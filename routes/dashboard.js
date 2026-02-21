const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/dashboard — real stats for admin dashboard
router.get('/', requireAuth, async (req, res) => {
    try {
        const [
            totalStudents,
            activeDrives,
            totalDrives,
            interviewsScheduled,
            pendingNotifications,
            recentDrives,
        ] = await Promise.all([
            // Total students
            prisma.student_profiles.count(),

            // Active drives
            prisma.placement_drives.count({ where: { status: { in: ['upcoming', 'active'] } } }),

            // All drives
            prisma.placement_drives.count(),

            // Interviews scheduled (upcoming)
            prisma.interview_slots.count({ where: { status: 'scheduled' } }),

            // Drives not yet notified
            prisma.placement_drives.count({
                where: { status: { in: ['upcoming', 'active'] }, notified: false },
            }),

            // Recent drives with eligible student counts
            prisma.placement_drives.findMany({
                orderBy: { created_at: 'desc' },
                take: 10,
                include: {
                    _count: { select: { drive_applications: true } },
                },
            }),
        ]);

        // For each drive, compute eligible student count
        const drivesWithEligible = await Promise.all(
            recentDrives.map(async (drive) => {
                const branches = drive.allowed_branches.split(',').map(b => b.trim().toLowerCase());
                const where = {
                    cgpa: { gte: drive.min_cgpa },
                    backlogs: { lte: drive.max_backlogs },
                };
                if (!branches.includes('all')) {
                    where.branch = { in: branches.map(b => b.charAt(0).toUpperCase() + b.slice(1)) };
                }
                const eligible = await prisma.student_profiles.count({ where });
                return {
                    id: drive.id,
                    company: drive.company,
                    role: drive.role,
                    package: drive.package,
                    drive_date: drive.drive_date,
                    status: drive.status,
                    notified: drive.notified,
                    allowed_branches: drive.allowed_branches,
                    min_cgpa: drive.min_cgpa,
                    max_backlogs: drive.max_backlogs,
                    eligible_count: eligible,
                    applications_count: drive._count.drive_applications,
                };
            })
        );

        res.json({
            stats: {
                totalStudents,
                activeDrives,
                totalDrives,
                interviewsScheduled,
                pendingNotifications,
            },
            recentDrives: drivesWithEligible,
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
