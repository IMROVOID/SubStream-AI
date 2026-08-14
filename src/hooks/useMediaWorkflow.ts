import { useState, useRef, useMemo } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { 
  SubtitleNode, 
  ExtractedSubtitleTrack, 
  TranslationStatus, 
  VideoProcessingStatus, 
  AIModel, 
  YouTubeVideoMetadata 
} from '../types';
import { LANGUAGES } from '../constants/languages';
import { parseSRT, normalizeResolutions } from '../utils/srtUtils';
import { generateVideoThumbnail } from '../utils/appHelpers';
import { triggerSrtDownload, processVideoDownload } from '../utils/mediaDownloadUtils';
import { loadFFmpeg, extractAudio, analyzeVideoFile, extractSrt } from '../services/ffmpegService';
import { downloadCaptionTrack, uploadVideoToYouTube, pollForCaptionReady, getVideoDetails } from '../services/youtubeService';
import { transcribeAudio, processFullSubtitleFile } from '../services/aiService';

interface UseMediaWorkflowProps {
  activeModelData: AIModel | null;
  activeApiKey: string;
  googleAccessToken: string | null;
  googleUser: { name: string; picture: string } | null;
  showToast: (title: string, message?: string, type?: 'info' | 'success' | 'error') => void;
  ensureMethodSelected: (actionDescription?: string) => boolean;
  onOpenConfigModal: () => void;
  resetDrag: () => void;
}

