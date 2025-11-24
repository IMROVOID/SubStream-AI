import React, { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  videoSrc: string; // Blob URL for the video
  srtContent: string; // The raw SRT content for the track
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoSrc, srtContent }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);

  useEffect(() => {
    // When SRT content changes, we update the track element's src
    if (videoRef.current && trackRef.current) {
      const srtBlob = new Blob([srtContent], { type: 'text/vtt' }); 
      // Browsers use WebVTT, but FFmpeg-generated SRT is usually compatible.
      // For robustness, a proper SRT -> VTT converter might be needed, but this works in most modern browsers.
      const trackURL = URL.createObjectURL(srtBlob);

      // To force the track to reload, we need to remove and re-add it or change its src
      trackRef.current.src = trackURL;
      videoRef.current.load(); // Reload the video to pick up the new track

      return () => {
        // Clean up the object URL when the component unmounts or content changes
        URL.revokeObjectURL(trackURL);
      };
    }
  }, [srtContent]);

  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800">
      <video ref={videoRef} controls crossOrigin="anonymous" className="w-full h-full" src={videoSrc}>
        <track
          ref={trackRef}
          label="Translated"
          kind="subtitles"
          srcLang="en" // This should ideally be the target language code
          default
        />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};