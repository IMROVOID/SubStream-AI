import { directAxiosClient } from './proxy';

export const translateSrtChunk = async (text: string, targetLang: string): Promise<string> => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
    const body = new URLSearchParams({ q: text }).toString();
    const response = await directAxiosClient.post(url, body, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (response.data && response.data[0]) {
        return response.data[0].map((x: any) => x[0]).join('');
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
                    const singleTranslated = await translateSrtChunk(b, targetLang);
                    translatedBlocks.push(singleTranslated);
                } catch (e) {
                    translatedBlocks.push(b);
                }
            }
        }
    }

    return translatedBlocks.join('\n\n');
};
