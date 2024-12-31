import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const VideoPlayer = ({ videoId }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1);

  const handleQualityChange = (qualityId) => {
    if (hlsRef.current) {
      hlsRef.current.levels.forEach((level, levelIndex) => {
        if (levelIndex === qualityId) {
          hlsRef.current.currentLevel = qualityId;
          setCurrentQuality(qualityId);
        }
      });
    }
  };

  useEffect(() => {
    if (!videoId) {
      console.error('No videoId provided');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const videoSrc = `http://localhost:5995/video/${videoId}/`;
    console.log('Loading video source:', videoSrc);

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        debug: true,
        enableWorker: true,
        lowLatencyMode: true,
        autoLevelEnabled: true, // Enable automatic quality selection by default
      });
      
      hlsRef.current = hls;

      hls.loadSource(videoSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('Manifest parsed, attempting playback');
        
        // Get available quality levels
        const availableQualities = hls.levels.map((level, index) => ({
          id: index,
          width: level.width,
          height: level.height,
          bitrate: level.bitrate
        }));
        
        setQualities(availableQualities);
        setCurrentQuality(hls.currentLevel);
        
        video.play().catch((error) => {
          console.log("Playback failed:", error);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        setCurrentQuality(data.level);
      });

      // Your existing error handling code...
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoSrc;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoId]);

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        controls
        style={{ width: '100%', maxWidth: '800px' }}
        playsInline
      />
      {qualities.length > 0 && (
        <div className="quality-controls">
          <select
            value={currentQuality}
            onChange={(e) => handleQualityChange(Number(e.target.value))}
          >
            <option value="-1">Auto</option>
            {qualities.map((quality) => (
              <option key={quality.id} value={quality.id}>
                {quality.height}p ({Math.round(quality.bitrate / 1000)} kbps)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
