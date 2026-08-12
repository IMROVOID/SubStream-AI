import fs from 'fs';
import path from 'path';
import { ytDlpWrap } from './binaryManager';
import { getActiveProxyConfig, rotateProxy, getProxyPool, setWorkingProxy } from './proxy';

export const ALL_CLIENTS = [
    'android_vr',
    'android',
    'ios',
    'mweb'
];

interface ClientHealth {
    rateLimitedUntil: number; // ms timestamp
    consecutiveFailures: number;
    lastSuccess: number;
}

// In-memory circuit breaker map to track rate limits per proxy + client pair
const clientStateMap = new Map<string, ClientHealth>();

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const getClientKey = (proxyUrl: string | null, client: string): string => {
    return `${proxyUrl || 'direct'}_${client}`;
};

// ponytail: Detect cookies.txt file or browser cookies configuration to bypass YouTube Botguard check
const getCookieFlags = (): string[] => {
    const envCookiePath = process.env.YOUTUBE_COOKIES_FILE || process.env.COOKIES_FILE;
    if (envCookiePath && fs.existsSync(envCookiePath)) {
        console.log(`[YT-DLP] Using YouTube cookies file: ${envCookiePath}`);
        return ['--cookies', envCookiePath];
    }
    
    const serverCookiePaths = [
        path.join(process.cwd(), 'cookies.txt'),
        path.join(process.cwd(), 'src', 'cookies.txt'),
        path.join(process.cwd(), 'temp', 'cookies.txt'),
        path.join(process.cwd(), '..', 'cookies.txt')
    ];
    for (const p of serverCookiePaths) {
        if (fs.existsSync(p)) {
            console.log(`[YT-DLP] Using detected YouTube cookies file: ${p}`);
            return ['--cookies', p];
        }
    }

    const browser = process.env.YOUTUBE_COOKIES_BROWSER;
    if (browser) {
        console.log(`[YT-DLP] Using cookies from browser: ${browser}`);
        return ['--cookies-from-browser', browser];
    }

    return [];
};

// Retrieve sorted list of clients for a specific proxy, prioritizing healthy ones
const getPrioritizedClients = (proxyUrl: string | null): string[] => {
    const now = Date.now();
    const healthy: string[] = [];
    const cooldowned: string[] = [];

    for (const client of ALL_CLIENTS) {
        const key = getClientKey(proxyUrl, client);
        const state = clientStateMap.get(key);
        if (state && now < state.rateLimitedUntil) {
            cooldowned.push(client);
        } else {
            healthy.push(client);
        }
    }

    healthy.sort((a, b) => {
        const keyA = getClientKey(proxyUrl, a);
        const keyB = getClientKey(proxyUrl, b);
        const lastA = clientStateMap.get(keyA)?.lastSuccess || 0;
        const lastB = clientStateMap.get(keyB)?.lastSuccess || 0;
        return lastB - lastA;
    });

    if (healthy.length === 0) {
        return ALL_CLIENTS;
    }

    return [...healthy, ...cooldowned];
};

const markClientSuccess = (proxyUrl: string | null, client: string) => {
    const key = getClientKey(proxyUrl, client);
    const state = clientStateMap.get(key) || { rateLimitedUntil: 0, consecutiveFailures: 0, lastSuccess: 0 };
    state.consecutiveFailures = 0;
    state.rateLimitedUntil = 0;
    state.lastSuccess = Date.now();
    clientStateMap.set(key, state);
};

const markClientRateLimited = (proxyUrl: string | null, client: string) => {
    const key = getClientKey(proxyUrl, client);
    const state = clientStateMap.get(key) || { rateLimitedUntil: 0, consecutiveFailures: 0, lastSuccess: 0 };
    state.consecutiveFailures += 1;
    const backoffMs = Math.min(30000 * Math.pow(2, state.consecutiveFailures - 1), 5 * 60 * 1000);
    state.rateLimitedUntil = Date.now() + backoffMs;
    clientStateMap.set(key, state);
    console.warn(`[YT-DLP] Client '${client}' on proxy '${proxyUrl || 'direct'}' placed in ${Math.round(backoffMs / 1000)}s cooldown.`);
};

