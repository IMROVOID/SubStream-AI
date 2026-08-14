import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { fetchYouTubeStreamUrl } from '../../services/youtubeService';
import { PlayerControls } from './PlayerControls';
import { PlayerSubtitleOverlay, SubtitleCue } from './PlayerSubtitleOverlay';
import { normalizeResolutions } from '../../utils/srtUtils';

interface VideoPlayerProps {
  videoSrc: string;
  srtContent: string;
  isYouTube?: boolean;
  availableResolutions?: number[];
  className?: string;
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

  const pendingSeekTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(isYouTube ? null : videoSrc);
  const [resolvedAudioSrc, setResolvedAudioSrc] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(!!isYouTube);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

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

  const qualityOptions = useMemo(() => {
    const rawList = [...(availableResolutions || [])];
    if (nativeResolution && nativeResolution >= 144) {
      rawList.push(nativeResolution);
    }
    const cleanList = normalizeResolutions(rawList);
    return ['Auto', ...cleanList.map(r => `${r}p`)];
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

  const renderScaleWrapperStyle = useMemo(() => {
    const selectedResNum = parseInt(selectedQuality.replace(/\D/g, ''), 10);
    return {
      width: '100%',
      height: '100%',
      imageRendering: selectedResNum && selectedResNum <= 360 ? 'pixelated' : 'auto',
    } as React.CSSProperties;
  }, [selectedQuality]);
  
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [subtitleBg, setSubtitleBg] = useState<'dark' | 'solid' | 'semi' | 'none'>('dark');
  const [subtitleColor, setSubtitleColor] = useState<'white' | 'yellow'>('white');
  const [subtitleOpacity, setSubtitleOpacity] = useState<number>(1);
  
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsView, setSettingsView] = useState<'main' | 'quality' | 'speed' | 'subtitles' | 'subtitleSize' | 'subtitleBg' | 'subtitleColor' | 'subtitleOpacity'>('main');

  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cues = useMemo(() => parseSrtToCues(srtContent), [srtContent]);

  const activeCue = useMemo(() => {
    if (!showSubtitles || cues.length === 0) return null;
    const currentMatch = cues.find(c => currentTime >= c.start && currentTime <= c.end);
    if (currentMatch) return currentMatch;
    if (currentTime <= 1.0) return cues[0];
    return null;
  }, [cues, currentTime, showSubtitles]);

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

    if (videoRef.current) {
      pendingSeekTimeRef.current = videoRef.current.currentTime || 0;
      wasPlayingRef.current = !videoRef.current.paused;
    }

    const numOptions = (availableResolutions || []).filter(r => typeof r === 'number' && r > 0);
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

    return () => { isMounted = false; };
  }, [videoSrc, isYouTube, selectedQuality, availableResolutions]);

  useEffect(() => {
    if (!resolvedAudioSrc || !videoRef.current || !audioRef.current) return;

    const syncAudioWithVideo = () => {
      const v = videoRef.current;
      const a = audioRef.current;
      if (!v || !a) return;

      if (v.paused && !a.paused) {
        a.pause();
      } else if (!v.paused && a.paused && !isBuffering && !isResolving) {
        a.currentTime = v.currentTime;
        a.play().catch(() => {});
      }

      if (a.playbackRate !== v.playbackRate) {
        a.playbackRate = v.playbackRate;
      }

      const drift = Math.abs(v.currentTime - a.currentTime);
      if (drift > 0.15 && !isSeeking) {
        a.currentTime = v.currentTime;
      }
    };

    const interval = setInterval(syncAudioWithVideo, 200);
    return () => clearInterval(interval);
  }, [resolvedAudioSrc, isBuffering, isResolving, isSeeking]);

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
      if (a && !a.paused) a.pause();
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
    if (videoRef.current && !isNaN(val)) videoRef.current.currentTime = val;
    if (audioRef.current && !isNaN(val)) audioRef.current.currentTime = val;
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
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
      if (audioRef.current) audioRef.current.currentTime = pendingSeekTimeRef.current;
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
      {isResolving && (
        <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-neutral-400">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <span className="text-xs font-medium tracking-wide text-neutral-200">Switching quality...</span>
        </div>
      )}

      {!isResolving && resolveError && (
        <div className="absolute inset-0 z-40 bg-neutral-950 flex flex-col items-center justify-center gap-3 text-neutral-400 px-6 text-center">
          <AlertCircle className="w-8 h-8 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-300">{resolveError}</span>
        </div>
      )}

      {isBuffering && !isResolving && !resolveError && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
          <div className="p-3 bg-black/60 backdrop-blur-md rounded-2xl">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
        </div>
      )}

      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden bg-black relative cursor-pointer"
        onClick={togglePlay}
      >
        <div className="w-full h-full flex items-center justify-center pointer-events-auto" style={renderScaleWrapperStyle}>
          <video
            ref={videoRef}
            src={resolvedSrc || undefined}
            className="w-full h-full object-contain cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false);
              setIsBuffering(false);
            }}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              setIsPlaying(true);
              setIsBuffering(false);
            }}
            onCanPlay={() => setIsBuffering(false)}
            onCanPlayThrough={() => setIsBuffering(false)}
            onSeeked={() => {
              setIsBuffering(false);
              if (audioRef.current && videoRef.current) {
                audioRef.current.currentTime = videoRef.current.currentTime;
              }
            }}
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

      {resolvedAudioSrc && (
        <audio
          ref={audioRef}
          src={resolvedAudioSrc}
          muted={isMuted || volume <= 0.05}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
              setDuration(prev => prev > 0 ? prev : audioRef.current!.duration);
            }
          }}
        />
      )}

      <PlayerSubtitleOverlay 
        activeCue={activeCue}
        showControls={showControls}
        isPlaying={isPlaying}
        isResolving={isResolving}
        resolveError={resolveError}
        subtitleColor={subtitleColor}
        subtitleSize={subtitleSize}
        subtitleBg={subtitleBg}
        subtitleOpacity={subtitleOpacity}
      />

      {!resolveError && (
        <PlayerControls 
          isPlaying={isPlaying}
          isMuted={isMuted}
          volume={volume}
          currentTime={currentTime}
          duration={duration}
          playbackSpeed={playbackSpeed}
          selectedQuality={selectedQuality}
          qualityOptions={qualityOptions}
          activeQualityText={activeQualityText}
          showSubtitles={showSubtitles}
          isFullscreen={isFullscreen}
          isSeeking={isSeeking}
          showControls={showControls}
          showSettings={showSettings}
          settingsView={settingsView}
          subtitleSize={subtitleSize}
          subtitleBg={subtitleBg}
          subtitleColor={subtitleColor}
          subtitleOpacity={subtitleOpacity}
          togglePlay={togglePlay}
          toggleMute={toggleMute}
          handleVolumeChange={handleVolumeChange}
          handleSeekChange={handleSeekChange}
          setIsSeeking={setIsSeeking}
          setShowSubtitles={setShowSubtitles}
          setShowSettings={setShowSettings}
          setSettingsView={setSettingsView}
          changeQuality={changeQuality}
          changeSpeed={changeSpeed}
          setSubtitleSize={setSubtitleSize}
          setSubtitleBg={setSubtitleBg}
          setSubtitleColor={setSubtitleColor}
          setSubtitleOpacity={setSubtitleOpacity}
          togglePictureInPicture={togglePictureInPicture}
          toggleFullscreen={toggleFullscreen}
          formatTime={formatTime}
        />
      )}
    </div>
  );
};