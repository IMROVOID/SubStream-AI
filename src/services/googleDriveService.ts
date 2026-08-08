import { DriveFile } from "../types";

// PROXY URL for Drive API Calls
const BACKEND_URL = "http://localhost:4000/api/proxy";

let isProxyChecked = false;
let isProxyOnline = false;

async function checkProxyAvailability(): Promise<boolean> {
    if (isProxyChecked) return isProxyOnline;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 150);
        const res = await fetch("http://localhost:4000/api/proxy/drive/list?token=test", { 
            signal: controller.signal 
        }).catch(() => null);
        clearTimeout(timeoutId);
        isProxyOnline = res !== null && res.status !== 0;
    } catch {
        isProxyOnline = false;
    }
    isProxyChecked = true;
    return isProxyOnline;
}

/**
 * Fetches the contents of a specific folder via Local Proxy or Direct REST API.
 */
export async function listDriveFiles(accessToken: string, folderId: string = 'root', searchQuery: string = ''): Promise<DriveFile[]> {
    let query = '';

    // Construct Query
    if (folderId === 'virtual-videos') {
        query = "(mimeType contains 'video/') and trashed = false";
    } 
    else if (folderId === 'virtual-subtitles') {
        // FIX: Use fileExtension to avoid matching text files like 'srtUtils.ts.txt'
        query = "(fileExtension = 'srt' or fileExtension = 'vtt') and trashed = false";
    } 
    else {
        // Strict grouping: (Is Child AND Not Trash) AND (Is Folder OR Is Video OR Is Subtitle File Ext)
        // We allow mimeType 'application/octet-stream' or 'text/plain' ONLY if extension matches
        query = `('${folderId}' in parents and trashed = false) and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/' or fileExtension = 'srt' or fileExtension = 'vtt')`;
    }

    if (searchQuery) {
        const safeSearch = searchQuery.replace(/'/g, "\\'");
        query += ` and name contains '${safeSearch}'`;
    }

    const fields = "files(id, name, mimeType, thumbnailLink, iconLink, size, createdTime, modifiedTime, videoMediaMetadata, fileExtension)";
    const orderBy = "folder,name";

    // 1. Try Local Proxy only if proxy is online
    const hasProxy = await checkProxyAvailability();
    if (hasProxy) {
        try {
            const params = new URLSearchParams({
                token: accessToken,
                query: query,
                fields: fields,
                orderBy: orderBy,
                pageSize: '1000'
            });

            const url = `${BACKEND_URL}/drive/list?${params.toString()}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                const files: DriveFile[] = data.files || [];
                const uniqueMap = new Map<string, DriveFile>();
                files.forEach(f => uniqueMap.set(f.id, f));
                return Array.from(uniqueMap.values());
            }
        } catch {
            isProxyOnline = false;
        }
    }

    // 2. Direct Google Drive API Fallback
    const directParams = new URLSearchParams({
        q: query,
        fields: fields,
        orderBy: orderBy,
        pageSize: '1000'
    });

    const directUrl = `https://www.googleapis.com/drive/v3/files?${directParams.toString()}`;
    const directResponse = await fetch(directUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!directResponse.ok) {
        const err = await directResponse.json().catch(() => ({}));
        let errMsg = "Unknown Drive Error";

        if (err.error) {
            if (typeof err.error === 'string') {
                errMsg = err.error;
            } else if (typeof err.error === 'object') {
                errMsg = err.error.message || JSON.stringify(err.error);
            }
        } else {
            errMsg = directResponse.statusText || "Server Error";
        }

        throw new Error(errMsg);
    }

    const data = await directResponse.json();
    const rawFiles: DriveFile[] = data.files || [];
    const uniqueMap = new Map<string, DriveFile>();
    rawFiles.forEach(f => uniqueMap.set(f.id, f));
    return Array.from(uniqueMap.values());
}

/**
 * Downloads a file from Google Drive via the Local Proxy, falling back to direct API download.
 */
export async function downloadDriveFile(accessToken: string, fileId: string, fileName: string): Promise<File> {
    const driveDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    // 1. Try Local Proxy first
    try {
        const proxyUrl = `${BACKEND_URL}/file-get?url=${encodeURIComponent(driveDownloadUrl)}`;
        const response = await fetch(proxyUrl, {
            headers: {
                'x-proxy-auth': `Bearer ${accessToken}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            return new File([blob], fileName, { type: blob.type });
        }
    } catch {
        // Local proxy server offline, fallback to direct download
    }

    // 2. Direct Google Drive API Download Fallback
    const directResponse = await fetch(driveDownloadUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!directResponse.ok) {
        throw new Error(`Failed to download file from Drive.`);
    }

    const blob = await directResponse.blob();
    return new File([blob], fileName, { type: blob.type });
}