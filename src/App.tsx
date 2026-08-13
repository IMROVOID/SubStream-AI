import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileText, ArrowRight, Download, RefreshCw, Languages, Zap, AlertCircle, Key, Info, Cpu, CheckCircle2, BookText, Search, XCircle, Loader2, Film, Clapperboard, ChevronDown, Gauge, Youtube, Link as LinkIcon, HardDrive, Instagram, Github, Heart, Sparkles, Shield, ExternalLink, Table, Video } from 'lucide-react';
import { GoogleOAuthProvider, TokenResponse } from '@react-oauth/google';
import { LANGUAGES, SubtitleNode, TranslationStatus, AVAILABLE_MODELS, SUPPORTED_VIDEO_FORMATS, ExtractedSubtitleTrack, VideoProcessingStatus, OPENAI_RPM_OPTIONS, ANTHROPIC_RPM_OPTIONS, RPMLimit, YouTubeVideoMetadata, AIModel } from './types';
import { parseSRT, stringifySRT, downloadFile } from './utils/srtUtils';
import { processFullSubtitleFile, BATCH_SIZE, validateGoogleApiKey, validateOpenAIApiKey, validateAnthropicApiKey, transcribeAudio, setGlobalRPM } from './services/aiService';
import { syncModels, getCachedModels, getSyncInfo, ModelSyncInfo } from './services/modelSyncService';
import { loadFFmpeg, analyzeVideoFile, extractSrt, extractAudio, addSrtToVideo } from './services/ffmpegService';
import { uploadVideoToYouTube, pollForCaptionReady, downloadCaptionTrack, downloadYouTubeVideoWithSubs, getVideoDetails } from './services/youtubeService';
import { Button } from './components/Button';
import { SubtitleCard } from './components/SubtitleCard';
import { StepIndicator } from './components/StepIndicator';
import { Modal } from './components/Modal';
import { Documentation } from './components/Documentation';
import { VideoPlayer } from './components/VideoPlayer';
import { TrackSelector } from './components/TrackSelector';
import { YouTubeAuth } from './components/YouTubeAuth';
import { ImportUrlModal } from './components/ImportUrlModal';
import { CloudImportModal } from './components/CloudImportModal';
import { ScrollFadeContainer } from './components/ScrollFadeContainer';
import { getAuthItem, setAuthItem, removeAuthItem } from './utils/cookieUtils';
import { FFmpeg } from '@ffmpeg/ffmpeg';

type Page = 'HOME' | 'DOCS';
type ModalType = 'NONE' | 'PRIVACY' | 'TOS' | 'CONFIG';
type ApiKeyStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type GoogleUser = { name: string; email: string; picture: string };
type GeminiTier = 'free' | 'tier1' | 'tier2' | 'tier3';

const ESTIMATED_DAILY_QUOTA = 500; // Rough estimate for Free Tier

const AppWrapper = () => {
    const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID;

    if (!googleClientId) {
        return <div className="bg-black text-white h-screen flex items-center justify-center">Error: Google Client ID is not configured.</div>;
    }
    
    return (
        <GoogleOAuthProvider clientId={googleClientId}>
            <App />
        </GoogleOAuthProvider>
    );
};

const generateVideoThumbnail = (videoFile: File): Promise<string> => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        video.src = URL.createObjectURL(videoFile);
        video.currentTime = 1; 

        const cleanup = () => {
            URL.revokeObjectURL(video.src);
            video.remove();
            canvas.remove();
        };

        video.onloadeddata = () => {
            video.onseeked = () => {
                if (!context) {
                    cleanup();
                    return resolve('');
                }
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                cleanup();
                resolve(dataUrl);
            };
            video.currentTime = 1; 
        };
        video.onerror = () => {
            cleanup();
            resolve(''); 
        };
    });
};

interface DraggedFileInfo {
  name: string;
  size: string;
  type: 'video' | 'subtitle' | 'unknown';
  extension: string;
  subtitleLabel?: string;
}

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const extractDraggedFileInfo = (e: DragEvent): DraggedFileInfo | null => {
  if (!e.dataTransfer) return null;

  // 1. Try reading real File object if available (e.g. drop or un-sandboxed environments)
  let file: File | null = null;
  try {
    file = e.dataTransfer.files?.[0] || null;
    if (!file && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && f.name && f.name !== 'item') {
            file = f;
            break;
          }
        }
      }
    }
  } catch (err) {
    // protected mode in browser
  }

  if (file && file.name && file.name !== 'item') {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = file.type ? file.type.toLowerCase() : '';
    const isSub = ext === 'srt' || ext === 'vtt' || mime.includes('subrip') || mime.includes('caption');
    const isVid = ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'flv', 'wmv'].includes(ext) || mime.startsWith('video/');

    return {
      name: file.name,
      size: formatFileSize(file.size),
      type: isSub ? 'subtitle' : isVid ? 'video' : 'unknown',
      extension: ext ? ext.toUpperCase() : isSub ? 'SRT' : isVid ? 'VIDEO' : 'FILE',
      subtitleLabel: isSub ? 'Release to process SRT subtitles' : isVid ? 'Release to import video file' : 'Release to load file',
    };
  }

  // 2. HTML5 Protected Mode fallback (browser hides filename until drop)
  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const mime = item.type ? item.type.toLowerCase() : '';
        
        const isVid = mime.startsWith('video/');
        const isSub = mime.includes('subrip') || mime.includes('caption') || mime.includes('srt') || mime.includes('vtt') || mime.includes('text/plain');

        let extLabel = 'SRT / VIDEO';
        let nameLabel = 'Subtitle or Video File';
        let typeVal: 'video' | 'subtitle' | 'unknown' = 'unknown';

        if (isVid) {
          typeVal = 'video';
          nameLabel = 'Video File Detected';
          if (mime.includes('mp4')) extLabel = 'MP4 VIDEO';
          else if (mime.includes('webm')) extLabel = 'WEBM VIDEO';
          else if (mime.includes('matroska') || mime.includes('mkv')) extLabel = 'MKV VIDEO';
          else extLabel = 'VIDEO FILE';
        } else if (isSub) {
          typeVal = 'subtitle';
          nameLabel = 'Subtitle File Detected';
          if (mime.includes('subrip') || mime.includes('srt')) extLabel = 'SRT SUBTITLE';
          else if (mime.includes('vtt')) extLabel = 'VTT SUBTITLE';
          else extLabel = 'SUBTITLE FILE';
        }

        return {
          name: nameLabel,
          size: 'Ready to import',
          type: typeVal,
          extension: extLabel,
          subtitleLabel: isVid ? 'Release mouse to process video' : isSub ? 'Release mouse to parse subtitles' : 'Release mouse to drop file',
        };
      }
    }
  }

  return {
    name: 'Subtitle or Video File',
    size: 'Ready to import',
    type: 'unknown',
    extension: 'SRT / VIDEO',
    subtitleLabel: 'Release mouse to drop & load file',
  };
};

