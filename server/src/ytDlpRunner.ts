import { ytDlpWrap } from './binaryManager';
import { getActiveProxyConfig } from './proxy';

export const ALL_CLIENTS = [
    'android_vr',
    'ios',
    'mweb',
    'web',
    'android',
    'android_creator',
    'tv',
    'tv_embedded',
    'web_creator',
    'web_embedded',
    'mweb,android,web',
    'android,ios,web'
];

interface ClientHealth {
    rateLimitedUntil: number; // ms timestamp
    consecutiveFailures: number;
    lastSuccess: number;
}

// In-memory circuit breaker map to track rate limits per client
const clientStateMap = new Map<string, ClientHealth>();

// Rate limit cooldown duration (10 minutes)
const COOLDOWN_MS = 10 * 60 * 1000;

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Retrieve sorted list of clients, prioritizing healthy/unblocked ones
const getPrioritizedClients = (): string[] => {
    const now = Date.now();
    
    // Split clients into healthy vs cooldowned
    const healthy: string[] = [];
    const cooldowned: string[] = [];

    for (const client of ALL_CLIENTS) {
        const state = clientStateMap.get(client);
        if (state && now < state.rateLimitedUntil) {
            cooldowned.push(client);
        } else {
            healthy.push(client);
        }
    }

    // Sort healthy clients by last success time (most recently successful first)
    healthy.sort((a, b) => {
        const lastA = clientStateMap.get(a)?.lastSuccess || 0;
        const lastB = clientStateMap.get(b)?.lastSuccess || 0;
        return lastB - lastA;
    });

    // If all clients are cooldowned, fallback to trying all clients in order
    if (healthy.length === 0) {
        console.warn("[YT-DLP] All clients are currently in cooldown. Resetting oldest cooldowns...");
        return ALL_CLIENTS;
    }

    // Return healthy clients first, appended by cooldowned as desperate fallbacks
    return [...healthy, ...cooldowned];
};

const markClientSuccess = (client: string) => {
    const state = clientStateMap.get(client) || { rateLimitedUntil: 0, consecutiveFailures: 0, lastSuccess: 0 };
    state.consecutiveFailures = 0;
    state.rateLimitedUntil = 0;
    state.lastSuccess = Date.now();
    clientStateMap.set(client, state);
};

const markClientRateLimited = (client: string) => {
    const state = clientStateMap.get(client) || { rateLimitedUntil: 0, consecutiveFailures: 0, lastSuccess: 0 };
    state.consecutiveFailures += 1;
    // Apply 10 minute cooldown penalty
    state.rateLimitedUntil = Date.now() + COOLDOWN_MS;
    clientStateMap.set(client, state);
    console.warn(`[YT-DLP] Client '${client}' placed in 10-min cooldown due to Rate Limit/Blocked state.`);
};

export const executeYtDlpWithRetry = async (baseArgs: string[]): Promise<string> => {
    let lastError: any;
    const currentProxyUrl = await getActiveProxyConfig();
    let proxyActive = !!currentProxyUrl;

    const clientsToTry = getPrioritizedClients();

    for (const client of clientsToTry) {
        // Skip if client is currently in cooldown unless it's our last resort
        const state = clientStateMap.get(client);
        if (state && Date.now() < state.rateLimitedUntil && clientsToTry.indexOf(client) < clientsToTry.length - 1) {
            console.log(`[YT-DLP] Skipping client '${client}' (Cooldown active for ${Math.round((state.rateLimitedUntil - Date.now()) / 1000)}s)`);
            continue;
        }

        try {
            const currentArgs = [
                ...baseArgs,
                '--no-playlist',
                '--no-check-certificates',
                '--force-ipv4',
                '--no-cache-dir',
                '--extractor-args', `youtube:player_client=${client}`
            ];

            if (proxyActive && currentProxyUrl) {
                currentArgs.push('--proxy', currentProxyUrl);
            }

            console.log(`[YT-DLP] Attempting with client: ${client}${proxyActive ? ' (via proxy)' : ' (direct)'}`);
            const result = await ytDlpWrap.execPromise(currentArgs);
            console.log(`[YT-DLP] Success with client: ${client}`);
            
            markClientSuccess(client);
            return result;

        } catch (e: any) {
            const msg = e?.message || '';
            const isProxyError = msg.includes('Unable to connect to proxy') || 
                                 msg.includes('ProxyError') || 
                                 msg.includes('WinError 10061') || 
                                 msg.includes('ECONNREFUSED');

            if (isProxyError && proxyActive) {
                console.warn(`[YT-DLP] Proxy failed. Disabling proxy and retrying client '${client}' directly...`);
                proxyActive = false;
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
                    
                    markClientSuccess(client);
                    return result;
                } catch (directErr) {
                    lastError = directErr;
                }
            }

            const isRateLimit = msg.includes('HTTP Error 429') || msg.includes('Too Many Requests');
            const isForbidden = msg.includes('HTTP Error 403') || msg.includes('Sign in to confirm');
            const isPOToken = msg.includes('PO Token');

            if (isRateLimit || isForbidden || isPOToken) {
                markClientRateLimited(client);
            }

            const errorLabel = isRateLimit ? 'Rate Limited' : isForbidden ? 'Forbidden' : isPOToken ? 'PO Token' : 'Generic Error';
            console.warn(`[YT-DLP] Client '${client}' failed. (Error: ${errorLabel})`);
            lastError = e;

            await delay(500 + Math.random() * 500);
        }
    }

    // Final fallback: if proxy was attempted and all clients failed via proxy, try direct IP pass
    if (currentProxyUrl && proxyActive) {
        console.warn("[YT-DLP] All proxy attempts failed. Performing direct IP pass across healthy clients...");
        for (const client of ['android', 'mweb', 'web', 'tv']) {
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
                markClientSuccess(client);
                return result;
            } catch (err) {
                lastError = err;
            }
        }
    }

    console.error("[YT-DLP] All clients exhausted.");
    throw lastError;
};
