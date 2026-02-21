const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/posts/:id ─────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid post ID' });

        const post = await prisma.posts.findUnique({
            where: { id },
            include: {
                users: {
                    select: { name: true, avatar_url: true, bio: true },
                },
            },
        });

        if (!post) return res.status(404).json({ error: 'Post not found' });

        const { users, ...p } = post;
        const result = {
            ...p,
            organizer_name: users?.name ?? null,
            organizer_avatar: users?.avatar_url ?? null,
            organizer_bio: users?.bio ?? null,
            is_saved: false,
            is_applied: false,
        };

        // Check save/apply status for logged-in user
        if (req.user) {
            const [saved, applied] = await Promise.all([
                prisma.saved_posts.findUnique({
                    where: { post_id_user_id: { post_id: id, user_id: req.user.id } },
                }),
                prisma.applications.findUnique({
                    where: { post_id_user_id: { post_id: id, user_id: req.user.id } },
                }),
            ]);
            result.is_saved = !!saved;
            result.is_applied = !!applied;
        }

        res.json(result);
    } catch (err) {
        console.error('Get post error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/posts ────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
    try {
        const { type, title, description, location, start_date, end_date, tags, apply_link, media_url } = req.body;

        if (!type || !title || !description) {
            return res.status(400).json({ error: 'Type, title, and description are required' });
        }

        const validTypes = ['event', 'program', 'internship', 'competition', 'announcement'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
        }

        const newPost = await prisma.posts.create({
            data: {
                user_id: req.user.id,
                type,
                title,
                description,
                media_url: media_url || null,
                location: location || null,
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
                tags: tags || null,
                apply_link: apply_link || null,
            },
        });

        res.status(201).json(newPost);
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/posts/:id/save ───────────────────────────
router.post('/:id/save', requireAuth, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

        // Check post exists
        const post = await prisma.posts.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) return res.status(404).json({ error: 'Post not found' });

        // Toggle save
        const existing = await prisma.saved_posts.findUnique({
            where: { post_id_user_id: { post_id: postId, user_id: req.user.id } },
        });

        if (existing) {
            await prisma.saved_posts.delete({
                where: { post_id_user_id: { post_id: postId, user_id: req.user.id } },
            });
            res.json({ saved: false, message: 'Post unsaved' });
        } else {
            await prisma.saved_posts.create({
                data: { user_id: req.user.id, post_id: postId },
            });
            res.json({ saved: true, message: 'Post saved' });
        }
    } catch (err) {
        console.error('Save toggle error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /api/posts/:id/apply ──────────────────────────
router.post('/:id/apply', requireAuth, async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

        // Check post exists
        const post = await prisma.posts.findUnique({ where: { id: postId }, select: { id: true, apply_link: true } });
        if (!post) return res.status(404).json({ error: 'Post not found' });

        // Check duplicate application
        const existing = await prisma.applications.findUnique({
            where: { post_id_user_id: { post_id: postId, user_id: req.user.id } },
        });
        if (existing) {
            return res.status(409).json({ error: 'Already applied', apply_link: post.apply_link });
        }

        await prisma.applications.create({
            data: { user_id: req.user.id, post_id: postId, status: 'pending' },
        });

        res.status(201).json({ applied: true, apply_link: post.apply_link });
    } catch (err) {
        console.error('Apply error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
