import React from 'react';
import { FileText, Film } from 'lucide-react';
import { YouTubeVideoMetadata } from '../../types';

interface SelectedMediaHeaderProps {
  file: File | null;
  fileType: 'srt' | 'video' | 'youtube' | null;
  youtubeMeta: YouTubeVideoMetadata | null;
  videoThumbnail: string | null;
  subtitlesLength: number;
  onReset: () => void;
}

export const SelectedMediaHeader: React.FC<SelectedMediaHeaderProps> = ({
  file,
  fileType,
  youtubeMeta,
  videoThumbnail,
  subtitlesLength,
  onReset
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="hidden sm:flex w-24 aspect-video rounded-xl bg-neutral-800 text-black items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
            {fileType === 'srt' ? (
              <FileText className="w-6 h-6 text-white" />
            ) : fileType === 'youtube' && youtubeMeta ? (
              <img src={youtubeMeta.thumbnailUrl} className="w-full h-full object-cover" alt="YouTube thumbnail" />
            ) : videoThumbnail ? (
              <img src={videoThumbnail} className="w-full h-full object-cover" alt="Video thumbnail" />
            ) : (
              <Film className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white truncate max-w-[200px] sm:max-w-md">
              {fileType === 'youtube' ? youtubeMeta?.title : file?.name}
            </div>
            <div className="text-xs text-neutral-500">
              {subtitlesLength > 0 
                ? `${subtitlesLength} lines loaded` 
                : fileType === 'youtube' 
                ? 'YouTube Video Selected' 
                : 'File selected'}
            </div>
          </div>
        </div>
        <button 
          onClick={onReset} 
          className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
        >
          Change File
        </button>
      </div>
    </div>
  );
};
