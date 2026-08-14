import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Sparkles, 
  BookText, 
  Film, 
  ChevronDown, 
  Download, 
  RefreshCw, 
  Table, 
  Video, 
  Github, 
  Heart, 
  Youtube, 
  Clapperboard, 
  FileText, 
  Loader2, 
  AlertCircle,
  Info 
} from 'lucide-react';
import { StepIndicator } from './components/workflow/StepIndicator';
import { SubtitleCard } from './components/subtitle/SubtitleCard';
import { TrackSelector } from './components/subtitle/TrackSelector';
import { VideoPlayer } from './components/player/VideoPlayer';
import { Modal } from './components/common/Modal';
import { Button } from './components/common/Button';
import { Documentation } from './components/docs/Documentation';
import { HeaderBar } from './components/app/HeaderBar';
import { SettingsDrawer, GeminiTier } from './components/app/SettingsDrawer';
import { MediaUploadSection } from './components/app/MediaUploadSection';
import { SubtitleGeneratorPanel } from './components/app/SubtitleGeneratorPanel';
import { Footer } from './components/app/Footer';
import { LegalModals } from './components/app/LegalModals';
import { ImportUrlModal } from './components/modals/ImportUrlModal';
import { CloudImportModal } from './components/modals/CloudImportModal';
import { YouTubeAuth } from './components/common/YouTubeAuth';
import { useToast } from './hooks/useToast';
import { useDragAndDrop } from './hooks/useDragAndDrop';

import { 
  SubtitleNode, 
  ExtractedSubtitleTrack, 
  TranslationStatus, 
  VideoProcessingStatus, 
  AIModel, 
  AVAILABLE_MODELS, 
  LANGUAGES, 
  SUPPORTED_VIDEO_FORMATS, 
  YouTubeVideoMetadata, 
  RPMLimit, 
  OPENAI_RPM_OPTIONS, 
  ANTHROPIC_RPM_OPTIONS 
} from './types';
import { parseSRT, stringifySRT, downloadFile, getFormattedDownloadFilename, normalizeResolutions } from './utils/srtUtils';
import { getAuthItem, setAuthItem, removeAuthItem } from './utils/cookieUtils';
import { 
  transcribeAudio, 
  processFullSubtitleFile, 
  setGlobalRPM, 
  validateGoogleApiKey, 
  validateOpenAIApiKey, 
  validateAnthropicApiKey 
} from './services/aiService';
import { loadFFmpeg, extractAudio, analyzeVideoFile, extractSrt, addSrtToVideo } from './services/ffmpegService';
import { downloadCaptionTrack, downloadYouTubeVideoWithSubs, uploadVideoToYouTube, pollForCaptionReady, getVideoDetails } from './services/youtubeService';
import { syncModels, getCachedModels, getSyncInfo } from './services/modelSyncService';
import { FFmpeg } from '@ffmpeg/ffmpeg';

type TokenResponse = {
  access_token: string;
};

const getVideoProcessingStatusTitle = (status: VideoProcessingStatus) => {
  switch (status) {
    case VideoProcessingStatus.INITIALIZING_ENGINE: return "Initializing Engine";
    case VideoProcessingStatus.ANALYZING: return "Analyzing Video";
    case VideoProcessingStatus.EXTRACTING_AUDIO: return "Extracting Audio";
    case VideoProcessingStatus.TRANSCRIBING: return "Transcribing Audio";
    case VideoProcessingStatus.EXTRACTING_SUBTITLES: return "Extracting Subtitles";
    case VideoProcessingStatus.UPLOADING_TO_YOUTUBE: return "Uploading to YouTube";
    case VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS: return "Waiting for YouTube Processing";
    case VideoProcessingStatus.MUXING: return "Muxing Subtitles";
    default: return "Processing";
  }
};

const generateVideoThumbnail = (videoFile: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
      canvas.remove();
    };

    video.onloadedmetadata = () => {
      const seekTime = video.duration > 1 ? 1 : Math.max(0, video.duration / 2);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
          cleanup();
          return resolve('');
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        resolve('');
      }
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };

    setTimeout(() => {
      cleanup();
      resolve('');
    }, 3000);
  });
};

const resolveAvailableModel = (
  googleKey: string,
  openAIKey: string,
  anthropicKey: string,
  googleUser: any,
  models: AIModel[]
): string => {
  if (googleKey.trim()) {
    const firstGoogle = models.find(m => m.provider === 'google');
    if (firstGoogle) return firstGoogle.id;
  }
  if (openAIKey.trim()) {
    const firstOpenAI = models.find(m => m.provider === 'openai');
    if (firstOpenAI) return firstOpenAI.id;
  }
  if (anthropicKey.trim()) {
    const firstAnthropic = models.find(m => m.provider === 'anthropic');
    if (firstAnthropic) return firstAnthropic.id;
  }
  if (googleUser) {
    return 'youtube-auto';
  }
  return '';
};

