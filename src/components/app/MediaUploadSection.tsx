import React from 'react';
import { Upload, FileText, Film, Link as LinkIcon, Youtube, HardDrive, Instagram } from 'lucide-react';
import { SUPPORTED_VIDEO_FORMATS } from '../../constants/languages';

interface MediaUploadSectionProps {
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDrop: (e: React.DragEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isDraggingFile: boolean;
  draggedFileInfo: { name: string; type: 'subtitle' | 'video' | 'unknown' } | null;
  onOpenUrlModal: (type: 'URL' | 'YOUTUBE') => void;
  onOpenCloudModal: () => void;
  showToast: (msg: string) => void;
}

export const MediaUploadSection: React.FC<MediaUploadSectionProps> = ({
  file,
  fileInputRef,
  handleDrop,
  handleFileChange,
  isDraggingFile,
  draggedFileInfo,
  onOpenUrlModal,
  onOpenCloudModal,
  showToast
}) => {
  if (file) return null;

  return (
    <>
      {isDraggingFile && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none rounded-3xl text-neutral-200 z-10" style={{ overflow: 'visible' }}>
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="8 8"
            className="animate-marching-ants"
          />
        </svg>
      )}

      <div 
        className="flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px] w-full relative transition-all duration-300"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept={`.srt, ${SUPPORTED_VIDEO_FORMATS.join(',')}`} 
          onChange={handleFileChange} 
        />
        
        {isDraggingFile ? (
          <div className="flex flex-col items-center justify-center my-auto transition-all duration-300 animate-fade-in z-20 w-full px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center mb-4 shadow-xl shadow-black/50">
              {draggedFileInfo?.type === 'subtitle' ? (
                <FileText className="w-7 h-7 text-white" />
              ) : (
                <Film className="w-7 h-7 text-white" />
              )}
            </div>
            
            <h2 className="text-xl font-bold text-white mb-1.5">
              {draggedFileInfo?.type === 'subtitle' 
                ? 'Drop Subtitle File Here' 
                : draggedFileInfo?.type === 'video'
                ? 'Drop Video File Here'
                : 'Drop File Here to Import'}
            </h2>
            
            <p className="text-sm text-neutral-400 font-medium">
              {draggedFileInfo?.type === 'subtitle'
                ? 'Supports SRT & VTT formats'
                : draggedFileInfo?.type === 'video'
                ? 'Supports MP4, MKV, MOV, WEBM & AVI'
                : 'Release mouse button to upload file'}
            </p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-300">
              <Upload className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">
              Drop your SRT or Video file here
            </h2>
            <p className="text-neutral-500 mb-8">
              or click to browse local files
            </p>
            
            <div className="flex gap-4 z-20" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => onOpenUrlModal('URL')} 
                className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 transition-all group/btn" 
                title="Import from URL"
              >
                <LinkIcon className="w-5 h-5 text-neutral-400 group-hover/btn:text-white" />
              </button>
              <button 
                onClick={() => onOpenUrlModal('YOUTUBE')} 
                className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-red-500/50 transition-all group/btn" 
                title="Import from YouTube"
              >
                <Youtube className="w-5 h-5 text-neutral-400 group-hover/btn:text-red-500" />
              </button>
              <button 
                onClick={onOpenCloudModal} 
                className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group/btn" 
                title="Import from Cloud Drive"
              >
                <HardDrive className="w-5 h-5 text-neutral-400 group-hover/btn:text-blue-500" />
              </button>
              <button 
                onClick={() => showToast("Social Media Integration Coming Soon!")} 
                className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-pink-500/50 transition-all group/btn" 
                title="Other Sources"
              >
                <Instagram className="w-5 h-5 text-neutral-400 group-hover/btn:text-pink-500" />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};
