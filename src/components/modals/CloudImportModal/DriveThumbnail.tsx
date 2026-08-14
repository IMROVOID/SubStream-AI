import React, { useState, useEffect } from 'react';
import { Folder, FileVideo, FileText } from 'lucide-react';
import { DriveFile } from '../../../types';

interface DriveThumbnailProps {
  file: DriveFile;
  className?: string;
  iconClassName?: string;
}

export const DriveThumbnail: React.FC<DriveThumbnailProps> = ({ file, className, iconClassName }) => {
  const [imgError, setImgError] = useState(false);
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

  useEffect(() => {
    setImgError(false);
  }, [file.id, file.thumbnailLink]);

  const thumbUrl = file.thumbnailLink 
    ? (file.thumbnailLink.includes('=s') ? file.thumbnailLink.replace(/=s\d+.*$/, '=s400') : file.thumbnailLink)
    : (file.mimeType.includes('video') ? `https://drive.google.com/thumbnail?id=${file.id}&sz=w400` : '');

  if (isFolder || !thumbUrl || imgError) {
    return (
      <div className="text-neutral-500 flex items-center justify-center">
        {isFolder ? (
          <Folder className={iconClassName || "w-7 h-7 text-neutral-300"} />
        ) : file.mimeType.includes('video') ? (
          <FileVideo className={iconClassName || "w-7 h-7 text-red-400"} />
        ) : (
          <FileText className={iconClassName || "w-7 h-7 text-blue-400"} />
        )}
      </div>
    );
  }

  return (
    <img
      src={thumbUrl}
      className={className || "w-full h-full object-cover opacity-80 group-hover:opacity-100"}
      alt={file.name || "File thumbnail"}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
    />
  );
};