const isModelValidForCurrentAuth = (
  modelId: string,
  googleKey: string,
  openAIKey: string,
  anthropicKey: string,
  googleUser: any,
  models: AIModel[]
): boolean => {
  if (!modelId) return false;
  const model = models.find(m => m.id === modelId);
  if (!model) return false;
  if (model.provider === 'google') return Boolean(googleKey.trim());
  if (model.provider === 'openai') return Boolean(openAIKey.trim());
  if (model.provider === 'anthropic') return Boolean(anthropicKey.trim());
  if (model.provider === 'youtube') return Boolean(googleUser);
  return false;
};

export function App() {
  const [currentPage, setCurrentPage] = useState<'HOME' | 'DOCS'>('HOME');
  const [activeModal, setActiveModal] = useState<'NONE' | 'CONFIG' | 'TOS' | 'PRIVACY'>('NONE');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [importType, setImportType] = useState<'URL' | 'YOUTUBE' | null>(null);

  const [modelsList, setModelsList] = useState<AIModel[]>(() => getCachedModels() || AVAILABLE_MODELS);
  const [syncInfo, setSyncInfo] = useState<any>(() => getSyncInfo());
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    youtube: true,
    google: true,
    openai: false,
    anthropic: false
  });

  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<{ name: string; picture: string } | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedRPM, setSelectedRPM] = useState<RPMLimit>(15);
  const [isCustomRPM, setIsCustomRPM] = useState(false);
  const [customRPMInput, setCustomRPMInput] = useState('15');
  const [selectedGeminiTier, setSelectedGeminiTier] = useState<GeminiTier>('free');

  const [userGoogleApiKey, setUserGoogleApiKey] = useState<string>('');
  const [tempGoogleApiKey, setTempGoogleApiKey] = useState<string>('');
  const [googleApiKeyStatus, setGoogleApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [userOpenAIApiKey, setUserOpenAIApiKey] = useState<string>('');
  const [tempOpenAIApiKey, setTempOpenAIApiKey] = useState<string>('');
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [userAnthropicApiKey, setUserAnthropicApiKey] = useState<string>('');
  const [tempAnthropicApiKey, setTempAnthropicApiKey] = useState<string>('');
  const [anthropicApiKeyStatus, setAnthropicApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [requestsUsed, setRequestsUsed] = useState<number>(0);

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

  const { toasts, showToast } = useToast();
  const { isDraggingFile, draggedFileInfo, resetDrag } = useDragAndDrop((f) => processFile(f));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resolutionMenuRef = useRef<HTMLDivElement>(null);

  const debounceGoogleKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceOpenAIKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceAnthropicKeyTimer = useRef<NodeJS.Timeout | null>(null);

  const isYouTubeAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=youtube_auth');
  }, []);

  const isDriveAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=drive_auth');
  }, []);

  const activeModelData = useMemo<AIModel | null>(() => {
    if (!selectedModelId) return null;
    return modelsList.find(m => m.id === selectedModelId) || null;
  }, [selectedModelId, modelsList]);

  const activeApiKey = useMemo(() => {
    if (!activeModelData) return '';
    if (activeModelData.provider === 'openai') return userOpenAIApiKey;
    if (activeModelData.provider === 'anthropic') return userAnthropicApiKey;
    if (activeModelData.provider === 'google') return userGoogleApiKey;
    return '';
  }, [activeModelData, userGoogleApiKey, userOpenAIApiKey, userAnthropicApiKey]);

  const hasProAccess = Boolean(activeApiKey || (activeModelData?.provider === 'youtube' && googleUser));
  const remainingQuota = hasProAccess ? 999999 : Math.max(0, 10 - requestsUsed);

  const isYouTubeWorkflow = fileType === 'youtube';
  const hasMedia = Boolean(file || (isYouTubeWorkflow && youtubeMeta));

  const ensureMethodSelected = (actionDescription?: string): boolean => {
    if (!selectedModelId || !activeModelData) {
      const msg = actionDescription 
        ? `Please select an AI model or configure an API key in Settings before ${actionDescription}.` 
        : "Please select an AI model or configure an API key in Settings to continue.";
      showToast("No AI Method Selected", msg, "info");
      setActiveModal('CONFIG');
      return false;
    }
    return true;
  };

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

  // Rate Limit Sync Effect
  useEffect(() => {
    if (activeModelData?.provider === 'google' && activeModelData.rateLimits) {
      if (selectedGeminiTier === 'free' && !activeModelData.rateLimits.free) {
        setSelectedGeminiTier('tier1');
      }
    }
  }, [activeModelData, selectedGeminiTier]);

  useEffect(() => {
    if (activeModelData?.provider === 'google' && activeModelData.rateLimits) {
      const rpm = activeModelData.rateLimits[selectedGeminiTier];
      if (rpm) {
        setSelectedRPM(rpm);
        setGlobalRPM(rpm);
      }
    } else if (activeModelData && (activeModelData.provider === 'openai' || activeModelData.provider === 'anthropic')) {
      setGlobalRPM(selectedRPM);
    }
  }, [selectedGeminiTier, activeModelData, selectedRPM]);

  // OAuth Callback Popup Handler Effect
  useEffect(() => {
    if (isYouTubeAuthCallback) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (accessToken) {
        const channel = new BroadcastChannel('substream_auth_channel');
        channel.postMessage({ token: accessToken });
        channel.close();
        window.close();
      }
    }

    if (isDriveAuthCallback) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (accessToken) {
        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'DRIVE_AUTH_SUCCESS', token: accessToken }, '*');
          } catch(e) { console.error(e); }
        }
        const channel = new BroadcastChannel('substream_drive_auth_channel');
        channel.postMessage({ token: accessToken });
        channel.close();
        setTimeout(() => {
          window.close();
          window.open('','_self')?.close();
        }, 1000); 
      }
    }
  }, [isYouTubeAuthCallback, isDriveAuthCallback]);

  // Main Window BroadcastChannel Listener
  useEffect(() => {
    const channel = new BroadcastChannel('substream_auth_channel');
    channel.onmessage = (event) => {
      if (event.data && event.data.token) {
        handleGoogleLoginSuccess({ access_token: event.data.token } as TokenResponse);
      }
    };
    return () => channel.close();
  }, []);

  // Restore saved state from LocalStorage & Cookies on mount
  useEffect(() => {
    const storedGoogleKey = localStorage.getItem('substream_google_api_key');
    const storedOpenAIKey = localStorage.getItem('substream_openai_api_key');
    const storedAnthropicKey = localStorage.getItem('substream_anthropic_api_key');
    const storedModel = localStorage.getItem('substream_model_id');
    const storedRPM = localStorage.getItem('substream_rpm');
    const storedGeminiTier = localStorage.getItem('substream_gemini_tier');
    const storedUsage = localStorage.getItem('substream_daily_usage');
    const lastUsageDate = localStorage.getItem('substream_usage_date');
    const today = new Date().toDateString();

    if (storedGoogleKey) {
      setUserGoogleApiKey(storedGoogleKey);
      setTempGoogleApiKey(storedGoogleKey);
      setGoogleApiKeyStatus('valid');
    }
    if (storedOpenAIKey) {
      setUserOpenAIApiKey(storedOpenAIKey);
      setTempOpenAIApiKey(storedOpenAIKey);
      setOpenAIApiKeyStatus('valid');
    }
    if (storedAnthropicKey) {
      setUserAnthropicApiKey(storedAnthropicKey);
      setTempAnthropicApiKey(storedAnthropicKey);
      setAnthropicApiKeyStatus('valid');
    }

    if (storedGeminiTier) {
      setSelectedGeminiTier(storedGeminiTier as GeminiTier);
    }

    if (storedRPM) {
      const parsedRpm = parseInt(storedRPM, 10);
      if (!isNaN(parsedRpm) && parsedRpm > 0) {
        setSelectedRPM(parsedRpm);
        setGlobalRPM(parsedRpm);
        if (![2, 5, 15, 20, 30, 50].includes(parsedRpm)) {
          setIsCustomRPM(true);
          setCustomRPMInput(parsedRpm.toString());
        }
      } else {
        setSelectedRPM(15);
        setGlobalRPM(15);
      }
    } else {
      setGlobalRPM(15); 
    }

    if (lastUsageDate === today && storedUsage) {
      setRequestsUsed(parseInt(storedUsage, 10));
    } else {
      setRequestsUsed(0);
      localStorage.setItem('substream_usage_date', today);
      localStorage.setItem('substream_daily_usage', '0');
    }

    const savedUser = getAuthItem('substream_google_user');
    const savedToken = getAuthItem('substream_google_token');
    const savedTimestamp = getAuthItem('substream_google_token_timestamp');
    
    let isValidAuth = false;

    if (savedUser && savedToken && savedTimestamp) {
      const tokenAge = Date.now() - parseInt(savedTimestamp, 10);
      if (tokenAge < 30 * 24 * 60 * 60 * 1000) {
        try {
          setGoogleUser(JSON.parse(savedUser));
          setGoogleAccessToken(savedToken);
          isValidAuth = true;
        } catch (e) {
          console.error("Failed to parse saved user", e);
          handleGoogleLogout();
        }
      } else {
        console.warn("Google Token Expired. Clearing session.");
        handleGoogleLogout(); 
      }
    }

    const currentCachedModels = getCachedModels() || AVAILABLE_MODELS;
    const currentGoogleUser = isValidAuth ? JSON.parse(savedUser) : null;
    if (storedModel && isModelValidForCurrentAuth(storedModel, storedGoogleKey || '', storedOpenAIKey || '', storedAnthropicKey || '', currentGoogleUser, currentCachedModels)) {
      setSelectedModelId(storedModel);
    } else {
      const autoModel = resolveAvailableModel(storedGoogleKey || '', storedOpenAIKey || '', storedAnthropicKey || '', currentGoogleUser, currentCachedModels);
      setSelectedModelId(autoModel);
    }
    
    setIsAuthLoaded(true);
    handleSyncModels(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('substream_model_id', selectedModelId || '');
  }, [selectedModelId]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    const isValid = isModelValidForCurrentAuth(
      selectedModelId,
      userGoogleApiKey,
      userOpenAIApiKey,
      userAnthropicApiKey,
      googleUser,
      modelsList
    );

    if (!isValid) {
      const nextModel = resolveAvailableModel(
        userGoogleApiKey,
        userOpenAIApiKey,
        userAnthropicApiKey,
        googleUser,
        modelsList
      );
      setSelectedModelId(nextModel);
    }
  }, [userGoogleApiKey, userOpenAIApiKey, userAnthropicApiKey, googleUser, modelsList, isAuthLoaded]);

  // Debounced Key Validation Effects
  useEffect(() => {
    if (tempGoogleApiKey === '') {
      setGoogleApiKeyStatus('idle');
      return;
    }
    if (tempGoogleApiKey === userGoogleApiKey) {
      setGoogleApiKeyStatus('valid');
      return;
    }
    setGoogleApiKeyStatus('validating');
    if (debounceGoogleKeyTimer.current) clearTimeout(debounceGoogleKeyTimer.current);

    debounceGoogleKeyTimer.current = setTimeout(() => {
      validateGoogleApiKey(tempGoogleApiKey).then(isValid => {
        setGoogleApiKeyStatus(isValid ? 'valid' : 'invalid');
      });
    }, 800);

    return () => { if (debounceGoogleKeyTimer.current) clearTimeout(debounceGoogleKeyTimer.current); };
  }, [tempGoogleApiKey, userGoogleApiKey]);
  
  useEffect(() => {
    if (tempOpenAIApiKey === '') {
      setOpenAIApiKeyStatus('idle');
      return;
    }
    if (tempOpenAIApiKey === userOpenAIApiKey) {
      setOpenAIApiKeyStatus('valid');
      return;
    }
    setOpenAIApiKeyStatus('validating');
    if (debounceOpenAIKeyTimer.current) clearTimeout(debounceOpenAIKeyTimer.current);

    debounceOpenAIKeyTimer.current = setTimeout(() => {
      validateOpenAIApiKey(tempOpenAIApiKey).then(isValid => {
        setOpenAIApiKeyStatus(isValid ? 'valid' : 'invalid');
      });
    }, 800);

    return () => { if (debounceOpenAIKeyTimer.current) clearTimeout(debounceOpenAIKeyTimer.current); };
  }, [tempOpenAIApiKey, userOpenAIApiKey]);

  useEffect(() => {
    if (tempAnthropicApiKey === '') {
      setAnthropicApiKeyStatus('idle');
      return;
    }
    if (tempAnthropicApiKey === userAnthropicApiKey) {
      setAnthropicApiKeyStatus('valid');
      return;
    }
    setAnthropicApiKeyStatus('validating');
    if (debounceAnthropicKeyTimer.current) clearTimeout(debounceAnthropicKeyTimer.current);

    debounceAnthropicKeyTimer.current = setTimeout(() => {
      validateAnthropicApiKey(tempAnthropicApiKey).then(isValid => {
        setAnthropicApiKeyStatus(isValid ? 'valid' : 'invalid');
      });
    }, 800);

    return () => { if (debounceAnthropicKeyTimer.current) clearTimeout(debounceAnthropicKeyTimer.current); };
  }, [tempAnthropicApiKey, userAnthropicApiKey]);

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleSyncModels = async (isManual = false) => {
    setIsSyncingModels(true);
    try {
      const res = await syncModels(true);
      setModelsList(res.models);
      setSyncInfo(res.info);
      if (isManual) showToast("AI models updated from server!", undefined, "success");
    } catch (e: any) {
      console.error("Failed to sync models:", e);
      if (isManual) showToast("Failed to refresh models list.", e.message, "error");
    } finally {
      setIsSyncingModels(false);
    }
  };

  const handleGoogleLoginSuccess = (tokenResponse: TokenResponse) => {
    if (!tokenResponse || !tokenResponse.access_token) return;
    
    const accessToken = tokenResponse.access_token;
    setGoogleAccessToken(accessToken);
    setAuthItem('substream_google_token', accessToken);
    setAuthItem('substream_google_token_timestamp', Date.now().toString());
    
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then(res => res.json())
    .then(data => {
      setGoogleUser(data);
      setAuthItem('substream_google_user', JSON.stringify(data));
      showToast(`Welcome, ${data.name}!`); 
    })
    .catch(error => {
      console.error("Failed to fetch user info", error);
      handleGoogleLogout();
    });
  };

  const handleGoogleLogout = () => {
    setGoogleUser(null);
    setGoogleAccessToken(null);
    removeAuthItem('substream_google_token');
    removeAuthItem('substream_google_user');
    removeAuthItem('substream_google_token_timestamp');
    showToast("Signed Out", "Google session cleared.", "info");
  };

  const handleSaveKeys = () => {
    setUserGoogleApiKey(tempGoogleApiKey);
    localStorage.setItem('substream_google_api_key', tempGoogleApiKey);
    setUserOpenAIApiKey(tempOpenAIApiKey);
    localStorage.setItem('substream_openai_api_key', tempOpenAIApiKey);
    setUserAnthropicApiKey(tempAnthropicApiKey);
    localStorage.setItem('substream_anthropic_api_key', tempAnthropicApiKey);
    localStorage.setItem('substream_rpm', selectedRPM.toString());
    localStorage.setItem('substream_gemini_tier', selectedGeminiTier);
    setActiveModal('NONE');
    showToast("Configuration Saved", "Your API keys and settings have been updated.", "success");
  };

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
    if (!ensureMethodSelected("uploading or processing files")) {
      return;
    }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    resetDrag();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
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
        setActiveModal('CONFIG');
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
      setActiveModal('CONFIG');
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
      setActiveModal('CONFIG');
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
    const srtContent = stringifySRT(subtitles);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const originalName = isYouTubeWorkflow && youtubeMeta ? youtubeMeta.title : file?.name;
    const downloadFilename = getFormattedDownloadFilename(originalName, sourceLang, targetLang, selectedCaptionId, 'srt');
    downloadFile(downloadFilename, blob);
  };

  const handleDownloadVideo = async (targetResolution?: number) => {
    if (fileType === 'youtube' && youtubeMeta) {
      try {
        setIsDownloadComplete(false);
        setDownloadStatusText('Downloading Video...');
        setDownloadProgress(25);
        const downloadFilename = getFormattedDownloadFilename(youtubeMeta.title, sourceLang, targetLang, selectedCaptionId, 'mp4');
        await downloadYouTubeVideoWithSubs(youtubeMeta.videoUrl, selectedCaptionId, downloadFilename, targetResolution);
        setDownloadProgress(100);
        setIsDownloadComplete(true);
        showToast("Download Complete", "YouTube video downloaded.", "success");
        setTimeout(() => {
          setDownloadProgress(undefined);
          setDownloadStatusText(undefined);
          setIsDownloadComplete(false);
        }, 3000);
      } catch (e: any) {
        const msg = e.message || "Failed to download video.";
        setError(msg);
        showToast("Error", msg, "error");
        setDownloadProgress(undefined);
        setDownloadStatusText(undefined);
      }
      return;
    }

    if (!ffmpegEngine || !file) return;
    try {
      setIsDownloadComplete(false);
      setDownloadStatusText('Muxing Video...');
      setDownloadProgress(15);
      const translatedSrt = stringifySRT(subtitles);
      const outputBlob = await addSrtToVideo(
        ffmpegEngine,
        file,
        translatedSrt,
        targetLang,
        extractedOriginalSrt,
        sourceLang,
        targetResolution,
        (percent) => {
          setDownloadProgress(percent);
        }
      );
      const ext = file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4';
      const downloadFilename = getFormattedDownloadFilename(file.name, sourceLang, targetLang, selectedCaptionId, ext);
      downloadFile(downloadFilename, outputBlob);
      setDownloadProgress(100);
      setIsDownloadComplete(true);
      showToast("Download Started", "Your softsubbed video has been prepared.", "success");
      setTimeout(() => {
        setDownloadProgress(undefined);
        setDownloadStatusText(undefined);
        setIsDownloadComplete(false);
      }, 3000);
    } catch (e: any) {
      console.error("Muxing error:", e);
      const msg = "Failed to mux video. Please check file format.";
      setError(msg);
      showToast("Muxing Error", msg, "error");
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

  if (isYouTubeAuthCallback || isDriveAuthCallback) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white space-y-6">
        <div className="w-20 h-20 bg-green-900/20 rounded-full flex items-center justify-center border border-green-900/50 animate-pulse-slow">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold font-display">Authentication Successful</h2>
          <p className="text-neutral-400">You can safely close this window.</p>
        </div>
        <button 
          onClick={() => { window.close(); try { window.open('','_self')?.close(); } catch(e){} }} 
          className="px-6 py-2 bg-neutral-800 border border-neutral-700 rounded-lg hover:bg-neutral-700 hover:text-white transition-colors text-neutral-300"
        >
          Close Window
        </button>
      </div>
    );
  }

  if (currentPage === 'DOCS') {
    return (
      <div key="docs-page" className="animate-fade-in min-h-screen bg-black">
        <Documentation onBack={() => setCurrentPage('HOME')} />
      </div>
    );
  }

  return (
    <div key="home-page" className="animate-fade-in min-h-screen bg-black text-neutral-200 font-sans selection:bg-white selection:text-black flex flex-col scroll-smooth snap-y snap-proximity">
      <HeaderBar 
        onGoToDocs={() => setCurrentPage('DOCS')}
        onOpenConfig={() => setActiveModal('CONFIG')}
        activeModelData={activeModelData}
        hasProAccess={hasProAccess}
        remainingQuota={remainingQuota}
      />

      <main className="relative z-10 max-w-5xl mx-auto px-3 sm:px-4 md:px-6 w-full flex-grow flex flex-col">
        <div className="flex-grow flex flex-col justify-start pt-8 md:pt-16">
          <section className="mb-8 md:mb-14 text-center">
            <h1 className="text-[2.65rem] leading-[1.05] sm:text-5xl md:text-6xl font-display font-bold tracking-tighter text-white mb-6 animate-slide-up">
              Bridge the Language<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-neutral-700">Gap Instantly.</span>
            </h1>
            <p className="text-base md:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
              Transform your subtitles with context-aware AI. Powered by state-of-the-art frontier AI models for nuance and accuracy across {LANGUAGES.length}+ languages.
            </p>
          </section>

          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch ${subtitles.length === 0 ? 'pb-16' : 'pb-8'}`}>
            <div className="order-2 lg:order-1 lg:col-span-3 flex flex-col">
              <div className="h-full flex flex-row justify-around p-6 rounded-3xl border border-neutral-900 bg-neutral-950/50 backdrop-blur-sm lg:flex-col lg:justify-between">
                <StepIndicator number={1} title="Upload" isActive={status === TranslationStatus.IDLE && !hasMedia} isCompleted={hasMedia} />
                <StepIndicator number={2} title="Configure" isActive={isConfigureStepActive} isCompleted={status === TranslationStatus.TRANSLATING || status === TranslationStatus.COMPLETED || subtitles.length > 0} />
                <StepIndicator number={3} title="Translate" isActive={status === TranslationStatus.TRANSLATING} isCompleted={status === TranslationStatus.COMPLETED || (!isYouTubeWorkflow && subtitles.length > 0 && status !== TranslationStatus.TRANSLATING)} />
                <StepIndicator number={4} title="Download" isActive={status === TranslationStatus.COMPLETED || (subtitles.length > 0 && status !== TranslationStatus.TRANSLATING)} isCompleted={false} />
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:col-span-9 h-full flex flex-col justify-between gap-6">
              
              {/* VIDEO PLAYER PREVIEW (for video files & youtube imports) */}
              {(fileType === 'video' || fileType === 'youtube') && (
                ((fileType as string) === 'youtube' && youtubeMeta) ? (
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
              <div className={`group relative rounded-3xl p-6 transition-all duration-300 overflow-hidden ${
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
                    onOpenUrlModal={(type) => { setImportType(type); setImportModalOpen(true); }}
                    onOpenCloudModal={() => setCloudModalOpen(true)}
                    showToast={showToast}
                    hasMethodSelected={Boolean(selectedModelId && activeModelData)}
                    onRequireMethod={() => ensureMethodSelected("uploading files")}
                  />
                ) : (videoProcessingStatus !== VideoProcessingStatus.IDLE && videoProcessingStatus !== VideoProcessingStatus.DONE && videoProcessingStatus !== VideoProcessingStatus.ERROR) ? (
                  <div className="flex flex-col items-center justify-center text-center min-h-[200px] space-y-4">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1 uppercase tracking-widest">{getVideoProcessingStatusTitle(videoProcessingStatus)}</h2>
                      <p className="text-neutral-400">{videoProcessingMessage}</p>
                    </div>
                    {showProgressBar &&
                      <div className="w-full max-w-sm">
                        <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-white transition-all duration-300" style={{width: `${ffmpegProgress}%`}}></div>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1 text-right">{Math.round(ffmpegProgress)}%</p>
                      </div>
                    }
                  </div>
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
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="hidden sm:flex w-24 aspect-video rounded-xl bg-neutral-800 text-black items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
                          {fileType === 'srt' ? (
                            <FileText className="w-6 h-6 text-white" />
                          ) : fileType === 'youtube' && youtubeMeta ? (
                            <img src={youtubeMeta.thumbnailUrl} className="w-full h-full object-cover" alt="YouTube thumbnail"/>
                          ) : videoThumbnail ? (
                            <img src={videoThumbnail} className="w-full h-full object-cover" alt="Video thumbnail"/>
                          ) : (
                            <Film className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate max-w-[200px] sm:max-w-md">
                            {fileType === 'youtube' ? youtubeMeta?.title : file?.name}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {subtitles.length > 0 ? `${subtitles.length} lines loaded` : fileType === 'youtube' ? 'YouTube Video Selected' : 'File selected'}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={resetState} 
                        className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
                      >
                        Change File
                      </button>
                    </div>
                  </div>
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
                  isTranslationInProgress={(status as any) === TranslationStatus.TRANSLATING}
                  status={status}
                  progress={progress}
                  activeModelData={activeModelData}
                  handleTranslate={handleTranslate}
                />
              )}

              {/* ERROR BANNER DISPLAY */}
              {error && (
                <div className="p-4 rounded-xl bg-red-900/10 border border-red-900/40 text-red-200 text-sm flex items-start gap-3 animate-fade-in w-full">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="break-words whitespace-pre-wrap block font-medium">{error}</span>
                    {!activeApiKey && (
                      <button 
                        onClick={() => setActiveModal('CONFIG')} 
                        className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-xs text-red-300 font-semibold transition-colors"
                      >
                        Open Settings & Add API Key
                      </button>
                    )}
                  </div>
                </div>
              )}

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
        </div>

        {/* STEP 4: LIVE PREVIEW & DOWNLOAD */}
        {subtitles.length > 0 && (
          <section ref={resultsRef} className={`border-t border-neutral-900 px-0 flex flex-col justify-between scroll-mt-20 snap-start snap-always animate-slide-up overflow-hidden box-border transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
            previewMode === 'video' 
              ? 'h-[65vh] min-h-[65vh] max-h-[65vh] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-4 pb-6 md:pt-16 md:pb-20' 
              : 'h-[100vh] min-h-[100vh] max-h-[100vh] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-7 pb-8 md:pt-9 md:pb-11'
          }`}>
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
                      className={`relative z-10 w-[2rem] sm:w-[3.5rem] py-[0.35rem] sm:py-[0.2rem] text-[0.7rem] font-semibold flex items-center justify-center transition-colors duration-300 rounded-lg ${previewMode === 'table' ? 'text-white font-bold' : 'text-neutral-400 hover:text-white'}`}
                    >
                      <Table className="w-3.5 h-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Table</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setPreviewMode('video')} 
                      className={`relative z-10 w-[2rem] sm:w-[3.5rem] py-[0.35rem] sm:py-[0.2rem] text-[0.7rem] font-semibold flex items-center justify-center transition-colors duration-300 rounded-lg ${previewMode === 'video' ? 'text-white font-bold' : 'text-neutral-400 hover:text-white'}`}
                    >
                      <Video className="w-3.5 h-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Video</span>
                    </button>
                  </div>
                </div>
                <p className="text-neutral-500 text-sm">
                  {isYouTubeWorkflow ? 'Review the generated transcription below.' : targetLang === 'none' ? 'Review generated transcription.' : 'Comparing original vs translated output.'}
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
                              normalizeResolutions(youtubeMeta.availableResolutions)
                                .map((res) => (
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
                      icon={<Download className="w-4 h-4"/>}
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
                    icon={<Download className="w-4 h-4"/>}
                    className="w-full sm:w-auto px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all focus:outline-none focus:ring-0 active:outline-none"
                  >
                    Download SRT
                  </Button>
                )}
              </div>
            </div>

            <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden relative transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${previewMode === 'video' ? 'my-0' : 'my-2.5'}`}>
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

            <div className="shrink-0 flex justify-center pt-4 pb-1">
              <Button variant="secondary" onClick={resetState} icon={<RefreshCw className="w-4 h-4" />}>
                Process Another File
              </Button>
            </div>
          </section>
        )}
      </main>

      <Footer onOpenModal={(modal) => setActiveModal(modal)} />

      <SettingsDrawer 
        isOpen={activeModal === 'CONFIG'}
        onClose={() => setActiveModal('NONE')}
        selectedModelId={selectedModelId}
        setSelectedModelId={setSelectedModelId}
        modelsList={modelsList}
        syncInfo={syncInfo}
        isSyncingModels={isSyncingModels}
        handleSyncModels={handleSyncModels}
        modelSearchQuery={modelSearchQuery}
        setModelSearchQuery={setModelSearchQuery}
        openGroups={openGroups}
        toggleGroup={toggleGroup}
        googleUser={googleUser}
        onGoogleLoginSuccess={handleGoogleLoginSuccess}
        onGoogleLogout={handleGoogleLogout}
        userGoogleApiKey={userGoogleApiKey}
        tempGoogleApiKey={tempGoogleApiKey}
        setTempGoogleApiKey={setTempGoogleApiKey}
        googleApiKeyStatus={googleApiKeyStatus}
        clearGoogleApiKey={() => {
          setUserGoogleApiKey('');
          setTempGoogleApiKey('');
          localStorage.removeItem('substream_google_api_key');
          setGoogleApiKeyStatus('idle');
        }}
        userOpenAIApiKey={userOpenAIApiKey}
        tempOpenAIApiKey={tempOpenAIApiKey}
        setTempOpenAIApiKey={setTempOpenAIApiKey}
        openAIApiKeyStatus={openAIApiKeyStatus}
        clearOpenAIApiKey={() => {
          setUserOpenAIApiKey('');
          setTempOpenAIApiKey('');
          localStorage.removeItem('substream_openai_api_key');
          setOpenAIApiKeyStatus('idle');
        }}
        userAnthropicApiKey={userAnthropicApiKey}
        tempAnthropicApiKey={tempAnthropicApiKey}
        setTempAnthropicApiKey={setTempAnthropicApiKey}
        anthropicApiKeyStatus={anthropicApiKeyStatus}
        clearAnthropicApiKey={() => {
          setUserAnthropicApiKey('');
          setTempAnthropicApiKey('');
          localStorage.removeItem('substream_anthropic_api_key');
          setAnthropicApiKeyStatus('idle');
        }}
        handleSaveKeys={handleSaveKeys}
        selectedRPM={selectedRPM}
        setSelectedRPM={setSelectedRPM}
        isCustomRPM={isCustomRPM}
        setIsCustomRPM={setIsCustomRPM}
        customRPMInput={customRPMInput}
        setCustomRPMInput={setCustomRPMInput}
        handleCustomRPMChange={(e) => {
          setCustomRPMInput(e.target.value);
          const num = parseInt(e.target.value, 10);
          if (num && num > 0) setSelectedRPM(num as any);
        }}
        selectedGeminiTier={selectedGeminiTier}
        setSelectedGeminiTier={setSelectedGeminiTier}
        activeModelData={activeModelData}
      />

      <LegalModals activeModal={activeModal} onClose={() => setActiveModal('NONE')} />

      <ImportUrlModal 
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        type={importType}
        onImportFile={processFile}
        onImportYouTube={handleImportYouTube}
        googleAccessToken={googleAccessToken}
        hasMethodSelected={Boolean(selectedModelId && activeModelData)}
        onRequireMethod={() => ensureMethodSelected("importing files")}
      />

      <CloudImportModal 
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        onImportFile={processFile}
        hasMethodSelected={Boolean(selectedModelId && activeModelData)}
        onRequireMethod={() => ensureMethodSelected("importing files from Cloud Drive")}
      />
    </div>
  );
}

export default App;