export const executeYtDlpWithRetry = async (baseArgs: string[]): Promise<string> => {
    let lastError: any;
    let currentProxyUrl = await getActiveProxyConfig();
    let proxyActive = !!currentProxyUrl;

    const cookieFlags = getCookieFlags();

    const standardFlags = [
        '--no-playlist',
        '--no-check-certificates',
        '--no-cache-dir',
        ...cookieFlags
    ];

    const pool = await getProxyPool();
    const proxyAttempts = Math.max(1, pool.length);

    for (let proxyAttempt = 0; proxyAttempt < proxyAttempts; proxyAttempt++) {
        const clientsToTry = getPrioritizedClients(currentProxyUrl);

        for (const client of clientsToTry) {
            const key = getClientKey(currentProxyUrl, client);
            const state = clientStateMap.get(key);
            if (state && Date.now() < state.rateLimitedUntil && clientsToTry.indexOf(client) < clientsToTry.length - 1) {
                continue;
            }

            try {
                const currentArgs = [
                    ...baseArgs,
                    ...standardFlags,
                    '--extractor-args', `youtube:player_client=${client}`
                ];

                if (proxyActive && currentProxyUrl) {
                    currentArgs.push('--proxy', currentProxyUrl);
                }

                console.log(`[YT-DLP] Attempting with client: ${client}${proxyActive ? ` (via ${currentProxyUrl})` : ' (direct)'}`);
                const result = await ytDlpWrap.execPromise(currentArgs);
                console.log(`[YT-DLP] Success with client: ${client} (proxy: ${currentProxyUrl || 'direct'})`);
                
                markClientSuccess(currentProxyUrl, client);
                if (proxyActive && currentProxyUrl) {
                    setWorkingProxy(currentProxyUrl);
                }
                return result;

            } catch (e: any) {
                const msg = e?.message || '';
                const isProxyError = msg.includes('Unable to connect to proxy') || 
                                     msg.includes('ProxyError') || 
                                     msg.includes('WinError 10061') || 
                                     msg.includes('ECONNREFUSED');

                const isRateLimit = msg.includes('HTTP Error 429') || msg.includes('Too Many Requests');
                const isForbidden = msg.includes('HTTP Error 403') || msg.includes('Sign in to confirm');
                const isPOToken = msg.includes('PO Token');

                if (isRateLimit || isForbidden || isPOToken) {
                    markClientRateLimited(currentProxyUrl, client);
                }

                const errorLabel = isRateLimit ? 'Rate Limited' : isForbidden ? 'Forbidden' : isPOToken ? 'PO Token' : isProxyError ? 'Proxy Error' : 'Generic Error';
                console.warn(`[YT-DLP] Client '${client}' failed on '${currentProxyUrl || 'direct'}'. (Error: ${errorLabel})`);
                lastError = e;

                await delay(200 + Math.random() * 200);
            }
        }

        // If all clients failed on the current proxy, rotate proxy for the next attempt
        if (proxyActive && pool.length > 1) {
            console.warn(`[YT-DLP] All clients failed on proxy '${currentProxyUrl}'. Rotating proxy...`);
            const nextProxy = await rotateProxy();
            if (nextProxy && nextProxy !== currentProxyUrl) {
                currentProxyUrl = nextProxy;
            } else {
                proxyActive = false;
            }
        } else {
            break;
        }
    }

    // Final fallback: direct IP pass across standard reliable clients
    if (currentProxyUrl && proxyActive) {
        console.warn("[YT-DLP] All proxy attempts failed. Performing direct IP pass across healthy clients...");
        for (const client of ALL_CLIENTS) {
            try {
                const directArgs = [
                    ...baseArgs,
                    ...standardFlags,
                    '--extractor-args', `youtube:player_client=${client}`
                ];
                const result = await ytDlpWrap.execPromise(directArgs);
                console.log(`[YT-DLP] Direct connection fallback succeeded with client: ${client}`);
                markClientSuccess(null, client);
                return result;
            } catch (err) {
                lastError = err;
            }
        }
    }

    console.error("[YT-DLP] All clients and proxies exhausted.");
    throw lastError;
};
