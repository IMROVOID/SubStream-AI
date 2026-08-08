import net from 'net';
import { execSync } from 'child_process';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const checkPortOpen = (host: string, port: number, timeout = 300): Promise<boolean> => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
};

export const getWindowsRegistryProxy = (): string | null => {
    if (process.platform !== 'win32') return null;
    try {
        const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        const enabledMatch = out.match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+)/);
        const serverMatch = out.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
        if (enabledMatch && parseInt(enabledMatch[1], 16) === 1 && serverMatch) {
            let rawProxy = serverMatch[1].trim();
            if (rawProxy.includes('=')) {
                const httpPart = rawProxy.split(';').find(p => p.startsWith('http=') || p.startsWith('https='));
                if (httpPart) rawProxy = httpPart.split('=')[1];
            }
            if (!rawProxy.startsWith('http://') && !rawProxy.startsWith('https://') && !rawProxy.startsWith('socks://')) {
                rawProxy = 'http://' + rawProxy;
            }
            return rawProxy;
        }
    } catch (e) {}
    return null;
};

export const getSystemProxy = async (): Promise<string | null> => {
    // 1. Check Environment Variables first
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (envProxy) return envProxy;

    // 2. Check Windows System Registry proxy configuration
    const regProxy = getWindowsRegistryProxy();
    if (regProxy) {
        try {
            const parsed = new URL(regProxy);
            const port = parseInt(parsed.port || '80', 10);
            const host = parsed.hostname || '127.0.0.1';
            if (await checkPortOpen(host, port)) {
                return regProxy;
            }
        } catch (e) {}
    }

    // 3. Scan common local proxy ports
    const commonPorts = [12334, 10809, 7890, 7897, 10808, 1080, 8080];
    for (const port of commonPorts) {
        if (await checkPortOpen('127.0.0.1', port)) {
            return `http://127.0.0.1:${port}`;
        }
    }

    return null;
};

export const directAxiosClient = axios.create({
    timeout: 60000,
    headers: { 
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    },
    maxBodyLength: Infinity, 
    maxContentLength: Infinity,
    proxy: false
});

export const createAxiosClient = (proxyUrl: string | null) => {
    const config: AxiosRequestConfig = {
        timeout: 60000, // Default 60s timeout
        headers: { 
            'Cache-Control': 'no-cache',
            // Spoof User-Agent to look like a browser (helps with Google API checks)
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        maxBodyLength: Infinity, 
        maxContentLength: Infinity
    };

    if (proxyUrl) {
        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            config.httpsAgent = agent;
            config.proxy = false; 
        } catch (e: any) {
            console.warn("[Server] Invalid Proxy URL format. Falling back to direct.", e?.message);
        }
    } else {
        config.proxy = false; 
    }

    return axios.create(config);
};

let cachedProxyUrl: string | null = null;
let lastProxyCheckTime = 0;
const PROXY_RECHECK_INTERVAL = 3000; // 3 seconds TTL for dynamic adaptation

export const getActiveProxyConfig = async (): Promise<string | null> => {
    const now = Date.now();
    if (lastProxyCheckTime === 0 || (now - lastProxyCheckTime) > PROXY_RECHECK_INTERVAL) {
        const detected = await getSystemProxy();
        if (detected !== cachedProxyUrl) {
            cachedProxyUrl = detected;
            console.log(`[Server] Network Proxy Configuration: ${cachedProxyUrl ? cachedProxyUrl : 'Direct Connection'}`);
        }
        lastProxyCheckTime = now;
    }
    return cachedProxyUrl;
};

// Retry Helper for Axios with Proxy Fallback
export const makeRequestWithRetry = async (config: AxiosRequestConfig, retries = 3): Promise<AxiosResponse<any>> => {
    const currentProxyUrl = await getActiveProxyConfig();
    const client = createAxiosClient(currentProxyUrl);
    try {
        return await client(config);
    } catch (error: any) {
        const isProxyError = error.code === 'ECONNREFUSED' || 
                             error.code === 'ENOTFOUND' || 
                             (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('Unable to connect to proxy')));

        if (isProxyError && currentProxyUrl) {
            console.warn(`[Proxy] Proxy request failed (${error.message || error.code}). Retrying with direct connection...`);
            try {
                return await directAxiosClient(config);
            } catch (directErr) {
                throw directErr;
            }
        }

        const isNetworkError = !error.response && (
            error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' || 
            error.code === 'ERR_BAD_RESPONSE' ||
            (error.message && error.message.includes('socket disconnected')) ||
            (error.message && error.message.includes('timeout'))
        );
        
        if (isNetworkError && retries > 0) {
            console.log(`[Proxy] Network error (${error.message || error.code}). Retrying... (${retries} left)`);
            await new Promise(r => setTimeout(r, 2000));
            return makeRequestWithRetry(config, retries - 1);
        }
        throw error;
    }
};
