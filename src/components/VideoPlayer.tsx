import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  Settings, 
  Maximize, 
  Minimize, 
  PictureInPicture2, 
  Subtitles, 
  ChevronRight, 
  ChevronLeft, 
  Gauge, 
  Monitor, 
  Loader2, 
  AlertCircle,
  Check,
  Volume2,
  Volume1,
  VolumeX
} from 'lucide-react';
import { fetchYouTubeStreamUrl } from '../services/youtubeService';

interface VideoPlayerProps {
  videoSrc: string; // Blob URL, Direct Link, or YouTube URL/ID
  srtContent: string; // Raw SRT or VTT content for the track
  isYouTube?: boolean;
  availableResolutions?: number[];
  className?: string;
}

interface SubtitleCue {
  id: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
}

function parseSrtToCues(srt: string): SubtitleCue[] {
  if (!srt) return [];
  const cues: SubtitleCue[] = [];
  const blocks = srt.trim().replace(/\r\n/g, '\n').split(/\n\s*\n/);
  
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.trim().split(':');
    if (parts.length < 3) return 0;
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const secParts = parts[2].split(/[,.]/);
    const seconds = parseFloat(secParts[0]);
    const ms = parseFloat(secParts[1] || '0') / 1000;
    return hours * 3600 + minutes * 60 + seconds + ms;
  };

  let idCounter = 1;
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeLineIdx = lines.findIndex(l => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const timeParts = lines[timeLineIdx].split('-->');
    if (timeParts.length === 2) {
      const start = parseTime(timeParts[0]);
      const end = parseTime(timeParts[1]);
      const text = lines.slice(timeLineIdx + 1).join('\n').trim();
      if (text) {
        cues.push({ id: idCounter++, start, end, text });
      }
    }
  }

  return cues;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoSrc, 
  srtContent, 
  isYouTube, 
  availableResolutions = [],
  className = "" 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Refs for preserving playback position & play state across quality changes
  const pendingSeekTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(isYouTube ? null : videoSrc);
  const [resolvedAudioSrc, setResolvedAudioSrc] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(!!isYouTube);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedQuality, setSelectedQuality] = useState<string>('Auto');
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [nativeResolution, setNativeResolution] = useState<number | null>(null);

  // Dynamic Quality options list based on source video resolutions or detected video height/width
  const qualityOptions = useMemo(() => {
    const standardTiers = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144];
    const resSet = new Set<number>();

    if (availableResolutions && availableResolutions.length > 0) {
      availableResolutions.forEach(r => {
        if (typeof r === 'number' && r > 0) resSet.add(r);
      });
    }

    if (nativeResolution && nativeResolution > 0) {
      resSet.add(nativeResolution);
    }

    if (resSet.size === 0) {
      return ['Auto', '1080p', '720p', '480p', '360p', '240p', '144p'];
    }

    const maxRes = Math.max(...Array.from(resSet), 1080);
    standardTiers.filter(r => r <= maxRes).forEach(r => resSet.add(r));

    const sorted = Array.from(resSet).sort((a, b) => b - a);
    return ['Auto', ...sorted.map(r => `${r}p`)];
  }, [availableResolutions, nativeResolution]);

  const activeQualityText = useMemo(() => {
    if (selectedQuality === 'Auto') {
      const numOptions = qualityOptions
        .filter(q => q !== 'Auto')
        .map(q => parseInt(q.replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
      const autoTarget = numOptions.length > 0 ? Math.min(Math.max(...numOptions), 1080) : 1080;
      return `Auto (${autoTarget}p)`;
    }
    return selectedQuality;
  }, [selectedQuality, qualityOptions]);

  // ponytail: Ensure video wrapper stays 100% width/height without transform scaling to eliminate side borders
  const renderScaleWrapperStyle = useMemo(() => {
    const selectedResNum = parseInt(selectedQuality.replace(/\D/g, ''), 10);
    return {
      width: '100%',
      height: '100%',
      imageRendering: selectedResNum && selectedResNum <= 360 ? 'pixelated' : 'auto',
    } as React.CSSProperties;
  }, [selectedQuality]);
  
  // Subtitle Customization State
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [subtitleBg, setSubtitleBg] = useState<'dark' | 'solid' | 'semi' | 'none'>('dark');
  const [subtitleColor, setSubtitleColor] = useState<'white' | 'yellow'>('white');
  const [subtitleOpacity, setSubtitleOpacity] = useState<number>(1);
  
  // Settings Popover State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsView, setSettingsView] = useState<'main' | 'quality' | 'speed' | 'subtitles' | 'subtitleSize' | 'subtitleBg' | 'subtitleColor' | 'subtitleOpacity'>('main');

  // Controls Visibility Timer
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse SRT cues
  const cues = useMemo(() => parseSrtToCues(srtContent), [srtContent]);

  // Current active subtitle cue
  const activeCue = useMemo(() => {
    if (!showSubtitles || cues.length === 0) return null;
    const currentMatch = cues.find(c => currentTime >= c.start && currentTime <= c.end);
    if (currentMatch) return currentMatch;
    if (currentTime <= 1.0) return cues[0];
    return null;
  }, [cues, currentTime, showSubtitles]);

  // Resolve YouTube Stream URL if isYouTube
  useEffect(() => {
    if (!isYouTube || !videoSrc) {
      setResolvedSrc(videoSrc);
      setResolvedAudioSrc(null);
      setIsResolving(false);
      setResolveError(null);
      return;
    }

    let isMounted = true;
    setIsResolving(true);
    setResolveError(null);

    // Save exact position & play state before fetching new resolution stream
    if (videoRef.current) {
      pendingSeekTimeRef.current = videoRef.current.currentTime || 0;
      wasPlayingRef.current = !videoRef.current.paused;
    }

    const numOptions = (availableResolutions || [])
      .filter(r => typeof r === 'number' && r > 0);
    const maxRes = numOptions.length > 0 ? Math.max(...numOptions) : 1080;
    const autoTarget = Math.min(maxRes, 1080);
    const qualityParam = selectedQuality === 'Auto' ? `${autoTarget}p` : selectedQuality;

    fetchYouTubeStreamUrl(videoSrc, qualityParam)
      .then((res) => {
        if (isMounted) {
          setResolvedSrc(res.streamUrl);
          setResolvedAudioSrc(res.audioUrl || null);
          setIsResolving(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setResolveError(err?.message || "Failed to load video stream.");
          setIsResolving(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [videoSrc, isYouTube, selectedQuality, availableResolutions]);

  // ponytail: Continuous Audio/Video Lock-Step Sync Controller to prevent drift and network buffering desync
  useEffect(() => {
    if (!resolvedAudioSrc || !videoRef.current || !audioRef.current) return;

    const syncAudioWithVideo = () => {
      const v = videoRef.current;
      const a = audioRef.current;
      if (!v || !a) return;

      // Sync playback state
      if (v.paused && !a.paused) {
        a.pause();
      } else if (!v.paused && a.paused && !isBuffering && !isResolving) {
        a.currentTime = v.currentTime;
        a.play().catch(() => {});
      }

      // Sync playback rate
      if (a.playbackRate !== v.playbackRate) {
        a.playbackRate = v.playbackRate;
      }

      // Drift correction
      const drift = Math.abs(v.currentTime - a.currentTime);
      if (drift > 0.15 && !isSeeking) {
        a.currentTime = v.currentTime;
      }
    };

    const interval = setInterval(syncAudioWithVideo, 200);
    return () => clearInterval(interval);
  }, [resolvedAudioSrc, isBuffering, isResolving, isSeeking]);

  // Handle User Activity for Controls Autohide
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isSeeking) {
        setShowControls(false);
        setShowSettings(false);
      }
    }, 3000);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    const v = videoRef.current;
    const a = audioRef.current;

    if (!v.paused) {
      v.pause();
      if (a && !a.paused) {
        a.pause();
      }
      setIsPlaying(false);
    } else {
      setIsBuffering(false);
      v.play()
        .then(() => {
          setIsPlaying(true);
          if (a && resolvedAudioSrc) {
            a.currentTime = v.currentTime;
            a.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn("Playback error:", err);
          setIsPlaying(!v.paused);
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    if (audioRef.current) audioRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume <= 0.05) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
      if (audioRef.current) audioRef.current.volume = 0.5;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    const muted = val <= 0.05;
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = muted;
    }
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = muted;
    }
    setIsMuted(muted);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current && !isNaN(val)) {
      videoRef.current.currentTime = val;
    }
    if (audioRef.current && !isNaN(val)) {
      audioRef.current.currentTime = val;
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setSettingsView('main');
  };

  const changeQuality = (quality: string) => {
    if (quality === selectedQuality) return;
    if (videoRef.current) {
      pendingSeekTimeRef.current = videoRef.current.currentTime || 0;
      wasPlayingRef.current = !videoRef.current.paused;
    }
    setSelectedQuality(quality);
    setSettingsView('main');
  };

  const togglePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("Picture in picture not supported or denied.");
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const isCurrentlyMuted = isMuted || volume <= 0.05;
  const volumePercent = isCurrentlyMuted ? 0 : volume * 100;

  // Restore playback & seek position seamlessly when new stream data loads
  const handleMediaLoadedData = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }

    const h = videoRef.current.videoHeight;
    const w = videoRef.current.videoWidth;
    if (h > 0 || w > 0) {
      const res = (h > 0 && w > 0) ? Math.min(h, w) : (h || w);
      setNativeResolution(res);
    }

    if (pendingSeekTimeRef.current > 0) {
      videoRef.current.currentTime = pendingSeekTimeRef.current;
      if (audioRef.current) {
        audioRef.current.currentTime = pendingSeekTimeRef.current;
      }
      setCurrentTime(pendingSeekTimeRef.current);
      pendingSeekTimeRef.current = 0;
    }

    if (wasPlayingRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (audioRef.current) audioRef.current.play().catch(() => {});
      }).catch(() => {
        setIsPlaying(false);
      });
    }

    setIsBuffering(false);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && !isSeeking && setShowControls(false)}
      className={`w-full bg-black rounded-2xl overflow-hidden aspect-video border border-neutral-800 relative group select-none ${className}`}
    >
      {/* Overlay: Stream Resolution Loading */}
      {isResolving && (
        <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-neutral-400">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <span className="text-xs font-medium tracking-wide text-neutral-200">Switching quality...</span>
        </div>
      )}

      {/* Overlay: Stream Error */}
      {!isResolving && resolveError && (
        <div className="absolute inset-0 z-40 bg-neutral-950 flex flex-col items-center justify-center gap-3 text-neutral-400 px-6 text-center">
          <AlertCircle className="w-8 h-8 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-300">{resolveError}</span>
        </div>
      )}

      {/* Overlay: Stream Buffering Spinner */}
      {isBuffering && !isResolving && !resolveError && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
          <div className="p-3 bg-black/60 backdrop-blur-md rounded-2xl">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
        </div>
      )}

      {/* Main Video Element - Kept mounted in DOM at all times */}
      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden bg-black relative cursor-pointer"
        onClick={togglePlay}
      >
        <div className="w-full h-full flex items-center justify-center pointer-events-auto" style={renderScaleWrapperStyle}>
          <video
            ref={videoRef}
            src={resolvedSrc || undefined}
            className="w-full h-full object-cover cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            onPlay={() => {
              setIsPlaying(true);
            }}
            onPause={() => {
              setIsPlaying(false);
            }}
            onWaiting={() => {
              setIsBuffering(true);
            }}
            onPlaying={() => {
              setIsBuffering(false);
              setIsPlaying(true);
            }}
            onSeeked={() => {
              if (audioRef.current && videoRef.current) {
                audioRef.current.currentTime = videoRef.current.currentTime;
              }
            }}
            onCanPlay={() => setIsBuffering(false)}
            onTimeUpdate={() => {
              if (!isSeeking && videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={handleMediaLoadedData}
            onLoadedData={handleMediaLoadedData}
            onError={(e) => {
              console.warn("Video element playback error:", e);
              if (isYouTube && videoSrc) {
                fetchYouTubeStreamUrl(videoSrc, '1080p')
                  .then(res => {
                    setResolvedSrc(res.streamUrl);
                    if (res.audioUrl) setResolvedAudioSrc(res.audioUrl);
                  })
                  .catch(() => {});
              }
            }}
          />
        </div>
      </div>

      {/* Synced Audio Track (For High Resolution Separate Audio/Video Streams) */}
      {resolvedAudioSrc && (
        <audio
          ref={audioRef}
          src={resolvedAudioSrc}
          muted={isCurrentlyMuted}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
              setDuration(prev => prev > 0 ? prev : audioRef.current!.duration);
            }
          }}
        />
      )}

      {/* Subtitle SoftSub Cue Overlay */}
      {activeCue && !isResolving && !resolveError && (
        <div 
          className={`absolute left-1/2 -translate-x-1/2 max-w-[85%] text-center pointer-events-none z-20 transition-all duration-300 ${
            showControls || !isPlaying ? 'bottom-14' : 'bottom-5'
          }`}
        >
          <span 
            className={`rounded-xl font-medium inline-block leading-relaxed font-vazirmatn transition-all duration-200 ${
              subtitleColor === 'yellow' ? 'text-yellow-300' : 'text-white'
            } ${
              subtitleSize === 'small' ? 'text-[11px] sm:text-sm md:text-base px-2 py-0.5 sm:px-3.5 sm:py-1.5' :
              subtitleSize === 'large' ? 'text-sm sm:text-lg md:text-xl px-3 py-1.5 sm:px-5 sm:py-2.5' :
              subtitleSize === 'xlarge' ? 'text-base sm:text-xl md:text-2xl px-4 py-2 sm:px-6 sm:py-3' :
              'text-xs sm:text-base md:text-lg px-2.5 py-1 sm:px-4 sm:py-2'
            } ${
              subtitleBg === 'solid' ? 'bg-black border border-white/10 shadow-2xl' :
              subtitleBg === 'semi' ? 'bg-black/50 backdrop-blur-sm border border-white/5' :
              subtitleBg === 'none' ? 'bg-transparent border-0 shadow-none [text-shadow:_0_2px_10px_rgba(0,0,0,1)]' :
              'bg-black/85 backdrop-blur-md border border-white/10 shadow-2xl'
            }`}
            style={{ 
              fontFamily: "'Vazirmatn', 'Inter', system-ui, sans-serif",
              opacity: subtitleOpacity 
            }}
          >
            {activeCue.text}
          </span>
        </div>
      )}

      {/* Single-Row Monochromatic Controls */}
      {!resolveError && (
        <div 
          className={`absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between gap-3 transition-all duration-300 z-30 ${
            showControls || !isPlaying || isSeeking ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          {/* Left Controls: Play, Mute, Time */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Play / Pause Button */}
            <button 
              onClick={togglePlay} 
              className="text-white/80 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex items-center justify-center"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
                  <path d="M7 4.75a1 1 0 0 1 1.53-.84l11 6.25a1 1 0 0 1 0 1.68l-11 6.25A1 1 0 0 1 7 17.25V4.75z" />
                </svg>
              )}
            </button>

            {/* Mute & Volume Slider */}
            <div className="flex items-center group/volume relative">
              <button 
                onClick={toggleMute} 
                className="text-white/80 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex items-center justify-center"
                title={isCurrentlyMuted ? "Unmute" : "Mute"}
              >
                {isCurrentlyMuted ? (
                  <VolumeX className="w-4 h-4 text-white/60" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4 text-white" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white" />
                )}
              </button>

              {/* Collapsible Volume Slider Container */}
              <div className="max-w-0 opacity-0 overflow-hidden group-hover/volume:max-w-[70px] group-hover/volume:opacity-100 transition-all duration-300 ease-out flex items-center">
                <div className="w-14 h-1 relative flex items-center rounded-full overflow-hidden bg-white/20 ml-1">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isCurrentlyMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-full opacity-0 cursor-pointer relative z-10"
                  />
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-white rounded-full pointer-events-none transition-all"
                    style={{ width: `${volumePercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Time Display */}
            <div className="text-[11px] font-mono text-neutral-300 font-medium tracking-tight whitespace-nowrap">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1 text-neutral-500">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Center Timeline Progress Scrubber with Single Knob */}
          <div className="flex-1 relative flex items-center group/timeline mx-1 h-3">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={handleSeekChange}
              onMouseUp={() => setIsSeeking(false)}
              onTouchEnd={() => setIsSeeking(false)}
              className="w-full h-full opacity-0 cursor-pointer relative z-10"
            />
            <div className="w-full h-1 bg-white/20 rounded-full pointer-events-none absolute left-0 right-0 group-hover/timeline:h-1.5 transition-all overflow-hidden">
              <div 
                className="h-full bg-white rounded-full pointer-events-none transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Single Circle Knob */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md pointer-events-none opacity-0 group-hover/timeline:opacity-100 transition-opacity z-20"
              style={{ left: `calc(${Math.min(98.5, Math.max(0, progressPercent))}% - 4px)` }}
            />
          </div>

          {/* Right Controls: CC, Settings, PiP, Fullscreen */}
          <div className="flex items-center gap-1.5 shrink-0 relative">
            {/* Subtitles CC Toggle */}
            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                showSubtitles ? 'text-white bg-white/20 border border-white/30' : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title="Toggle Subtitles"
            >
              <Subtitles className="w-4 h-4" />
            </button>

            {/* Settings Button */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSettings(!showSettings);
                  setSettingsView('main');
                }}
                className={`p-1.5 rounded-lg transition-all ${
                  showSettings ? 'text-white bg-white/20' : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Settings Menu Popover */}
              {showSettings && (
                <div className="absolute bottom-10 right-0 w-56 bg-neutral-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/80 z-50 text-xs overflow-hidden transition-all duration-200 animate-fade-in">
                  {settingsView === 'main' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('quality')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <div className="flex items-center gap-2.5">
                          <Monitor className="w-4 h-4 text-neutral-400" />
                          <span className="font-semibold">Quality</span>
                        </div>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span>{activeQualityText}</span>
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>

                      <button
                        onClick={() => setSettingsView('speed')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <div className="flex items-center gap-2.5">
                          <Gauge className="w-4 h-4 text-neutral-400" />
                          <span className="font-semibold">Speed</span>
                        </div>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span>{playbackSpeed}×</span>
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>

                      <button
                        onClick={() => setSettingsView('subtitles')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <div className="flex items-center gap-2.5">
                          <Subtitles className="w-4 h-4 text-neutral-400" />
                          <span className="font-semibold">Subtitles</span>
                        </div>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span className="capitalize">{subtitleSize}</span>
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    </div>
                  )}

                  {settingsView === 'quality' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('main')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Quality</span>
                      </button>
                      <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-0.5">
                        {qualityOptions.map((q) => (
                          <button
                            key={q}
                            onClick={() => changeQuality(q)}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                              selectedQuality === q ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{q}</span>
                            {selectedQuality === q && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {settingsView === 'speed' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('main')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Playback Speed</span>
                      </button>
                      <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-0.5">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                          <button
                            key={spd}
                            onClick={() => changeSpeed(spd)}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                              playbackSpeed === spd ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{spd === 1 ? '1× (Normal)' : `${spd}×`}</span>
                            {playbackSpeed === spd && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {settingsView === 'subtitles' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('main')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Subtitles</span>
                      </button>
                      <button
                        onClick={() => setSettingsView('subtitleSize')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <span className="font-medium">Font Size</span>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span className="capitalize">{subtitleSize}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                      <button
                        onClick={() => setSettingsView('subtitleColor')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <span className="font-medium">Caption Color</span>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span className="capitalize">{subtitleColor}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                      <button
                        onClick={() => setSettingsView('subtitleBg')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <span className="font-medium">Background</span>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span className="capitalize">{subtitleBg === 'none' ? 'No BG' : subtitleBg}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                      <button
                        onClick={() => setSettingsView('subtitleOpacity')}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                      >
                        <span className="font-medium">Opacity</span>
                        <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                          <span>{Math.round(subtitleOpacity * 100)}%</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    </div>
                  )}

                  {settingsView === 'subtitleSize' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('subtitles')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Font Size</span>
                      </button>
                      {[
                        { id: 'small', label: 'Small' },
                        { id: 'medium', label: 'Medium (Default)' },
                        { id: 'large', label: 'Large' },
                        { id: 'xlarge', label: 'Extra Large' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setSubtitleSize(opt.id as any); setSettingsView('subtitles'); }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                            subtitleSize === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {subtitleSize === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {settingsView === 'subtitleColor' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('subtitles')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Caption Color</span>
                      </button>
                      {[
                        { id: 'white', label: 'White (Default)' },
                        { id: 'yellow', label: 'Yellow' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setSubtitleColor(opt.id as any); setSettingsView('subtitles'); }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                            subtitleColor === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                          }`}
                        >
                          <span className={opt.id === 'yellow' ? 'text-yellow-300 font-semibold' : ''}>{opt.label}</span>
                          {subtitleColor === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {settingsView === 'subtitleBg' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('subtitles')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Background Style</span>
                      </button>
                      {[
                        { id: 'dark', label: 'Dark Glass' },
                        { id: 'solid', label: 'Solid Black' },
                        { id: 'semi', label: 'Semi-Transparent' },
                        { id: 'none', label: 'No Background' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setSubtitleBg(opt.id as any); setSettingsView('subtitles'); }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                            subtitleBg === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {subtitleBg === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {settingsView === 'subtitleOpacity' && (
                    <div className="flex flex-col gap-1 transition-all duration-200">
                      <button
                        onClick={() => setSettingsView('subtitles')}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Background Opacity</span>
                      </button>
                      {[
                        { val: 1, label: '100%' },
                        { val: 0.85, label: '85%' },
                        { val: 0.6, label: '60%' }
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => { setSubtitleOpacity(opt.val); setSettingsView('subtitles'); }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                            subtitleOpacity === opt.val ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {subtitleOpacity === opt.val && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Picture in Picture */}
            <button
              onClick={togglePictureInPicture}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};