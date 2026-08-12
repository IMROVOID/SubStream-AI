import { directAxiosClient, makeRequestWithRetry } from './proxy';

// ponytail: Convert WebVTT to SRT timestamp format (00:00:00,000) and strip VTT headers/tags
export function vttToSrt(vttContent: string): string {
    if (!vttContent) return '';
    let lines = vttContent.replace(/^WEBVTT[^\n]*\n+/i, '').split(/\r?\n/);
    let srtResult: string[] = [];
    let counter = 1;
    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.includes('-->')) {
            const timestampLine = line
                .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
                .replace(/(\d{2}:\d{2})\.(\d{3})/g, '00:$1,$2');
            srtResult.push(String(counter++));
            srtResult.push(timestampLine);
            inBlock = true;
        } else if (line === '') {
            if (inBlock) {
                srtResult.push('');
                inBlock = false;
            }
        } else if (inBlock) {
            const cleanText = line.replace(/<[^>]*>/g, '');
            if (cleanText) srtResult.push(cleanText);
        }
    }
    return srtResult.join('\n');
}

// ponytail: Convert YouTube native JSON3 subtitle structure to clean SRT format
export function json3ToSrt(jsonStrOrObj: any): string {
    let data: any;
    try {
        data = typeof jsonStrOrObj === 'string' ? JSON.parse(jsonStrOrObj) : jsonStrOrObj;
    } catch (e) {
        return '';
    }

    if (!data || !data.events || !Array.isArray(data.events)) return '';
    let srt = '';
    let count = 1;

    for (const ev of data.events) {
        if (!ev.segs || !Array.isArray(ev.segs) || ev.segs.length === 0) continue;
        const text = ev.segs.map((s: any) => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
        if (!text) continue;

        const startMs = ev.tStartMs || 0;
        const durationMs = ev.dDurationMs || 0;
        const endMs = startMs + durationMs;

        const formatMs = (ms: number) => {
            const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
            const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
            const msec = String(ms % 1000).padStart(3, '0');
            return `${h}:${m}:${s},${msec}`;
        };

        srt += `${count++}\n${formatMs(startMs)} --> ${formatMs(endMs)}\n${text}\n\n`;
    }
    return srt;
}

// ponytail: Direct HTTP fetch for YouTube signed subtitle track (supporting WebVTT & JSON3 formats)
export const fetchDirectSubtitleTrack = async (url: string): Promise<string> => {
    const response = await makeRequestWithRetry({
        url: url,
        method: 'GET',
        responseType: 'text',
        timeout: 15000
    });
    const rawData = response.data;
    if (typeof rawData === 'string') {
        if (rawData.includes('WEBVTT') || rawData.includes('-->')) {
            return rawData.includes('WEBVTT') ? vttToSrt(rawData) : rawData;
        }
        if (rawData.trim().startsWith('{') && rawData.includes('"events"')) {
            return json3ToSrt(rawData);
        }
    } else if (typeof rawData === 'object') {
        return json3ToSrt(rawData);
    }
    return String(rawData);
};

export const translateSrtChunk = async (text: string, targetLang: string): Promise<string> => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
    const body = new URLSearchParams({ q: text }).toString();
    try {
        const response = await directAxiosClient.post(url, body, {
            timeout: 15000,
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        if (response.data && response.data[0]) {
            return response.data[0].map((x: any) => x[0]).join('');
        }
    } catch (e: any) {
        const response = await makeRequestWithRetry({
            url,
            method: 'POST',
            data: body,
            timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (response.data && response.data[0]) {
            return response.data[0].map((x: any) => x[0]).join('');
        }
    }
    throw new Error('Translation API returned invalid structure');
};

export const translateSrtContent = async (srtContent: string, targetLang: string): Promise<string> => {
    if (!srtContent || targetLang === 'en') return srtContent;

    const blocks = srtContent.trim().split(/\r?\n\r?\n/);
    const translatedBlocks: string[] = [];

    const CHUNK_SIZE = 50;
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunkBlocks = blocks.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkBlocks.join('\n\n');
        try {
            const translatedText = await translateSrtChunk(chunkText, targetLang);
            translatedBlocks.push(translatedText);
        } catch (err: any) {
            console.warn(`[Translate] Chunk translation warning (${err?.message}). Retrying block by block...`);
            for (const b of chunkBlocks) {
                try {
                    await new Promise(r => setTimeout(r, 100));
                    const singleTranslated = await translateSrtChunk(b, targetLang);
                    translatedBlocks.push(singleTranslated);
                } catch (e) {
                    translatedBlocks.push(b);
                }
            }
        }
        await new Promise(r => setTimeout(r, 150));
    }

    return translatedBlocks.join('\n\n');
};
