import React from 'react';
import { Youtube, Loader2 } from 'lucide-react';
import { 
  TranslationStatus, 
  VideoProcessingStatus, 
  AIModel, 
  YouTubeVideoMetadata, 
  ExtractedSubtitleTrack, 
  SubtitleNode 
} from '../../types';
import { WorkflowSteps } from './WorkflowSteps';
import { VideoPlayer } from '../player/VideoPlayer';
import { MediaUploadSection } from './MediaUploadSection';
import { ProcessingProgress } from './ProcessingProgress';
import { TrackSelector } from '../subtitle/TrackSelector';
import { SelectedMediaHeader } from './SelectedMediaHeader';
import { SubtitleGeneratorPanel } from './SubtitleGeneratorPanel';
import { ErrorBanner } from './ErrorBanner';

interface WorkflowSectionProps {
  status: TranslationStatus;
  hasMedia: boolean;
  isConfigureStepActive: boolean;
  subtitles: SubtitleNode[];
  isYouTubeWorkflow: boolean;
  fileType: 'srt' | 'video' | 'youtube' | null;
  file: File | null;
  videoSrc: string | null;
  youtubeMeta: YouTubeVideoMetadata | null;
  videoThumbnail: string | null;
  localAvailableResolutions: number[];
  isDraggingFile: boolean;
  draggedFileInfo: { name: string; type: 'subtitle' | 'video' | 'unknown' } | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDrop: (e: React.DragEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenUrlModal: (type: 'URL' | 'YOUTUBE') => void;
  onOpenCloudModal: () => void;
  showToast: (title: string, message?: string, type?: 'info' | 'success' | 'error') => void;
  hasMethodSelected: boolean;
  onRequireMethod: () => void;
  videoProcessingStatus: VideoProcessingStatus;
  videoProcessingMessage: string;
  showProgressBar: boolean;
  ffmpegProgress: number;
  extractedTracks: ExtractedSubtitleTrack[];
  handleTrackSelection: (index: number) => void;
  handleGenerateSubtitles: () => void;
  activeModelData: AIModel | null;
  googleUser: any;
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
  resetState: () => void;
  selectedCaptionId: string;
  setSelectedCaptionId: (id: string) => void;
  handleYouTubeCaptionDownload: () => void;
  handleTranslate: () => void;
  progress: number;
  error: string | null;
  activeApiKey: string;
  onOpenSettings: () => void;
}

export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  status,
  hasMedia,
  isConfigureStepActive,
  subtitles,
  isYouTubeWorkflow,
  fileType,
  file,
  videoSrc,
  youtubeMeta,
  videoThumbnail,
  localAvailableResolutions,
  isDraggingFile,
  draggedFileInfo,
  fileInputRef,
  handleDrop,
  handleFileChange,
  onOpenUrlModal,
  onOpenCloudModal,
  showToast,
  hasMethodSelected,
  onRequireMethod,
  videoProcessingStatus,
  videoProcessingMessage,
  showProgressBar,
  ffmpegProgress,
  extractedTracks,
  handleTrackSelection,
  handleGenerateSubtitles,
  activeModelData,
  googleUser,
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  resetState,
  selectedCaptionId,
  setSelectedCaptionId,
  handleYouTubeCaptionDownload,
  handleTranslate,
  progress,
  error,
  activeApiKey,
  onOpenSettings
}) => {
  const isProcessingVideo = (
    videoProcessingStatus !== VideoProcessingStatus.IDLE && 
    videoProcessingStatus !== VideoProcessingStatus.DONE && 
    videoProcessingStatus !== VideoProcessingStatus.ERROR
  );

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-8 items-stretch ${subtitles.length === 0 ? 'pb-16' : 'pb-8'}`}>
      <WorkflowSteps 
        status={status}
        hasMedia={hasMedia}
        isConfigureStepActive={isConfigureStepActive}
        subtitlesLength={subtitles.length}
        isYouTubeWorkflow={isYouTubeWorkflow}
      />

      <div className="order-1 lg:order-2 lg:col-span-9 h-full flex flex-col justify-start lg:justify-between gap-4 sm:gap-5 lg:gap-6">
        {/* VIDEO PLAYER PREVIEW (for video files & youtube imports) */}
        {(fileType === 'video' || fileType === 'youtube') && (
          (fileType === 'youtube' && youtubeMeta) ? (
            <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800 relative group">
              <img src={youtubeMeta.thumbnailUrl} alt={youtubeMeta.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="px-4 py-2 bg-black/70 rounded-xl backdrop-blur border border-white/10 text-sm text-white font-medium flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" /> YouTube Import
                </div>
              </div>
            </div>
          ) : videoSrc ? (
            <VideoPlayer 
              videoSrc={videoSrc} 
              srtContent="" 
              isYouTube={false} 
              availableResolutions={localAvailableResolutions} 
            />
          ) : null
        )}

        {/* MEDIA UPLOAD CONTAINER / PROCESSING SPINNER / TRACK SELECTOR / FILE HEADER */}
        <div className={`group relative rounded-3xl p-4 sm:p-6 transition-all duration-300 overflow-hidden ${
          isDraggingFile && !hasMedia
            ? 'border border-transparent bg-neutral-900/60 scale-[1.01]'
            : 'border border-neutral-800 bg-neutral-900/20 hover:bg-neutral-900/30'
        }`}>
          {!hasMedia ? (
            <MediaUploadSection 
              file={file}
              fileInputRef={fileInputRef}
              handleDrop={handleDrop}
              handleFileChange={handleFileChange}
              isDraggingFile={isDraggingFile}
              draggedFileInfo={draggedFileInfo}
              onOpenUrlModal={onOpenUrlModal}
              onOpenCloudModal={onOpenCloudModal}
              showToast={showToast}
              hasMethodSelected={hasMethodSelected}
              onRequireMethod={onRequireMethod}
            />
          ) : isProcessingVideo ? (
            <ProcessingProgress 
              videoProcessingStatus={videoProcessingStatus}
              videoProcessingMessage={videoProcessingMessage}
              showProgressBar={showProgressBar}
              ffmpegProgress={ffmpegProgress}
            />
          ) : (fileType === 'video' && subtitles.length === 0 && (videoProcessingStatus === VideoProcessingStatus.IDLE || videoProcessingStatus === VideoProcessingStatus.DONE)) ? (
            <TrackSelector 
              tracks={extractedTracks} 
              onSelectTrack={handleTrackSelection} 
              onGenerate={handleGenerateSubtitles}
              activeModel={activeModelData}
              isYouTubeAuthenticated={!!googleUser}
              sourceLang={sourceLang}
              setSourceLang={setSourceLang}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
            />
          ) : (
            <SelectedMediaHeader 
              file={file}
              fileType={fileType}
              youtubeMeta={youtubeMeta}
              videoThumbnail={videoThumbnail}
              subtitlesLength={subtitles.length}
              onReset={resetState}
            />
          )}
        </div>

        {/* GENERATOR / TRANSLATION PANEL */}
        {hasMedia && (
          <SubtitleGeneratorPanel
            isYouTubeWorkflow={isYouTubeWorkflow}
            youtubeMeta={youtubeMeta}
            selectedCaptionId={selectedCaptionId}
            setSelectedCaptionId={setSelectedCaptionId}
            videoProcessingStatus={videoProcessingStatus}
            handleYouTubeCaptionDownload={handleYouTubeCaptionDownload}
            subtitles={subtitles}
            sourceLang={sourceLang}
            setSourceLang={setSourceLang}
            targetLang={targetLang}
            setTargetLang={setTargetLang}
            isTranslationInProgress={status === TranslationStatus.TRANSLATING}
            status={status}
            progress={progress}
            activeModelData={activeModelData}
            handleTranslate={handleTranslate}
          />
        )}

        {/* ERROR BANNER */}
        <ErrorBanner 
          error={error}
          activeApiKey={activeApiKey}
          onOpenSettings={onOpenSettings}
        />

        {/* TRANSLATION PROGRESS BAR */}
        {status === TranslationStatus.TRANSLATING && (
          <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between text-sm font-bold text-white">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
                <span>Translating with {activeModelData?.name || 'AI'}...</span>
              </div>
              <span className="font-mono text-white">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
