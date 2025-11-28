import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileText, ArrowRight, Download, RefreshCw, Languages, Zap, AlertCircle, Key, Info, Cpu, CheckCircle2, BookText, Search, XCircle, Loader2, Film, Clapperboard, ChevronDown, Gauge, Youtube, Link as LinkIcon, HardDrive, Instagram, Github, Heart, Sparkles, Shield, ExternalLink } from 'lucide-react';
import { GoogleOAuthProvider, TokenResponse } from '@react-oauth/google';
import { LANGUAGES, SubtitleNode, TranslationStatus, AVAILABLE_MODELS, SUPPORTED_VIDEO_FORMATS, ExtractedSubtitleTrack, VideoProcessingStatus, OPENAI_RPM_OPTIONS, RPMLimit, YouTubeVideoMetadata, AIModel } from './types';
import { parseSRT, stringifySRT, downloadFile } from './utils/srtUtils';
import { processFullSubtitleFile, BATCH_SIZE, validateGoogleApiKey, validateOpenAIApiKey, transcribeAudio, setGlobalRPM } from './services/aiService';
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
  
  // API Key & Model Config State
  const [userGoogleApiKey, setUserGoogleApiKey] = useState<string>('');
  const [tempGoogleApiKey, setTempGoogleApiKey] = useState<string>('');
  const [googleApiKeyStatus, setGoogleApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [userOpenAIApiKey, setUserOpenAIApiKey] = useState<string>('');
  const [tempOpenAIApiKey, setTempOpenAIApiKey] = useState<string>('');
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[1].id); 
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [requestsUsed, setRequestsUsed] = useState<number>(0);
  const [selectedRPM, setSelectedRPM] = useState<RPMLimit>(15);
  const [selectedGeminiTier, setSelectedGeminiTier] = useState<GeminiTier>('free');
  
  // YouTube Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceGoogleKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceOpenAIKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const isYouTubeAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=youtube_auth');
  }, []);

  const isDriveAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=drive_auth');
  }, []);

  // --- MODEL & RATE LIMIT LOGIC ---
  const activeModelData = useMemo(() => {
      return AVAILABLE_MODELS.find(m => m.id === selectedModelId) || AVAILABLE_MODELS[0];
  }, [selectedModelId]);

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
      } else if (activeModelData.provider === 'openai') {
          // Keep current Logic for OpenAI or reset if needed
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

    if (storedGeminiTier) {
        setSelectedGeminiTier(storedGeminiTier as GeminiTier);
    }

    if (storedRPM) {
        const rpm = (storedRPM === 'unlimited' ? 'unlimited' : parseInt(storedRPM, 10)) as RPMLimit;
        setSelectedRPM(rpm);
        setGlobalRPM(rpm);
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

    const savedUser = localStorage.getItem('substream_google_user');
    const savedToken = localStorage.getItem('substream_google_token');
    const savedTimestamp = localStorage.getItem('substream_google_token_timestamp');
    
    let isValidAuth = false;

    if (savedUser && savedToken && savedTimestamp) {
        const tokenAge = Date.now() - parseInt(savedTimestamp, 10);
        if (tokenAge < 3000000) {
            setGoogleUser(JSON.parse(savedUser));
            setGoogleAccessToken(savedToken);
            isValidAuth = true;
        } else {
            console.warn("Google Token Expired. Clearing session.");
            handleGoogleLogout(); 
        }
    }

    if (storedModel && AVAILABLE_MODELS.find(m => m.id === storedModel)) {
        if (storedModel === 'youtube-auto' && !isValidAuth) {
            setSelectedModelId(AVAILABLE_MODELS[1].id);
        } else {
            setSelectedModelId(storedModel);
        }
    }
    
    setIsAuthLoaded(true);

  }, []);

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
    const isAiTranscription = !isYouTubeTranscription && (sourceLang === 'auto' || sourceLang === targetLang);

    const action = isYouTubeTranscription || isAiTranscription ? 'Transcribed' : 'Translated';
    const langName = isYouTubeTranscription ? (LANGUAGES.find(l => l.code === selectedCaptionId)?.name || 'Unknown') : isAiTranscription ? 'Auto' : (LANGUAGES.find(l => l.name === targetLang)?.name || 'English');
    
    return `SubStream_${cleanBase}_${action}_${langName}.${extension}`;
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
    localStorage.setItem('substream_google_token', accessToken);
    localStorage.setItem('substream_google_token_timestamp', Date.now().toString());
    
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then(res => res.json())
    .then(data => {
        setGoogleUser(data);
        localStorage.setItem('substream_google_user', JSON.stringify(data));
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
    localStorage.removeItem('substream_google_token');
    localStorage.removeItem('substream_google_user');
    localStorage.removeItem('substream_google_token_timestamp');
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
      setVideoProcessingStatus(VideoProcessingStatus.LOADING_FFMPEG);
      const ffmpeg = await loadFFmpeg((message) => setVideoProcessingMessage(message));
      ffmpegRef.current = ffmpeg;
      ffmpeg.on('progress', ({ progress }) => {
        setFfmpegProgress(progress * 100);
      });
      
      setVideoProcessingStatus(VideoProcessingStatus.ANALYZING);
      setVideoProcessingMessage('Analyzing video for subtitle tracks...');
      const tracks = await analyzeVideoFile(ffmpeg, videoFile);
      setExtractedTracks(tracks);
      
      setVideoSrc(URL.createObjectURL(videoFile));
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

    const apiKey = activeModelData.provider === 'openai' ? userOpenAIApiKey : userGoogleApiKey;
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
    
    const apiKey = activeModelData.provider === 'openai' ? userOpenAIApiKey : userGoogleApiKey;
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
    
    if (!file || !ffmpegRef.current || status !== TranslationStatus.COMPLETED) return;
    try {
        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.MUXING);
        setVideoProcessingMessage('Packaging dual-track video file (Original + Translated)...');
        
        const finalSrt = stringifySRT(subtitles); // Translated Text
        const originalSrt = stringifySRT(subtitles.map(s => ({...s, text: s.originalText || s.text}))); // Original Text

        const targetLangData = LANGUAGES.find(l => l.name === targetLang);
        const sourceLangData = LANGUAGES.find(l => l.name === sourceLang);
        
        const mkvFileName = fileName.replace('.mp4', '.mkv');
        
        const newVideoBlob = await addSrtToVideo(
            ffmpegRef.current, 
            file, 
            finalSrt, 
            targetLangData?.code || 'eng',
            originalSrt,
            sourceLangData?.code || 'und'
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
  const hasProAccess = userGoogleApiKey || userOpenAIApiKey;

  const filteredGoogleModels = useMemo(() => {
    return AVAILABLE_MODELS.filter(model => model.provider === 'google' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelSearchQuery]);

  const filteredOpenAIModels = useMemo(() => {
    return AVAILABLE_MODELS.filter(model => model.provider === 'openai' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelSearchQuery]);
  
  const youtubeModel = useMemo(() => {
      return AVAILABLE_MODELS.filter(model => model.provider === 'youtube' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelSearchQuery]);

  const showProgressBar = [
    VideoProcessingStatus.EXTRACTING_AUDIO, 
    VideoProcessingStatus.TRANSCRIBING, 
    VideoProcessingStatus.MUXING,
    VideoProcessingStatus.EXTRACTING_SUBTITLES,
    VideoProcessingStatus.UPLOADING_TO_YOUTUBE,
    VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS
  ].includes(videoProcessingStatus);
  
  const selectedOpenAIRpmIndex = useMemo(() => OPENAI_RPM_OPTIONS.findIndex(o => o.value === selectedRPM), [selectedRPM]);

  const isTranslationInProgress = status === TranslationStatus.TRANSLATING;
  const isTranslationComplete = status === TranslationStatus.COMPLETED;
  const isConfigureStepActive = !!file && !isTranslationInProgress && !isTranslationComplete;
  const isYouTubeWorkflow = fileType === 'youtube';

  const sourceLangFont = useMemo(() => LANGUAGES.find(l => l.name === sourceLang)?.font, [sourceLang]);
  const targetLangFont = useMemo(() => LANGUAGES.find(l => l.name === targetLang)?.font, [targetLang]);

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
    return <Documentation onBack={() => setCurrentPage('HOME')} />;
  }

  return (
    <div className="min-h-screen bg-black text-neutral-200 font-sans selection:bg-white selection:text-black flex flex-col">
      
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
            <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-xl rounded-lg font-display">S</div>
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

      <main className="relative z-10 max-w-5xl mx-auto px-6 w-full flex-grow flex flex-col">
        <div className="flex-grow flex flex-col justify-start pt-16 md:pt-30">
            <section className="mb-14 text-center">
                <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tighter text-white mb-6 animate-slide-up">
                    Bridge the Language<br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-neutral-700">Gap Instantly.</span>
                </h1>
                <p className="text-base md:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{animationDelay: '0.1s'}}>
                    Transform your subtitles with context-aware AI. 
                    Powered by {activeModelData.provider === 'google' ? "Google's" : "OpenAI's"} {activeModelData.name} for nuance and accuracy across {LANGUAGES.length}+ languages.
                </p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch pb-12">
              <div className="lg:col-span-3">
                 <div className="lg:sticky lg:top-32 h-full">
                    <div className="h-full flex flex-row justify-around p-4 rounded-2xl border border-neutral-900 bg-neutral-950/50 backdrop-blur-sm lg:flex-col lg:p-6 lg:justify-between">
                        <StepIndicator number={1} title="Upload" isActive={status === TranslationStatus.IDLE && !file} isCompleted={!!file} />
                        <StepIndicator number={2} title="Configure" isActive={isConfigureStepActive} isCompleted={isTranslationInProgress || isTranslationComplete} />
                        <StepIndicator number={3} title="Translate" isActive={isTranslationInProgress} isCompleted={isTranslationComplete} />
                        <StepIndicator number={4} title="Download" isActive={isTranslationComplete} isCompleted={false} />
                    </div>
                 </div>
              </div>

              <div className="lg:col-span-9 space-y-8">
                {(fileType === 'video' || fileType === 'youtube') && (
                    <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800 relative group">
                        {fileType === 'youtube' && youtubeMeta ? (
                            <>
                                <img src={youtubeMeta.thumbnailUrl} alt={youtubeMeta.title} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <div className="px-4 py-2 bg-black/70 rounded-xl backdrop-blur border border-white/10 text-sm text-white font-medium flex items-center gap-2">
                                        <Youtube className="w-4 h-4 text-red-500" /> YouTube Import
                                    </div>
                                </div>
                            </>
                        ) : videoSrc ? (
                            <VideoPlayer videoSrc={videoSrc} srtContent={stringifySRT(subtitles)} isYouTube={false} />
                        ) : null}
                    </div>
                )}

                <div className="group relative rounded-3xl border border-neutral-800 bg-neutral-900/20 p-6 hover:bg-neutral-900/30 transition-all duration-300">
                   {!file ? (
                     <div className="flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px]"
                       onDragOver={(e) => e.preventDefault()}
                       onDrop={handleDrop}
                     >
                        <input type="file" ref={fileInputRef} className="hidden" accept={`.srt, ${SUPPORTED_VIDEO_FORMATS.join(',')}`} onChange={handleFileChange} />
                        <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="text-white w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2" onClick={() => fileInputRef.current?.click()}>Drop your SRT or Video file here</h2>
                        <p className="text-neutral-500 mb-8" onClick={() => fileInputRef.current?.click()}>or click to browse local files</p>
                        
                        <div className="flex gap-4 z-20">
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
                     </div>
                   ) : (videoProcessingStatus !== VideoProcessingStatus.IDLE && videoProcessingStatus !== VideoProcessingStatus.DONE && videoProcessingStatus !== VideoProcessingStatus.ERROR) ? (
                     <div className="flex flex-col items-center justify-center text-center min-h-[200px] space-y-4">
                        <Loader2 className="w-12 h-12 text-white animate-spin" />
                        <div>
                          <h2 className="text-xl font-bold text-white mb-1 uppercase tracking-widest">{videoProcessingStatus.replace(/_/g, ' ')}</h2>
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
                               <div className="w-24 aspect-video rounded-xl bg-neutral-800 text-black flex items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
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
          <section ref={resultsRef} className="mt-24 border-t border-neutral-900 pt-12 animate-slide-up pb-24">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">
                    {isYouTubeWorkflow ? 'Transcription Preview' : 'Live Preview'}
                </h2>
                <p className="text-neutral-500">
                    {isYouTubeWorkflow ? 'Review the generated transcription below.' : 'Comparing original vs translated output.'}
                </p>
              </div>
              <div className="flex items-center gap-4 relative">
                  {(fileType === 'video' || fileType === 'youtube') && (
                      <div className="relative" ref={resolutionMenuRef}>
                        <Button 
                            variant="secondary" 
                            onClick={() => setShowResolutionMenu(!showResolutionMenu)} 
                            progress={downloadProgress}
                            statusText={downloadStatusText}
                            completed={isDownloadComplete}
                            disabled={downloadProgress !== undefined || isTranslationInProgress}
                            icon={<Film className="w-4 h-4" />}
                            className=""
                        >
                            Download Video
                        </Button>
                        {showResolutionMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden z-20 animate-fade-in">
                                <div>
                                    {isYouTubeWorkflow && youtubeMeta?.availableResolutions && youtubeMeta.availableResolutions.length > 0 ? (
                                        youtubeMeta.availableResolutions.map((res) => (
                                            <button
                                                key={res}
                                                onClick={() => handleDownloadVideo(res)}
                                                className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between transition-colors"
                                            >
                                                <span>{res}p</span>
                                                <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-500">MP4</span>
                                            </button>
                                        ))
                                    ) : (
                                        <button
                                            onClick={() => handleDownloadVideo()}
                                            className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between transition-colors"
                                        >
                                            <span>Best Quality</span>
                                            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-500">{isYouTubeWorkflow ? 'MP4' : 'MKV'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                      </div>
                  )}
                  <Button variant="primary" onClick={handleDownloadSrt} disabled={isTranslationInProgress} icon={<Download className="w-4 h-4"/>}>Download SRT</Button>
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-800 bg-black/50 backdrop-blur overflow-hidden min-h-[400px]">
              <div className={`grid grid-cols-[100px_1fr] border-b border-neutral-800 bg-neutral-900/50 p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky top-0 z-10`}>
                <div className="pl-2">Timestamp</div>
                <div className={`grid ${isYouTubeWorkflow ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
                   <span>Original ({isYouTubeWorkflow ? LANGUAGES.find(l=>l.code === selectedCaptionId)?.name || 'Selected Language' : sourceLang})</span>
                   {!isYouTubeWorkflow && <span className="text-white">Translated ({targetLang})</span>}
                </div>
              </div>
              <div className="max-h-[800px] overflow-y-auto">
                {subtitles.map((sub) => ( <SubtitleCard key={sub.id} subtitle={sub} isActive={sub.text !== sub.originalText} isSingleColumn={isYouTubeWorkflow} sourceFont={sourceLangFont} targetFont={targetLangFont} /> ))}
              </div>
            </div>
            <div className="mt-8 flex justify-center">
                <Button variant="secondary" onClick={resetState} icon={<RefreshCw className="w-4 h-4" />}>
                    Process Another File
                </Button>
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-neutral-900 bg-black/80 backdrop-blur-xl mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-neutral-800 text-white flex items-center justify-center font-bold text-sm rounded font-display">S</div>
                    <span className="font-display font-bold tracking-tight text-neutral-400">SubStream AI</span>
                </div>
                <div className="text-xs text-neutral-600">
                    &copy; {new Date().getFullYear()} SubStream AI. Open Source.
                </div>
                <div className="flex items-center gap-6 text-sm text-neutral-500">
                    <button onClick={() => setActiveModal('TOS')} className="hover:text-white transition-colors">Terms</button>
                    <button onClick={() => setActiveModal('PRIVACY')} className="hover:text-white transition-colors">Privacy</button>
                    <a href="https://github.com/imrovoid/SubStream-AI" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><Github className="w-5 h-5" /></a>
                </div>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xs text-neutral-500 w-full">
                <span>Developed by <a href="https://rovoid.ir" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white transition-colors font-medium">ROVOID</a></span>
                <span className="hidden md:block w-1 h-1 rounded-full bg-neutral-800"></span>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/50 border border-neutral-800 text-xs hover:border-neutral-600 hover:bg-neutral-800 transition-all group">
                    <Heart className="w-3 h-3 text-pink-500 group-hover:scale-110 transition-transform" /> Support Me
                </button>
            </div>
        </div>
      </footer>

      {/* ... Modals ... */}
      <Modal isOpen={activeModal === 'CONFIG'} onClose={() => setActiveModal('NONE')} title="AI Configuration">
        {/* ... (Existing modal content remains unchanged) ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
           <div className="flex flex-col gap-4">
              <label className="block text-sm font-bold text-white flex items-center gap-2"><Cpu className="w-4 h-4" /> Select AI Model</label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 w-5 h-5 text-neutral-500 pointer-events-none" />
                <input type="text" placeholder="Search models..." value={modelSearchQuery} onChange={(e) => setModelSearchQuery(e.target.value)} className="w-full bg-black/50 border border-neutral-700 rounded-xl py-2 pl-10 pr-4 text-white focus:border-white focus:outline-none transition-colors" />
              </div>
              <div className="space-y-4 pr-2 overflow-y-auto max-h-[300px] md:max-h-[450px] custom-scrollbar">
                
                {youtubeModel.length > 0 && (
                  <details open className="group/youtube">
                    <summary className="list-none flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors">
                      <span className="font-bold text-neutral-300">YouTube Services</span>
                      <ChevronDown className="w-5 h-5 text-neutral-500 transition-transform duration-200 group-open/youtube:rotate-180" />
                    </summary>
                    <div className="space-y-3 pt-2 pl-2 border-l border-neutral-800 ml-2">
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
                              <div className="flex gap-2 mt-3">
                                {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                              </div>
                            </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                {filteredGoogleModels.length > 0 && (
                  <details open className="group/google">
                    <summary className="list-none flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors">
                      <span className="font-bold text-neutral-300">Google Gemini Models</span>
                      <ChevronDown className="w-5 h-5 text-neutral-500 transition-transform duration-200 group-open/google:rotate-180" />
                    </summary>
                    <div className="space-y-3 pt-2 pl-2 border-l border-neutral-800 ml-2">
                      {filteredGoogleModels.map((model) => (
                        <div key={model.id} onClick={() => setSelectedModelId(model.id)} className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-bold text-white mb-1">{model.name}</h4>
                              <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                            </div>
                            {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                          </div>
                          <div className="flex gap-2 mt-3">
                            {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {filteredOpenAIModels.length > 0 && (
                   <details open className="group/openai">
                    <summary className="list-none flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors">
                      <span className="font-bold text-neutral-300">OpenAI Models</span>
                      <ChevronDown className="w-5 h-5 text-neutral-500 transition-transform duration-200 group-open/openai:rotate-180" />
                    </summary>
                    <div className="space-y-3 pt-2 pl-2 border-l border-neutral-800 ml-2">
                      {filteredOpenAIModels.map((model) => (
                        <div key={model.id} onClick={() => setSelectedModelId(model.id)} className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-bold text-white mb-1">{model.name}</h4>
                              <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                            </div>
                            {selectedModelId === model.id && ( <CheckCircle2 className="w-5 h-5 text-white shrink-0" /> )}
                          </div>
                          <div className="flex gap-2 mt-3">
                            {model.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span> ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
           </div>
           
           <div className="space-y-6 flex flex-col h-full">
              <div className="space-y-6 flex-grow">
                  <div className="space-y-2">
                     <div className="flex items-center justify-between">
                        <label className="block text-sm font-bold text-white flex items-center gap-2"><Key className="w-4 h-4" /> Google AI API Key</label>
                        {userGoogleApiKey && ( <button onClick={clearGoogleApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button> )}
                     </div>
                    <div className="relative">
                       <input type="password" placeholder="AIzaSy..." value={tempGoogleApiKey} onChange={(e) => setTempGoogleApiKey(e.target.value)} className={`w-full bg-black border rounded-xl px-4 py-3 text-white focus:outline-none transition-colors ${googleApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''} ${googleApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${googleApiKeyStatus === 'valid' ? 'border-green-700/50 focus:border-green-500 focus:ring-1 focus:ring-green-500/50' : ''} ${googleApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`} />
                       <div className="absolute right-3 top-3.5">
                          {googleApiKeyStatus === 'validating' && <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />}
                          {googleApiKeyStatus === 'valid' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                          {googleApiKeyStatus === 'invalid' && <XCircle className="w-5 h-5 text-red-500" />}
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
                       <input type="password" placeholder="sk-..." value={tempOpenAIApiKey} onChange={(e) => setTempOpenAIApiKey(e.target.value)} className={`w-full bg-black border rounded-xl px-4 py-3 text-white focus:outline-none transition-colors ${openAIApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''} ${openAIApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${openAIApiKeyStatus === 'valid' ? 'border-green-700/50 focus:border-green-500 focus:ring-1 focus:ring-green-500/50' : ''} ${openAIApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`} />
                       <div className="absolute right-3 top-3.5">
                          {openAIApiKeyStatus === 'validating' && <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />}
                          {openAIApiKeyStatus === 'valid' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                          {openAIApiKeyStatus === 'invalid' && <XCircle className="w-5 h-5 text-red-500" />}
                       </div>
                    </div>
                    <p className="text-xs text-neutral-500">For GPT models. Stored locally in your browser.</p>
                  </div>
    
                  {activeModelData.provider !== 'youtube' && (
                    <div className="space-y-2">
                         <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-bold text-white flex items-center gap-2"><Gauge className="w-4 h-4" /> Rate Limit</label>
                            <p className="font-medium text-white text-sm">{selectedRPM === 'unlimited' ? 'Unlimited' : `${selectedRPM} RPM`}</p>
                         </div>
                        
                         {/* GOOGLE DYNAMIC RATE LIMIT UI */}
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
                                    <a href="https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                                        Check your limits on Google AI Studio <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                             </>
                         ) : (
                             /* OPENAI / STATIC RATE LIMIT UI */
                             <>
                                <div className="relative flex w-full p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
                                    <div className="absolute top-1 bottom-1 left-1 w-1/4 bg-neutral-700 rounded-lg transition-all duration-300 ease-out" style={{ transform: `translateX(${selectedOpenAIRpmIndex * 100}%)` }} />
                                    {OPENAI_RPM_OPTIONS.map((option) => (
                                        <button key={option.value} onClick={() => setSelectedRPM(option.value)} className={`relative z-10 w-1/4 py-2 text-sm font-medium transition-colors duration-300 rounded-lg ${selectedRPM === option.value ? 'text-white' : 'text-neutral-400 hover:text-white'}`}>{option.label}</button>
                                    ))}
                                </div>
                                <p className="text-xs text-neutral-500 text-center mt-2">{OPENAI_RPM_OPTIONS.find(o => o.value === selectedRPM)?.description}</p>
                             </>
                         )}
                    </div>
                  )}

              </div>
              
              <div className="flex items-center justify-between w-full pt-6 mt-8 border-t border-neutral-800">
                <YouTubeAuth 
                    onLoginSuccess={handleGoogleLoginSuccess} 
                    onLogout={handleGoogleLogout} 
                    userInfo={googleUser} 
                />
                <Button onClick={saveSettings} disabled={googleApiKeyStatus === 'invalid' || googleApiKeyStatus === 'validating' || openAIApiKeyStatus === 'invalid' || openAIApiKeyStatus === 'validating'}>Save Settings</Button>
              </div>
           </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'PRIVACY'} onClose={() => setActiveModal('NONE')} title="Privacy Policy">
        {/* ... (Existing modal content remains unchanged) ... */}
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
            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                 <LinkIcon className="w-4 h-4 text-blue-400" /> Proxy Usage
              </h3>
              <p>
                When importing files from external URLs, data is streamed through a temporary local proxy to bypass CORS restrictions. The data is not persisted on the server.
              </p>
            </div>
         </div>
      </Modal>

      <Modal isOpen={activeModal === 'TOS'} onClose={() => setActiveModal('NONE')} title="Terms of Service">
        {/* ... (Existing modal content remains unchanged) ... */}
         <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
            <p className="text-xs text-neutral-500">Last Updated: November 2025</p>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">1. Acceptance of Terms</h3>
              <p>By accessing and using SubStream AI, you accept and agree to be bound by the terms and provision of this agreement.</p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">2. YouTube Integration</h3>
              <p>
                Our service integrates with YouTube. By using the YouTube features (Import, Auto-Caption), you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" className="text-white underline">YouTube Terms of Service</a>.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">3. User Responsibility</h3>
              <p>
                You are solely responsible for the content you process using this tool. You agree not to upload content that violates copyright laws, contains illegal material, or infringes on the rights of others.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-bold text-lg">4. Disclaimer</h3>
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