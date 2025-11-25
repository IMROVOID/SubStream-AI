import React, { useState } from 'react';
import { Link, Youtube, Download, AlertCircle, Loader2, PlayCircle, FileText } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { extractYouTubeId, getVideoDetails, downloadCaptionTrack } from '../services/youtubeService';
import { YouTubeVideoMetadata, YouTubeCaptionTrack } from '../types';

interface ImportUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'URL' | 'YOUTUBE' | 'GDRIVE' | 'SOCIAL' | null;
  onImportFile: (file: File) => void;
  onImportYouTube: (meta: YouTubeVideoMetadata, captionText: string, videoEmbedUrl: string) => void;
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
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PREVIEW' | 'DOWNLOADING'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  
  // URL Specific State
  const [detectedType, setDetectedType] = useState<'VIDEO' | 'SRT' | null>(null);
  const [fileMeta, setFileMeta] = useState<{name: string, size?: string, type: string} | null>(null);

  // YouTube Specific State
  const [ytMeta, setYtMeta] = useState<YouTubeVideoMetadata | null>(null);
  const [ytCaptions, setYtCaptions] = useState<YouTubeCaptionTrack[]>([]);
  const [selectedCaptionUrl, setSelectedCaptionUrl] = useState<string>('');

  const reset = () => {
      setUrl('');
      setStatus('IDLE');
      setError(null);
      setDetectedType(null);
      setFileMeta(null);
      setYtMeta(null);
      setYtCaptions([]);
  };

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
              // Pass the full URL to the backend
              const { meta, captions } = await getVideoDetails(url);
              setYtMeta(meta);
              setYtCaptions(captions);
              setStatus('PREVIEW');
          } catch (e: any) {
              setError(e.message || "Failed to fetch YouTube details.");
              setStatus('IDLE');
          }
      } 
      else if (type === 'URL') {
          try {
              // Simple head request to check mime type
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
              // Fallback: If HEAD fails (CORS), assume user knows what they are doing and just show generic preview
              if (e.message.includes("Failed to access")) {
                 setError("CORS restricted or Invalid URL. We will attempt to force download, but it might fail if the server blocks cross-origin requests.");
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

  const handleConfirmDownload = async () => {
      setStatus('DOWNLOADING');
      
      if (type === 'YOUTUBE' && ytMeta) {
          try {
             let captionText = '';
             if (selectedCaptionUrl) {
                 captionText = await downloadCaptionTrack(selectedCaptionUrl);
             } else {
                 captionText = ''; 
             }
             const embedUrl = `https://www.youtube.com/embed/${ytMeta.id}`;
             onImportYouTube(ytMeta, captionText, embedUrl);
             onClose();
             reset();
          } catch(e: any) {
             setError(e.message);
             setStatus('PREVIEW');
          }
      } 
      else if (type === 'URL' && fileMeta) {
          try {
              const response = await fetch(url);
              if (!response.ok) throw new Error("Download failed.");
              const blob = await response.blob();
              const file = new File([blob], fileMeta.name, { type: blob.type });
              onImportFile(file);
              onClose();
              reset();
          } catch (e: any) {
              setError("Download Failed: " + e.message + ". The server might be blocking this request.");
              setStatus('PREVIEW');
          }
      }
  };

  const title = type === 'YOUTUBE' ? 'Import from YouTube' : type === 'URL' ? 'Import from URL' : 'Import';

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); reset(); }} title={title}>
        <div className="space-y-6">
            
            {/* INPUT STAGE */}
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
                    <div className="flex justify-end">
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

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-neutral-400">Select Source Language / Caption Track</label>
                        {ytCaptions.length > 0 ? (
                            <select 
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-white focus:border-white outline-none"
                                value={selectedCaptionUrl}
                                onChange={(e) => setSelectedCaptionUrl(e.target.value)}
                            >
                                <option value="">-- Ignore Captions (Video Only) --</option>
                                {ytCaptions.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name || c.language} {c.isAutoSynced ? '(Auto-Generated)' : ''}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="p-3 border border-yellow-900/30 bg-yellow-900/10 rounded-lg text-yellow-500 text-sm">
                                No caption tracks found. You can import the video, but you'll need to generate subtitles manually.
                            </div>
                        )}
                    </div>
                    
                    {error && <div className="text-red-400 text-sm">{error}</div>}

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setStatus('IDLE')}>Back</Button>
                        <Button onClick={handleConfirmDownload} icon={<Download className="w-4 h-4"/>}>Import Video</Button>
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
                        <Button onClick={handleConfirmDownload} icon={<Download className="w-4 h-4"/>}>Download & Process</Button>
                    </div>
                </div>
            )}
            
            {status === 'DOWNLOADING' && (
                 <div className="py-8 flex flex-col items-center justify-center space-y-4">
                     <Loader2 className="w-10 h-10 text-white animate-spin" />
                     <p className="text-neutral-400">Downloading and processing content...</p>
                 </div>
            )}

        </div>
    </Modal>
  );
};