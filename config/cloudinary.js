const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// 1. Configure Cloudinary with credentials
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure Multer to use Cloudinary as storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'PlacementPro_Uploads', // The folder name in Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], // Restrict file types
        transformation: [{ width: 1080, crop: "limit" }] // Automatically resize if necessary
    },
});

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };
