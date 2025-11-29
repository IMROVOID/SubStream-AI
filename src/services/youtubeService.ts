import { YouTubeVideoMetadata, YouTubeCaptionTrack, YouTubeUserVideo } from "../types";
import { downloadFile } from "../utils/srtUtils";

// Backend URL (Local Node Server)
const BACKEND_URL = "http://localhost:4000/api";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function extractYouTubeId(url: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

export async function getVideoDetails(videoUrl: string): Promise<{ meta: YouTubeVideoMetadata, captions: YouTubeCaptionTrack[] }> {
    try {
        const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(videoUrl)}`);
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server returned ${response.status}: Failed to process video.`);
        }
        
        const data = await response.json();
        // The yt-dlp response has a different structure for captions, so we map it.
        const mappedCaptions = data.captions.map((c: any) => ({
            id: c.id,
            language: c.language,
            name: c.name,
        }));
        
        data.meta.videoUrl = data.meta.videoUrl || videoUrl;
        
        // Include resolutions in the returned object
        data.meta.availableResolutions = data.resolutions || [];

        return { meta: data.meta, captions: mappedCaptions };

    } catch (e: any) {
        console.error("Backend API Error:", e);
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            throw new Error("Could not connect to local server. Please run 'npm start' in the 'server' folder.");
        }
        throw new Error(e.message || "Failed to fetch video details.");
    }
}

/**
 * HYBRID DOWNLOADER:
 * 1. Tries Official YouTube API via Local Proxy (Authenticated) -> 100% Reliable for owned videos
 * 2. Falls back to Backend Proxy (yt-dlp) -> Best Effort for public videos
 */
export async function downloadCaptionTrack(videoUrl: string, trackToken: string, accessToken?: string | null): Promise<string> {
    
    // --- STRATEGY 1: Official API (Authenticated) ---
    // We must route this through the backend proxy to avoid CORS errors in the browser
    if (accessToken) {
        const videoId = extractYouTubeId(videoUrl);
        if (videoId) {
            try {
                // 1. Decode the track token to find language preference
                let targetLang = '';
                try {
                    const jsonStr = atob(trackToken);
                    const decoded = JSON.parse(jsonStr);
                    targetLang = decoded.lang; 
                } catch(e) {
                    console.warn("Could not decode track token for API strategy:", e);
                }

                if (targetLang) {
                    // 2. List captions via API (Proxy) to find the Track ID
                    const listResp = await fetch(`${BACKEND_URL}/proxy/captions?videoId=${videoId}&token=${encodeURIComponent(accessToken)}`);

                    if (listResp.ok) {
                        const listData = await listResp.json();
                        // Find a track matching our language
                        const track = listData.items?.find((t: any) => t.snippet.language === targetLang);
                        
                        if (track) {
                            console.log("Found track via Official API:", track.id);
                            
                            // 3. Download via API Proxy (Bypasses CORS)
                            const downResp = await fetch(`${BACKEND_URL}/proxy/download-caption?captionId=${track.id}&token=${encodeURIComponent(accessToken)}`);
                            
                            if (downResp.ok) {
                                const text = await downResp.text();
                                if (text && text.length > 0) return text;
                            } else {
                                console.warn("Official API Proxy Download Failed:", downResp.status);
                            }
                        }
                    } else {
                        console.warn("Official API List Failed:", listResp.status);
                    }
                }
            } catch (e) {
                console.warn("Official API Strategy failed, falling back to Proxy...", e);
            }
        }
    }

    // --- STRATEGY 2: Backend yt-dlp (Fallback) ---
    try {
        const query = new URLSearchParams({
            url: videoUrl,
            token: trackToken
        });

        const response = await fetch(`${BACKEND_URL}/caption?${query.toString()}`);
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || "Failed to download caption track from backend.");
        }
        return await response.text();
    } catch (e: any) {
        console.error("Subtitle download failed:", e);
        throw new Error(e.message || "Failed to download subtitles.");
    }
}

