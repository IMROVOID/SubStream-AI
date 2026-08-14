import React from 'react';
import { Table, Video, Film, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { SubtitleNode, YouTubeVideoMetadata, TranslationStatus } from '../../types';
import { normalizeResolutions, stringifySRT } from '../../utils/srtUtils';
import { Button } from '../common/Button';
import { SubtitleCard } from '../subtitle/SubtitleCard';
import { VideoPlayer } from '../player/VideoPlayer';

interface LivePreviewSectionProps {
  resultsRef: React.RefObject<HTMLDivElement>;
  previewMode: 'table' | 'video';
  setPreviewMode: (mode: 'table' | 'video') => void;
  subtitles: SubtitleNode[];
  isYouTubeWorkflow: boolean;
  targetLang: string;
  sourceLang: string;
  youtubeMeta: YouTubeVideoMetadata | null;
  selectedCaptionId: string;
  fileType: 'srt' | 'video' | 'youtube' | null;
  resolutionMenuRef: React.RefObject<HTMLDivElement>;
  status: TranslationStatus;
  downloadProgress: number | undefined;
  downloadStatusText: string | undefined;
  isDownloadComplete: boolean;
  showResolutionMenu: boolean;
  setShowResolutionMenu: React.Dispatch<React.SetStateAction<boolean>>;
  localAvailableResolutions: number[];
  localVideoDimensions?: { width: number; height: number };
  handleDownloadVideo: (resolution?: number) => void;
  handleDownloadSrt: () => void;
  sourceLangFont?: string;
  targetLangFont?: string;
  videoSrc: string | null;
  resetState: () => void;
}

export const LivePreviewSection: React.FC<LivePreviewSectionProps> = ({
  resultsRef,
  previewMode,
  setPreviewMode,
  subtitles,
  isYouTubeWorkflow,
  targetLang,
  sourceLang,
  youtubeMeta,
  selectedCaptionId,
  fileType,
  resolutionMenuRef,
  status,
  downloadProgress,
  downloadStatusText,
  isDownloadComplete,
  showResolutionMenu,
  setShowResolutionMenu,
  localAvailableResolutions,
  localVideoDimensions,
  handleDownloadVideo,
  handleDownloadSrt,
  sourceLangFont,
  targetLangFont,
  videoSrc,
  resetState
}) => {
  if (subtitles.length === 0) return null;

  return (
    <section 
      ref={resultsRef} 
      className={`border-t border-neutral-900 px-0 flex flex-col justify-between scroll-mt-28 md:scroll-mt-20 snap-start snap-always animate-slide-up overflow-hidden box-border transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
        previewMode === 'video' 
          ? 'h-auto min-h-0 max-h-none md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-4 pb-4 md:pt-16 md:pb-20' 
          : 'h-[calc(100dvh-7rem)] min-h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-4 pb-4 md:pt-9 md:pb-11'
      }`}
    >
      {/* HEADER WITH CONTROLS */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) mb-4">
        <div>
          <div className="flex items-center gap-3 mb-[0.5rem]">
            <h2 className="text-3xl font-display font-bold text-white">Live Preview</h2>
            <div className="relative inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-xl select-none shadow-sm">
              <div 
                className="absolute top-1 bottom-1 left-1 w-[2rem] sm:w-[3.5rem] bg-neutral-800 rounded-lg transition-transform duration-300 ease-out shadow-sm" 
                style={{ transform: `translateX(${previewMode === 'video' ? '100%' : '0%'})` }} 
              />
              <button 
                type="button"
                onClick={() => setPreviewMode('table')} 
                className={`relative z-10 w-[2rem] sm:w-[3.5rem] py-[0.35rem] sm:py-[0.2rem] text-[0.7rem] font-semibold flex items-center justify-center transition-colors duration-300 rounded-lg ${
                  previewMode === 'table' ? 'text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Table className="w-3.5 h-3.5 sm:hidden" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button 
                type="button"
                onClick={() => setPreviewMode('video')} 
                className={`relative z-10 w-[2rem] sm:w-[3.5rem] py-[0.35rem] sm:py-[0.2rem] text-[0.7rem] font-semibold flex items-center justify-center transition-colors duration-300 rounded-lg ${
                  previewMode === 'video' ? 'text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5 sm:hidden" />
                <span className="hidden sm:inline">Video</span>
              </button>
            </div>
          </div>
          <p className="text-neutral-500 text-sm">
            {isYouTubeWorkflow 
              ? 'Review the generated transcription below.' 
              : targetLang === 'none' 
              ? 'Review generated transcription.' 
              : 'Comparing original vs translated output.'}
          </p>
        </div>

        <div className="flex items-center relative w-full sm:w-auto mt-2 sm:mt-0">
          {(fileType === 'video' || fileType === 'youtube') ? (
            <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-sm gap-1 w-full sm:w-auto">
              <div 
                className="relative flex-1 sm:flex-initial" 
                ref={resolutionMenuRef}
                onMouseEnter={() => {
                  if (window.matchMedia('(hover: hover)').matches && status !== TranslationStatus.TRANSLATING && !downloadProgress) {
                    setShowResolutionMenu(true);
                  }
                }}
                onMouseLeave={() => {
                  if (window.matchMedia('(hover: hover)').matches) {
                    setShowResolutionMenu(false);
                  }
                }}
              >
                <Button 
                  variant="secondary" 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (status !== TranslationStatus.TRANSLATING && !downloadProgress) {
                      setShowResolutionMenu(prev => !prev);
                    }
                  }} 
                  progress={downloadProgress}
                  statusText={downloadStatusText}
                  completed={isDownloadComplete}
                  disabled={status === TranslationStatus.TRANSLATING}
                  icon={!downloadProgress ? <Film className="w-4 h-4" /> : undefined}
                  className="w-full !bg-transparent hover:!bg-neutral-900/90 !text-neutral-300 hover:!text-white !border-0 rounded-xl focus:outline-none focus:ring-0 active:outline-none px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Download Video</span>
                  {!downloadProgress && (
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${showResolutionMenu ? 'rotate-180' : ''}`} />
                  )}
                </Button>
                {showResolutionMenu && status !== TranslationStatus.TRANSLATING && !downloadProgress && (
                  <div className="absolute right-0 top-full pt-1.5 z-30 animate-fade-in w-full sm:w-48">
                    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden py-1">
                      {isYouTubeWorkflow && youtubeMeta?.availableResolutions && youtubeMeta.availableResolutions.length > 0 ? (
                        normalizeResolutions(youtubeMeta.availableResolutions).map((res) => (
                          <button
                            key={res}
                            onClick={() => { setShowResolutionMenu(false); handleDownloadVideo(res); }}
                            className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between transition-colors"
                          >
                            <span>{res}p</span>
                            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400">MP4</span>
                          </button>
                        ))
                      ) : (
                        normalizeResolutions(localAvailableResolutions).map((res) => (
                          <button
                            key={res}
                            onClick={() => { setShowResolutionMenu(false); handleDownloadVideo(res); }}
                            className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between transition-colors"
                          >
                            <span>{localVideoDimensions?.height && res === localVideoDimensions.height ? `${res}p (Original)` : `${res}p`}</span>
                            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400">MKV</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button 
                variant="primary" 
                onClick={handleDownloadSrt} 
                disabled={status === TranslationStatus.TRANSLATING || !!downloadProgress} 
                icon={<Download className="w-4 h-4" />}
                className="flex-1 sm:flex-initial w-full !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 hover:!text-white !border-0 rounded-xl focus:outline-none focus:ring-0 active:outline-none px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold transition-all flex items-center justify-center shadow-sm"
              >
                Download SRT
              </Button>
            </div>
          ) : (
            <Button 
              variant="primary" 
              onClick={handleDownloadSrt} 
              disabled={status === TranslationStatus.TRANSLATING} 
              icon={<Download className="w-4 h-4" />}
              className="w-full sm:w-auto px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all focus:outline-none focus:ring-0 active:outline-none"
            >
              Download SRT
            </Button>
          )}
        </div>
      </div>

      {/* PREVIEW CONTAINER */}
      <div className={`w-full flex flex-col overflow-hidden relative transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
        previewMode === 'video' 
          ? 'aspect-video md:aspect-auto md:flex-1 md:min-h-0 my-2 md:my-0' 
          : 'flex-1 min-h-0 my-2.5'
      }`}>
        <div 
          className={`absolute inset-0 flex flex-col rounded-3xl border border-neutral-800/80 bg-black/70 backdrop-blur overflow-hidden transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
            previewMode === 'table' ? 'opacity-100 scale-100 pointer-events-auto z-10' : 'opacity-0 scale-[0.98] pointer-events-none z-0'
          }`}
        >
          <div className="grid grid-cols-[112px_1fr] border-b border-neutral-800/80 bg-neutral-950/80 px-6 py-3.5 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky top-0 z-10 shrink-0">
            <div className="w-24">Timestamp</div>
            <div className={`grid ${isYouTubeWorkflow || targetLang === 'none' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
              <span>Original ({isYouTubeWorkflow ? (youtubeMeta?.availableCaptions?.find(c => c.id === selectedCaptionId)?.name || 'Selected Language') : sourceLang})</span>
              {!isYouTubeWorkflow && targetLang !== 'none' && <span className="text-white">Translated ({targetLang})</span>}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
            {subtitles.map((sub) => ( 
              <SubtitleCard 
                key={sub.id} 
                subtitle={sub} 
                isActive={sub.text !== sub.originalText} 
                isSingleColumn={isYouTubeWorkflow || targetLang === 'none'}
                sourceFont={sourceLangFont}
                targetFont={targetLangFont}
              /> 
            ))}
          </div>
        </div>

        <div 
          className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
            previewMode === 'video' ? 'opacity-100 scale-100 pointer-events-auto z-10' : 'opacity-0 scale-[0.98] pointer-events-none z-0'
          }`}
        >
          <VideoPlayer 
            videoSrc={(isYouTubeWorkflow || (fileType as string) === 'youtube') ? (youtubeMeta?.videoUrl || youtubeMeta?.id || videoSrc || '') : (videoSrc || '')} 
            srtContent={stringifySRT(subtitles)} 
            isYouTube={isYouTubeWorkflow || (fileType as string) === 'youtube'} 
            availableResolutions={(isYouTubeWorkflow || (fileType as string) === 'youtube') ? (youtubeMeta?.availableResolutions || []) : localAvailableResolutions}
            className="max-h-full aspect-video"
          />
        </div>
      </div>

      {/* PROCESS ANOTHER FILE */}
      <div className="shrink-0 flex justify-center pt-4 pb-1">
        <Button variant="secondary" onClick={resetState} icon={<RefreshCw className="w-4 h-4" />}>
          Process Another File
        </Button>
      </div>
    </section>
  );
};
