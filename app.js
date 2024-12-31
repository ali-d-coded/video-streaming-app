const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs/promises');
const fsG = require('fs');
const videoUpload = require('./upload');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { login } = require('./auth');
dotenv.config();
const cors = require('cors');
const videoProcessor = require('./videoProcessor');
const WebSocket = require('ws');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("Failed to connect to MongoDB", err));

// Middleware
app.use(express.json());
app.use(express.static('uploads'))
const compression = require('compression');
app.use(compression());

// User authentication (Basic JWT auth)
const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.sendStatus(403);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Add cache middleware
const cacheControl = (duration) => {
  return (req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${duration}`);
    next();
  };
};


// Login route
app.post("/login", login);


// Video Upload Route
app.post('/upload', videoUpload, async (req, res) => {
  const videoPath = req.file.path;
  console.log({videoPath});
  
  const outputDir = path.join('uploads', 'hls', Date.now().toString());
  
  // Set up event listeners for this specific upload
  videoProcessor.on('progress', (progress) => {
    console.log(`Processing ${progress.resolution}: ${progress.percent}%`);
  });

  videoProcessor.on('error', (error) => {
    console.error('Processing error:', error);
  });

  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Convert video to HLS using the VideoProcessor instance
    const result = await videoProcessor.convertToHLS(videoPath, outputDir);
    
    
    res.json({ 
      message: 'Video uploaded and processed successfully!', 
      hlsPath: outputDir,
      masterPlaylist: result.masterPlaylist,
      variants: result.variants
    });

  } catch (err) {
    console.error('Error processing video:', err);
    res.status(500).json({ message: 'Error processing video' });
    
    // Clean up: remove the uploaded file and created directory
    try {
    } catch (unlinkError) {
      console.error('Error deleting video file:', unlinkError);
    }

    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (rmError) {
      console.error('Error deleting output directory:', rmError);
    }

  } finally {
    // Remove event listeners to prevent memory leaks
    videoProcessor.removeAllListeners('progress');
    videoProcessor.removeAllListeners('error');
  }
});


// Add this route to your app.js
app.get('/video/:filename', async (req, res) => {
  const { filename } = req.params;
  const videoPath = path.join('uploads', 'hls', filename, 'master.m3u8');

  // Check if file exists
  try {
    await fs.access(videoPath);
  } catch (error) {
    return res.status(404).json({ message: 'Video not found' });
  }

  // Set appropriate headers for HLS streaming
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Stream the master playlist
  const readStream = fsG.createReadStream(videoPath);
  readStream.pipe(res);
});

// Add route for streaming segments
app.get('/video/:filename/:resolution/:segment', cacheControl(86400),async (req, res) => {

  
  const { filename, resolution, segment } = req.params;
  const segmentPath = path.join('uploads', 'hls', filename, resolution, segment);

  try {
    await fs.access(segmentPath);
  } catch (error) {
    return res.status(404).json({ message: 'Segment not found' });
  }

  // Set appropriate headers for TS segments
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const readStream = fsG.createReadStream(segmentPath);
  readStream.pipe(res);
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
