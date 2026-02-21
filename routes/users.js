const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/users/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

        const user = await prisma.users.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                bio: true,
                avatar_url: true,
                role: true,
                created_at: true,
                posts: { orderBy: { created_at: 'desc' } },
            },
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── PUT /api/users/me ──────────────────────────────────
router.put('/me', requireAuth, async (req, res) => {
    try {
        const { name, bio, avatar_url } = req.body;
        const data = {};

        if (name) data.name = name;
        if (bio !== undefined) data.bio = bio;
        if (avatar_url !== undefined) data.avatar_url = avatar_url;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const updated = await prisma.users.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                bio: true,
                avatar_url: true,
                role: true,
                created_at: true,
            },
        });

        res.json(updated);
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /api/users/:id/saved ───────────────────────────
router.get('/:id/saved', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

        // Only allow users to see their own saved posts
        if (id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const savedRows = await prisma.saved_posts.findMany({
            where: { user_id: id },
            orderBy: { saved_at: 'desc' },
            include: {
                posts: {
                    include: {
                        users: { select: { name: true, avatar_url: true } },
                    },
                },
            },
        });

        // Flatten to match old API shape
        const posts = savedRows.map(({ posts: p }) => ({
            ...p,
            organizer_name: p.users?.name ?? null,
            organizer_avatar: p.users?.avatar_url ?? null,
            users: undefined,
        }));

        res.json(posts);
    } catch (err) {
        console.error('Get saved error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
