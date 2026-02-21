const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const assetsDir = path.join(__dirname, '../Mobile-app/assets/images');
const files = fs.readdirSync(assetsDir);
const results = {};

async function upload() {
    for (const file of files) {
        if (file.match(/\.(png|jpg|jpeg|svg)$/)) {
            const filePath = path.join(assetsDir, file);
            try {
                console.log(`Uploading ${file}...`);
                const result = await cloudinary.uploader.upload(filePath, {
                    folder: 'placementpro_assets'
                });
                results[file] = result.secure_url;
                console.log(`Uploaded ${file}: ${result.secure_url}`);
            } catch (err) {
                console.error(`Error uploading ${file}`, err);
            }
        }
    }
    fs.writeFileSync(path.join(__dirname, 'cloudinary_assets.json'), JSON.stringify(results, null, 2));
    console.log('Finished uploading assets to Cloudinary. Mappings saved to cloudinary_assets.json');
}

upload();
