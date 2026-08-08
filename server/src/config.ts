import path from 'path';
import fs from 'fs';

export const PORT = 4000;
export const TEMP_DIR = path.join(__dirname, '..', 'temp');
export const YT_DLP_BINARY_PATH = path.join(
    __dirname,
    '..',
    'yt-dlp' + (process.platform === 'win32' ? '.exe' : '')
);

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
