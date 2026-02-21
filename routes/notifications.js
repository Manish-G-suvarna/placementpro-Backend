const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const { dispatchExternalAlerts } = require('../utils/mailer');

/**
 * Helper: broadcast a notification to a list of user_ids and send external alerts (Email/SMS)
 */
async function broadcastNotification({ user_ids, type, title, message, drive_id = null, slot_id = null }) {
    if (!user_ids || user_ids.length === 0) return 0;

    // 1. Create In-App Notifications
    await prisma.notifications.createMany({
        data: user_ids.map(uid => ({
            user_id: uid, type, title, message,
            drive_id: drive_id || null,
            slot_id: slot_id || null,
        })),
        skipDuplicates: false,
    });

    // 2. Fetch User Profiles to retrieve Email & Phone for externals
    try {
        const users = await prisma.users.findMany({
            where: { id: { in: user_ids } },
            select: { id: true, email: true, phone: true }
        });

        const profiles = await prisma.student_profiles.findMany({
            where: { user_id: { in: user_ids } },
            select: { user_id: true, email: true, phone: true }
        });

        // Merge user and profile data (Profile takes precedence for contact details usually)
        const contactMap = {};
        for (const u of users) {
            contactMap[u.id] = { email: u.email, phone: u.phone };
        }
        for (const p of profiles) {
            if (p.email) contactMap[p.user_id].email = p.email;
            if (p.phone) contactMap[p.user_id].phone = p.phone;
        }

        // 3. Dispatch external alerts asynchronously (fire and forget)
        for (const uid of user_ids) {
            const contact = contactMap[uid];
            if (contact && (contact.email || contact.phone)) {
                dispatchExternalAlerts(contact, title, message).catch(err => console.error('External Alert Error:', err));
            }
        }
    } catch (err) {
        console.error('Failed processing external notifications:', err);
    }

    return user_ids.length;
}

module.exports.broadcastNotification = broadcastNotification;

// ── GET /api/notifications/my — student's own notifications
router.get('/my', requireAuth, async (req, res) => {
    try {
        const notifs = await prisma.notifications.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: 'desc' },
            take: 50,
        });
        res.json(notifs);
    } catch (err) {
        console.error('Notifications my error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── PUT /api/notifications/my/read — mark all as read
router.put('/my/read', requireAuth, async (req, res) => {
    try {
        await prisma.notifications.updateMany({
            where: { user_id: req.user.id, is_read: false },
            data: { is_read: true },
        });
        res.json({ message: 'Marked all as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/notifications/my/unread-count
router.get('/my/unread-count', requireAuth, async (req, res) => {
    try {
        const count = await prisma.notifications.count({
            where: { user_id: req.user.id, is_read: false },
        });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/notifications — admin: all history
router.get('/', requireAuth, async (req, res) => {
    try {
        const { type, drive_id } = req.query;
        const where = {};
        if (type) where.type = type;
        if (drive_id) where.drive_id = parseInt(drive_id);

        const [history, counts] = await Promise.all([
            prisma.notifications.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: 200,
                distinct: ['drive_id', 'slot_id', 'type'],
                select: {
                    id: true, type: true, title: true, message: true,
                    drive_id: true, slot_id: true, created_at: true,
                },
            }),
            prisma.notifications.groupBy({
                by: ['drive_id', 'slot_id', 'type'],
                _count: { id: true },
                where,
            }),
        ]);

        // Enrich with recipient count
        const countMap = {};
        for (const c of counts) {
            const key = `${c.drive_id}_${c.slot_id}_${c.type}`;
            countMap[key] = c._count.id;
        }

        const result = history.map(n => ({
            ...n,
            recipient_count: countMap[`${n.drive_id}_${n.slot_id}_${n.type}`] || 1,
        }));

        res.json(result);
    } catch (err) {
        console.error('Admin notifications error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/notifications/send-drive — admin sends for a specific drive
router.post('/send-drive', requireAuth, async (req, res) => {
    try {
        const { drive_id } = req.body;
        if (!drive_id) return res.status(400).json({ error: 'drive_id required' });

        const drive = await prisma.placement_drives.findUnique({ where: { id: parseInt(drive_id) } });
        if (!drive) return res.status(404).json({ error: 'Drive not found' });

        // Find all eligible students who haven't been notified about this drive yet
        const branchesStr = drive.allowed_branches.toLowerCase();
        const profileWhere = {
            cgpa: { gte: drive.min_cgpa },
            backlogs: { lte: drive.max_backlogs },
        };

        const eligibleProfiles = await prisma.student_profiles.findMany({
            where: profileWhere,
            select: { user_id: true, branch: true },
        });

        // Filter by branch manually to handle case-insensitivity easily
        let targetProfiles = eligibleProfiles;
        if (!branchesStr.includes('all')) {
            const allowedArr = branchesStr.split(',').map(b => b.trim());
            targetProfiles = eligibleProfiles.filter(p => {
                if (!p.branch) return false;
                const stuBranch = p.branch.toLowerCase();
                return allowedArr.some(allowed => stuBranch.includes(allowed) || allowed.includes(stuBranch));
            });
        }

        // Exclude already notified
        const alreadyNotified = await prisma.notifications.findMany({
            where: { drive_id: drive.id, type: 'drive' },
            select: { user_id: true },
        });
        const alreadySet = new Set(alreadyNotified.map(n => n.user_id));
        const toNotify = targetProfiles.map(p => p.user_id).filter(uid => !alreadySet.has(uid));

        if (toNotify.length === 0) {
            return res.json({ message: 'All eligible students already notified', count: 0 });
        }

        const count = await broadcastNotification({
            user_ids: toNotify,
            type: 'drive',
            title: `New Placement Drive: ${drive.company}`,
            message: `${drive.company} is hiring for ${drive.role} offering ${drive.package}. Drive date: ${new Date(drive.drive_date).toLocaleDateString('en-IN')}. Check your eligibility and apply now!`,
            drive_id: drive.id,
        });

        // Mark drive as notified
        await prisma.placement_drives.update({ where: { id: drive.id }, data: { notified: true } });

        res.json({ message: `Sent to ${count} students`, count });
    } catch (err) {
        console.error('Send drive notification error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/notifications/send-interview — auto called when interview is scheduled
router.post('/send-interview', requireAuth, async (req, res) => {
    try {
        const { slot_id, user_id, drive_id } = req.body;
        if (!slot_id || !user_id || !drive_id) {
            return res.status(400).json({ error: 'slot_id, user_id, drive_id required' });
        }

        const [drive, slot] = await Promise.all([
            prisma.placement_drives.findUnique({ where: { id: parseInt(drive_id) }, select: { company: true, role: true } }),
            prisma.interview_slots.findUnique({ where: { id: parseInt(slot_id) }, select: { interview_date: true, interview_time: true, location: true } }),
        ]);

        await broadcastNotification({
            user_ids: [parseInt(user_id)],
            type: 'interview',
            title: `Interview Scheduled: ${drive?.company || 'Company'}`,
            message: `Your interview for ${drive?.role} at ${drive?.company} is scheduled on ${new Date(slot?.interview_date).toLocaleDateString('en-IN')} at ${slot?.interview_time}${slot?.location ? ` in ${slot.location}` : ''}. Please be prepared!`,
            drive_id: parseInt(drive_id),
            slot_id: parseInt(slot_id),
        });

        res.json({ message: 'Interview notification sent to student' });
    } catch (err) {
        console.error('Send interview notification error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
module.exports.broadcastNotification = broadcastNotification;
