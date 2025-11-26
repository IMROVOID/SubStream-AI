import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, Youtube, Download, AlertCircle, Loader2, PlayCircle, FileText, Film, ArrowLeft, Search, SortDesc, Globe, Lock, EyeOff, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { extractYouTubeId, getVideoDetails, fetchUserVideos } from '../services/youtubeService';
import { YouTubeVideoMetadata, YouTubeUserVideo } from '../types';

interface ImportUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'URL' | 'YOUTUBE' | 'GDRIVE' | 'SOCIAL' | null;
  onImportFile: (file: File) => void;
  onImportYouTube: (meta: YouTubeVideoMetadata) => void;
  googleAccessToken: string | null;
}

export const ImportUrlModal: React.FC<ImportUrlModalProps> = ({ 
    isOpen, 
    onClose, 
    type, 
    onImportFile, 
    onImportYouTube,
    googleAccessToken
}) => {
  const [mode, setMode] = useState<'INPUT' | 'CHANNEL'>('INPUT');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PREVIEW'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  
  // URL Specific State
  const [detectedType, setDetectedType] = useState<'VIDEO' | 'SRT' | null>(null);
  const [fileMeta, setFileMeta] = useState<{name: string, size?: string, type: string} | null>(null);

  // YouTube Specific State
  const [ytMeta, setYtMeta] = useState<YouTubeVideoMetadata | null>(null);

  // Channel Browser State
  const [userVideos, setUserVideos] = useState<YouTubeUserVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'date' | 'title'>('date');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Ref for closing sort menu on outside click
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (!isOpen) {
          // Reset when closed
          setMode('INPUT');
          setUrl('');
          setStatus('IDLE');
          setError(null);
          setDetectedType(null);
          setFileMeta(null);
          setYtMeta(null);
          setUserVideos([]);
          setSearchQuery('');
          setShowSortMenu(false);
      }
  }, [isOpen]);

  // Handle clicks outside sort menu
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
              setShowSortMenu(false);
          }
      };
      if (showSortMenu) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
  }, [showSortMenu]);

  // Fetch videos when entering CHANNEL mode
  useEffect(() => {
      if (mode === 'CHANNEL' && googleAccessToken && userVideos.length === 0) {
          setLoadingVideos(true);
          fetchUserVideos(googleAccessToken)
              .then(videos => setUserVideos(videos))
              .catch(err => setError(err.message)) 
              .finally(() => setLoadingVideos(false));
      }
  }, [mode, googleAccessToken]);

  const handleUrlSubmit = async () => {
      setError(null);
      setStatus('LOADING');

      if (type === 'YOUTUBE') {
          const videoId = extractYouTubeId(url);
          if (!videoId) {
              setError("Invalid YouTube URL.");
              setStatus('IDLE');
              return;
          }
          try {
              const { meta, captions } = await getVideoDetails(url);
              setYtMeta({ ...meta, availableCaptions: captions });
              setStatus('PREVIEW');
          } catch (e: any) {
              setError(e.message || "Failed to fetch YouTube details.");
              setStatus('IDLE');
          }
      } 
      else if (type === 'URL') {
          try {
              const response = await fetch(url, { method: 'HEAD' });
              if (!response.ok) throw new Error(`Failed to access URL: ${response.statusText}`);
              
              const contentType = response.headers.get('content-type') || '';
              const contentLength = response.headers.get('content-length');
              
              const name = url.split('/').pop()?.split('?')[0] || 'downloaded_file';
              const size = contentLength ? `${(parseInt(contentLength) / (1024 * 1024)).toFixed(2)} MB` : 'Unknown Size';

              if (contentType.includes('text') || name.endsWith('.srt') || name.endsWith('.vtt')) {
                  setDetectedType('SRT');
                  setFileMeta({ name, size, type: 'Subtitle File' });
                  setStatus('PREVIEW');
              } else if (contentType.includes('video') || name.match(/\.(mp4|mkv|mov|webm)$/i)) {
                  setDetectedType('VIDEO');
                  setFileMeta({ name, size, type: 'Video File' });
                  setStatus('PREVIEW');
              } else {
                  throw new Error("Unsupported file type. Please provide a direct link to an SRT or Video file.");
              }
          } catch (e: any) {
              console.error(e);
              if (e.message.includes("Failed to access")) {
                 setError("CORS restricted or Invalid URL. We will attempt to force download, but it might fail.");
                 setDetectedType(url.endsWith('.srt') ? 'SRT' : 'VIDEO');
                 setFileMeta({ name: url.split('/').pop() || 'file', size: '?', type: 'Unknown' });
                 setStatus('PREVIEW');
              } else {
                 setError(e.message);
                 setStatus('IDLE');
              }
          }
      }
  };

  const handleConfirm = async () => {
      if (type === 'YOUTUBE' && ytMeta) {
          onImportYouTube(ytMeta);
          onClose();
      } 
      else if (type === 'URL' && fileMeta) {
          try {
              const response = await fetch(url);
              if (!response.ok) throw new Error("Download failed.");
              const blob = await response.blob();
              const file = new File([blob], fileMeta.name, { type: blob.type });
              onImportFile(file);
              onClose();
          } catch (e: any) {
              setError("Download Failed: " + e.message);
          }
      }
  };

  const handleSelectVideo = async (videoId: string) => {
      setMode('INPUT');
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      setUrl(youtubeUrl);
      
      setError(null);
      setStatus('LOADING');
      try {
          const { meta, captions } = await getVideoDetails(youtubeUrl);
          setYtMeta({ ...meta, availableCaptions: captions });
          setStatus('PREVIEW');
      } catch (e: any) {
          setError(e.message || "Failed to fetch YouTube details.");
          setStatus('IDLE');
      }
  };

  const filteredVideos = useMemo(() => {
      let result = userVideos.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (sortOrder === 'date') {
          result.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      } else {
          result.sort((a, b) => a.title.localeCompare(b.title));
      }
      return result;
  }, [userVideos, searchQuery, sortOrder]);

  const title = type === 'YOUTUBE' ? (mode === 'CHANNEL' ? 'Select from My Videos' : 'Import from YouTube') : type === 'URL' ? 'Import from URL' : 'Import';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="space-y-6">
            
            {/* INPUT MODE */}
            {mode === 'INPUT' && (
                <>
                    {(status === 'IDLE' || status === 'LOADING') && (
                        <div className="space-y-4">
                            <p className="text-neutral-400 text-sm">
                                {type === 'YOUTUBE' 
                                    ? "Paste a YouTube URL. We will fetch the video details and available captions using the local server." 
                                    : "Paste a direct link to an .SRT file or a supported Video file (MP4, MKV, etc)."}
                            </p>
                            <div className="relative">
                                <div className="absolute left-4 top-3.5 text-neutral-500">
                                {type === 'YOUTUBE' ? <Youtube className="w-5 h-5" /> : <Link className="w-5 h-5" />}
                                </div>
                                <input 
                                    type="text" 
                                    placeholder={type === 'YOUTUBE' ? "https://www.youtube.com/watch?v=..." : "https://example.com/movie.srt"}
                                    className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-white transition-colors"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                                />
                            </div>
                            {error && <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{error}</div>}
                            
                            <div className="flex justify-between items-center pt-2">
                                {/* SELECT FROM CHANNEL BUTTON */}
                                {type === 'YOUTUBE' ? (
                                    <button 
                                        onClick={() => setMode('CHANNEL')}
                                        disabled={!googleAccessToken}
                                        className="flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={!googleAccessToken ? "Authenticate with YouTube in Settings first" : "Browse your uploaded videos"}
                                    >
                                        <Film className="w-4 h-4" /> Select from My Videos
                                    </button>
                                ) : <div></div>}

                                <Button 
                                    onClick={handleUrlSubmit} 
                                    disabled={!url || status === 'LOADING'} 
                                    icon={status === 'LOADING' ? <Loader2 className="animate-spin w-4 h-4"/> : undefined}
                                >
                                    {status === 'LOADING' ? 'Checking...' : 'Continue'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* PREVIEW STAGE - YOUTUBE */}
                    {status === 'PREVIEW' && type === 'YOUTUBE' && ytMeta && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex gap-4">
                                <img src={ytMeta.thumbnailUrl} alt="Thumb" className="w-32 h-24 object-cover rounded-lg border border-neutral-800" />
                                <div>
                                    <h3 className="font-bold text-white line-clamp-2">{ytMeta.title}</h3>
                                    <p className="text-xs text-neutral-500 mt-1">{ytMeta.channelTitle}</p>
                                    <div className="flex gap-2 mt-2">
                                        <span className="text-[10px] bg-neutral-800 px-2 py-0.5 rounded text-neutral-400">Duration: {ytMeta.duration}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {error && <div className="text-red-400 text-sm">{error}</div>}

                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setStatus('IDLE')}>Back</Button>
                                <Button onClick={handleConfirm} icon={<Download className="w-4 h-4"/>}>Import Video</Button>
                            </div>
                        </div>
                    )}

                    {/* PREVIEW STAGE - URL */}
                    {status === 'PREVIEW' && type === 'URL' && fileMeta && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="p-6 bg-neutral-900/30 border border-neutral-800 rounded-xl flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
                                    {detectedType === 'VIDEO' ? <PlayCircle className="w-6 h-6 text-blue-400" /> : <FileText className="w-6 h-6 text-green-400" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-white break-all">{fileMeta.name}</h3>
                                    <p className="text-sm text-neutral-500">{fileMeta.type} • {fileMeta.size}</p>
                                </div>
                            </div>
                            {error && <div className="text-red-400 text-sm">{error}</div>}
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setStatus('IDLE')}>Back</Button>
                                <Button onClick={handleConfirm} icon={<Download className="w-4 h-4"/>}>Download & Process</Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* CHANNEL BROWSER MODE */}
            {mode === 'CHANNEL' && (
                <div className="flex flex-col h-[500px]">
                    {/* HEADER */}
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-800 shrink-0 relative z-20">
                        <button onClick={() => setMode('INPUT')} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                            <ArrowLeft className="w-5 h-5 text-white" />
                        </button>
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
                            <input 
                                type="text" 
                                placeholder="Search your videos..." 
                                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        
                        {/* SORT DROPDOWN */}
                        <div className="relative" ref={sortMenuRef}>
                            <button 
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${showSortMenu ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                                title="Sort Options"
                            >
                                <SortDesc className="w-5 h-5" />
                            </button>
                            
                            {showSortMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-30 overflow-hidden">
                                    <div className="py-1">
                                        <button 
                                            onClick={() => { setSortOrder('date'); setShowSortMenu(false); }}
                                            className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between"
                                        >
                                            Newest First
                                            {sortOrder === 'date' && <Check className="w-4 h-4 text-white" />}
                                        </button>
                                        <button 
                                            onClick={() => { setSortOrder('title'); setShowSortMenu(false); }}
                                            className="w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between"
                                        >
                                            Title (A-Z)
                                            {sortOrder === 'title' && <Check className="w-4 h-4 text-white" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* VIDEO LIST */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 relative z-10">
                        {loadingVideos ? (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <p>Loading channel videos...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 text-center px-4">
                                <AlertCircle className="w-8 h-8" />
                                <p>{error}</p>
                                <Button variant="outline" onClick={() => setMode('INPUT')} className="mt-2">Go Back</Button>
                            </div>
                        ) : filteredVideos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                                <Film className="w-12 h-12 mb-2 opacity-50" />
                                <p>No videos found.</p>
                            </div>
                        ) : (
                            filteredVideos.map(video => (
                                <div 
                                    key={video.id} 
                                    onClick={() => handleSelectVideo(video.id)}
                                    className="flex gap-3 p-2 rounded-xl hover:bg-neutral-800/50 transition-colors cursor-pointer group border border-transparent hover:border-neutral-700"
                                >
                                    <div className="relative w-32 h-20 shrink-0 rounded-lg overflow-hidden bg-neutral-900">
                                        <img src={video.thumbnail} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] text-white px-1 rounded">
                                            {video.duration}
                                        </span>
                                    </div>
                                    <div className="flex flex-col justify-between py-1 min-w-0">
                                        <div>
                                            <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors">
                                                {video.title}
                                            </h4>
                                            <p className="text-[10px] text-neutral-500 mt-1">
                                                {new Date(video.publishedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {video.privacyStatus === 'private' && <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded"><Lock className="w-3 h-3" /> Private</span>}
                                            {video.privacyStatus === 'unlisted' && <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-900/20 px-1.5 py-0.5 rounded"><EyeOff className="w-3 h-3" /> Unlisted</span>}
                                            {video.privacyStatus === 'public' && <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded"><Globe className="w-3 h-3" /> Public</span>}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>
    </Modal>
  );
};