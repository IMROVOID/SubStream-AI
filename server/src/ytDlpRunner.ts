import { ytDlpWrap } from './binaryManager';
import { getActiveProxyConfig } from './proxy';

export const CLIENTS_TO_TRY = ['android_vr', 'tv', 'android_creator', 'ios', 'android', 'mweb', 'web'];

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const executeYtDlpWithRetry = async (baseArgs: string[]): Promise<string> => {
    let lastError: any;
    const currentProxyUrl = await getActiveProxyConfig();
    let proxyActive = !!currentProxyUrl;

    for (const client of CLIENTS_TO_TRY) {
        try {
            // Build arguments for this specific client attempt
            const currentArgs = [
                ...baseArgs,
                '--no-playlist',
                '--no-check-certificates',
                '--force-ipv4',
                '--no-cache-dir', // Critical to prevent caching 429/403 states
                '--extractor-args', `youtube:player_client=${client}`
            ];

            if (proxyActive && currentProxyUrl) {
                currentArgs.push('--proxy', currentProxyUrl);
            }

            console.log(`[YT-DLP] Attempting with client: ${client}${proxyActive ? ` (via proxy)` : ' (direct)'}`);
            const result = await ytDlpWrap.execPromise(currentArgs);
            console.log(`[YT-DLP] Success with client: ${client}`);
            return result;

        } catch (e: any) {
            const msg = e?.message || '';
            const isProxyError = msg.includes('Unable to connect to proxy') || 
                                 msg.includes('ProxyError') || 
                                 msg.includes('WinError 10061') || 
                                 msg.includes('ECONNREFUSED');

            if (isProxyError && proxyActive) {
                console.warn(`[YT-DLP] Proxy failed (${msg.split('\n')[0]}). Disabling proxy and retrying client '${client}' directly...`);
                proxyActive = false; // Disable proxy for remainder of execution
                try {
                    const directArgs = [
                        ...baseArgs,
                        '--no-playlist',
                        '--no-check-certificates',
                        '--force-ipv4',
                        '--no-cache-dir',
                        '--extractor-args', `youtube:player_client=${client}`
                    ];
                    console.log(`[YT-DLP] Attempting with client: ${client} (direct fallback)`);
                    const result = await ytDlpWrap.execPromise(directArgs);
                    console.log(`[YT-DLP] Success with client: ${client} (direct fallback)`);
                    return result;
                } catch (directErr) {
                    lastError = directErr;
                }
            } else {
                const isRateLimit = msg.includes('HTTP Error 429') || msg.includes('Too Many Requests');
                const isForbidden = msg.includes('HTTP Error 403') || msg.includes('Sign in to confirm');
                const isPOToken = msg.includes('PO Token');
                const isFormat = msg.includes('Requested format is not available');

                console.warn(`[YT-DLP] Client '${client}' failed. (Error: ${isRateLimit ? 'Rate Limited' : isForbidden ? 'Forbidden' : isPOToken ? 'PO Token' : isFormat ? 'Format Unavail' : 'Generic'})`);
                lastError = e;
            }
            
            // Short random delay between retries to avoid hammering
            await delay(1500 + Math.random() * 1000); 
        }
    }

    // Final fallback: if proxy was attempted and everything failed, try a direct connection pass
    if (currentProxyUrl && proxyActive) {
        console.warn("[YT-DLP] All proxy attempts failed. Performing final direct connection attempt...");
        for (const client of ['tv', 'mweb', 'web']) {
            try {
                const directArgs = [
                    ...baseArgs,
                    '--no-playlist',
                    '--no-check-certificates',
                    '--force-ipv4',
                    '--no-cache-dir',
                    '--extractor-args', `youtube:player_client=${client}`
                ];
                const result = await ytDlpWrap.execPromise(directArgs);
                console.log(`[YT-DLP] Direct connection fallback succeeded with client: ${client}`);
                return result;
            } catch (err) {
                lastError = err;
            }
        }
    }

    // If we exhausted all clients
    console.error("[YT-DLP] All clients failed.");
    throw lastError;
};
