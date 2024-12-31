// upload.js
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 1000 * 1024 * 1024 }, // 100 MB limit
}).single('video'); // Assuming the form field is named "video"

module.exports = videoUpload;

