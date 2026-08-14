import React, { useState } from 'react';
import { Film } from 'lucide-react';

interface VideoUrlThumbnailProps {
  videoUrl: string;
  useProxy: boolean;
}

export const VideoUrlThumbnail: React.FC<VideoUrlThumbnailProps> = ({ videoUrl, useProxy }) => {
  const initialSrc = useProxy 
    ? `http://localhost:4000/api/proxy/file-get?url=${encodeURIComponent(videoUrl)}#t=0.5`
    : `${videoUrl}#t=0.5`;

  const [src, setSrc] = useState(initialSrc);
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    const proxyFallback = `http://localhost:4000/api/proxy/file-get?url=${encodeURIComponent(videoUrl)}#t=0.5`;
    if (!useProxy && src !== proxyFallback) {
      setSrc(proxyFallback);
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div className="w-28 h-20 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
        <Film className="w-8 h-8 text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="w-28 h-20 rounded-xl overflow-hidden border border-neutral-800 bg-black shrink-0 relative group">
      <video
        src={src}
        className="w-full h-full object-cover"
        preload="metadata"
        muted
        playsInline
        onError={handleError}
      />
    </div>
  );
};
