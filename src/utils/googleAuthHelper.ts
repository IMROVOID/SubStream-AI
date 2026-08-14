/**
 * Centralized Google OAuth helper.
 * Provides client-side OAuth 2.0 flow using centered popup windows,
 * BroadcastChannel communication, silent background renewal via iframe,
 * and 30-day persistent session management.
 */

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly profile email';
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl profile email';

export interface RequestTokenOptions {
  scope: string;
  prompt?: string; // '' for silent renewal, 'consent' for interactive login
  hint?: string;
  state?: string;
  timeoutMs?: number;
}

// In-flight refresh promises by scope to deduplicate concurrent refresh requests
const activeRefreshPromises = new Map<string, Promise<string>>();

/**
 * Requests a Google OAuth access token.
 * Supports silent renewal (prompt: '') and interactive centered popups (prompt: 'consent').
 */
export async function requestGoogleAccessToken(options: RequestTokenOptions): Promise<string> {
  const { scope, prompt = 'consent', timeoutMs = 180000 } = options;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured in environment.');
  }

  const isYouTube = scope.includes('youtube');
  const state = options.state || (isYouTube ? 'youtube_auth' : 'drive_auth');

  // If this is a silent refresh and one is already in flight for this scope, reuse the pending promise
  if (prompt === '' && activeRefreshPromises.has(scope)) {
    return activeRefreshPromises.get(scope)!;
  }

  if (prompt === '') {
    const silentPromise = silentRenewGoogleToken(clientId, scope, state, 8000);
    activeRefreshPromises.set(scope, silentPromise);
    silentPromise.finally(() => {
      activeRefreshPromises.delete(scope);
    });
    return silentPromise;
  }

  return openGoogleOAuthPopup(clientId, scope, state, timeoutMs);
}

/**
 * Opens an interactive centered popup for Google OAuth authentication.
 */
function openGoogleOAuthPopup(
  clientId: string, 
  scope: string, 
  state: string, 
  timeoutMs: number
): Promise<string> {
  const redirectUri = (window.location.origin + window.location.pathname).replace(/\/$/, '') || window.location.origin;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: scope,
    include_granted_scopes: 'true',
    state: state,
    prompt: 'consent'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const width = 500;
  const height = 600;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  const channelName = state === 'youtube_auth' ? 'substream_auth_channel' : 'substream_drive_auth_channel';
  const channel = new BroadcastChannel(channelName);

  return new Promise((resolve, reject) => {
    let resolved = false;

    const popup = window.open(
      authUrl,
      'Google Auth',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=1`
    );

    if (!popup) {
      channel.close();
      reject(new Error('Popup blocked. Please allow popups for this site and try again.'));
      return;
    }

    const cleanup = () => {
      resolved = true;
      clearTimeout(safetyTimeout);
      window.removeEventListener('message', handleWindowMessage);
      channel.close();
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.token) {
        cleanup();
        resolve(event.data.token);
      }
    };

    channel.onmessage = (event) => {
      if (event.data?.token) {
        cleanup();
        resolve(event.data.token);
      }
    };

    window.addEventListener('message', handleWindowMessage);

    const safetyTimeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Authentication timed out. Please try again.'));
      }
    }, timeoutMs);
  });
}

/**
 * Attempts silent token renewal via a hidden iframe using prompt=none.
 */
function silentRenewGoogleToken(
  clientId: string, 
  scope: string, 
  state: string, 
  timeoutMs: number
): Promise<string> {
  const redirectUri = (window.location.origin + window.location.pathname).replace(/\/$/, '') || window.location.origin;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: scope,
    include_granted_scopes: 'true',
    state: state,
    prompt: 'none'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const channelName = state === 'youtube_auth' ? 'substream_auth_channel' : 'substream_drive_auth_channel';
  const channel = new BroadcastChannel(channelName);

  return new Promise((resolve, reject) => {
    let resolved = false;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = authUrl;

    const cleanup = () => {
      resolved = true;
      clearTimeout(timer);
      window.removeEventListener('message', handleWindowMessage);
      channel.close();
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.token) {
        cleanup();
        resolve(event.data.token);
      }
    };

    channel.onmessage = (event) => {
      if (event.data?.token) {
        cleanup();
        resolve(event.data.token);
      }
    };

    window.addEventListener('message', handleWindowMessage);

    const timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Silent token renewal timed out.'));
      }
    }, timeoutMs);

    document.body.appendChild(iframe);
  });
}

/**
 * Revokes an issued Google OAuth access token on Google's authorization servers.
 */
export async function revokeGoogleAccessToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  } catch (e) {
    // Non-blocking cleanup
    console.warn('Failed to revoke Google access token:', e);
  }
}
