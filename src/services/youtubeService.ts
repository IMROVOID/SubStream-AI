import { YouTubeVideoMetadata, YouTubeCaptionTrack, YouTubeUserVideo } from "../types";
import { downloadFile } from "../utils/srtUtils";

// Backend URL (Local Node Server) - Used for external video info fetching
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
        data.meta.videoUrl = data.meta.videoUrl || videoUrl;
        
        return { meta: data.meta, captions: data.captions };

    } catch (e: any) {
        console.error("Backend API Error:", e);
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            throw new Error("Could not connect to local server. Please run 'npm start' in the 'server' folder.");
        }
        throw new Error(e.message || "Failed to fetch video details.");
    }
}

export async function downloadCaptionTrack(videoUrl: string, trackToken: string): Promise<string> {
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

export async function downloadYouTubeVideoWithSubs(videoUrl: string, trackToken: string, fileName: string): Promise<void> {
    const query = new URLSearchParams({
        url: videoUrl,
        token: trackToken,
        name: fileName
    });
    
    try {
        // Use fetch to handle errors and completion
        const response = await fetch(`${BACKEND_URL}/download-video?${query.toString()}`);
        
        if (!response.ok) {
             const errorText = await response.text().catch(() => "Unknown Server Error");
             throw new Error(errorText || "Download failed on server.");
        }

        // Convert to blob and trigger download
        const blob = await response.blob();
        
        // Ensure the downloaded file has the correct extension
        const downloadName = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
        downloadFile(downloadName, blob);

    } catch (e: any) {
        console.error("Video download failed:", e);
        throw new Error(e.message || "Failed to download video from server.");
    }
}


// --- GOOGLE OAUTH DIRECT API (No GAPI) ---

/**
 * Fetches the user's uploaded videos.
 * Optimized to use 'channels -> playlistItems' flow to save quota (2 units) vs 'search' (100 units).
 */
export async function fetchUserVideos(accessToken: string): Promise<YouTubeUserVideo[]> {
    // 1. Get Uploads Playlist ID
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

    // 2. Get Playlist Items (Max 50)
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

    // 3. Get Video Details (to get Privacy Status & Metadata)
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

// Helper to format ISO 8601 duration (PT1M33S) to readable string (01:33)
function formatDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return "00:00";

    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');

    const h = hours ? `${hours}:` : '';
    const m = minutes ? `${minutes.padStart(2, '0')}:` : '00:';
    const s = seconds ? seconds.padStart(2, '0') : '00';

    return `${h}${m}${s}`.replace(/^00:/, ''); // cleanup leading 00: if no hours
}

/**
 * Uploads a video to YouTube using the Resumable Upload Protocol.
 * This handles large files better than a simple POST.
 */
export async function uploadVideoToYouTube(accessToken: string, videoFile: File, title: string): Promise<string> {
    // 1. Initiate the Resumable Upload Session
    const metadata = {
        snippet: {
            title: title,
            description: 'Uploaded automatically by SubStream AI for transcription.',
        },
        status: {
            privacyStatus: 'unlisted', // Unlisted is best for privacy while allowing tool access
        },
    };

    const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': videoFile.size.toString(),
            'X-Upload-Content-Type': videoFile.type || 'video/mp4'
        },
        body: JSON.stringify(metadata)
    });

    if (!initResponse.ok) {
        const err = await initResponse.json().catch(() => ({}));
        console.error("Upload Init Error:", err);
        throw new Error(`YouTube Upload Init Failed: ${err.error?.message || initResponse.statusText}`);
    }

    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) throw new Error("YouTube did not provide an upload location.");

    // 2. Upload the actual binary content
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': videoFile.type || 'video/mp4'
        },
        body: videoFile
    });

    if (!uploadResponse.ok) {
        const err = await uploadResponse.json().catch(() => ({}));
        console.error("Upload Binary Error:", err);
        throw new Error(`YouTube Upload Failed: ${err.error?.message || uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    return uploadData.id;
}

/**
 * Polls the YouTube API to check if the Automatic Speech Recognition (ASR) track is ready.
 * This can take several minutes.
 */
export async function checkYouTubeCaptionStatus(accessToken: string, videoId: string, onProgress?: (msg: string) => void): Promise<string> {
    const MAX_ATTEMPTS = 60; // 10 minutes if checking every 10s
    const INTERVAL_MS = 10000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        try {
            if (onProgress) onProgress(`Waiting for YouTube to generate captions... (${i + 1}/${MAX_ATTEMPTS})`);
            
            const response = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                // Detailed Error Logging
                const errorBody = await response.json().catch(() => ({}));
                console.warn(`Caption Check Attempt ${i+1} Failed:`, errorBody);

                const errorMessage = errorBody.error?.message || response.statusText;

                // If 403 or 401, we want to know WHY
                if (response.status === 401 || response.status === 403) {
                    throw new Error(`YouTube API Permission Denied: ${errorMessage}. (Please ensure "YouTube Data API v3" is enabled in Cloud Console and you re-authenticated).`);
                }
            } else {
                const data = await response.json();
                
                // Look for the automatic track
                // trackKind='ASR' means Automatic Speech Recognition
                const asrTrack = data.items?.find((item: any) => item.snippet.trackKind === 'ASR');

                if (asrTrack && asrTrack.id) {
                    return asrTrack.id;
                }
            }
        } catch (e: any) {
            console.warn("Polling error catch:", e);
            // Stop polling if it's a hard permission error
            if (e.message.includes("Permission Denied")) throw e;
        }

        await delay(INTERVAL_MS);
    }

    throw new Error('Timed out waiting for YouTube captions. The video might be too long or audio too unclear.');
}

export async function downloadYouTubeCaptionTrackOAuth(accessToken: string, captionId: string): Promise<string> {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/captions/${captionId}?tfmt=srt`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Failed to download caption: ${err.error?.message || response.statusText}`);
    }

    return await response.text();
}