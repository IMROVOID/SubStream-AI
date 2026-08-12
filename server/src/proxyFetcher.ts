import { directAxiosClient, checkPortOpen, createAxiosClient } from './proxy';

interface ValidatedProxy {
    url: string;
    lastTested: number;
    latency: number;
}

let activeVerifiedProxies: ValidatedProxy[] = [];
let isFetching = false;

// ponytail: Auto-fetch fresh proxies from iplocate/free-proxy-list repository
export async function fetchFreeProxyList(): Promise<string[]> {
    const urls = [
        'https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt',
        'https://raw.githubusercontent.com/iplocate/free-proxy-list/main/all-proxies.txt'
    ];

    const rawProxies = new Set<string>();

    for (const url of urls) {
        try {
            const res = await directAxiosClient.get(url, { timeout: 10000, responseType: 'text' });
            if (typeof res.data === 'string') {
                const lines = res.data.split(/\r?\n/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(trimmed)) {
                        rawProxies.add(`http://${trimmed}`);
                    }
                }
            }
        } catch (e: any) {
            console.warn(`[ProxyFetcher] Could not fetch ${url}: ${e?.message}`);
        }
    }

    return Array.from(rawProxies);
}

// ponytail: Test YouTube HTTPS proxy connectivity using YouTube's generate_204 endpoint
export async function testProxyConnectivity(proxyUrl: string, timeoutMs = 2500): Promise<boolean> {
    try {
        const parsed = new URL(proxyUrl);
        const port = parseInt(parsed.port || '80', 10);
        const host = parsed.hostname;
        const portOpen = await checkPortOpen(host, port, 1000);
        if (!portOpen) return false;

        const client = createAxiosClient(proxyUrl);
        const res = await client.get('https://www.youtube.com/generate_204', {
            timeout: timeoutMs,
            validateStatus: (status) => status >= 200 && status < 400
        });
        return res.status === 204 || res.status === 200;
    } catch (e) {
        return false;
    }
}

export async function refreshProxyPool(): Promise<void> {
    if (isFetching) return;
    isFetching = true;
    try {
        console.log('[ProxyFetcher] Fetching fresh proxies from iplocate/free-proxy-list repository...');
        const candidates = await fetchFreeProxyList();
        console.log(`[ProxyFetcher] Fetched ${candidates.length} proxy candidates. Testing YouTube SSL connectivity...`);

        const tested: ValidatedProxy[] = [];
        const BATCH_SIZE = 30;
        for (let i = 0; i < Math.min(candidates.length, 250); i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
                batch.map(async (p) => {
                    const start = Date.now();
                    const works = await testProxyConnectivity(p, 2500);
                    if (works) {
                        return { url: p, lastTested: Date.now(), latency: Date.now() - start };
                    }
                    return null;
                })
            );
            results.forEach(r => { if (r) tested.push(r); });
            if (tested.length > 0) {
                tested.sort((a, b) => a.latency - b.latency);
                activeVerifiedProxies = [...tested];
            }
            if (tested.length >= 10) break;
        }

        console.log(`[ProxyFetcher] Dynamic proxy pool initialized with ${activeVerifiedProxies.length} verified live YouTube proxies.`);
    } catch (err: any) {
        console.error('[ProxyFetcher] Error refreshing proxy pool:', err?.message);
    } finally {
        isFetching = false;
    }
}

export function getVerifiedProxies(): string[] {
    return activeVerifiedProxies.map(p => p.url);
}

export function startAutoProxyFetcher(): void {
    refreshProxyPool();
    // Refresh proxy list every 20 minutes
    setInterval(() => {
        refreshProxyPool();
    }, 20 * 60 * 1000);
}
