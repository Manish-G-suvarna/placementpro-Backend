const express = require('express');
const prisma = require('../config/prisma');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/feed?page=1&limit=10&type= ────────────────
router.get('/', optionalAuth, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const type = req.query.type || undefined;
        const search = req.query.search || undefined;

        const where = {};
        if (type) where.type = type;
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } },
                { tags: { contains: search } },
                { location: { contains: search } },
            ];
        }

        // Total count
        const total = await prisma.posts.count({ where });
        const totalPages = Math.ceil(total / limit);

        // Posts with user (organizer) info
        const rawPosts = await prisma.posts.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
            include: {
                users: {
                    select: { name: true, avatar_url: true },
                },
            },
        });

        // Flatten user fields into post object
        let posts = rawPosts.map(({ users, ...p }) => ({
            ...p,
            organizer_name: users?.name ?? null,
            organizer_avatar: users?.avatar_url ?? null,
            is_saved: false,
            is_applied: false,
        }));

        // Mark saved / applied for logged-in user
        if (req.user && posts.length > 0) {
            const postIds = posts.map((p) => p.id);

            const [savedRows, appliedRows] = await Promise.all([
                prisma.saved_posts.findMany({
                    where: { user_id: req.user.id, post_id: { in: postIds } },
                    select: { post_id: true },
                }),
                prisma.applications.findMany({
                    where: { user_id: req.user.id, post_id: { in: postIds } },
                    select: { post_id: true },
                }),
            ]);

            const savedSet = new Set(savedRows.map((s) => s.post_id));
            const appliedSet = new Set(appliedRows.map((a) => a.post_id));
            posts = posts.map((p) => ({
                ...p,
                is_saved: savedSet.has(p.id),
                is_applied: appliedSet.has(p.id),
            }));
        }

        res.json({ posts, page, totalPages, total, hasMore: page < totalPages });
    } catch (err) {
        console.error('Feed error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