export async function downloadYouTubeVideoWithSubs(videoUrl: string, trackToken: string, fileName: string, resolution?: number): Promise<void> {
    const query = new URLSearchParams({
        url: videoUrl,
        token: trackToken,
        name: fileName
    });
    
    if (resolution) {
        query.append('quality', resolution.toString());
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/download-video?${query.toString()}`);
        
        if (!response.ok) {
             const errorText = await response.text().catch(() => "Unknown Server Error");
             throw new Error(errorText || "Download failed on server.");
        }

        const blob = await response.blob();
        
        const downloadName = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
        downloadFile(downloadName, blob);

    } catch (e: any) {
        console.error("Video download failed:", e);
        throw new Error(e.message || "Failed to download video from server.");
    }
}


// --- GOOGLE OAUTH PROXY METHODS (Resolves COEP/CORS Issues) ---

export async function fetchUserVideos(accessToken: string): Promise<YouTubeUserVideo[]> {
    const channelResp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!channelResp.ok) {
        if (channelResp.status === 401) throw new Error("Session expired. Please Sign Out and Sign In again in Settings.");
        if (channelResp.status === 403) throw new Error("Access forbidden. API Quota might be exceeded or YouTube Data API is disabled.");
        throw new Error(`Failed to fetch channel details (${channelResp.status})`);
    }

    const channelData = await channelResp.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) return [];

    const playlistResp = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!playlistResp.ok) {
        if (playlistResp.status === 401) throw new Error("Session expired. Please re-authenticate.");
        throw new Error("Failed to fetch playlist items.");
    }
    const playlistData = await playlistResp.json();
    
    const videoIds = playlistData.items.map((item: any) => item.contentDetails.videoId).join(',');
    if (!videoIds) return [];

    const videosResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails&id=${videoIds}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!videosResp.ok) throw new Error("Failed to fetch video details.");
    const videosData = await videosResp.json();

    return videosData.items.map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
        privacyStatus: item.status.privacyStatus,
        duration: formatDuration(item.contentDetails.duration)
    }));
}

function formatDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return "00:00";

    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');

    const h = hours ? `${hours}:` : '';
    const m = minutes ? `${minutes.padStart(2, '0')}:` : '00:';
    const s = seconds ? seconds.padStart(2, '0') : '00';

    return `${h}${m}${s}`.replace(/^00:/, ''); 
}

/**
 * Uploads a video to YouTube using the Local Proxy for Init and the binary stream.
 */
export async function uploadVideoToYouTube(accessToken: string, videoFile: File, title: string, onProgress?: (percent: number) => void): Promise<string> {
    
    // 1. Initiate Session via Local Proxy
    const metadata = {
        snippet: {
            title: title,
            description: 'Uploaded automatically by SubStream AI for transcription.',
        },
        status: {
            privacyStatus: 'unlisted', 
        },
    };

    const initResp = await fetch(`${BACKEND_URL}/proxy/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: accessToken,
            metadata: metadata,
            fileSize: videoFile.size.toString(),
            fileType: videoFile.type || 'video/mp4'
        })
    });

    if (!initResp.ok) {
        const err = await initResp.json().catch(() => ({}));
        
        let errorMessage = "Unknown Error";
        if (err.error && typeof err.error === 'object' && err.error.message) {
             errorMessage = err.error.message;
        } else if (err.error) {
             errorMessage = JSON.stringify(err.error);
        } else if (err.message) {
             errorMessage = err.message;
        }

        errorMessage = errorMessage.replace(/<[^>]*>?/gm, '');

        console.error("YouTube Upload Init Failed Response:", err);

        if (initResp.status === 403) {
             throw new Error(`YouTube Permission Denied (403): ${errorMessage}. Ensure 'YouTube Data API v3' is ENABLED in Google Cloud Console and Quota is not exceeded.`);
        }
        if (initResp.status === 401) {
            throw new Error("Session Expired (401). Please re-authenticate YouTube.");
        }
        
        throw new Error(`Upload Init Failed (${initResp.status}): ${errorMessage}`);
    }

    const { location: uploadUrl } = await initResp.json();
    if (!uploadUrl) throw new Error("Backend did not return an upload location.");

    // 2. Upload binary VIA LOCAL PROXY to avoid CORS
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.open('PUT', `${BACKEND_URL}/proxy/upload-finish`, true);
        
        xhr.setRequestHeader('x-upload-url', uploadUrl);
        xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4');

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const uploadData = JSON.parse(xhr.responseText);
                    resolve(uploadData.id);
                } catch (e) {
                    reject(new Error("Failed to parse YouTube response after upload."));
                }
            } else {
                 const errorText = xhr.responseText || xhr.statusText;
                 reject(new Error(`Binary Upload Failed (${xhr.status}): ${errorText}`));
            }
        };

        xhr.onerror = () => reject(new Error("Network Error during Binary Upload (Check Backend Connection)."));
        
        xhr.send(videoFile);
    });
}

/**
 * Polls the YouTube API via Local Proxy to check if any caption tracks are ready.
 */
export async function pollForCaptionReady(accessToken: string, videoId: string, onProgress?: (msg: string, percent: number) => void): Promise<boolean> {
    const MAX_ATTEMPTS = 120; // 20 minutes
    const INTERVAL_MS = 10000; // 10 seconds

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const percent = Math.round((i / MAX_ATTEMPTS) * 100);
        
        try {
            if (onProgress) onProgress(`Waiting for YouTube to process video... (${i + 1}/${MAX_ATTEMPTS})`, percent);
            
            const response = await fetch(`${BACKEND_URL}/proxy/captions?token=${encodeURIComponent(accessToken)}&videoId=${videoId}`);

            if (response.ok) {
                const data = await response.json();
                
                // We just need to know if ANY track is ready. That means processing is done.
                if (data.items && data.items.length > 0) {
                    if (onProgress) onProgress("Video processing complete!", 100);
                    return true;
                }
            } else {
                 const errText = await response.text();
                 console.warn(`Caption check failed (${response.status}): ${errText}`);
            }
        } catch (e: any) {
            console.warn("Polling error:", e);
        }

        await delay(INTERVAL_MS);
    }

    throw new Error('Timed out waiting for YouTube to process the video.');
}