const App = () => {
  // Navigation & Modal State
  const [currentPage, setCurrentPage] = useState<Page>('HOME');
  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  
  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [importType, setImportType] = useState<'URL' | 'YOUTUBE' | 'GDRIVE' | 'SOCIAL' | null>(null);

  // Notification State
  const [toast, setToast] = useState<{ message: string; isVisible: boolean } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Core App State
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'srt' | 'video' | 'youtube' | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleNode[]>([]);
  const [status, setStatus] = useState<TranslationStatus>(TranslationStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'table' | 'video'>('table');
  
  // Download Progress State
  const [downloadProgress, setDownloadProgress] = useState<number | undefined>(undefined);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [isDownloadComplete, setIsDownloadComplete] = useState(false);
  
  // Resolution Dropdown State
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const resolutionMenuRef = useRef<HTMLDivElement>(null);

  // Language & Translation Settings
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>(LANGUAGES[0].name); 
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>('');

  // Video-specific State
  const [videoProcessingStatus, setVideoProcessingStatus] = useState<VideoProcessingStatus>(VideoProcessingStatus.IDLE);
  const [videoProcessingMessage, setVideoProcessingMessage] = useState('');
  const [ffmpegProgress, setFfmpegProgress] = useState<number>(0);
  const [extractedTracks, setExtractedTracks] = useState<ExtractedSubtitleTrack[]>([]);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [youtubeMeta, setYoutubeMeta] = useState<YouTubeVideoMetadata | null>(null);
  const [localVideoDimensions, setLocalVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  const localAvailableResolutions = useMemo(() => {
    const origH = localVideoDimensions?.height || 1080;
    const maxRes = Math.max(origH, 1080);
    const standardTiers = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144];
    const filtered = standardTiers.filter(r => r <= maxRes);
    if (origH > 0 && !filtered.includes(origH) && origH >= 144) {
      filtered.unshift(origH);
      filtered.sort((a, b) => b - a);
    }
    return filtered;
  }, [localVideoDimensions]);

  const getVideoProcessingStatusTitle = (status: VideoProcessingStatus): string => {
    switch (status) {
      case VideoProcessingStatus.INITIALIZING_ENGINE:
        return 'INITIALIZING VIDEO ENGINE';
      case VideoProcessingStatus.ANALYZING:
        return 'ANALYZING VIDEO';
      case VideoProcessingStatus.EXTRACTING_AUDIO:
        return 'EXTRACTING AUDIO';
      case VideoProcessingStatus.TRANSCRIBING:
        return 'TRANSCRIBING AUDIO';
      case VideoProcessingStatus.EXTRACTING_SUBTITLES:
        return 'EXTRACTING SUBTITLES';
      case VideoProcessingStatus.MUXING:
        return 'PREPARING VIDEO DOWNLOAD';
      case VideoProcessingStatus.DONE:
        return 'PROCESSING COMPLETE';
      case VideoProcessingStatus.UPLOADING_TO_YOUTUBE:
        return 'UPLOADING TO YOUTUBE';
      case VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS:
        return 'PROCESSING CAPTIONS';
      case VideoProcessingStatus.DOWNLOADING_FROM_URL:
        return 'FETCHING VIDEO FROM URL';
      case VideoProcessingStatus.FETCHING_YOUTUBE_INFO:
        return 'FETCHING VIDEO DETAILS';
      case VideoProcessingStatus.DOWNLOADING_VIDEO:
        return 'DOWNLOADING VIDEO';
      default:
        return status.replace(/_/g, ' ');
    }
  };

  const localVideoResolutions = useMemo(() => {
    const standardHeights = [1080, 720, 480, 360, 240, 144];
    const origH = localVideoDimensions?.height || 1080;
    const maxRes = Math.max(origH, 1080);
    const filtered = standardHeights.filter(h => h <= maxRes);
    if (origH > 0 && !filtered.includes(origH) && origH >= 144) {
      filtered.unshift(origH);
      filtered.sort((a, b) => b - a);
    }
    return filtered.length > 0 ? filtered : [1080, 720, 480, 360, 240, 144];
  }, [localVideoDimensions]);
  
  // API Key & Model Config State
  const [userGoogleApiKey, setUserGoogleApiKey] = useState<string>('');
  const [tempGoogleApiKey, setTempGoogleApiKey] = useState<string>('');
  const [googleApiKeyStatus, setGoogleApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [userOpenAIApiKey, setUserOpenAIApiKey] = useState<string>('');
  const [tempOpenAIApiKey, setTempOpenAIApiKey] = useState<string>('');
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<ApiKeyStatus>('idle');

  const [userAnthropicApiKey, setUserAnthropicApiKey] = useState<string>('');
  const [tempAnthropicApiKey, setTempAnthropicApiKey] = useState<string>('');
  const [anthropicApiKeyStatus, setAnthropicApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [modelsList, setModelsList] = useState<AIModel[]>(() => getCachedModels() || AVAILABLE_MODELS);
  const [syncInfo, setSyncInfo] = useState<ModelSyncInfo | null>(() => getSyncInfo());
  const [isSyncingModels, setIsSyncingModels] = useState<boolean>(false);

  const handleSyncModels = async (force = false) => {
    setIsSyncingModels(true);
    try {
      const result = await syncModels(force);
      setModelsList(result.models);
      setSyncInfo(result.info);
    } catch (e) {
      console.error('Failed to sync models:', e);
    } finally {
      setIsSyncingModels(false);
    }
  };

  useEffect(() => {
    handleSyncModels(false);
  }, []);

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const saved = localStorage.getItem('substream_model_id');
    if (saved) return saved;
    const cached = getCachedModels() || AVAILABLE_MODELS;
    return cached[1]?.id || cached[0]?.id || 'gemini-2.5-flash';
  }); 
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    youtube: true,
    google: true,
    openai: true,
    anthropic: true
  });

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const [requestsUsed, setRequestsUsed] = useState<number>(0);
  const [selectedRPM, setSelectedRPM] = useState<RPMLimit>(15);
  const [isCustomRPM, setIsCustomRPM] = useState<boolean>(false);
  const [customRPMInput, setCustomRPMInput] = useState<string>('60');
  const [selectedGeminiTier, setSelectedGeminiTier] = useState<GeminiTier>('free');
  
  // YouTube Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedFileInfo, setDraggedFileInfo] = useState<DraggedFileInfo | null>(null);
  const dragCounter = useRef(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceGoogleKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceOpenAIKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceAnthropicKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (subtitles.length > 0 && (status === TranslationStatus.COMPLETED || videoProcessingStatus === VideoProcessingStatus.DONE)) {
      const timer = setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [subtitles.length, status, videoProcessingStatus]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current += 1;
        if (dragCounter.current === 1) {
          setIsDraggingFile(true);
          const info = extractDraggedFileInfo(e);
          if (info) setDraggedFileInfo(info);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        const info = extractDraggedFileInfo(e);
        if (info) setDraggedFileInfo(info);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setIsDraggingFile(false);
          setDraggedFileInfo(null);
        }
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDraggingFile(false);
        setDraggedFileInfo(null);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const isYouTubeAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=youtube_auth');
  }, []);

  const isDriveAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=drive_auth');
  }, []);

  // --- MODEL & RATE LIMIT LOGIC ---
  const activeModelData = useMemo(() => {
      return modelsList.find(m => m.id === selectedModelId) || modelsList[0] || AVAILABLE_MODELS[0];
  }, [selectedModelId, modelsList]);

  // Update RPM when model or tier changes for Google
  useEffect(() => {
      if (activeModelData.provider === 'google' && activeModelData.rateLimits) {
          // Check if current tier is available for this model
          if (selectedGeminiTier === 'free' && !activeModelData.rateLimits.free) {
              setSelectedGeminiTier('tier1'); // Fallback if free not available
          }
      }
  }, [activeModelData, selectedGeminiTier]);

  useEffect(() => {
      if (activeModelData.provider === 'google' && activeModelData.rateLimits) {
          const rpm = activeModelData.rateLimits[selectedGeminiTier];
          if (rpm) {
             setSelectedRPM(rpm);
             setGlobalRPM(rpm);
          }
      } else if (activeModelData.provider === 'openai' || activeModelData.provider === 'anthropic') {
          setGlobalRPM(selectedRPM);
      }
  }, [selectedGeminiTier, activeModelData, selectedRPM]);


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

  useEffect(() => {
    const channel = new BroadcastChannel('substream_auth_channel');
    channel.onmessage = (event) => {
        if (event.data && event.data.token) {
            handleGoogleLoginSuccess({ access_token: event.data.token } as TokenResponse);
        }
    };
    return () => channel.close();
  }, []);

  // Close resolution menu on outside click
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (resolutionMenuRef.current && !resolutionMenuRef.current.contains(event.target as Node)) {
              setShowResolutionMenu(false);
          }
      };
      if (showResolutionMenu) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
  }, [showResolutionMenu]);

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

    if (storedModel) {
        if (storedModel === 'youtube-auto' && !isValidAuth) {
            setSelectedModelId(modelsList[1]?.id || AVAILABLE_MODELS[1].id);
        } else {
            setSelectedModelId(storedModel);
        }
    }
    
    setIsAuthLoaded(true);

  }, []);

  // Auto-persist model selection whenever user selects a model
  useEffect(() => {
    if (selectedModelId) {
      localStorage.setItem('substream_model_id', selectedModelId);
    }
  }, [selectedModelId]);

  useEffect(() => {
      if (isAuthLoaded && selectedModelId === 'youtube-auto' && !googleUser) {
          setSelectedModelId(AVAILABLE_MODELS[1].id); 
      }
  }, [googleUser, selectedModelId, isAuthLoaded]);

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


  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, isVisible: true });
    toastTimeoutRef.current = setTimeout(() => {
        setToast(prev => prev ? { ...prev, isVisible: false } : null);
        setTimeout(() => setToast(null), 500); 
    }, 3000);
  };

  const updateUsage = (newRequests: number) => {
    const total = requestsUsed + newRequests;
    setRequestsUsed(total);
    localStorage.setItem('substream_daily_usage', total.toString());
    localStorage.setItem('substream_usage_date', new Date().toDateString());
  };

  const getOutputFilename = (extension: string) => {
    let baseName = 'video';
    
    if (file) {
        baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    } else if (youtubeMeta?.title) {
        baseName = youtubeMeta.title;
    }

    const cleanBase = baseName.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
    
    const isYouTubeTranscription = fileType === 'youtube';
    const isTranslated = status === TranslationStatus.COMPLETED || isTranslationComplete;
    
    let langName = targetLang;
    if (!isTranslated) {
      langName = isYouTubeTranscription 
        ? (LANGUAGES.find(l => l.code === selectedCaptionId)?.name || 'Captions')
        : (sourceLang !== 'auto' ? sourceLang : 'Transcript');
    }

    const cleanLang = langName.replace(/[^a-zA-Z0-9]/g, '');
    return extension ? `${cleanBase}_SubStream_${cleanLang}.${extension}` : `${cleanBase}_SubStream_${cleanLang}`;
  };

  const resetState = () => {
    setFile(null);
    setFileType(null);
    setSubtitles([]);
    setStatus(TranslationStatus.IDLE);
    setProgress(0);
    setError(null);
    setVideoProcessingStatus(VideoProcessingStatus.IDLE);
    setVideoProcessingMessage('');
    setFfmpegProgress(0);
    setExtractedTracks([]);
    setYoutubeMeta(null);
    setSelectedCaptionId('');
    setDownloadProgress(undefined);
    setDownloadStatusText('');
    setIsDownloadComplete(false);
    setVideoThumbnail(null);
    setShowResolutionMenu(false);
    if (videoSrc) {
       if (videoSrc.startsWith('blob:')) {
           URL.revokeObjectURL(videoSrc);
       }
    }
    setVideoSrc(null);
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
    if (selectedModelId === 'youtube-auto') {
        const fallbackModel = AVAILABLE_MODELS.find(m => m.provider === 'google') || AVAILABLE_MODELS[1];
        setSelectedModelId(fallbackModel.id);
    }
    setGoogleUser(null);
    setGoogleAccessToken(null);
    removeAuthItem('substream_google_token');
    removeAuthItem('substream_google_user');
    removeAuthItem('substream_google_token_timestamp');
    showToast("Disconnected from YouTube.");
  };

  const saveSettings = () => {
    if (googleApiKeyStatus === 'valid') {
        localStorage.setItem('substream_google_api_key', tempGoogleApiKey);
        setUserGoogleApiKey(tempGoogleApiKey);
    }
    if (openAIApiKeyStatus === 'valid') {
        localStorage.setItem('substream_openai_api_key', tempOpenAIApiKey);
        setUserOpenAIApiKey(tempOpenAIApiKey);
    }
    if (anthropicApiKeyStatus === 'valid') {
        localStorage.setItem('substream_anthropic_api_key', tempAnthropicApiKey);
        setUserAnthropicApiKey(tempAnthropicApiKey);
    }
    localStorage.setItem('substream_model_id', selectedModelId);
    localStorage.setItem('substream_rpm', selectedRPM.toString());
    localStorage.setItem('substream_gemini_tier', selectedGeminiTier);
    setGlobalRPM(selectedRPM);
    setActiveModal('NONE');
    showToast("Configuration Saved.");
  };

  const clearGoogleApiKey = () => {
    localStorage.removeItem('substream_google_api_key');
    setUserGoogleApiKey('');
    setTempGoogleApiKey('');
    setGoogleApiKeyStatus('idle');
  };
  
  const clearOpenAIApiKey = () => {
    localStorage.removeItem('substream_openai_api_key');
    setUserOpenAIApiKey('');
    setTempOpenAIApiKey('');
    setOpenAIApiKeyStatus('idle');
  };

  const clearAnthropicApiKey = () => {
    localStorage.removeItem('substream_anthropic_api_key');
    setUserAnthropicApiKey('');
    setTempAnthropicApiKey('');
    setAnthropicApiKeyStatus('idle');
  };

  const handleImportYouTube = async (meta: YouTubeVideoMetadata) => {
      resetState();
      setFileType('youtube');
      setYoutubeMeta({ ...meta, isOAuthFlow: false });
      // We do not use the videoSrc for youtube type anymore in the preview box
      const mockFile = new File([""], meta.title, { type: 'video/youtube' });
      setFile(mockFile);
  };

  const handleYouTubeCaptionDownload = async () => {
      if (!selectedCaptionId || !youtubeMeta?.videoUrl) {
          setError("Please select a caption track first.");
          return;
      }
      
      setError(null);
      setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
      setVideoProcessingMessage('Downloading caption track from YouTube...');
      
      try {
          const trackConfig = { lang: selectedCaptionId, isAuto: true };
          const token = btoa(JSON.stringify(trackConfig));
          const captionText = await downloadCaptionTrack(youtubeMeta.videoUrl, token);

          const parsed = parseSRT(captionText);
          if (parsed.length === 0) throw new Error("Downloaded caption file is empty or in an unsupported format.");
          
          setSubtitles(parsed);
          setStatus(TranslationStatus.COMPLETED); 
          setVideoProcessingStatus(VideoProcessingStatus.DONE);
          setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

      } catch (e: any) {
          setError(e.message || "Failed to download captions");
          setVideoProcessingStatus(VideoProcessingStatus.ERROR);
      }
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    setDraggedFileInfo(null);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  };

  const processFile = (fileToProcess: File) => {
      resetState();
      if (fileToProcess.name.endsWith('.srt') || fileToProcess.name.endsWith('.vtt')) {
          setFileType('srt');
          setFile(fileToProcess);
          parseSrtFile(fileToProcess);
      } else if (SUPPORTED_VIDEO_FORMATS.includes(fileToProcess.type) || fileToProcess.name.match(/\.(mp4|mkv|mov|webm|avi)$/i)) {
          setFileType('video');
          setFile(fileToProcess);
          handleVideoUpload(fileToProcess);
      } else {
          setError("Unsupported file type. Please upload an SRT or a supported video file.");
      }
  };

  const handleImportFile = (importedFile: File) => {
      processFile(importedFile);
  };

  const parseSrtFile = async (f: File) => {
    setStatus(TranslationStatus.PARSING);
    try {
      const text = await f.text();
      const parsed = parseSRT(text);
      if (parsed.length === 0) throw new Error("No subtitles found in file.");
      setSubtitles(parsed);
      setStatus(TranslationStatus.IDLE);
    } catch (e: any) {
      setError(e.message || "Failed to parse SRT file.");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleVideoUpload = async (videoFile: File) => {
    try {
      setVideoProcessingStatus(VideoProcessingStatus.INITIALIZING_ENGINE);
      const ffmpeg = await loadFFmpeg((message) => setVideoProcessingMessage(message));
      ffmpegRef.current = ffmpeg;
      ffmpeg.on('progress', ({ progress }) => {
        setFfmpegProgress(progress * 100);
      });
      
      setVideoProcessingStatus(VideoProcessingStatus.ANALYZING);
      setVideoProcessingMessage('Analyzing video for subtitle tracks...');
      const analysis = await analyzeVideoFile(ffmpeg, videoFile);
      setExtractedTracks(analysis.tracks);
      if (analysis.dimensions && analysis.dimensions.height > 0) {
        setLocalVideoDimensions(analysis.dimensions);
      }
      
      const objectUrl = URL.createObjectURL(videoFile);
      const tempVideo = document.createElement('video');
      tempVideo.src = objectUrl;
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.videoHeight > 0) {
          setLocalVideoDimensions({ width: tempVideo.videoWidth, height: tempVideo.videoHeight });
        }
      };

      setVideoSrc(objectUrl);
      generateVideoThumbnail(videoFile).then(setVideoThumbnail);

      setVideoProcessingStatus(VideoProcessingStatus.IDLE);
    } catch (e: any) {
      setError(`Failed to process video file: ${e.message}`);
      setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const handleTrackSelection = async (trackIndex: number) => {
    if (!ffmpegRef.current) return;
    try {
        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
        setVideoProcessingMessage('Extracting selected subtitle track...');
        const srtContent = await extractSrt(ffmpegRef.current, trackIndex);
        const parsed = parseSRT(srtContent);
        setSubtitles(parsed);
        setVideoProcessingStatus(VideoProcessingStatus.DONE);
        setStatus(TranslationStatus.COMPLETED);
    } catch(e: any) {
        setError(`Failed to extract subtitle track: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const handleGenerateSubtitles = async () => {
    if (fileType === 'youtube') {
         setError("This action is for local video files. Please select a language to generate captions for your YouTube import.");
         return;
    }

    if (activeModelData.provider === 'youtube') {
        if (!googleAccessToken || !googleUser || !file) {
            setError("Please authenticate with YouTube in Settings to use this feature.");
            if (!file) setError("No file loaded to upload.");
            setActiveModal('CONFIG');
            return;
        }

        try {
            setError(null);
            setVideoProcessingStatus(VideoProcessingStatus.UPLOADING_TO_YOUTUBE);
            setVideoProcessingMessage('Uploading video to YouTube (Unlisted)...');
            setFfmpegProgress(0);
            
            const uploadTitle = getOutputFilename('').replace('SubStream_', '').replace(/\.$/, '').replace(/_/g, ' ');
            const videoId = await uploadVideoToYouTube(
                googleAccessToken, 
                file, 
                uploadTitle,
                (percent) => setFfmpegProgress(percent / 2) // Upload is first 50%
            );
            
            setVideoProcessingStatus(VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS);
            await pollForCaptionReady(
                googleAccessToken, 
                videoId, 
                (msg, percent) => {
                    setVideoProcessingMessage(msg);
                    setFfmpegProgress(50 + (percent / 2)); // Polling is second 50%
                }
            );

            // Fetch video details to get available resolutions
            let resolutions: number[] = [];
            try {
                const details = await getVideoDetails(`https://www.youtube.com/watch?v=${videoId}`);
                resolutions = details.meta.availableResolutions || [];
            } catch (e) {
                console.warn("Could not fetch resolutions for fresh video, using defaults.");
            }

            // Fallback for fresh uploads if resolutions array is empty
            if (resolutions.length === 0) {
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
            if (msg.toLowerCase().includes("quota")) {
                 setError("Daily YouTube Upload Quota Exceeded. Please try again tomorrow or use a Gemini/OpenAI model.");
            } else if (msg.includes("401")) {
                setError(`Session expired. Please click "Authenticate YouTube" again.`);
                handleGoogleLogout(); 
            } else {
                setError(`YouTube Auto-Caption failed: ${msg}`);
            }
            setVideoProcessingStatus(VideoProcessingStatus.ERROR);
        }
        return;
    }

    const apiKey = activeModelData.provider === 'openai' ? userOpenAIApiKey : activeModelData.provider === 'anthropic' ? userAnthropicApiKey : userGoogleApiKey;
    if (!ffmpegRef.current || !apiKey) {
        setActiveModal('CONFIG');
        setError(`Please provide an API Key for ${activeModelData.provider} to generate subtitles.`);
        setVideoProcessingStatus(VideoProcessingStatus.IDLE);
        return;
    }

    try {
        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_AUDIO);
        setVideoProcessingMessage('Extracting audio from video...');
        const audioBlob = await extractAudio(ffmpegRef.current);

        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.TRANSCRIBING);
        setVideoProcessingMessage(`Transcribing audio in ${sourceLang === 'auto' ? 'detected language' : sourceLang} with ${activeModelData.name}...`);
        
        const srtContent = await transcribeAudio(audioBlob, sourceLang, apiKey, activeModelData);
        const parsed = parseSRT(srtContent);
        
        setSubtitles(parsed);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        setVideoProcessingStatus(VideoProcessingStatus.DONE); 
        runTranslationSequence(parsed, apiKey, activeModelData);

    } catch(e: any) {
        setError(`Failed to generate subtitles: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
        setStatus(TranslationStatus.ERROR);
    }
  };
  
  const runTranslationSequence = async (
      subtitlesToTranslate: SubtitleNode[], 
      apiKey: string, 
      activeModel: AIModel
  ) => {
    setStatus(TranslationStatus.TRANSLATING);
    setProgress(0);
    setError(null);

    try {
      const result = await processFullSubtitleFile(
        subtitlesToTranslate,
        sourceLang,
        targetLang,
        apiKey,
        activeModel,
        (count) => setProgress(Math.round((count / subtitlesToTranslate.length) * 100)),
        (updatedSubtitles) => setSubtitles(updatedSubtitles)
      );
      
      setSubtitles(result);
      const estimatedRequests = Math.ceil(subtitlesToTranslate.length / BATCH_SIZE);
      updateUsage(estimatedRequests);
      setStatus(TranslationStatus.COMPLETED);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An error occurred during translation. Please try again.");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleTranslate = async () => {
    if (subtitles.length === 0) return;
    
    const apiKey = activeModelData.provider === 'openai' ? userOpenAIApiKey : activeModelData.provider === 'anthropic' ? userAnthropicApiKey : userGoogleApiKey;
    if (!apiKey) {
      setActiveModal('CONFIG');
      setError(`Please Provide an API Key for ${activeModelData.provider} to continue.`);
      return;
    }
    
    runTranslationSequence(subtitles, apiKey, activeModelData);
  };

  const handleDownloadSrt = () => {
    if (subtitles.length === 0) return;
    const content = stringifySRT(subtitles);
    const filename = getOutputFilename('srt');
    downloadFile(filename, content);
  };

  const handleDownloadVideo = async (resolution?: number) => {
    const fileName = getOutputFilename('mp4');
    setShowResolutionMenu(false);

    if (fileType === 'youtube') {
        if (!selectedCaptionId || !youtubeMeta?.videoUrl) return;
        
        setError(null);
        setDownloadProgress(0); 
        setDownloadStatusText('Initializing...');
        setIsDownloadComplete(false);

        progressInterval.current = setInterval(() => {
            setDownloadProgress(prev => {
                if (prev === undefined) return 0;
                if (prev >= 90) return 90;
                return prev + Math.random() * 4;
            });
        }, 600);

        try {
             const trackConfig = { lang: selectedCaptionId, isAuto: true };
             const token = btoa(JSON.stringify(trackConfig));
             await downloadYouTubeVideoWithSubs(youtubeMeta.videoUrl, token, fileName, resolution);
             
             if (progressInterval.current) clearInterval(progressInterval.current);
             setDownloadProgress(100);
             setDownloadStatusText('Done');
             setIsDownloadComplete(true);
             
             setTimeout(() => {
                 setDownloadProgress(undefined);
                 setDownloadStatusText('');
                 setIsDownloadComplete(false);
             }, 3000);

        } catch (e: any) {
            if (progressInterval.current) clearInterval(progressInterval.current);
            setDownloadProgress(undefined);
            setDownloadStatusText('');
            setError(`Video download failed: ${e.message}`);
        }
        return;
    }
    
    if (!file || subtitles.length === 0) return;
    try {
        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.MUXING);
        setVideoProcessingMessage('Packaging softsub video file...');
        
        const ffmpeg = ffmpegRef.current || await loadFFmpeg((message) => setVideoProcessingMessage(message));
        ffmpegRef.current = ffmpeg;

        const finalSrt = stringifySRT(subtitles); // Selected / Translated Text
        const hasOriginals = subtitles.some(s => !!s.originalText);
        const originalSrt = hasOriginals ? stringifySRT(subtitles.map(s => ({...s, text: s.originalText || s.text}))) : undefined;

        const targetLangData = LANGUAGES.find(l => l.name === targetLang);
        const sourceLangData = LANGUAGES.find(l => l.name === sourceLang);
        
        const mkvFileName = fileName.replace(/\.mp4$/i, '.mkv');
        
        const newVideoBlob = await addSrtToVideo(
            ffmpeg, 
            file, 
            finalSrt, 
            targetLangData?.code || 'eng',
            originalSrt,
            sourceLangData?.code || 'und',
            resolution
        );
        
        downloadFile(mkvFileName, newVideoBlob);
        setVideoProcessingStatus(VideoProcessingStatus.DONE);
    } catch(e: any) {
        setError(`Failed to package video file: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const estimatedRequests = subtitles.length > 0 ? Math.ceil(subtitles.length / BATCH_SIZE) : 0;
  const remainingQuota = Math.max(0, ESTIMATED_DAILY_QUOTA - requestsUsed);
  const hasProAccess = userGoogleApiKey || userOpenAIApiKey || userAnthropicApiKey;

  const filteredGoogleModels = useMemo(() => {
    return modelsList.filter(model => model.provider === 'google' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelsList, modelSearchQuery]);

  const filteredOpenAIModels = useMemo(() => {
    return modelsList.filter(model => model.provider === 'openai' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelsList, modelSearchQuery]);

  const filteredAnthropicModels = useMemo(() => {
    return modelsList.filter(model => model.provider === 'anthropic' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelsList, modelSearchQuery]);
  
  const youtubeModel = useMemo(() => {
      return modelsList.filter(model => model.provider === 'youtube' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelsList, modelSearchQuery]);

  const showProgressBar = [
    VideoProcessingStatus.EXTRACTING_AUDIO, 
    VideoProcessingStatus.TRANSCRIBING, 
    VideoProcessingStatus.MUXING,
    VideoProcessingStatus.EXTRACTING_SUBTITLES,
    VideoProcessingStatus.UPLOADING_TO_YOUTUBE,
    VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS
  ].includes(videoProcessingStatus);
  
  const selectedOpenAIRpmIndex = useMemo(() => OPENAI_RPM_OPTIONS.findIndex(o => o.value === selectedRPM), [selectedRPM]);
  const selectedAnthropicRpmIndex = useMemo(() => ANTHROPIC_RPM_OPTIONS.findIndex(o => o.value === selectedRPM), [selectedRPM]);

  const isTranslationInProgress = status === TranslationStatus.TRANSLATING;
  const isTranslationComplete = status === TranslationStatus.COMPLETED;
  const isConfigureStepActive = !!file && !isTranslationInProgress && !isTranslationComplete;
  const isYouTubeWorkflow = fileType === 'youtube';

  const sourceLangFont = useMemo(() => {
      if (isYouTubeWorkflow && selectedCaptionId) {
          const matched = LANGUAGES.find(l => l.code === selectedCaptionId || l.name === selectedCaptionId);
          if (matched?.font) return matched.font;
      }
      return LANGUAGES.find(l => l.name === sourceLang || l.code === sourceLang)?.font;
  }, [sourceLang, selectedCaptionId, isYouTubeWorkflow]);

  const targetLangFont = useMemo(() => LANGUAGES.find(l => l.name === targetLang || l.code === targetLang)?.font, [targetLang]);

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

  const isDownloadDisabled = subtitles.length === 0 || isTranslationInProgress || downloadProgress !== undefined || (videoProcessingStatus !== VideoProcessingStatus.IDLE && videoProcessingStatus !== VideoProcessingStatus.DONE);

  if (currentPage === 'DOCS') {
    return (
      <div key="docs-page" className="animate-fade-in min-h-screen bg-black">
        <Documentation onBack={() => setCurrentPage('HOME')} />
      </div>
    );
  }

  return (
    <div key="home-page" className="animate-fade-in min-h-screen bg-black text-neutral-200 font-sans selection:bg-white selection:text-black flex flex-col scroll-smooth snap-y snap-proximity">
      
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-neutral-900/30 blur-[120px] rounded-full mix-blend-screen" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-neutral-800/20 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className={`
          fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 
          flex items-center gap-3 px-6 py-3.5 rounded-full min-w-[320px] justify-center
          bg-neutral-900/30 border border-white/10 text-white shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-xl
          transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)
          ${toast?.isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95 pointer-events-none'}
      `}>
         <Sparkles className="w-5 h-5 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
         <span className="text-sm font-medium tracking-wide">{toast?.message}</span>
      </div>

      <nav className="relative z-20 border-b border-neutral-900 bg-black/80 backdrop-blur-xl sticky top-0 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => window.location.reload()}>
            <span className="font-display font-bold text-lg tracking-tight">SubStream <span className="text-neutral-600 font-sans font-normal text-sm ml-2">AI</span></span>
          </div>
          <div className="flex items-center gap-2 md:gap-6 text-sm font-medium text-neutral-400">
             <button onClick={() => setCurrentPage('DOCS')} className="hidden md:block hover:text-white transition-colors focus:outline-none">Documentation</button>
             <button onClick={() => setCurrentPage('DOCS')} className="p-2 rounded-full hover:bg-neutral-800 transition-colors group md:hidden" aria-label="Documentation"><BookText className="w-5 h-5 text-neutral-400 group-hover:text-white" /></button>
             <button onClick={() => setActiveModal('CONFIG')} className={`flex items-center gap-1.5 md:gap-3 pl-2 md:pl-3 pr-1.5 md:pr-2 py-1 md:py-1.5 rounded-xl border transition-all group ${hasProAccess ? 'bg-neutral-900/50 border-neutral-800 hover:border-white/30' : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-600'}`}>
                <div className="text-xs text-right max-w-[110px] md:max-w-none leading-tight">
                   <div className="font-bold text-white">{activeModelData.name}</div>
                   <div className={`text-[10px] uppercase ${hasProAccess ? 'text-green-400' : 'text-neutral-500'}`}>{hasProAccess ? 'Pro Access' : `${remainingQuota} Credits`}</div>
                </div>
                <div className={`w-8 h-8 rounded-full border relative flex items-center justify-center ${hasProAccess ? 'border-green-900/50 bg-green-900/20' : 'border-neutral-700 bg-neutral-800/50'}`}>
                   <Cpu className={`w-4 h-4 ${hasProAccess ? 'text-green-400' : 'text-neutral-400 group-hover:text-white'}`} />
                </div>
             </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-3 sm:px-4 md:px-6 w-full flex-grow flex flex-col">
        <div className="flex-grow flex flex-col justify-start pt-8 md:pt-30">
            <section className="mb-8 md:mb-14 text-center">
                <h1 className="text-[2.65rem] leading-[1.05] sm:text-5xl md:text-6xl font-display font-bold tracking-tighter text-white mb-6 animate-slide-up">
                    Bridge the Language<br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-neutral-700">Gap Instantly.</span>
                </h1>
                <p className="text-base md:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{animationDelay: '0.1s'}}>
                    Transform your subtitles with context-aware AI. 
                    Powered by state-of-the-art frontier AI models for nuance and accuracy across {LANGUAGES.length}+ languages.
                </p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pb-8">
              <div className="order-2 lg:order-1 lg:col-span-3 flex flex-col">
                 <div className="h-full flex flex-row justify-around p-6 rounded-3xl border border-neutral-900 bg-neutral-950/50 backdrop-blur-sm lg:flex-col lg:justify-between">
                     <StepIndicator number={1} title="Upload" isActive={status === TranslationStatus.IDLE && !file} isCompleted={!!file} />
                     <StepIndicator number={2} title="Configure" isActive={isConfigureStepActive} isCompleted={isTranslationInProgress || isTranslationComplete} />
                     <StepIndicator number={3} title="Translate" isActive={isTranslationInProgress} isCompleted={isTranslationComplete} />
                     <StepIndicator number={4} title="Download" isActive={isTranslationComplete} isCompleted={false} />
                 </div>
              </div>

              <div className="order-1 lg:order-2 lg:col-span-9 h-full flex flex-col justify-between gap-6">
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

                <div className={`group relative rounded-3xl p-6 transition-all duration-300 overflow-hidden ${
                  isDraggingFile && !file
                    ? 'border border-transparent bg-neutral-900/60 scale-[1.01]'
                    : 'border border-neutral-800 bg-neutral-900/20 hover:bg-neutral-900/30'
                }`}>
                   {isDraggingFile && !file && (
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
                   {!file ? (
                     <div className="flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px] w-full relative transition-all duration-300"
                       onDragOver={(e) => e.preventDefault()}
                       onDrop={handleDrop}
                       onClick={() => fileInputRef.current?.click()}
                     >
                        <input type="file" ref={fileInputRef} className="hidden" accept={`.srt, ${SUPPORTED_VIDEO_FORMATS.join(',')}`} onChange={handleFileChange} />
                        
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
                               <button onClick={() => { setImportType('URL'); setImportModalOpen(true); }} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 transition-all group/btn" title="Import from URL">
                                 <LinkIcon className="w-5 h-5 text-neutral-400 group-hover/btn:text-white" />
                               </button>
                               <button onClick={() => { setImportType('YOUTUBE'); setImportModalOpen(true); }} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-red-500/50 transition-all group/btn" title="Import from YouTube">
                                 <Youtube className="w-5 h-5 text-neutral-400 group-hover/btn:text-red-500" />
                               </button>
                               <button onClick={() => setCloudModalOpen(true)} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group/btn" title="Import from Cloud Drive">
                                 <HardDrive className="w-5 h-5 text-neutral-400 group-hover/btn:text-blue-500" />
                               </button>
                               <button onClick={() => showToast("Social Media Integration Coming Soon!")} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-pink-500/50 transition-all group/btn" title="Other Sources">
                                 <Instagram className="w-5 h-5 text-neutral-400 group-hover/btn:text-pink-500" />
                               </button>
                            </div>
                          </>
                        )}
                     </div>
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
                   ) : (fileType === 'video' && videoProcessingStatus === VideoProcessingStatus.IDLE && subtitles.length === 0) ? (
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
                                ) : fileType === 'video' && videoThumbnail ? (
                                    <img src={videoThumbnail} className="w-full h-full object-cover" alt="Video thumbnail"/>
                                ) : (
                                    <Clapperboard className="w-6 h-6 text-white" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-lg font-bold text-white truncate">{file?.name}</h3>
                                <p className="text-neutral-500 text-sm">
                                    {subtitles.length > 0 ? `${subtitles.length} lines loaded` : isYouTubeWorkflow ? 'Select a caption track below' : 'Ready to configure'}
                                </p>
                              </div>
                            </div>
                            <Button variant="outline" onClick={resetState} className="shrink-0">Change File</Button>
                        </div>

                        {!isYouTubeWorkflow && subtitles.length > 0 && status === TranslationStatus.IDLE && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-900/20 border border-indigo-900/40 text-indigo-300 text-sm">
                              <Info className="w-4 h-4 shrink-0" />
                              <span>Processing this file will require approximately <strong>{estimatedRequests} API requests</strong>.</span>
                          </div>
                        )}
                     </div>
                   )}
                </div>

                {isConfigureStepActive && (
                    <>
                        {isYouTubeWorkflow && subtitles.length === 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                                <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Transcription Language</label>
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                                            onChange={(e) => setSelectedCaptionId(e.target.value)}
                                            value={selectedCaptionId}
                                            disabled={videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES}
                                        >
                                            <option value="">-- Select a Language --</option>
                                            {LANGUAGES.map((l) => (
                                                <option key={l.code} value={l.code}>
                                                    {l.name}
                                                </option>
                                            ))}
                                        </select>
                                        <Languages className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 flex flex-col justify-end">
                                    <div className="h-full flex items-end">
                                        <Button
                                            className="w-full py-3.5 text-base"
                                            onClick={handleYouTubeCaptionDownload}
                                            disabled={!selectedCaptionId || videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES}
                                            icon={videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                        >
                                            {videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES ? 'Downloading...' : 'Generate & Process'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : !isYouTubeWorkflow && subtitles.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                                <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Source Language</label>
                                    <div className="relative">
                                        <select className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} disabled={isTranslationInProgress}>
                                            <option value="auto">✨ Auto Detect</option>
                                            {LANGUAGES.map(l => <option key={`source-${l.code}`} value={l.name}>{l.name}</option>)}
                                        </select>
                                        <Languages className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 flex flex-col justify-end">
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Target Language</label>
                                    <div className="relative">
                                        <select className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} disabled={isTranslationInProgress}>
                                            {LANGUAGES.map(l => <option key={`target-${l.code}`} value={l.name}>{l.name}</option>)}
                                        </select>
                                        <ArrowRight className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}


                {!isYouTubeWorkflow && subtitles.length > 0 && (
                  <div className="flex justify-end gap-4 animate-fade-in">
                    {isTranslationInProgress ? (
                      <div className="flex-1 p-4 rounded-xl border border-neutral-800 bg-neutral-900/50 flex items-center gap-4">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <div className="flex-1">
                           <div className="flex justify-between text-xs font-medium mb-1">
                             <span>Translating with {activeModelData.name}...</span>
                             <span>{progress}%</span>
                           </div>
                           <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full bg-white transition-all duration-300" style={{width: `${progress}%`}}></div>
                           </div>
                        </div>
                      </div>
                    ) : status === TranslationStatus.IDLE ? (
                      <Button onClick={handleTranslate} className="w-full md:w-auto text-lg" icon={<Zap className="w-5 h-5" />}>
                        Start Translation
                      </Button>
                    ) : null}
                  </div>
                )}
                
                {error && (
                  <div className="p-4 rounded-xl bg-red-900/10 border border-red-900/40 text-red-200 text-sm flex items-start gap-3 animate-fade-in w-full">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <span className="break-words whitespace-pre-wrap w-full">{error}</span>
                  </div>
                )}
              </div>
            </div>
        </div>

        {subtitles.length > 0 && (
          <section ref={resultsRef} className={`border-t border-neutral-900 px-3 md:px-8 flex flex-col justify-between scroll-mt-20 snap-start snap-always animate-slide-up overflow-hidden box-border transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
            previewMode === 'video' 
              ? 'h-[65vh] min-h-[65vh] max-h-[65vh] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-4 pb-6 md:pt-16 md:pb-20' 
              : 'h-[100vh] min-h-[100vh] max-h-[100vh] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)] pt-7 pb-8 md:pt-9 md:pb-11'
          }`}>
            <div className={`flex items-center justify-between flex-wrap gap-2 shrink-0 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${previewMode === 'video' ? 'mb-1' : 'mb-4'}`}>
              <div>
                <div className="flex items-center gap-3 mb-[0.5rem]">
                  <h2 className="text-3xl font-display font-bold text-white">
                      Live Preview
                  </h2>

                  {/* Segmented Control Switch with exact requested styling */}
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
                    {isYouTubeWorkflow ? 'Review the generated transcription below.' : 'Comparing original vs translated output.'}
                </p>
              </div>
              <div className="flex items-center relative w-full sm:w-auto mt-2 sm:mt-0">
                  {(fileType === 'video' || fileType === 'youtube') ? (
                      <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-sm gap-1 w-full sm:w-auto">
                        <div 
                            className="relative flex-1 sm:flex-initial" 
                            ref={resolutionMenuRef}
                            onMouseEnter={() => {
                              if (window.matchMedia('(hover: hover)').matches && !isDownloadDisabled) {
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
                                if (!isDownloadDisabled) {
                                  setShowResolutionMenu(prev => !prev);
                                }
                              }} 
                              progress={downloadProgress}
                              statusText={downloadStatusText}
                              completed={isDownloadComplete}
                              disabled={isDownloadDisabled}
                              icon={<Film className="w-4 h-4" />}
                              className="w-full !bg-transparent hover:!bg-neutral-900/90 !text-neutral-300 hover:!text-white !border-0 rounded-xl focus:outline-none focus:ring-0 active:outline-none px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold transition-all flex items-center justify-center gap-1.5"
                          >
                              <span>Download Video</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${showResolutionMenu ? 'rotate-180' : ''}`} />
                          </Button>
                          {showResolutionMenu && !isDownloadDisabled && (
                              <div className="absolute right-0 top-full pt-1.5 z-30 animate-fade-in w-full sm:w-48">
                                  <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden py-1">
                                      {isYouTubeWorkflow && youtubeMeta?.availableResolutions && youtubeMeta.availableResolutions.length > 0 ? (
                                          youtubeMeta.availableResolutions
                                            .filter((res) => typeof res === 'number' && res >= 144)
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
                                          localVideoResolutions.map((res) => (
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
                            disabled={isDownloadDisabled} 
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
                          disabled={isDownloadDisabled} 
                          icon={<Download className="w-4 h-4"/>}
                          className="w-full sm:w-auto px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all focus:outline-none focus:ring-0 active:outline-none"
                      >
                          Download SRT
                      </Button>
                  )}
              </div>
            </div>

            <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden relative transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${previewMode === 'video' ? 'my-0' : 'my-2.5'}`}>
              {/* Table View */}
              <div 
                key="table-view" 
                className={`absolute inset-0 flex flex-col rounded-3xl border border-neutral-800/80 bg-black/70 backdrop-blur overflow-hidden transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
                  previewMode === 'table' 
                    ? 'opacity-100 scale-100 pointer-events-auto z-10' 
                    : 'opacity-0 scale-[0.98] pointer-events-none z-0'
                }`}
              >
                <div className={`grid grid-cols-[112px_1fr] border-b border-neutral-800/80 bg-neutral-950/80 px-6 py-3.5 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky top-0 z-10 shrink-0`}>
                  <div className="w-24">Timestamp</div>
                  <div className={`grid ${isYouTubeWorkflow ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
                     <span>Original ({isYouTubeWorkflow ? LANGUAGES.find(l=>l.code === selectedCaptionId)?.name || 'Selected Language' : sourceLang})</span>
                     {!isYouTubeWorkflow && <span className="text-white">Translated ({targetLang})</span>}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
                  {subtitles.map((sub) => ( <SubtitleCard key={sub.id} subtitle={sub} isActive={sub.text !== sub.originalText} isSingleColumn={isYouTubeWorkflow} sourceFont={sourceLangFont} targetFont={targetLangFont} /> ))}
                </div>
              </div>

              {/* Video View */}
              <div 
                key="video-view" 
                className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
                  previewMode === 'video' 
                    ? 'opacity-100 scale-100 pointer-events-auto z-10' 
                    : 'opacity-0 scale-[0.98] pointer-events-none z-0'
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

            <div className="shrink-0 flex justify-center pt-2 pb-1">
                <Button variant="secondary" onClick={resetState} icon={<RefreshCw className="w-4 h-4" />}>
                    Process Another File
                </Button>
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-neutral-900 bg-black/80 backdrop-blur-xl mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 flex flex-col gap-3 md:gap-4">
            <div className="flex items-center justify-between gap-4 w-full">
                <span className="font-display font-bold tracking-tight text-neutral-400">SubStream AI</span>
                <div className="hidden md:block text-xs text-neutral-600 text-center">
                    &copy; {new Date().getFullYear()} SubStream AI. Open Source.
                </div>
                <div className="flex items-center gap-3.5 md:gap-6 text-xs md:text-sm text-neutral-500">
                    <button onClick={() => setActiveModal('TOS')} className="hover:text-white transition-colors">Terms</button>
                    <button onClick={() => setActiveModal('PRIVACY')} className="hover:text-white transition-colors">Privacy</button>
                    <a href="https://github.com/imrovoid/SubStream-AI" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" aria-label="GitHub"><Github className="w-4 h-4 md:w-5 md:h-5" /></a>
                </div>
            </div>
            <div className="flex items-center justify-center gap-2.5 md:gap-4 text-xs text-neutral-500 w-full">
                <span>Developed by <a href="https://rovoid.netlify.app" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white transition-colors font-medium">ROVOID</a></span>
                <span className="w-1 h-1 rounded-full bg-neutral-800"></span>
                <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/50 border border-neutral-800 text-xs hover:border-neutral-600 hover:bg-neutral-800 transition-all group">
                    <Heart className="w-3 h-3 text-pink-500 group-hover:scale-110 transition-transform" /> Support Me
                </button>
            </div>
            <div className="md:hidden text-center text-[11px] text-neutral-600">
                &copy; {new Date().getFullYear()} SubStream AI. Open Source.
            </div>
        </div>
      </footer>

      {/* ... Modals ... */}
      <Modal isOpen={activeModal === 'CONFIG'} onClose={() => setActiveModal('NONE')} title="AI Configuration">
        {/* ... (Existing modal content remains unchanged) ... */}
        <div className="flex flex-col md:grid md:grid-cols-2 gap-x-8 gap-y-6 md:gap-y-10">
           <div className="order-2 md:order-1 md:col-start-1 md:row-span-2 flex flex-col gap-4 bg-neutral-900/60 border border-neutral-800/80 md:bg-transparent md:border-0 rounded-2xl md:rounded-none p-4 md:p-0">
              <label className="block text-sm font-bold text-white flex items-center gap-2"><Cpu className="w-4 h-4" /> Select AI Model</label>
              
              {/* Dynamic Model Sync Status Banner */}
              <div className="flex items-center justify-between bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>
                    Auto-synced via <strong className="text-white">{syncInfo?.provider || 'OpenRouter'}</strong> ({modelsList.length} models)
                  </span>
                </div>
                <button
                  onClick={() => handleSyncModels(true)}
                  disabled={isSyncingModels}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors disabled:opacity-50"
                  title="Fetch latest models from free public API"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingModels ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{isSyncingModels ? 'Syncing...' : 'Refresh'}</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-neutral-500 pointer-events-none" />
                <input type="text" placeholder="Search models..." value={modelSearchQuery} onChange={(e) => setModelSearchQuery(e.target.value)} className="w-full bg-black/50 border border-neutral-700 rounded-xl py-2 pl-10 pr-4 text-white focus:border-white focus:outline-none transition-colors" />
              </div>
              
              <ScrollFadeContainer 
                className="space-y-4 pr-2 overflow-y-auto max-h-[380px] md:max-h-[430px] flex-1 custom-scrollbar"
                topFadeClassName="from-[#121212] via-[#121212]/40 to-transparent"
                bottomFadeClassName="from-[#121212] via-[#121212]/40 to-transparent"
                roundedCorner="rounded-xl"
              >
                
                {youtubeModel.length > 0 && (
                  <div>
                    <div 
                      onClick={() => toggleGroup('youtube')}
                      className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                    >
                      <span className="font-bold text-neutral-300">YouTube Services</span>
                      <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.youtube ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.youtube ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                          {youtubeModel.map((model) => {
                            const isDisabled = !googleUser;
                            return (
                                <div 
                                    key={model.id} 
                                    onClick={() => !isDisabled && setSelectedModelId(model.id)} 
                                    className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 
                                        ${isDisabled ? 'opacity-50 cursor-not-allowed bg-neutral-900/30 border-neutral-800' : 
                                          selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}
                                    `}
                                >
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                          {model.name}
                                          {!googleUser && <span className="text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">Auth Required</span>}
                                      </h4>
                                      <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                                    </div>
                                    {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 mt-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                                    </div>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {filteredGoogleModels.length > 0 && (
                  <div>
                    <div 
                      onClick={() => toggleGroup('google')}
                      className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                    >
                      <span className="font-bold text-neutral-300">Google Gemini Models</span>
                      <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.google ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.google ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                          {filteredGoogleModels.map((model) => (
                            <div key={model.id} onClick={() => setSelectedModelId(model.id)} className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                    {model.name}
                                    {model.isDynamic && <span className="text-[9px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">LIVE</span>}
                                  </h4>
                                  <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                                </div>
                                {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {filteredOpenAIModels.length > 0 && (
                  <div>
                    <div 
                      onClick={() => toggleGroup('openai')}
                      className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                    >
                      <span className="font-bold text-neutral-300">OpenAI Models</span>
                      <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.openai ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.openai ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                          {filteredOpenAIModels.map((model) => (
                            <div key={model.id} onClick={() => setSelectedModelId(model.id)} className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                    {model.name}
                                    {model.isDynamic && <span className="text-[9px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">LIVE</span>}
                                  </h4>
                                  <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                                </div>
                                {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {filteredAnthropicModels.length > 0 && (
                  <div>
                    <div 
                      onClick={() => toggleGroup('anthropic')}
                      className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                    >
                      <span className="font-bold text-neutral-300">Anthropic Claude Models</span>
                      <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.anthropic ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.anthropic ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                          {filteredAnthropicModels.map((model) => (
                            <div key={model.id} onClick={() => setSelectedModelId(model.id)} className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                    {model.name}
                                    {model.isDynamic && <span className="text-[9px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">LIVE</span>}
                                  </h4>
                                  <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                                </div>
                                {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ScrollFadeContainer>
           </div>
           
           <div className="order-1 md:order-2 md:col-start-2 md:row-start-1 space-y-6 flex flex-col">
              <div className="space-y-6 flex-grow">
                  <div className="space-y-2">
                     <div className="flex items-center justify-between">
                        <label className="block text-sm font-bold text-white flex items-center gap-2"><Key className="w-4 h-4" /> Google AI API Key</label>
                        {userGoogleApiKey && ( <button onClick={clearGoogleApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button> )}
                     </div>
                    <div className="relative">
                       <input type="password" placeholder="AIzaSy..." value={tempGoogleApiKey} onChange={(e) => setTempGoogleApiKey(e.target.value)} className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${googleApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''} ${googleApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${googleApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''} ${googleApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`} />
                       <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {googleApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                          {googleApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          {googleApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                       </div>
                    </div>
                    <p className="text-xs text-neutral-500">For Gemini models. Stored locally in your browser.</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="block text-sm font-bold text-white flex items-center gap-2"><Key className="w-4 h-4" /> OpenAI API Key</label>
                        {userOpenAIApiKey && ( <button onClick={clearOpenAIApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button> )}
                     </div>
                    <div className="relative">
                       <input type="password" placeholder="sk-..." value={tempOpenAIApiKey} onChange={(e) => setTempOpenAIApiKey(e.target.value)} className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${openAIApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''} ${openAIApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${openAIApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''} ${openAIApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`} />
                       <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {openAIApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                          {openAIApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          {openAIApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                       </div>
                    </div>
                    <p className="text-xs text-neutral-500">For GPT models. Stored locally in your browser.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="block text-sm font-bold text-white flex items-center gap-2"><Key className="w-4 h-4" /> Anthropic Claude API Key</label>
                        {userAnthropicApiKey && ( <button onClick={clearAnthropicApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button> )}
                     </div>
                    <div className="relative">
                       <input type="password" placeholder="sk-ant-..." value={tempAnthropicApiKey} onChange={(e) => setTempAnthropicApiKey(e.target.value)} className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${anthropicApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''} ${anthropicApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${anthropicApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''} ${anthropicApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`} />
                       <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {anthropicApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                          {anthropicApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          {anthropicApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                       </div>
                    </div>
                    <p className="text-xs text-neutral-500">For Claude models. Stored locally in your browser.</p>
                  </div>
    
                  {activeModelData.provider !== 'youtube' && (() => {
                    const currentRpmOptions = activeModelData.provider === 'anthropic' ? ANTHROPIC_RPM_OPTIONS : OPENAI_RPM_OPTIONS;
                    const standardIdx = currentRpmOptions.findIndex(o => o.value === selectedRPM);
                    const currentRpmOptionIndex = isCustomRPM ? 3 : (standardIdx >= 0 ? standardIdx : 1);

                    return (
                      <div className="space-y-2">
                           <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-bold text-white flex items-center gap-2"><Gauge className="w-4 h-4" /> Rate Limit</label>
                              <p className="font-medium text-white text-sm">{`${typeof selectedRPM === 'number' ? selectedRPM : 15} RPM`}</p>
                           </div>
                          
                           {/* GOOGLE STATIC TIER RATE LIMIT UI */}
                           {activeModelData.provider === 'google' && activeModelData.rateLimits ? (
                               <>
                                  <div className="grid grid-cols-4 gap-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                                      {(['free', 'tier1', 'tier2', 'tier3'] as GeminiTier[]).map((tier) => {
                                          const rpm = activeModelData.rateLimits![tier];
                                          const isDisabled = rpm === undefined;
                                          const isActive = selectedGeminiTier === tier;
                                          const labelMap = { free: 'Free Tier', tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' };
                                          
                                          return (
                                              <button
                                                  key={tier}
                                                  onClick={() => !isDisabled && setSelectedGeminiTier(tier)}
                                                  disabled={isDisabled}
                                                  className={`
                                                      relative flex flex-col items-center justify-center py-2 rounded-lg text-xs transition-all duration-200
                                                      ${isDisabled ? 'opacity-30 cursor-not-allowed text-neutral-600' : 
                                                          isActive ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'}
                                                  `}
                                              >
                                                  <span className="font-bold mb-0.5">{labelMap[tier]}</span>
                                                  <span className="text-[10px] opacity-80">{rpm ? rpm : 'N/A'}</span>
                                              </button>
                                          );
                                      })}
                                  </div>
                                  <div className="mt-2 text-center">
                                      <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                                          Check your limits on Google AI Studio <ExternalLink className="w-3 h-3" />
                                      </a>
                                  </div>
                               </>
                           ) : (
                               /* STANDARD & DYNAMIC RATE LIMIT UI (Google, OpenAI, Anthropic) */
                               <>
                                   <div className="relative flex w-full p-1 bg-neutral-900 border border-neutral-800 rounded-xl select-none">
                                       <div 
                                         className="absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/4)] bg-neutral-700 rounded-lg transition-transform duration-300 ease-out shadow-sm" 
                                         style={{ transform: `translateX(calc(${currentRpmOptionIndex} * 100%))` }} 
                                       />
                                       {currentRpmOptions.map((option, idx) => (
                                           <button 
                                             key={option.label} 
                                             onClick={() => {
                                               if (option.value === 'custom') {
                                                 setIsCustomRPM(true);
                                                 const num = parseInt(customRPMInput, 10);
                                                 if (num && num > 0) {
                                                   setSelectedRPM(num);
                                                   setGlobalRPM(num);
                                                 } else {
                                                   setCustomRPMInput('60');
                                                   setSelectedRPM(60);
                                                   setGlobalRPM(60);
                                                 }
                                               } else {
                                                 setIsCustomRPM(false);
                                                 const num = option.value as number;
                                                 setSelectedRPM(num);
                                                 setGlobalRPM(num);
                                               }
                                             }} 
                                             className={`relative z-10 w-1/4 py-2 text-sm font-medium transition-colors duration-300 rounded-lg text-center ${currentRpmOptionIndex === idx ? 'text-white font-semibold' : 'text-neutral-400 hover:text-white'}`}
                                           >
                                             {option.label}
                                           </button>
                                       ))}
                                   </div>

                                  {isCustomRPM && (
                                    <div className="mt-3 flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-neutral-400 font-medium whitespace-nowrap">Custom RPM:</label>
                                        <input
                                          type="number"
                                          min="1"
                                          step="1"
                                          placeholder="e.g. 60"
                                          value={customRPMInput}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setCustomRPMInput(val);
                                            const num = parseInt(val, 10);
                                            if (num && num > 0) {
                                              setSelectedRPM(num);
                                              setGlobalRPM(num);
                                            }
                                          }}
                                          className="w-full bg-black border border-neutral-800 focus:border-white rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none transition-colors"
                                        />
                                      </div>
                                      {(!parseInt(customRPMInput, 10) || parseInt(customRPMInput, 10) <= 0) && (
                                        <p className="text-[10px] text-red-400 pl-2">RPM must be greater than 0.</p>
                                      )}
                                    </div>
                                  )}

                                  <p className="text-xs text-neutral-500 text-center mt-2">
                                    {isCustomRPM 
                                      ? 'Custom rate limit specified by user.' 
                                      : currentRpmOptions.find(o => o.value === selectedRPM)?.description || 'Rate limit per minute.'}
                                  </p>

                                  <div className="mt-2 text-center">
                                    {activeModelData.provider === 'google' ? (
                                      <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                                          Check your limits on Google AI Studio <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : activeModelData.provider === 'anthropic' ? (
                                      <a href="https://platform.claude.com/docs/en/api/rate-limits" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                                          Check your limits on Anthropic Console <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <a href="https://developers.openai.com/api/docs/guides/rate-limits" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                                          Check your limits on OpenAI Platform <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                               </>
                           )}
                      </div>
                    );
                  })()}

              </div>
           </div>
           
           <div className="order-3 md:col-start-2 md:row-start-2 flex items-center justify-between w-full pt-4 mt-2 md:mt-0 border-t border-neutral-800">
             <YouTubeAuth 
                 onLoginSuccess={handleGoogleLoginSuccess} 
                 onLogout={handleGoogleLogout} 
                 userInfo={googleUser} 
             />
             <Button 
                 onClick={saveSettings} 
                 variant="secondary"
                 className="px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 border border-neutral-700 hover:border-neutral-600 rounded-xl transition-all flex items-center justify-center"
                 disabled={googleApiKeyStatus === 'invalid' || googleApiKeyStatus === 'validating' || openAIApiKeyStatus === 'invalid' || openAIApiKeyStatus === 'validating' || anthropicApiKeyStatus === 'invalid' || anthropicApiKeyStatus === 'validating'}
             >
                 Save Settings
             </Button>
           </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'PRIVACY'} onClose={() => setActiveModal('NONE')} title="Privacy Policy">
         <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
            <p className="text-xs text-neutral-500">Last Updated: November 2025</p>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" /> Data Handling & Storage
              </h3>
              <p>
                <strong>SubStream AI</strong> is a "Client-Side" application. We do not store your API keys, subtitle files, or personal data on our servers.
                All API keys are stored locally in your browser's <code>localStorage</code>.
              </p>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                 <HardDrive className="w-4 h-4 text-blue-400" /> Google Drive Integration
              </h3>
              <p>
                When using Cloud Import, we request <code>drive.readonly</code> permission. This allows us to list your folders and download specific files you select.
              </p>
              <ul className="list-disc list-inside pl-2 mt-1 space-y-1 text-neutral-400">
                  <li><strong>Data Flow:</strong> Google Drive → Local Proxy Server (Your Machine) → Browser Application.</li>
                  <li><strong>No Storage:</strong> We do not store, copy, or analyze your files outside of the immediate translation session.</li>
              </ul>
            </div>

            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Youtube className="w-4 h-4 text-red-500" /> YouTube API Services
              </h3>
              <p>
                This application uses YouTube API Services to provide features such as importing videos from your channel and uploading videos for auto-captioning.
                By using these features, you agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" className="text-white underline">YouTube Terms of Service</a>.
              </p>
              <p>We access the following data only when you explicitly authenticate:</p>
              <ul className="list-disc list-inside pl-2 mt-1 space-y-1 text-neutral-400">
                  <li><strong>Uploads:</strong> To upload videos as "Unlisted" for transcription purposes.</li>
                  <li><strong>Channel List:</strong> To display your videos in the import selector.</li>
              </ul>
              <p>
                Please refer to the <a href="http://www.google.com/policies/privacy" target="_blank" className="text-white underline">Google Privacy Policy</a> for more information on how Google handles your data.
              </p>
            </div>
         </div>
      </Modal>

      <Modal isOpen={activeModal === 'TOS'} onClose={() => setActiveModal('NONE')} title="Terms of Service">
         <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
            <p className="text-xs text-neutral-500">Last Updated: November 2025</p>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">1. Acceptance of Terms</h3>
              <p>By accessing and using SubStream AI, you accept and agree to be bound by the terms and provision of this agreement.</p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">2. Third-Party Integrations</h3>
              <p>
                Our service integrates with YouTube and Google Drive. By using these features, you agree to their respective Terms of Service:
              </p>
              <ul className="list-disc list-inside pl-2 text-neutral-400">
                  <li><a href="https://www.youtube.com/t/terms" target="_blank" className="underline hover:text-white">YouTube Terms of Service</a></li>
                  <li><a href="https://policies.google.com/terms" target="_blank" className="underline hover:text-white">Google Drive Terms of Service</a></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">3. API Usage & Rate Limits</h3>
              <p>
                You are responsible for managing your own API keys (Gemini/OpenAI). SubStream AI implements rate limiting to help prevent errors, but we are not responsible for any costs incurred or account suspensions due to excessive usage.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">4. User Responsibility</h3>
              <p>
                You are solely responsible for the content you process using this tool. You agree not to upload content that violates copyright laws, contains illegal material, or infringes on the rights of others.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">5. Disclaimer</h3>
              <p>
                This software is provided "as is", without warranty of any kind, express or implied. The developers are not liable for any damages or data loss arising from the use of this software.
              </p>
            </div>
         </div>
      </Modal>
      
      <ImportUrlModal 
        isOpen={importModalOpen} 
        onClose={() => setImportModalOpen(false)} 
        type={importType} 
        onImportFile={handleImportFile}
        onImportYouTube={handleImportYouTube}
        googleAccessToken={googleAccessToken}
      />
      
      <CloudImportModal
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        onImportFile={handleImportFile}
      />

    </div>
  );
};

export default AppWrapper;