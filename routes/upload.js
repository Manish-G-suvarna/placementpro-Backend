const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');

router.post('/', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // req.file contains the file info, including the Cloudinary URL
        res.status(200).json({
            message: 'Upload successful',
            url: req.file.path, // This is the public URL
            public_id: req.file.filename
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Server error during upload' });
    }
});

module.exports = router;
