import React from 'react';
import { Loader2 } from 'lucide-react';
import { VideoProcessingStatus } from '../../types';
import { getVideoProcessingStatusTitle } from '../../utils/appHelpers';

interface ProcessingProgressProps {
  videoProcessingStatus: VideoProcessingStatus;
  videoProcessingMessage: string;
  showProgressBar: boolean;
  ffmpegProgress: number;
}

export const ProcessingProgress: React.FC<ProcessingProgressProps> = ({
  videoProcessingStatus,
  videoProcessingMessage,
  showProgressBar,
  ffmpegProgress
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-4 sm:py-8 min-h-[130px] sm:min-h-[200px] space-y-3 sm:space-y-4">
      <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-spin" />
      <div>
        <h2 className="text-base sm:text-xl font-bold text-white mb-1 uppercase tracking-widest">
          {getVideoProcessingStatusTitle(videoProcessingStatus)}
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400">{videoProcessingMessage}</p>
      </div>
      {showProgressBar && (
        <div className="w-full max-w-sm">
          <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-300" style={{ width: `${ffmpegProgress}%` }}></div>
          </div>
          <p className="text-xs text-neutral-500 mt-1 text-right">{Math.round(ffmpegProgress)}%</p>
        </div>
      )}
    </div>
  );
};
