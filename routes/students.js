const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/students — admin view of all student profiles
router.get('/', requireAuth, async (req, res) => {
    try {
        const { branch, min_cgpa, max_backlogs, search, page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (branch) where.branch = branch;
        if (min_cgpa) where.cgpa = { gte: parseFloat(min_cgpa) };
        if (max_backlogs !== undefined) where.backlogs = { lte: parseInt(max_backlogs) };
        if (search) {
            where.OR = [
                { full_name: { contains: search, mode: 'insensitive' } },
                { reg_id: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [total, students] = await Promise.all([
            prisma.student_profiles.count({ where }),
            prisma.student_profiles.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { cgpa: 'desc' },
            }),
        ]);

        res.json({ students, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error('Students error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/students/:id — single student profile
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const student = await prisma.student_profiles.findUnique({
            where: { id },
            include: {
                users: {
                    select: { id: true, role: true, created_at: true },
                    include: {
                        drive_applications: {
                            include: { drives: { select: { company: true, role: true, drive_date: true } } },
                            orderBy: { applied_at: 'desc' },
                        },
                        interview_slots: {
                            include: { drives: { select: { company: true, role: true } } },
                            orderBy: { interview_date: 'asc' },
                        },
                    },
                },
            },
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (err) {
        console.error('Get student error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/students/me — student's own profile
router.get('/profile/me', requireAuth, async (req, res) => {
    try {
        const profile = await prisma.student_profiles.findUnique({
            where: { user_id: req.user.id },
        });
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    } catch (err) {
        console.error('Profile me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
