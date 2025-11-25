import { YouTubeVideoMetadata, YouTubeCaptionTrack } from "../types";

// Backend URL (Local Node Server)
const BACKEND_URL = "http://localhost:4000/api";

// Declare gapi explicitly for upload functionality
declare var gapi: any;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const GAPI_URL = "https://apis.google.com/js/api.js";
let gapiLoaded = false;
let gapiLoading = false;

/**
 * Extracts Video ID from various YouTube URL formats
 */
export function extractYouTubeId(url: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

/**
 * Fetches Video Metadata + Captions using Local Node Backend (yt-dlp)
 */
export async function getVideoDetails(videoUrl: string): Promise<{ meta: YouTubeVideoMetadata, captions: YouTubeCaptionTrack[] }> {
    try {
        // Pass the full URL to the backend
        const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(videoUrl)}`);
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server returned ${response.status}: Failed to process video.`);
        }
        
        const data = await response.json();
        return { meta: data.meta, captions: data.captions };

    } catch (e: any) {
        console.error("Backend API Error:", e);
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            throw new Error("Could not connect to local server. Please run 'npm start' in the 'server' folder.");
        }
        throw new Error(e.message || "Failed to fetch video details.");
    }
}

/**
 * Downloads the subtitle content via Backend Proxy (yt-dlp)
 * @param trackId - The base64 encoded track ID from the info response
 */
export async function downloadCaptionTrack(trackId: string): Promise<string> {
    try {
        const response = await fetch(`${BACKEND_URL}/caption?trackId=${encodeURIComponent(trackId)}`);
        if (!response.ok) throw new Error("Failed to download caption track from backend.");
        return await response.text();
    } catch (e) {
        console.error("Subtitle download failed:", e);
        throw new Error("Failed to download subtitles.");
    }
}


// --- GOOGLE OAUTH (Only for Uploading) ---

// Load the Google API script dynamically.
function loadGapiScript() {
  return new Promise<void>((resolve, reject) => {
    if (gapiLoaded) return resolve();
    if (gapiLoading) {
      const interval = setInterval(() => {
        if (gapiLoaded) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      return;
    }
    
    gapiLoading = true;
    const script = document.createElement("script");
    script.src = GAPI_URL;
    script.onload = () => {
      gapi.load('client', () => {
        gapi.client.setApiKey(null);
        gapiLoaded = true;
        gapiLoading = false;
        resolve();
      });
    };
    script.onerror = () => {
      gapiLoading = false;
      reject("Failed to load Google API script.");
    };
    document.body.appendChild(script);
  });
}

/**
 * Uploads a video to YouTube as unlisted.
 */
export async function uploadVideoToYouTube(accessToken: string, videoFile: File): Promise<string> {
    await loadGapiScript();
    gapi.client.setToken({ access_token: accessToken });

    const metadata = {
        snippet: {
            title: `SubStream Transcription - ${new Date().toISOString()}`,
            description: 'Temporary video uploaded for transcription by SubStream AI.',
        },
        status: {
            privacyStatus: 'unlisted', // CRITICAL: Use 'unlisted' to protect user privacy.
        },
    };

    return new Promise((resolve, reject) => {
        const uploader = new gapi.client.youtube.videos.insert({
            part: 'snippet,status',
            resource: metadata,
        }, {
            'media': videoFile,
            'location': 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            'autoRetry': true,
            'maxRetries': 3,
        });

        uploader.execute((response) => {
            if (response.id) {
                resolve(response.id);
            } else {
                reject(new Error(response.message || 'Unknown error during YouTube upload.'));
            }
        });
    });
}

/**
 * Polls the YouTube API to check for the availability of automatic captions.
 */
export async function checkYouTubeCaptionStatus(accessToken: string, videoId: string): Promise<string> {
    await loadGapiScript();
    gapi.client.setToken({ access_token: accessToken });

    const MAX_POLL_ATTEMPTS = 60;
    const POLL_INTERVAL_MS = 10000;

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        try {
            const response = await gapi.client.youtube.captions.list({
                part: 'snippet',
                videoId: videoId,
            });

            if (response.result.items && response.result.items.length > 0) {
                const autoCaptionTrack = response.result.items.find(
                    (item: any) => item.snippet.trackKind === 'ASR'
                );

                if (autoCaptionTrack && autoCaptionTrack.id) {
                    return autoCaptionTrack.id;
                }
            }
            await delay(POLL_INTERVAL_MS);
        } catch (error) {
            await delay(POLL_INTERVAL_MS);
        }
    }

    throw new Error('Failed to retrieve captions from YouTube after 10 minutes.');
}

/**
 * Downloads the SRT content of a caption track (OAuth version).
 */
export async function downloadYouTubeCaptionTrackOAuth(accessToken: string, captionId: string): Promise<string> {
    await loadGapiScript();
    gapi.client.setToken({ access_token: accessToken });

    const response = await gapi.client.youtube.captions.download({
        id: captionId,
        tfmt: 'srt',
    });

    if (typeof response.body === 'string') {
        return response.body;
    }

    throw new Error('Failed to download SRT content from YouTube.');
}