export function useMediaWorkflow({
  activeModelData,
  activeApiKey,
  googleAccessToken,
  googleUser,
  showToast,
  ensureMethodSelected,
  onOpenConfigModal,
  resetDrag
}: UseMediaWorkflowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'srt' | 'video' | 'youtube' | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [youtubeMeta, setYoutubeMeta] = useState<YouTubeVideoMetadata | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>('');

  const [ffmpegEngine, setFfmpegEngine] = useState<FFmpeg | null>(null);
  const [extractedTracks, setExtractedTracks] = useState<ExtractedSubtitleTrack[]>([]);
  const [extractedOriginalSrt, setExtractedOriginalSrt] = useState<string>('');
  const [localAvailableResolutions, setLocalAvailableResolutions] = useState<number[]>([]);
  const [localVideoDimensions, setLocalVideoDimensions] = useState<{ width: number; height: number } | undefined>(undefined);

  const [subtitles, setSubtitles] = useState<SubtitleNode[]>([]);
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('none');
  const [status, setStatus] = useState<TranslationStatus>(TranslationStatus.IDLE);
  const [videoProcessingStatus, setVideoProcessingStatus] = useState<VideoProcessingStatus>(VideoProcessingStatus.IDLE);
  const [videoProcessingMessage, setVideoProcessingMessage] = useState<string>('');
  const [ffmpegProgress, setFfmpegProgress] = useState<number>(0);
  const [showProgressBar, setShowProgressBar] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const [downloadProgress, setDownloadProgress] = useState<number | undefined>(undefined);
  const [downloadStatusText, setDownloadStatusText] = useState<string | undefined>(undefined);
  const [isDownloadComplete, setIsDownloadComplete] = useState<boolean>(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<'table' | 'video'>('table');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resolutionMenuRef = useRef<HTMLDivElement>(null);

  const isYouTubeWorkflow = fileType === 'youtube';
  const hasMedia = Boolean(file || (isYouTubeWorkflow && youtubeMeta));

  const sourceLangFont = useMemo(() => {
    if (isYouTubeWorkflow && selectedCaptionId) {
      const currentCaption = youtubeMeta?.availableCaptions?.find(c => c.id === selectedCaptionId);
      const langCodeOrName = currentCaption?.language || currentCaption?.name || selectedCaptionId;
      const matched = LANGUAGES.find(l => l.code === langCodeOrName || l.name === langCodeOrName);
      if (matched?.font) return matched.font;
    }
    return LANGUAGES.find(l => l.name === sourceLang || l.code === sourceLang)?.font;
  }, [sourceLang, selectedCaptionId, isYouTubeWorkflow, youtubeMeta]);

  const targetLangFont = useMemo(() => LANGUAGES.find(l => l.name === targetLang || l.code === targetLang)?.font, [targetLang]);

  const resetState = () => {
    setFile(null);
    setFileType(null);
    setVideoSrc(null);
    setVideoThumbnail(null);
    setYoutubeMeta(null);
    setSelectedCaptionId('');
    setSubtitles([]);
    setStatus(TranslationStatus.IDLE);
    setVideoProcessingStatus(VideoProcessingStatus.IDLE);
    setError(null);
    setProgress(0);
    setExtractedTracks([]);
    setExtractedOriginalSrt('');
    setDownloadProgress(undefined);
    setDownloadStatusText(undefined);
    setIsDownloadComplete(false);
    setShowResolutionMenu(false);
    setPreviewMode('table');
    resetDrag();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = async (selectedFile: File) => {
    if (!ensureMethodSelected("uploading or processing files")) return;
    resetState();
    setFile(selectedFile);

    const filename = selectedFile.name.toLowerCase();
    if (filename.endsWith('.srt') || filename.endsWith('.vtt')) {
      setFileType('srt');
      setStatus(TranslationStatus.PARSING);
      try {
        const text = await selectedFile.text();
        const parsed = parseSRT(text);
        if (parsed.length === 0) throw new Error("Could not find valid subtitles.");
        setSubtitles(parsed);
        setStatus(TranslationStatus.IDLE);
      } catch (err: any) {
        const msg = err.message || "Failed to parse subtitle file.";
        setError(msg);
        showToast("Error", msg, "error");
        setStatus(TranslationStatus.ERROR);
      }
    } else {
      setFileType('video');
      setVideoSrc(URL.createObjectURL(selectedFile));
      generateVideoThumbnail(selectedFile).then(setVideoThumbnail);

      setVideoProcessingStatus(VideoProcessingStatus.INITIALIZING_ENGINE);
      try {
        const ffmpeg = await loadFFmpeg(setVideoProcessingMessage);
        setFfmpegEngine(ffmpeg);
        setVideoProcessingStatus(VideoProcessingStatus.ANALYZING);
        setVideoProcessingMessage('Probing video metadata and subtitle tracks...');
        const { tracks, dimensions } = await analyzeVideoFile(ffmpeg, selectedFile);
        setExtractedTracks(tracks);
        setLocalVideoDimensions(dimensions);

        if (dimensions && dimensions.height > 0) {
          const effectiveHeight = (dimensions.width > 0 && dimensions.height > dimensions.width)
            ? dimensions.width
            : dimensions.height;
          setLocalAvailableResolutions(normalizeResolutions([effectiveHeight]));
        } else {
          setLocalAvailableResolutions([1080, 720, 480, 360]);
        }
        setVideoProcessingStatus(VideoProcessingStatus.DONE);
      } catch (err: any) {
        console.error("Video processing error:", err);
        const msg = "Failed to load video engine. Please try another video file.";
        setError(msg);
        showToast("Error", msg, "error");
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
      }
    }
  };

  const handleTrackSelection = async (trackIndex: number) => {
    let engine = ffmpegEngine;
    if (!engine) {
      setVideoProcessingStatus(VideoProcessingStatus.INITIALIZING_ENGINE);
      engine = await loadFFmpeg(setVideoProcessingMessage);
      setFfmpegEngine(engine);
    }
    setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
    setVideoProcessingMessage('Extracting embedded subtitles...');
    try {
      const srtText = await extractSrt(engine, trackIndex);
      const parsed = parseSRT(srtText);
      setSubtitles(parsed);
      setExtractedOriginalSrt(srtText);
      setVideoProcessingStatus(VideoProcessingStatus.DONE);
    } catch (e: any) {
      const msg = "Failed to extract chosen subtitle track.";
      setError(msg);
      showToast("Error", msg, "error");
      setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const handleGenerateSubtitles = async () => {
    if (fileType === 'youtube') {
      const msg = "This action is for local video files. Please select a language to generate captions for your YouTube import.";
      setError(msg);
      showToast("Notice", msg, "info");
      return;
    }
    if (!activeModelData) {
      ensureMethodSelected("generating subtitles");
      return;
    }

    if (activeModelData.provider === 'youtube') {
      if (!googleAccessToken || !googleUser || !file) {
        const msg = "Please authenticate with YouTube in Settings to use this feature.";
        setError(msg);
        showToast("YouTube Auth Required", msg, "error");
        onOpenConfigModal();
        return;
      }

      try {
        setError(null);
        setVideoProcessingStatus(VideoProcessingStatus.UPLOADING_TO_YOUTUBE);
        setVideoProcessingMessage('Uploading video to YouTube (Unlisted)...');
        setShowProgressBar(true);
        setFfmpegProgress(0);
        
        const videoId = await uploadVideoToYouTube(
          googleAccessToken, 
          file, 
          file.name.replace(/\.[^/.]+$/, ''),
          (percent) => setFfmpegProgress(percent / 2)
        );
        
        setVideoProcessingStatus(VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS);
        await pollForCaptionReady(
          googleAccessToken, 
          videoId, 
          (msg, percent) => {
            setVideoProcessingMessage(msg);
            setFfmpegProgress(50 + (percent / 2));
          }
        );

        let resolutions: number[] = [];
        try {
          const details = await getVideoDetails(`https://www.youtube.com/watch?v=${videoId}`);
          resolutions = normalizeResolutions(details.meta.availableResolutions || []);
        } catch {
          resolutions = [1080, 720, 480, 360];
        }
        
        setYoutubeMeta({
          id: videoId,
          title: file.name,
          description: 'Uploaded by SubStream AI for transcription.',
          thumbnailUrl: videoThumbnail || '',
          channelTitle: googleUser.name,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          availableResolutions: resolutions,
          isOAuthFlow: true
        });

        setVideoProcessingStatus(VideoProcessingStatus.DONE); 
        setFileType('youtube');
      } catch (e: any) {
        console.error("YouTube Auto-Caption Error:", e);
        const msg = e.message || "";
        let displayError = msg || "Failed to upload video to YouTube.";
        if (msg.toLowerCase().includes("quota")) {
          displayError = "Daily YouTube Upload Quota Exceeded. Please try again tomorrow or use a Gemini/OpenAI model.";
        } else if (msg.includes("401")) {
          displayError = `Session expired. Please click "Authenticate YouTube" again.`;
        }
        setError(displayError);
        showToast("YouTube Error", displayError, "error");
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
      }
      return;
    }

    if (!file) return;
    if (!activeApiKey) {
      const keyMsg = `Please provide an API Key for ${activeModelData.name} in Settings to start processing.`;
      setError(keyMsg);
      showToast("API Key Required", keyMsg, "error");
      onOpenConfigModal();
      return;
    }

    let engine = ffmpegEngine;
    if (!engine) {
      setVideoProcessingStatus(VideoProcessingStatus.INITIALIZING_ENGINE);
      setVideoProcessingMessage('Initializing video engine...');
      try {
        engine = await loadFFmpeg(setVideoProcessingMessage);
        setFfmpegEngine(engine);
      } catch (e: any) {
        const msg = "Failed to initialize video engine. Please try again.";
        setError(msg);
        showToast("Error", msg, "error");
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
        return;
      }
    }

    setShowProgressBar(true);
    setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_AUDIO);
    setVideoProcessingMessage('Extracting audio stream...');
    try {
      const audioBlob = await extractAudio(engine);
      setVideoProcessingStatus(VideoProcessingStatus.TRANSCRIBING);
      setVideoProcessingMessage(`Transcribing audio with ${activeModelData.name}...`);
      const srtString = await transcribeAudio(audioBlob, sourceLang, activeApiKey, activeModelData);
      const parsed = parseSRT(srtString);
      setSubtitles(parsed);
      setExtractedOriginalSrt(srtString);
      setVideoProcessingStatus(VideoProcessingStatus.DONE);

      if (targetLang && targetLang !== 'none') {
        setStatus(TranslationStatus.TRANSLATING);
        setError(null);
        setProgress(0);

        const translatedSubtitles = await processFullSubtitleFile(
          parsed,
          sourceLang,
          targetLang,
          activeApiKey,
          activeModelData,
          (processed) => setProgress(Math.round((processed / parsed.length) * 100)),
          (batchResult) => setSubtitles([...batchResult])
        );
        setSubtitles([...translatedSubtitles]);
        setStatus(TranslationStatus.COMPLETED);
        showToast("Translation Complete!", "All subtitles translated successfully.", "success");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
      } else {
        setStatus(TranslationStatus.COMPLETED);
        showToast("Transcription Complete!", "Subtitles generated successfully.", "success");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
      }
    } catch (e: any) {
      const msg = e.message || "Failed to process subtitles.";
      console.error("Processing Error:", e);
      setError(msg);
      showToast("Error", msg, "error");
      setVideoProcessingStatus(VideoProcessingStatus.ERROR);
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleTranslate = async () => {
    if (subtitles.length === 0) return;
    if (!activeModelData) {
      ensureMethodSelected("translating subtitles");
      return;
    }
    if (!activeApiKey) {
      const keyMsg = `Please provide an API Key for ${activeModelData.name} in Settings to start translation.`;
      setError(keyMsg);
      showToast("API Key Required", keyMsg, "error");
      onOpenConfigModal();
      return;
    }
    setStatus(TranslationStatus.TRANSLATING);
    setError(null);
    setProgress(0);
    try {
      const finalSubtitles = await processFullSubtitleFile(
        subtitles,
        sourceLang,
        targetLang,
        activeApiKey,
        activeModelData,
        (processed) => setProgress(Math.round((processed / subtitles.length) * 100)),
        (batchResult) => setSubtitles([...batchResult])
      );
      setSubtitles([...finalSubtitles]);
      setStatus(TranslationStatus.COMPLETED);
      showToast("Translation Complete!", "All subtitles translated successfully.", "success");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (e: any) {
      console.error(e);
      const msg = e.message || "Translation failed.";
      setError(msg);
      showToast("Translation Error", msg, "error");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleDownloadSrt = () => {
    triggerSrtDownload(subtitles, isYouTubeWorkflow, youtubeMeta, file, sourceLang, targetLang, selectedCaptionId);
  };

  const handleDownloadVideo = async (targetResolution?: number) => {
    try {
      setIsDownloadComplete(false);
      await processVideoDownload({
        fileType,
        youtubeMeta,
        file,
        ffmpegEngine,
        subtitles,
        sourceLang,
        targetLang,
        selectedCaptionId,
        extractedOriginalSrt,
        targetResolution,
        onProgress: setDownloadProgress,
        onStatusChange: setDownloadStatusText
      });
      setIsDownloadComplete(true);
      showToast(fileType === 'youtube' ? "Download Complete" : "Download Started", fileType === 'youtube' ? "YouTube video downloaded." : "Your softsubbed video has been prepared.", "success");
      setTimeout(() => {
        setDownloadProgress(undefined);
        setDownloadStatusText(undefined);
        setIsDownloadComplete(false);
      }, 3000);
    } catch (e: any) {
      console.error("Video download error:", e);
      const msg = e.message || "Failed to process video download.";
      setError(msg);
      showToast("Download Error", msg, "error");
      setDownloadProgress(undefined);
      setDownloadStatusText(undefined);
    }
  };

  const handleImportYouTube = (meta: YouTubeVideoMetadata) => {
    resetState();
    setFileType('youtube');
    setYoutubeMeta(meta);
    if (meta.availableCaptions && meta.availableCaptions.length > 0) {
      const defaultCaption = meta.availableCaptions.find((c: any) => 
        c.language === 'en' || 
        c.language === 'en-orig' || 
        c.language?.startsWith('en-') || 
        c.name?.toLowerCase().includes('english')
      ) || meta.availableCaptions[0];
      setSelectedCaptionId(defaultCaption.id);
    }
  };

  const handleYouTubeCaptionDownload = async () => {
    if (!youtubeMeta || !selectedCaptionId) return;
    setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
    setVideoProcessingMessage('Downloading captions...');
    try {
      const srtText = await downloadCaptionTrack(youtubeMeta.videoUrl, selectedCaptionId);
      const parsed = parseSRT(srtText);
      if (parsed.length === 0) throw new Error("Could not parse downloaded subtitles.");
      setSubtitles(parsed);
      setVideoProcessingStatus(VideoProcessingStatus.DONE);
      setStatus(TranslationStatus.COMPLETED);
      showToast("Captions Ready!", "YouTube subtitles imported successfully.", "success");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (e: any) {
      const msg = e.message || "Failed to download YouTube captions.";
      setError(msg);
      showToast("Error", msg, "error");
      setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const isConfigureStepActive = hasMedia && subtitles.length === 0 && status !== TranslationStatus.TRANSLATING && status !== TranslationStatus.COMPLETED;

  return {
    file,
    fileType,
    videoSrc,
    videoThumbnail,
    youtubeMeta,
    selectedCaptionId,
    setSelectedCaptionId,
    extractedTracks,
    localAvailableResolutions,
    localVideoDimensions,
    subtitles,
    setSubtitles,
    sourceLang,
    setSourceLang,
    targetLang,
    setTargetLang,
    status,
    videoProcessingStatus,
    videoProcessingMessage,
    ffmpegProgress,
    showProgressBar,
    progress,
    error,
    setError,
    downloadProgress,
    downloadStatusText,
    isDownloadComplete,
    showResolutionMenu,
    setShowResolutionMenu,
    previewMode,
    setPreviewMode,
    fileInputRef,
    resultsRef,
    resolutionMenuRef,
    isYouTubeWorkflow,
    hasMedia,
    isConfigureStepActive,
    sourceLangFont,
    targetLangFont,
    resetState,
    processFile,
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
    },
    handleDrop: (e: React.DragEvent) => {
      e.preventDefault();
      resetDrag();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    },
    handleTrackSelection,
    handleGenerateSubtitles,
    handleTranslate,
    handleDownloadSrt,
    handleDownloadVideo,
    handleImportYouTube,
    handleYouTubeCaptionDownload
  };
}
