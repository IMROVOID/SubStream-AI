// ponytail: Simple Map-based LRU cache with TTL expiry to prevent memory leaks and eliminate redundant yt-dlp executions.

export function extractVideoId(urlOrId: string): string {
    if (!urlOrId) return '';
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : trimmed;
}

interface CacheItem<T> {
    value: T;
    expiresAt: number;
}

export class SimpleLRUCache<T> {
    private cache = new Map<string, CacheItem<T>>();
    private maxCapacity: number;
    private defaultTtlMs: number;

    constructor(maxCapacity = 200, defaultTtlMs = 4 * 60 * 60 * 1000) {
        this.maxCapacity = maxCapacity;
        this.defaultTtlMs = defaultTtlMs;
    }

    get(key: string): T | null {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        // Move key to end to preserve LRU order
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    set(key: string, value: T, ttlMs?: number): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxCapacity) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
        this.cache.set(key, { value, expiresAt });
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }
}

// 4-hour TTL for video metadata (info & format URLs)
export const metadataCache = new SimpleLRUCache<any>(200, 4 * 60 * 60 * 1000);

// 24-hour TTL for parsed/translated SRT subtitle content
export const captionCache = new SimpleLRUCache<string>(500, 24 * 60 * 60 * 1000);
