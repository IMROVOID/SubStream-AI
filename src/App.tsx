import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileText, ArrowRight, Download, RefreshCw, Languages, Zap, AlertCircle, Key, Info, Cpu, CheckCircle2, BookText, Search, XCircle, Loader2, Film, Bot, Clapperboard, ChevronDown, Gauge, Youtube, Link as LinkIcon, HardDrive, Instagram, Github, Heart } from 'lucide-react';
import { GoogleOAuthProvider, TokenResponse } from '@react-oauth/google';
import { LANGUAGES, SubtitleNode, TranslationStatus, AVAILABLE_MODELS, SUPPORTED_VIDEO_FORMATS, ExtractedSubtitleTrack, VideoProcessingStatus, RPM_OPTIONS, RPMLimit, YouTubeVideoMetadata } from './types';
import { parseSRT, stringifySRT, downloadFile } from './utils/srtUtils';
import { processFullSubtitleFile, BATCH_SIZE, validateGoogleApiKey, validateOpenAIApiKey, transcribeAudio, setGlobalRPM } from './services/aiService';
import { loadFFmpeg, analyzeVideoFile, extractSrt, extractAudio, addSrtToVideo } from './services/ffmpegService';
import { uploadVideoToYouTube, checkYouTubeCaptionStatus, downloadYouTubeCaptionTrackOAuth, downloadCaptionTrack, downloadYouTubeVideoWithSubs } from './services/youtubeService';
import { Button } from './components/Button';
import { SubtitleCard } from './components/SubtitleCard';
import { StepIndicator } from './components/StepIndicator';
import { Modal } from './components/Modal';
import { Documentation } from './components/Documentation';
import { VideoPlayer } from './components/VideoPlayer';
import { TrackSelector } from './components/TrackSelector';
import { YouTubeAuth } from './components/YouTubeAuth';
import { ImportUrlModal } from './components/ImportUrlModal';
import { FFmpeg } from '@ffmpeg/ffmpeg';

type Page = 'HOME' | 'DOCS';
type ModalType = 'NONE' | 'PRIVACY' | 'TOS' | 'CONFIG';
type ApiKeyStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type GoogleUser = { name: string; email: string; picture: string };

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


