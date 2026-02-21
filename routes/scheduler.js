const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const { broadcastNotification } = require('./notifications');

const router = express.Router();

// ── GET /api/scheduler — admin lists all interview slots
router.get('/', requireAuth, async (req, res) => {
    try {
        const { drive_id, date } = req.query;
        const where = {};
        if (drive_id) where.drive_id = parseInt(drive_id);
        if (date) where.interview_date = new Date(date);

        const slots = await prisma.interview_slots.findMany({
            where,
            orderBy: [{ interview_date: 'asc' }, { interview_time: 'asc' }],
            include: {
                users: { select: { id: true, name: true, email: true } },
                drives: { select: { id: true, company: true, role: true } },
            },
        });

        // Flatten user and drive info
        const result = slots.map(({ users: u, drives: d, ...s }) => ({
            ...s,
            student_name: u?.name,
            student_email: u?.email,
            company: d?.company,
            drive_role: d?.role,
        }));

        res.json(result);
    } catch (err) {
        console.error('Scheduler list error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/scheduler/my — student views their own interview slots
router.get('/my', requireAuth, async (req, res) => {
    try {
        const slots = await prisma.interview_slots.findMany({
            where: { user_id: req.user.id },
            orderBy: { interview_date: 'asc' },
            include: {
                drives: { select: { company: true, role: true, package: true } },
            },
        });

        const result = slots.map(({ drives: d, ...s }) => ({
            ...s,
            company: d?.company,
            drive_role: d?.role,
            package: d?.package,
        }));

        res.json(result);
    } catch (err) {
        console.error('My slots error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/scheduler — admin schedules an interview
router.post('/', requireAuth, async (req, res) => {
    try {
        const { drive_id, user_id, interview_date, interview_time, location, notes } = req.body;
        if (!drive_id || !user_id || !interview_date || !interview_time) {
            return res.status(400).json({ error: 'drive_id, user_id, interview_date, interview_time are required' });
        }

        const slot = await prisma.interview_slots.create({
            data: {
                drive_id: parseInt(drive_id),
                user_id: parseInt(user_id),
                interview_date: new Date(interview_date),
                interview_time,
                location: location || null,
                notes: notes || null,
                status: 'scheduled',
            },
        });

        // Auto-notify the student about their interview
        try {
            const drive = await prisma.placement_drives.findUnique({
                where: { id: parseInt(drive_id) },
                select: { company: true, role: true },
            });
            await broadcastNotification({
                user_ids: [parseInt(user_id)],
                type: 'interview',
                title: `Interview Scheduled: ${drive?.company || 'Company'}`,
                message: `Your interview for ${drive?.role} at ${drive?.company} is scheduled on ${new Date(interview_date).toLocaleDateString('en-IN')} at ${interview_time}${location ? ` in ${location}` : ''}. Be prepared!`,
                drive_id: parseInt(drive_id),
                slot_id: slot.id,
            });
        } catch (notifErr) {
            console.warn('Interview notification failed (non-fatal):', notifErr.message);
        }

        res.status(201).json(slot);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Interview already scheduled for this student and drive' });
        console.error('Schedule interview error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/scheduler/bulk — admin schedules interviews for all approved/eligible students in a drive
router.post('/bulk', requireAuth, async (req, res) => {
    try {
        const { drive_id, start_date, end_date, start_time, location, notes } = req.body;
        if (!drive_id || !start_date || !start_time) {
            return res.status(400).json({ error: 'drive_id, start_date, start_time are required' });
        }

        const targetApps = await prisma.drive_applications.findMany({
            where: { drive_id: parseInt(drive_id), status: 'shortlisted' }
        });

        if (targetApps.length === 0) {
            return res.status(400).json({ error: 'No approved students found for this drive.' });
        }

        const drive = await prisma.placement_drives.findUnique({
            where: { id: parseInt(drive_id) },
            select: { company: true, role: true },
        });

        // Current scheduling pointers
        let currentDate = new Date(start_date);
        let [hour, minute] = start_time.split(':').map(Number);

        const slotDurationMinutes = 15;
        const endOfDayHour = 17;
        const startOfDayHour = 9;

        let count = 0;
        const newSlotsData = [];
        const notificationData = [];

        // Build the data arrays in memory
        for (const app of targetApps) {
            const hh = String(hour).padStart(2, '0');
            const mm = String(minute).padStart(2, '0');
            const currentTimeStr = `${hh}:${mm}`;

            newSlotsData.push({
                drive_id: parseInt(drive_id),
                user_id: app.user_id,
                interview_date: new Date(currentDate),
                interview_time: currentTimeStr,
                location: location || null,
                notes: notes || null,
                status: 'scheduled',
            });

            count++;

            // Increment time
            minute += slotDurationMinutes;
            if (minute >= 60) {
                minute -= 60;
                hour += 1;
            }

            // If past end of day, move to next day
            if (hour >= endOfDayHour) {
                hour = startOfDayHour;
                minute = 0;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // 1. Bulk insert slots and get them back (Requires Prisma 5+)
        const slotsCreated = await prisma.interview_slots.createManyAndReturn({
            data: newSlotsData,
            skipDuplicates: true // In case some are already scheduled
        });

        // 2. Build notifications only for the students who actually got a slot created
        const notificationsData = slotsCreated.map(slot => ({
            user_id: slot.user_id,
            type: 'interview',
            title: `Interview Scheduled: ${drive?.company || 'Company'}`,
            message: `Your interview for ${drive?.role} at ${drive?.company} is scheduled on ${new Date(slot.interview_date).toLocaleDateString('en-IN')} at ${slot.interview_time}${location ? ` in ${location}` : ''}. Be prepared!`,
            drive_id: parseInt(drive_id),
            slot_id: slot.id,
            is_read: false
        }));

        // 3. Bulk insert notifications
        if (notificationsData.length > 0) {
            await prisma.notifications.createMany({
                data: notificationsData
            });
        }

        res.status(201).json({ message: `Successfully scheduled ${count} students.` });
    } catch (err) {
        console.error('Bulk schedule error:', err);
        res.status(500).json({ error: 'Server error bulk scheduling' });
    }
});

// ── GET /api/scheduler/:id (dummy block to anchor changes if needed) - not modifying existing PUT below
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { interview_date, interview_time, location, notes, status } = req.body;
        const data = {};
        if (interview_date) data.interview_date = new Date(interview_date);
        if (interview_time) data.interview_time = interview_time;
        if (location !== undefined) data.location = location;
        if (notes !== undefined) data.notes = notes;
        if (status) data.status = status;

        const slot = await prisma.interview_slots.update({ where: { id }, data });
        res.json(slot);
    } catch (err) {
        console.error('Update slot error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── DELETE /api/scheduler/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await prisma.interview_slots.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Slot deleted' });
    } catch (err) {
        console.error('Delete slot error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
