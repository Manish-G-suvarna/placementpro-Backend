const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/drives — list all drives (student: public, admin: all)
router.get('/', async (req, res) => {
    try {
        const drives = await prisma.placement_drives.findMany({
            orderBy: { drive_date: 'asc' },
            include: {
                _count: { select: { drive_applications: true } },
            },
        });
        res.json(drives);
    } catch (err) {
        console.error('Drives list error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/drives/eligible — drives student is eligible for
router.get('/eligible', requireAuth, async (req, res) => {
    try {
        const profile = await prisma.student_profiles.findUnique({
            where: { user_id: req.user.id },
        });
        if (!profile) return res.status(404).json({ error: 'Student profile not found' });

        const drives = await prisma.placement_drives.findMany({
            where: {
                status: { in: ['upcoming', 'active'] },
                min_cgpa: { lte: profile.cgpa },
                max_backlogs: { gte: profile.backlogs },
            },
            orderBy: { drive_date: 'asc' },
            include: { _count: { select: { drive_applications: true } } },
        });

        // Also filter by branch
        const eligible = drives.filter(d => {
            const branches = d.allowed_branches.split(',').map(b => b.trim().toLowerCase());
            return branches.includes('all') || branches.includes(profile.branch.toLowerCase());
        });

        // Mark which ones student already applied to
        const myApplications = await prisma.drive_applications.findMany({
            where: { user_id: req.user.id },
            select: { drive_id: true, status: true },
        });
        const appliedMap = new Map(myApplications.map(a => [a.drive_id, a.status]));

        const result = eligible.map(d => ({
            ...d,
            my_status: appliedMap.get(d.id) || null,
        }));

        res.json(result);
    } catch (err) {
        console.error('Eligible drives error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/drives — admin creates a new drive
router.post('/', requireAuth, async (req, res) => {
    try {
        const { company, role, package: pkg, drive_date, min_cgpa, max_backlogs, allowed_branches, description } = req.body;
        if (!company || !role || !pkg || !drive_date) {
            return res.status(400).json({ error: 'company, role, package, drive_date are required' });
        }

        const drive = await prisma.placement_drives.create({
            data: {
                company,
                role,
                package: pkg,
                drive_date: new Date(drive_date),
                min_cgpa: parseFloat(min_cgpa) || 0,
                max_backlogs: parseInt(max_backlogs) ?? 99,
                allowed_branches: allowed_branches || 'All',
                description: description || null,
                status: 'upcoming',
            },
        });
        res.status(201).json(drive);
    } catch (err) {
        console.error('Create drive error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── PUT /api/drives/:id — admin updates drive
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { company, role, package: pkg, drive_date, min_cgpa, max_backlogs, allowed_branches, description, status, notified } = req.body;

        const data = {};
        if (company) data.company = company;
        if (role) data.role = role;
        if (pkg) data.package = pkg;
        if (drive_date) data.drive_date = new Date(drive_date);
        if (min_cgpa !== undefined) data.min_cgpa = parseFloat(min_cgpa);
        if (max_backlogs !== undefined) data.max_backlogs = parseInt(max_backlogs);
        if (allowed_branches) data.allowed_branches = allowed_branches;
        if (description !== undefined) data.description = description;
        if (status) data.status = status;
        if (notified !== undefined) data.notified = notified;

        const drive = await prisma.placement_drives.update({ where: { id }, data });
        res.json(drive);
    } catch (err) {
        console.error('Update drive error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── DELETE /api/drives/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.placement_drives.delete({ where: { id } });
        res.json({ message: 'Drive deleted' });
    } catch (err) {
        console.error('Delete drive error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/drives/:id/eligible-students — students eligible for a drive
router.get('/:id/eligible-students', requireAuth, async (req, res) => {
    try {
        const drive = await prisma.placement_drives.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!drive) return res.status(404).json({ error: 'Drive not found' });

        const branches = drive.allowed_branches.split(',').map(b => b.trim().toLowerCase());
        const whereClause = {
            cgpa: { gte: drive.min_cgpa },
            backlogs: { lte: drive.max_backlogs },
        };
        if (!branches.includes('all')) {
            whereClause.branch = { in: branches.map(b => b.charAt(0).toUpperCase() + b.slice(1)) };
        }

        const students = await prisma.student_profiles.findMany({ where: whereClause, orderBy: { cgpa: 'desc' } });
        res.json({ drive, students, count: students.length });
    } catch (err) {
        console.error('Eligible students error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/drives/:id/applications — admin views applications for a drive
router.get('/:id/applications', requireAuth, async (req, res) => {
    try {
        const driveId = parseInt(req.params.id);
        const drive = await prisma.placement_drives.findUnique({ where: { id: driveId } });
        if (!drive) return res.status(404).json({ error: 'Drive not found' });

        const apps = await prisma.drive_applications.findMany({
            where: { drive_id: driveId },
            include: {
                users: {
                    include: {
                        student_profile: true
                    }
                }
            },
            orderBy: {
                applied_at: 'desc'
            }
        });

        // Flatten the data for easier use in frontend
        const applications = apps.map(app => {
            const profile = app.users?.student_profile || {};
            return {
                user_id: app.user_id,
                status: app.status,
                applied_at: app.applied_at,
                full_name: profile.full_name || 'Unknown',
                reg_id: profile.reg_id || 'Unknown',
                email: profile.email || app.users?.email,
                branch: profile.branch || 'Unknown',
                cgpa: profile.cgpa || 0,
                backlogs: profile.backlogs || 0,
            };
        });

        res.json({ drive, applications, count: applications.length });
    } catch (err) {
        console.error('Get applications error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/drives/:id/apply — student applies to a drive
router.post('/:id/apply', requireAuth, async (req, res) => {
    try {
        const driveId = parseInt(req.params.id);
        const drive = await prisma.placement_drives.findUnique({ where: { id: driveId } });
        if (!drive) return res.status(404).json({ error: 'Drive not found' });
        if (!['upcoming', 'active'].includes(drive.status)) {
            return res.status(400).json({ error: 'Drive is not accepting applications' });
        }

        const app = await prisma.drive_applications.create({
            data: { drive_id: driveId, user_id: req.user.id, status: 'pending' },
        });
        res.status(201).json(app);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Already applied to this drive' });
        console.error('Apply drive error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── PUT /api/drives/:driveId/applications/:userId — admin updates application status
router.put('/:driveId/applications/:userId', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await prisma.drive_applications.update({
            where: {
                drive_id_user_id: {
                    drive_id: parseInt(req.params.driveId),
                    user_id: parseInt(req.params.userId),
                },
            },
            data: { status },
        });
        res.json(updated);
    } catch (err) {
        console.error('Update application error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