const App = () => {
  // Navigation & Modal State
  const [currentPage, setCurrentPage] = useState<Page>('HOME');
  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  
  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'URL' | 'YOUTUBE' | 'GDRIVE' | 'SOCIAL' | null>(null);

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

  // Language & Translation Settings
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('es');
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>('');

  // Video-specific State
  const [videoProcessingStatus, setVideoProcessingStatus] = useState<VideoProcessingStatus>(VideoProcessingStatus.IDLE);
  const [videoProcessingMessage, setVideoProcessingMessage] = useState('');
  const [ffmpegProgress, setFfmpegProgress] = useState<number>(0);
  const [extractedTracks, setExtractedTracks] = useState<ExtractedSubtitleTrack[]>([]);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [youtubeMeta, setYoutubeMeta] = useState<YouTubeVideoMetadata | null>(null);
  
  // API Key & Model Config State
  const [userGoogleApiKey, setUserGoogleApiKey] = useState<string>('');
  const [tempGoogleApiKey, setTempGoogleApiKey] = useState<string>('');
  const [googleApiKeyStatus, setGoogleApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [userOpenAIApiKey, setUserOpenAIApiKey] = useState<string>('');
  const [tempOpenAIApiKey, setTempOpenAIApiKey] = useState<string>('');
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<ApiKeyStatus>('idle');
  
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[1].id); // Default to Gemini 3 Pro
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [requestsUsed, setRequestsUsed] = useState<number>(0);
  const [selectedRPM, setSelectedRPM] = useState<RPMLimit>(15);
  
  // YouTube Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceGoogleKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceOpenAIKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // --- 1. DETECT IF THIS IS THE POPUP (Auth Callback) ---
  const isAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=youtube_auth');
  }, []);

  // --- 2. POPUP LOGIC: Broadcast & Close ---
  useEffect(() => {
    if (isAuthCallback) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (accessToken) {
            const channel = new BroadcastChannel('substream_auth_channel');
            channel.postMessage({ token: accessToken });
            channel.close();
            window.close();
            
            document.body.innerHTML = `
                <div style="background:black; color:white; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
                    <div style="font-size:24px; font-weight:bold; margin-bottom:10px;">Authentication Successful</div>
                    <div>You can now close this window.</div>
                </div>
            `;
        }
    }
  }, [isAuthCallback]);

  // --- 3. MAIN WINDOW LOGIC: Listen for Token ---
  useEffect(() => {
    const channel = new BroadcastChannel('substream_auth_channel');
    channel.onmessage = (event) => {
        if (event.data && event.data.token) {
            handleGoogleLoginSuccess({ access_token: event.data.token } as TokenResponse);
        }
    };
    return () => channel.close();
  }, []);

  // --- LOAD PERSISTED SETTINGS ---
  useEffect(() => {
    const storedGoogleKey = localStorage.getItem('substream_google_api_key');
    const storedOpenAIKey = localStorage.getItem('substream_openai_api_key');
    const storedModel = localStorage.getItem('substream_model_id');
    const storedRPM = localStorage.getItem('substream_rpm');
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

    if (storedModel && AVAILABLE_MODELS.find(m => m.id === storedModel)) {
      setSelectedModelId(storedModel);
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
    if (savedUser && savedToken) {
        setGoogleUser(JSON.parse(savedUser));
        setGoogleAccessToken(savedToken);
    }

  }, []);

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


  // --- Helper Functions ---

  const updateUsage = (newRequests: number) => {
    const total = requestsUsed + newRequests;
    setRequestsUsed(total);
    localStorage.setItem('substream_daily_usage', total.toString());
    localStorage.setItem('substream_usage_date', new Date().toDateString());
  };

  // Standardized Filename Generator
  const getOutputFilename = (extension: string) => {
    let baseName = 'video';
    
    if (file) {
        baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    } else if (youtubeMeta?.title) {
        baseName = youtubeMeta.title;
    }

    // Sanitize
    const cleanBase = baseName.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
    
    // Determine Action
    // If using YouTube Auto model (uploading), we are "transcribing"
    // If using AI model and source==auto or source==target, we are "transcribing"
    // Otherwise "translating"
    const activeModel = AVAILABLE_MODELS.find(m => m.id === selectedModelId);
    const isTranscribing = activeModel?.provider === 'youtube' || sourceLang === 'auto' || sourceLang === targetLang;
    const action = isTranscribing ? 'Transcribed' : 'Translated';
    
    // Language Suffix
    const langName = isTranscribing ? 'Auto' : (LANGUAGES.find(l => l.name === targetLang)?.name || 'English');
    
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
    
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then(res => res.json())
    .then(data => {
        setGoogleUser(data);
        localStorage.setItem('substream_google_user', JSON.stringify(data));
    })
    .catch(error => {
        console.error("Failed to fetch user info", error);
        setGoogleAccessToken(null);
        setGoogleUser(null);
        localStorage.removeItem('substream_google_token');
        localStorage.removeItem('substream_google_user');
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
    setGlobalRPM(selectedRPM);
    setActiveModal('NONE');
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

  const handleImportYouTube = (meta: YouTubeVideoMetadata) => {
      setFile(null);
      setSubtitles([]);
      setStatus(TranslationStatus.IDLE);
      setProgress(0);
      setError(null);
      setVideoProcessingStatus(VideoProcessingStatus.IDLE);
      setVideoProcessingMessage('');
      setFfmpegProgress(0);
      setExtractedTracks([]);
      setSelectedCaptionId('');
      setDownloadProgress(undefined);
      setDownloadStatusText('');
      setIsDownloadComplete(false);
      
      if (videoSrc && videoSrc.startsWith('blob:')) {
           URL.revokeObjectURL(videoSrc);
      }

      setFileType('youtube');
      setYoutubeMeta(meta);
      setVideoSrc(`https://www.youtube.com/embed/${meta.id}`);
      const mockFile = new File([""], meta.title, { type: 'video/youtube' });
      setFile(mockFile);
  };

  const handleYouTubeDownload = async () => {
      if (!selectedCaptionId || !youtubeMeta?.videoUrl) {
          setError("Please select a caption track first.");
          return;
      }
      
      setError(null);
      setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
      setVideoProcessingMessage('Downloading caption track...');
      
      try {
          const captionText = await downloadCaptionTrack(youtubeMeta.videoUrl, selectedCaptionId);
          const parsed = parseSRT(captionText);
          if (parsed.length === 0) throw new Error("Parsed subtitle file is empty.");
          setSubtitles(parsed);
          setStatus(TranslationStatus.COMPLETED); 
          setVideoProcessingStatus(VideoProcessingStatus.DONE);
      } catch (e: any) {
          if (e.message.includes("Stale data")) {
              setError(e.message);
          } else {
              setError("Failed to download captions: " + e.message);
          }
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
    } catch(e: any) {
        setError(`Failed to extract subtitle track: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const handleGenerateSubtitles = async () => {
    const activeModel = AVAILABLE_MODELS.find(m => m.id === selectedModelId)!;
    
    if (fileType === 'youtube') {
         setError("AI Audio transcription for YouTube links is currently limited. Please select a caption track.");
         return;
    }

    // --- YOUTUBE TRANSCRIPTION LOGIC ---
    if (activeModel.provider === 'youtube') {
        if (!googleAccessToken || !googleUser || !file) {
            if (!file) {
                setError("No file loaded to upload.");
            } else {
                setActiveModal('CONFIG');
                setError("Please authenticate with YouTube to use Auto-Caption.");
            }
            return;
        }

        try {
            setError(null);
            
            // 1. Upload
            setVideoProcessingStatus(VideoProcessingStatus.UPLOADING_TO_YOUTUBE);
            setVideoProcessingMessage('Uploading video to YouTube (Unlisted)...');
            setFfmpegProgress(0); 
            
            // Use standardized title for upload
            const uploadTitle = getOutputFilename('').replace('SubStream_', '').replace(/\.$/, '').replace(/_/g, ' '); // "MyMovie Transcribed Auto"
            
            const videoId = await uploadVideoToYouTube(googleAccessToken, file, uploadTitle);
            
            // 2. Poll for Captions
            setVideoProcessingStatus(VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS);
            const captionId = await checkYouTubeCaptionStatus(
                googleAccessToken, 
                videoId, 
                (msg) => setVideoProcessingMessage(msg)
            );
            
            // 3. Download Caption
            setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_SUBTITLES);
            setVideoProcessingMessage('Downloading generated captions...');
            const captionText = await downloadYouTubeCaptionTrackOAuth(googleAccessToken, captionId);
            
            // 4. Parse
            const parsed = parseSRT(captionText);
            if (parsed.length === 0) throw new Error("Downloaded caption file is empty.");
            
            setSubtitles(parsed);
            setVideoProcessingStatus(VideoProcessingStatus.DONE);

        } catch (e: any) {
            console.error("YouTube Auto-Caption Error:", e);
            setError(`YouTube Auto-Caption failed: ${e.message}`);
            setVideoProcessingStatus(VideoProcessingStatus.ERROR);
        }
        return;
    }

    // --- AI MODEL TRANSCRIPTION LOGIC ---
    const apiKey = activeModel.provider === 'openai' ? userOpenAIApiKey : userGoogleApiKey;
    const hasDefaultKey = activeModel.provider === 'google' ? !!process.env.GEMINI_API_KEY : false;

    if (!ffmpegRef.current || (!apiKey && !hasDefaultKey)) {
        setActiveModal('CONFIG');
        setError(`Please provide an API Key for ${activeModel.provider} to generate subtitles.`);
        setVideoProcessingStatus(VideoProcessingStatus.IDLE);
        return;
    }
    const keyToUse = apiKey || (hasDefaultKey ? process.env.GEMINI_API_KEY as string : '');
    if (!keyToUse) return;

    try {
        setFfmpegProgress(0);
        setVideoProcessingStatus(VideoProcessingStatus.EXTRACTING_AUDIO);
        setVideoProcessingMessage('Extracting audio from video...');
        const audioBlob = await extractAudio(ffmpegRef.current);

        setVideoProcessingStatus(VideoProcessingStatus.TRANSCRIBING);
        setVideoProcessingMessage(`Generating subtitles with ${activeModel.name}, this may take a moment...`);
        const srtContent = await transcribeAudio(audioBlob, sourceLang, keyToUse, activeModel);

        const parsed = parseSRT(srtContent);
        setSubtitles(parsed);
        setVideoProcessingStatus(VideoProcessingStatus.DONE);
    } catch(e: any) {
        setError(`Failed to generate subtitles: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const handleGenerateWithYouTube = async () => {
      // Legacy - Unused
  };
  
  const handleTranslate = async () => {
    if (subtitles.length === 0) return;
    
    const activeModel = AVAILABLE_MODELS.find(m => m.id === selectedModelId)!;
    
    if (activeModel.provider === 'youtube') {
        setError("YouTube Auto-Caption can only be used for generating subtitles from video, not for translating text. Please select a Gemini or OpenAI model.");
        return;
    }

    const apiKey = activeModel.provider === 'openai' ? userOpenAIApiKey : userGoogleApiKey;
    const hasDefaultKey = activeModel.provider === 'google' ? !!process.env.GEMINI_API_KEY : false;

    if (!apiKey && !hasDefaultKey) {
      setActiveModal('CONFIG');
      setError(`Please Provide an API Key for ${activeModel.provider} to continue.`);
      return;
    }
    const keyToUse = apiKey || (hasDefaultKey ? process.env.GEMINI_API_KEY as string : '');

    setStatus(TranslationStatus.TRANSLATING);
    setProgress(0);
    setError(null);

    try {
      const result = await processFullSubtitleFile(
        subtitles,
        sourceLang,
        targetLang,
        keyToUse,
        activeModel,
        (count) => setProgress(Math.round((count / subtitles.length) * 100)),
        (updatedSubtitles) => setSubtitles(updatedSubtitles)
      );
      
      setSubtitles(result);
      updateUsage(estimatedRequests);
      setStatus(TranslationStatus.COMPLETED);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An error occurred during translation. Please try again.");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleDownloadSrt = () => {
    if (subtitles.length === 0) return;
    const content = stringifySRT(subtitles);
    // Use new filename generator
    const filename = getOutputFilename('srt');
    downloadFile(filename, content);
  };

  const handleDownloadVideo = async () => {
    // Calculate filename once
    const fileName = getOutputFilename('mp4');

    if (fileType === 'youtube') {
        if (!selectedCaptionId || !youtubeMeta?.videoUrl) return;
        
        setError(null);
        setDownloadProgress(0); 
        setDownloadStatusText('Initializing...');
        setIsDownloadComplete(false);

        // Progress Simulation
        progressInterval.current = setInterval(() => {
            setDownloadProgress(prev => {
                if (prev === undefined) return 0;
                if (prev < 30) setDownloadStatusText('Fetching stream...');
                else if (prev < 60) setDownloadStatusText('Embedding subs...');
                else if (prev < 90) setDownloadStatusText('Finalizing...');
                if (prev >= 90) return 90;
                return prev + Math.random() * 4;
            });
        }, 600);

        try {
             await downloadYouTubeVideoWithSubs(youtubeMeta.videoUrl, selectedCaptionId, fileName);
             
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
        setVideoProcessingMessage('Packaging your new video file... This will not re-encode the video.');
        const finalSrt = stringifySRT(subtitles);
        const targetLangData = LANGUAGES.find(l => l.name === targetLang);
        
        // Ensure mkv extension for ffmpeg output
        const mkvFileName = fileName.replace('.mp4', '.mkv');
        const newVideoBlob = await addSrtToVideo(ffmpegRef.current, file, finalSrt, targetLangData?.code || 'eng');
        
        downloadFile(mkvFileName, newVideoBlob);
        setVideoProcessingStatus(VideoProcessingStatus.DONE);
    } catch(e: any) {
        setError(`Failed to package video file: ${e.message}`);
        setVideoProcessingStatus(VideoProcessingStatus.ERROR);
    }
  };

  const estimatedRequests = subtitles.length > 0 ? Math.ceil(subtitles.length / BATCH_SIZE) : 0;
  const remainingQuota = Math.max(0, ESTIMATED_DAILY_QUOTA - requestsUsed);
  const activeModelData = AVAILABLE_MODELS.find(m => m.id === selectedModelId) || AVAILABLE_MODELS[0];
  const hasProAccess = userGoogleApiKey || userOpenAIApiKey;

  const filteredGoogleModels = useMemo(() => {
    return AVAILABLE_MODELS.filter(model => model.provider === 'google' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelSearchQuery]);

  const filteredOpenAIModels = useMemo(() => {
    return AVAILABLE_MODELS.filter(model => model.provider === 'openai' && (model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())));
  }, [modelSearchQuery]);
  
  const youtubeModel = useMemo(() => {
      return AVAILABLE_MODELS.filter(model => model.provider === 'youtube');
  }, []);

  const showProgressBar = [
    VideoProcessingStatus.EXTRACTING_AUDIO, 
    VideoProcessingStatus.TRANSCRIBING, 
    VideoProcessingStatus.MUXING,
    VideoProcessingStatus.EXTRACTING_SUBTITLES,
    VideoProcessingStatus.UPLOADING_TO_YOUTUBE,
    VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS
  ].includes(videoProcessingStatus);
  
  const selectedRpmIndex = useMemo(() => RPM_OPTIONS.findIndex(o => o.value === selectedRPM), [selectedRPM]);

  if (isAuthCallback) {
      return null; 
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

      <nav className="relative z-20 border-b border-neutral-900 bg-black/80 backdrop-blur-xl sticky top-0 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-xl rounded-lg font-display">S</div>
            <span className="font-display font-bold text-lg tracking-tight">SubStream <span className="text-neutral-600 font-sans font-normal text-sm ml-2">AI</span></span>
          </div>
          <div className="flex items-center gap-2 md:gap-6 text-sm font-medium text-neutral-400">
             <button onClick={() => setCurrentPage('DOCS')} className="hidden md:block hover:text-white transition-colors focus:outline-none">Documentation</button>
             <button onClick={() => setCurrentPage('DOCS')} className="p-2 rounded-full hover:bg-neutral-800 transition-colors group md:hidden" aria-label="Documentation"><BookText className="w-5 h-5 text-neutral-400 group-hover:text-white" /></button>
             <button onClick={() => setActiveModal('CONFIG')} className={`flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-xl border transition-all group ${hasProAccess ? 'bg-neutral-900/50 border-neutral-800 hover:border-white/30' : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-600'}`}>
                <div className="text-xs text-right">
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
                        <StepIndicator number={2} title="Configure" isActive={!!file && (subtitles.length > 0 || fileType === 'youtube') && status !== TranslationStatus.TRANSLATING && status !== TranslationStatus.COMPLETED} isCompleted={status === TranslationStatus.TRANSLATING || status === TranslationStatus.COMPLETED} />
                        <StepIndicator number={3} title="Translate" isActive={status === TranslationStatus.TRANSLATING} isCompleted={status === TranslationStatus.COMPLETED} />
                        <StepIndicator number={4} title="Download" isActive={status === TranslationStatus.COMPLETED} isCompleted={false} />
                    </div>
                 </div>
              </div>

              <div className="lg:col-span-9 space-y-8">
                {/* REPLACED VideoPlayer with Thumbnail for YouTube */}
                {(fileType === 'video' || fileType === 'youtube') && videoSrc && (
                    fileType === 'youtube' && youtubeMeta ? (
                        <div className="w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800 relative group">
                            <img src={youtubeMeta.thumbnailUrl} alt={youtubeMeta.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="px-4 py-2 bg-black/70 rounded-xl backdrop-blur border border-white/10 text-sm text-white font-medium flex items-center gap-2">
                                    <Youtube className="w-4 h-4 text-red-500" /> YouTube Import
                                </div>
                            </div>
                        </div>
                    ) : (
                        <VideoPlayer videoSrc={videoSrc} srtContent={stringifySRT(subtitles)} isYouTube={false} />
                    )
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
                           <button onClick={() => alert("Google Drive Integration Coming Soon!")} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group/btn" title="Import from Google Drive">
                             <HardDrive className="w-5 h-5 text-neutral-400 group-hover/btn:text-blue-500" />
                           </button>
                           <button onClick={() => alert("Social Media Integration Coming Soon!")} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 hover:border-pink-500/50 transition-all group/btn" title="Other Sources">
                             <Instagram className="w-5 h-5 text-neutral-400 group-hover/btn:text-pink-500" />
                           </button>
                        </div>
                     </div>
                   ) : (fileType === 'video' && videoProcessingStatus !== VideoProcessingStatus.IDLE && videoProcessingStatus !== VideoProcessingStatus.DONE && videoProcessingStatus !== VideoProcessingStatus.ERROR) ? (
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
                      />
                   ) : (
                     <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="w-24 aspect-video rounded-xl bg-neutral-800 text-black flex items-center justify-center overflow-hidden shrink-0 border border-neutral-700">
                                {fileType === 'srt' ? <FileText className="w-6 h-6 text-white" /> : fileType === 'youtube' && youtubeMeta ? <img src={youtubeMeta.thumbnailUrl} className="w-full h-full object-cover"/> : <Clapperboard className="w-6 h-6 text-white" />}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-lg font-bold text-white truncate">{file.name}</h3>
                                <p className="text-neutral-500 text-sm">
                                    {subtitles.length > 0 ? `${subtitles.length} lines loaded` : fileType === 'youtube' ? 'Select a caption track below' : 'Ready to configure'}
                                </p>
                              </div>
                            </div>
                            <Button variant="outline" onClick={resetState} className="shrink-0">Change File</Button>
                        </div>

                        {subtitles.length > 0 && fileType !== 'youtube' && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-900/20 border border-indigo-900/40 text-indigo-300 text-sm">
                              <Info className="w-4 h-4 shrink-0" />
                              <span>Processing this file will require approximately <strong>{estimatedRequests} API requests</strong>.</span>
                          </div>
                        )}
                     </div>
                   )}
                </div>

                {(subtitles.length > 0 || fileType === 'youtube') && (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                      <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
                        
                        {/* REPLACED SOURCE LANGUAGE SELECTOR FOR YOUTUBE */}
                        {fileType === 'youtube' ? (
                            <>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">YouTube Caption Track</label>
                                <div className="relative">
                                    <select 
                                        className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                                        onChange={(e) => setSelectedCaptionId(e.target.value)}
                                        value={selectedCaptionId}
                                        disabled={videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES}
                                    >
                                        <option value="">-- Select Caption to Import --</option>
                                        {youtubeMeta?.availableCaptions?.map((c, index) => (
                                            // Use index as key to ensure uniqueness if URLs are duplicate
                                            <option key={index} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                </div>
                            </>
                        ) : (
                            <>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Source Language</label>
                                <div className="relative">
                                <select className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} disabled={status === TranslationStatus.TRANSLATING}>
                                    <option value="auto">✨ Auto Detect</option>
                                    {LANGUAGES.map(l => <option key={`source-${l.code}`} value={l.name}>{l.name}</option>)}
                                </select>
                                <Languages className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                </div>
                            </>
                        )}
                      </div>
                      <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 flex flex-col justify-end">
                        {/* TARGET LANGUAGE / ACTION BUTTON AREA */}
                        {fileType === 'youtube' ? (
                             <div className="h-full flex items-end">
                                <Button 
                                    className="w-full py-3.5 text-base" 
                                    onClick={handleYouTubeDownload}
                                    disabled={!selectedCaptionId || videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES}
                                    icon={videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                >
                                    {videoProcessingStatus === VideoProcessingStatus.EXTRACTING_SUBTITLES ? 'Downloading...' : 'Download & Process'}
                                </Button>
                             </div>
                        ) : (
                            <>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Target Language</label>
                                <div className="relative">
                                <select className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} disabled={status === TranslationStatus.TRANSLATING}>
                                    {LANGUAGES.map(l => <option key={`target-${l.code}`} value={l.name}>{l.name}</option>)}
                                </select>
                                <ArrowRight className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                                </div>
                            </>
                        )}
                      </div>
                   </div>
                )}

                {(subtitles.length > 0 && fileType !== 'youtube') && (
                  <div className="flex justify-end gap-4 animate-fade-in">
                    {status === TranslationStatus.TRANSLATING ? (
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
                    ) : (
                      <Button onClick={handleTranslate} className="w-full md:w-auto text-lg" icon={<Zap className="w-5 h-5" />}>
                        Start Translation
                      </Button>
                    )}
                  </div>
                )}
                
                {error && (
                  <div className="p-4 rounded-xl bg-red-900/10 border border-red-900/40 text-red-200 text-sm flex items-center gap-3 animate-fade-in">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>
        </div>

        {subtitles.length > 0 && (
          <section ref={resultsRef} className="mt-24 border-t border-neutral-900 pt-12 animate-slide-up pb-24">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">Live Preview</h2>
                <p className="text-neutral-500">Comparing original vs translated output.</p>
              </div>
              <div className="flex items-center gap-4">
                  {(fileType === 'video' || fileType === 'youtube') && (
                      <div className="">
                        <Button 
                            variant="secondary" 
                            onClick={handleDownloadVideo} 
                            progress={downloadProgress}
                            statusText={downloadStatusText}
                            completed={isDownloadComplete}
                            disabled={downloadProgress !== undefined}
                            icon={<Film className="w-4 h-4" />}
                            className=""
                        >
                            Download Video
                        </Button>
                      </div>
                  )}
                  <Button variant="primary" onClick={handleDownloadSrt} icon={<Download className="w-4 h-4"/>}>Download SRT</Button>
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-800 bg-black/50 backdrop-blur overflow-hidden min-h-[400px]">
              <div className={`grid ${fileType === 'youtube' ? 'grid-cols-1' : 'grid-cols-[100px_1fr]'} border-b border-neutral-800 bg-neutral-900/50 p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky top-0 z-10`}>
                {fileType !== 'youtube' && <div className="pl-2">Timestamp</div>}
                <div className={`grid ${fileType === 'youtube' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
                   <span>Original ({sourceLang})</span>
                   {fileType !== 'youtube' && <span className="text-white">Translated ({targetLang})</span>}
                </div>
              </div>
              <div className="max-h-[800px] overflow-y-auto">
                {subtitles.map((sub) => ( <SubtitleCard key={sub.id} subtitle={sub} isActive={sub.text !== sub.originalText} isSingleColumn={fileType === 'youtube'} /> ))}
              </div>
            </div>
            <div className="mt-8 flex justify-center">
                <Button variant="secondary" onClick={resetState} icon={<RefreshCw className="w-4 h-4" />}>
                    Translate Another File
                </Button>
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-neutral-900 bg-black/80 backdrop-blur-xl mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-8">
            {/* Top Row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                {/* Brand */}
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-neutral-800 text-white flex items-center justify-center font-bold text-sm rounded font-display">S</div>
                    <span className="font-display font-bold tracking-tight text-neutral-400">SubStream AI</span>
                </div>

                {/* Copyright (Middle) */}
                <div className="text-xs text-neutral-600">
                    &copy; {new Date().getFullYear()} SubStream AI. Open Source.
                </div>

                {/* Links (Right) */}
                <div className="flex items-center gap-6 text-sm text-neutral-500">
                    <button onClick={() => setActiveModal('TOS')} className="hover:text-white transition-colors">Terms</button>
                    <button onClick={() => setActiveModal('PRIVACY')} className="hover:text-white transition-colors">Privacy</button>
                    <a href="https://github.com/imrovoid/SubStream-AI" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors"><Github className="w-5 h-5" /></a>
                </div>
            </div>

            {/* Bottom Row - Developer Info */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
           <div className="flex flex-col gap-4">
              <label className="block text-sm font-bold text-white flex items-center gap-2"><Cpu className="w-4 h-4" /> Select AI Model</label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 w-5 h-5 text-neutral-500 pointer-events-none" />
                <input type="text" placeholder="Search models..." value={modelSearchQuery} onChange={(e) => setModelSearchQuery(e.target.value)} className="w-full bg-black/50 border border-neutral-700 rounded-xl py-2 pl-10 pr-4 text-white focus:border-white focus:outline-none transition-colors" />
              </div>
              <div className="space-y-4 pr-2 overflow-y-auto max-h-[300px] md:max-h-[450px] custom-scrollbar">
                
                {/* YOUTUBE MODELS (NEW) */}
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
                {/* OpenAI Models Section */}
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
           
           {/* RIGHT COLUMN */}
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
    
                  <div className="space-y-2">
                     <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-bold text-white flex items-center gap-2"><Gauge className="w-4 h-4" /> Rate Limit</label>
                        <p className="font-medium text-white text-sm">{selectedRPM === 'unlimited' ? 'Unlimited' : `${selectedRPM} RPM`}</p>
                     </div>
                      <div className="relative flex w-full p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
                          <div className="absolute top-1 bottom-1 left-1 w-1/4 bg-neutral-700 rounded-lg transition-all duration-300 ease-out" style={{ transform: `translateX(${selectedRpmIndex * 100}%)` }} />
                          {RPM_OPTIONS.map((option) => (
                              <button key={option.value} onClick={() => setSelectedRPM(option.value)} className={`relative z-10 w-1/4 py-2 text-sm font-medium transition-colors duration-300 rounded-lg ${selectedRPM === option.value ? 'text-white' : 'text-neutral-400 hover:text-white'}`}>{option.label}</button>
                          ))}
                      </div>
                       <p className="text-xs text-neutral-500 text-center mt-2">{RPM_OPTIONS.find(o => o.value === selectedRPM)?.description}</p>
                  </div>
              </div>
              
              {/* FOOTER ACTIONS - MODIFIED */}
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
         <div className="space-y-5 text-sm text-neutral-300">
            <p className="text-neutral-500">Last Updated: November 2025</p>
            <div>
              <h3 className="text-white font-bold mb-2">1. Data Collection</h3>
              <p>We do not store your subtitle files. All processing is done in-memory and via the Gemini API. Once your session ends, your data is cleared from our interface.</p>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2">2. Third-Party Services</h3>
              <p>We use Google's Gemini API for processing translations. Data sent to Google is subject to their data processing terms.</p>
            </div>
         </div>
      </Modal>

      <Modal isOpen={activeModal === 'TOS'} onClose={() => setActiveModal('NONE')} title="Terms of Service">
         <div className="space-y-5 text-sm text-neutral-300">
            <p className="text-neutral-500">Last Updated: November 2025</p>
            <div>
              <h3 className="text-white font-bold mb-2">1. Usage</h3>
              <p>SubStream AI is provided "as is" for subtitle translation purposes. Do not use for illegal content.</p>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2">2. Limitations</h3>
              <p>We do not guarantee 100% accuracy in translations. AI models can hallucinate or misinterpret context.</p>
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

    </div>
  );
};

export default AppWrapper;