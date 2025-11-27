import { DriveFile } from "../types";

// PROXY URL for Drive API Calls
const BACKEND_URL = "http://localhost:4000/api/proxy";

/**
 * Fetches the contents of a specific folder via Local Proxy.
 * This bypasses CORS and 403 restrictions from the browser.
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

    // FIX: Added 'fileExtension' to requested fields
    const fields = "files(id, name, mimeType, thumbnailLink, iconLink, size, createdTime, modifiedTime, videoMediaMetadata, fileExtension)";
    const orderBy = "folder,modifiedTime desc";

    const params = new URLSearchParams({
        token: accessToken,
        query: query,
        fields: fields,
        orderBy: orderBy,
        pageSize: '1000'
    });

    const url = `${BACKEND_URL}/drive/list?${params.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        let errMsg = "Unknown Drive Error";

        if (err.error) {
            if (typeof err.error === 'string') {
                errMsg = err.error;
            } else if (typeof err.error === 'object') {
                errMsg = err.error.message || JSON.stringify(err.error);
            }
        } else {
            errMsg = response.statusText || "Server Error";
        }

        throw new Error(errMsg);
    }

    const data = await response.json();
    return data.files || [];
}

/**
 * Downloads a file from Google Drive via the Local Proxy.
 */
export async function downloadDriveFile(accessToken: string, fileId: string, fileName: string): Promise<File> {
    const driveDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const proxyUrl = `${BACKEND_URL}/file-get?url=${encodeURIComponent(driveDownloadUrl)}`;

    const response = await fetch(proxyUrl, {
        headers: {
            'x-proxy-auth': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to download file from Drive via proxy.`);
    }

    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type });
}