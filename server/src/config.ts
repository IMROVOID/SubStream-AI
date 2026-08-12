import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from server/.env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
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
