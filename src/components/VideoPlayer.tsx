import React, { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  videoSrc: string; // Blob URL, Direct Link, or YouTube Embed URL
  srtContent: string; // The raw SRT content for the track
  isYouTube?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoSrc, srtContent, isYouTube }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);

  useEffect(() => {
    // Only run this logic for native video elements
    if (!isYouTube && videoRef.current && trackRef.current) {
      const srtBlob = new Blob([srtContent], { type: 'text/vtt' }); 
      const trackURL = URL.createObjectURL(srtBlob);

      trackRef.current.src = trackURL;
      
      // Attempt to retain playback position if just updating subtitles
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      
      videoRef.current.load();
      videoRef.current.currentTime = currentTime;
      if (wasPlaying) videoRef.current.play().catch(e => console.log("Auto-resume prevented", e));

      return () => {
        URL.revokeObjectURL(trackURL);
      };
    }
  }, [srtContent, isYouTube]);

  if (isYouTube) {
    return (
        <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800 relative group">
             <iframe 
                width="100%" 
                height="100%" 
                src={videoSrc} 
                title="YouTube video player" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
            ></iframe>
             {/* Note: We cannot overlay subtitles easily on an iframe without a complex custom player overlay. 
                 Users will see the subtitles in the editor below. */}
             <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-neutral-400 pointer-events-none">
                 YouTube Preview
             </div>
        </div>
    );
  }

  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800">
      <video ref={videoRef} controls crossOrigin="anonymous" className="w-full h-full" src={videoSrc}>
        <track
          ref={trackRef}
          label="Translated"
          kind="subtitles"
          srcLang="en"
          default
        />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};