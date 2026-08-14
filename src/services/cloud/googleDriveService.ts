import { DriveFile } from "../../types";
import { requestGoogleAccessToken, GOOGLE_DRIVE_SCOPE } from "../../utils/googleAuthHelper";
import { setAuthItem } from "../../utils/cookieUtils";

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
 * Silently refreshes the Google Drive access token using GIS.
 */
export async function refreshGoogleDriveAccessToken(): Promise<string> {
  const freshToken = await requestGoogleAccessToken({
    scope: GOOGLE_DRIVE_SCOPE,
    prompt: '' // Silent background check
  });
  setAuthItem('substream_drive_token', freshToken, 1);
  setAuthItem('substream_drive_token_timestamp', Date.now().toString(), 30);
  setAuthItem('substream_drive_session', 'active', 30);
  return freshToken;
}

/**
 * Fetches the contents of a specific folder via Local Proxy or Direct REST API.
 * Includes automated 401 silent token refresh and retry.
 */
export async function listDriveFiles(
  accessToken: string, 
  folderId: string = 'root', 
  searchQuery: string = '',
  onTokenRefreshed?: (newToken: string) => void
): Promise<DriveFile[]> {
  try {
    return await executeListDriveFiles(accessToken, folderId, searchQuery);
  } catch (error: any) {
    if (error?.message?.includes("AUTH_EXPIRED") || error?.message?.includes("401")) {
      try {
        const freshToken = await refreshGoogleDriveAccessToken();
        onTokenRefreshed?.(freshToken);
        return await executeListDriveFiles(freshToken, folderId, searchQuery);
      } catch (refreshErr) {
        throw new Error("AUTH_EXPIRED: Your Google Drive session has expired. Please sign in again.");
      }
    }
    throw error;
  }
}

async function executeListDriveFiles(accessToken: string, folderId: string, searchQuery: string): Promise<DriveFile[]> {
  let query = '';

  if (folderId === 'virtual-videos') {
    query = "(mimeType contains 'video/') and trashed = false";
  } 
  else if (folderId === 'virtual-subtitles') {
    query = "(name contains '.srt' or name contains '.vtt') and trashed = false";
  } 
  else {
    query = `('${folderId}' in parents and trashed = false) and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/' or name contains '.srt' or name contains '.vtt')`;
  }

  if (searchQuery) {
    const safeSearch = searchQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    query += ` and name contains '${safeSearch}'`;
  }

  const fields = "files(id, name, mimeType, thumbnailLink, iconLink, size, createdTime, modifiedTime, videoMediaMetadata, fileExtension)";
  const orderBy = "folder,name";

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
      } else if (response.status === 401) {
        throw new Error("AUTH_EXPIRED: Your Google Drive session has expired. Please sign in again.");
      }
    } catch (e: any) {
      if (e?.message?.includes("AUTH_EXPIRED")) throw e;
      isProxyOnline = false;
    }
  }

  // Direct Google Drive API Fallback
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
    const status = directResponse.status;
    if (status === 401) {
      throw new Error("AUTH_EXPIRED: Your Google Drive session has expired. Please sign in again.");
    }
    if (status === 403) {
      throw new Error("ACCESS_DENIED: Google Drive permission denied. Please verify your account access.");
    }
    throw new Error("CONNECTION_ERROR: Unable to connect to Google Drive. Please try again.");
  }

  const data = await directResponse.json();
  const rawFiles: DriveFile[] = data.files || [];
  const uniqueMap = new Map<string, DriveFile>();
  rawFiles.forEach(f => uniqueMap.set(f.id, f));
  return Array.from(uniqueMap.values());
}

export { listDriveFiles as fetchDriveFiles };

/**
 * Downloads a file from Google Drive via the Local Proxy, falling back to direct API download.
 * Includes automated 401 silent token refresh and retry.
 */
export async function downloadDriveFile(
  accessToken: string, 
  fileId: string, 
  fileName: string,
  onTokenRefreshed?: (newToken: string) => void
): Promise<File> {
  try {
    return await executeDownloadDriveFile(accessToken, fileId, fileName);
  } catch (error: any) {
    if (error?.message?.includes("AUTH_EXPIRED") || error?.message?.includes("401")) {
      try {
        const freshToken = await refreshGoogleDriveAccessToken();
        onTokenRefreshed?.(freshToken);
        return await executeDownloadDriveFile(freshToken, fileId, fileName);
      } catch {
        throw new Error("AUTH_EXPIRED: Your Google Drive session has expired. Please sign in again.");
      }
    }
    throw error;
  }
}

async function executeDownloadDriveFile(accessToken: string, fileId: string, fileName: string): Promise<File> {
  const driveDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  try {
    const proxyUrl = `${BACKEND_URL}/file-get?url=${encodeURIComponent(driveDownloadUrl)}`;
    const response = await fetch(proxyUrl, {
      headers: {
        'x-proxy-auth': `Bearer ${accessToken}`
      }
    });

    if (response.ok) {
      const blob = await response.blob();
      return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    }
  } catch {
    // Fall back to direct API download
  }

  const directResponse = await fetch(driveDownloadUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!directResponse.ok) {
    if (directResponse.status === 401) {
      throw new Error("AUTH_EXPIRED: Your Google Drive session has expired. Please sign in again.");
    }
    throw new Error("Failed to download file from Google Drive.");
  }

  const blob = await directResponse.blob();
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
}
