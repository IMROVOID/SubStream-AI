import fs from 'fs';
import YTDlpWrap from 'yt-dlp-wrap';
import { YT_DLP_BINARY_PATH } from './config';
import { getActiveProxyConfig, createAxiosClient } from './proxy';

export const ytDlpWrap = new YTDlpWrap(YT_DLP_BINARY_PATH);

export const downloadBinaryWithProxy = async (): Promise<void> => {
    const platform = process.platform;
    let fileName = 'yt-dlp';
    if (platform === 'win32') fileName = 'yt-dlp.exe';
    else if (platform === 'darwin') fileName = 'yt-dlp_macos';

    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
    console.log(`[Server] Downloading ${fileName} from GitHub...`);

    const writer = fs.createWriteStream(YT_DLP_BINARY_PATH);

    const currentProxyUrl = await getActiveProxyConfig();
    const client = createAxiosClient(currentProxyUrl);
    const response = await client({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 0 // No timeout for download
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('[Server] yt-dlp binary downloaded successfully.');
            if (platform !== 'win32') {
                try { fs.chmodSync(YT_DLP_BINARY_PATH, '755'); } catch (e) {}
            }
            resolve();
        });
        writer.on('error', reject);
    });
};

export const ensureBinary = async (): Promise<void> => {
    let isValid = false;

    // 1. Check if exists
    if (fs.existsSync(YT_DLP_BINARY_PATH)) {
        try {
            // 2. Try to run version check to verify integrity
            await ytDlpWrap.execPromise(['--version']);
            isValid = true;
        } catch (e: any) {
            console.error(`[Server] Existing yt-dlp binary is corrupted (Error: ${e?.message?.split('\n')[0]}). Deleting...`);
            try { fs.unlinkSync(YT_DLP_BINARY_PATH); } catch (delErr) {}
        }
    }

    // 3. Download if missing or deleted
    if (!isValid) {
        try {
            await downloadBinaryWithProxy();
        } catch (err: any) {
            console.error('[Server] Failed to download yt-dlp binary:', err?.message);
            // Fallback: Try library default if custom proxy download fails
            try {
                console.log('[Server] Attempting fallback download...');
                await YTDlpWrap.downloadFromGithub(YT_DLP_BINARY_PATH);
            } catch (fallbackErr) {
                console.error('[Server] Fallback download also failed.');
            }
        }
    }
};
