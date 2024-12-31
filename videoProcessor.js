// videoProcessor.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs/promises');
const { existsSync, mkdirSync } = require('fs');
const EventEmitter = require('events');

class VideoProcessor extends EventEmitter {
  
  constructor() {
    super();
    this.RESOLUTIONS = [
      {name:"240p", width:426, height:240, bitrate: '400k' },
      { name: '360p', width: 640, height: 360, bitrate: '800k' },
      { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
      { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' }
    ];
  }

  /**
   * Ensures output directory exists
   * @param {string} dir - Directory path
   */
  async ensureDir(dir) {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  /**
   * Get video metadata
   * @param {string} inputFile - Input file path
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoMetadata(inputFile) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) reject(err);
        resolve(metadata);
      });
    });
  }

  /**
   * Create HLS stream for a specific resolution
   * @param {string} inputFile - Input file path
   * @param {string} outputDir - Output directory
   * @param {Object} resolution - Resolution configuration
   * @returns {Promise<string>} Output path
   */
  async createHLSStream(inputFile, outputDir, resolution) {
    const resolutionDir = path.join(outputDir, resolution.name);
    await this.ensureDir(resolutionDir);

    const segmentPattern = path.join(resolutionDir, 'segment-%03d.ts');
    const playlistPath = path.join(resolutionDir, 'playlist.m3u8');

    return new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .outputOptions([
          '-codec:v libx264',
          '-codec:a aac',
          '-profile:v main',
          '-preset veryfast',
          '-sc_threshold 0',
          '-g 48',
          '-keyint_min 48',
          `-vf scale=w=${resolution.width}:h=${resolution.height}`,
          `-b:v ${resolution.bitrate}`,
          '-b:a 128k',
          '-hls_time 6',
          '-hls_list_size 0',
          '-f hls',
          `-hls_segment_filename ${segmentPattern}`
        ])
        .output(playlistPath)
        .on('progress', (progress) => {
          this.emit('progress', {
            resolution: resolution.name,
            percent: progress.percent
          });
        })
        .on('end', () => resolve(playlistPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Generate master playlist
   * @param {string} outputDir - Output directory
   * @param {Array} variants - Variant streams
   */
  async generateMasterPlaylist(outputDir, variants) {
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n';

    variants.forEach(variant => {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(variant.bitrate) * 1000},RESOLUTION=${variant.width}x${variant.height}\n`;
      content += `${variant.name}/playlist.m3u8\n`;
    });

    await fs.writeFile(masterPlaylistPath, content);
    return masterPlaylistPath;
  }

  /**
   * Convert video to HLS format
   * @param {string} inputFile - Input file path
   * @param {string} outputDir - Output directory
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertToHLS(inputFile, outputDir, options = {}) {
    try {
      // Bind the context to ensure 'this' refers to the class instance
      this.convertToHLS = this.convertToHLS.bind(this);
      
      // Validate input file
      if (!existsSync(inputFile)) {
        throw new Error('Input file does not exist');
      }

      // Ensure output directory exists
      await this.ensureDir(outputDir);

      // Get video metadata
      const metadata = await this.getVideoMetadata(inputFile);
      this.emit('metadata', metadata);

      // Filter resolutions based on input video
      const inputHeight = metadata.streams.find(s => s.codec_type === 'video')?.height || 0;
      const applicableResolutions = this.RESOLUTIONS.filter(
        res => res.height <= inputHeight
      ).sort((a, b) => a.height - b.height);

      if (applicableResolutions.length === 0) {
        throw new Error('No applicable resolutions found for input video');
      }

      // Create HLS streams for each resolution
      const conversionResults = await Promise.all(
        applicableResolutions.map(resolution => 
          this.createHLSStream(inputFile, outputDir, resolution)
            .catch(error => {
              this.emit('error', {
                resolution: resolution.name,
                error: error.message
              });
              return null;
            })
        )
      );

      // Filter out failed conversions
      const successfulConversions = conversionResults
        .filter(Boolean)
        .map((path, index) => ({
          ...applicableResolutions[index],
          playlistPath: path
        }));

      if (successfulConversions.length === 0) {
        throw new Error('All resolution conversions failed');
      }

      // Generate master playlist
      const masterPlaylistPath = await this.generateMasterPlaylist(
        outputDir,
        successfulConversions
      );

      this.emit('complete', {
        masterPlaylist: masterPlaylistPath,
        variants: successfulConversions
      });

      await fs.unlink(inputFile);

      return {
        success: true,
        masterPlaylist: masterPlaylistPath,
        variants: successfulConversions
      };

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
}

}

// Export singleton instance
module.exports = new VideoProcessor();

// Usage example:
/*
const videoProcessor = require('./videoProcessor');

async function processVideo() {
  try {
    videoProcessor.on('progress', (progress) => {
      console.log(`Processing ${progress.resolution}: ${progress.percent}%`);
    });

    videoProcessor.on('metadata', (metadata) => {
      console.log('Video metadata:', metadata);
    });

    const result = await videoProcessor.convertToHLS(
      'input.mp4',
      './output'
    );
    console.log('Conversion complete:', result);
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}
*/
