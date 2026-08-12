import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { TEMP_DIR } from './config';

const COOKIES_DIR = path.join(__dirname, '..', 'cookies');

if (!fs.existsSync(COOKIES_DIR)) {
    try {
        fs.mkdirSync(COOKIES_DIR, { recursive: true });
    } catch (e) {}
}

export interface LoadedCookie {
    filePath: string;
    type: 'netscape' | 'json';
    cookieHeader?: string;
    isTemp?: boolean;
}

class CookieManager {
    private cookieFiles: LoadedCookie[] = [];

    constructor() {
        this.reloadCookies();
    }

    public reloadCookies(): void {
        this.cookieFiles = [];

        // 1. Method 1: Load Base64-encoded Cookie from Environment Variable (YOUTUBE_COOKIES_BASE64)
        const envBase64 = process.env.YOUTUBE_COOKIES_BASE64 || process.env.COOKIES_BASE64;
        if (envBase64) {
            try {
                const decoded = Buffer.from(envBase64.trim(), 'base64').toString('utf-8');
                const tempFilePath = path.join(TEMP_DIR, `env_sec_cookie_${Date.now()}.txt`);
                fs.writeFileSync(tempFilePath, decoded, { mode: 0o600 });
                const header = this.parseNetscapeToHeader(decoded) || this.parseJsonToHeader(decoded);

                this.cookieFiles.push({
                    filePath: tempFilePath,
                    type: decoded.trim().startsWith('[') || decoded.trim().startsWith('{') ? 'json' : 'netscape',
                    cookieHeader: header,
                    isTemp: true
                });
                console.log(`[CookieManager] Loaded secure in-memory cookie from environment variable (YOUTUBE_COOKIES_BASE64).`);
            } catch (e: any) {
                console.warn(`[CookieManager] Failed to decode YOUTUBE_COOKIES_BASE64 env variable:`, e?.message);
            }
        }

        // 2. Method 2: Load Encrypted Cookie File (server/cookies/*.enc) using COOKIE_SECRET_KEY
        const secretKey = process.env.COOKIE_SECRET_KEY;
        if (fs.existsSync(COOKIES_DIR)) {
            try {
                const files = fs.readdirSync(COOKIES_DIR);
                for (const file of files) {
                    const fullPath = path.join(COOKIES_DIR, file);
                    
                    if (file.endsWith('.enc') && secretKey) {
                        try {
                            const encData = fs.readFileSync(fullPath, 'utf-8');
                            const decrypted = this.decryptText(encData, secretKey);
                            const tempFilePath = path.join(TEMP_DIR, `dec_${file}_${Date.now()}.txt`);
                            fs.writeFileSync(tempFilePath, decrypted, { mode: 0o600 });
                            const header = this.parseNetscapeToHeader(decrypted) || this.parseJsonToHeader(decrypted);

                            this.cookieFiles.push({
                                filePath: tempFilePath,
                                type: decrypted.trim().startsWith('[') || decrypted.trim().startsWith('{') ? 'json' : 'netscape',
                                cookieHeader: header,
                                isTemp: true
                            });
                            console.log(`[CookieManager] Decrypted and loaded encrypted cookie file: ${file}`);
                        } catch (e: any) {
                            console.warn(`[CookieManager] Failed to decrypt ${file}:`, e?.message);
                        }
                    } else if (file.endsWith('.txt')) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const header = this.parseNetscapeToHeader(content);
                        this.cookieFiles.push({
                            filePath: fullPath,
                            type: 'netscape',
                            cookieHeader: header
                        });
                    } else if (file.endsWith('.json')) {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const header = this.parseJsonToHeader(content);
                        this.cookieFiles.push({
                            filePath: fullPath,
                            type: 'json',
                            cookieHeader: header
                        });
                    }
                }
            } catch (e: any) {
                console.warn(`[CookieManager] Error reading cookies directory:`, e?.message);
            }
        }

        if (this.cookieFiles.length > 0) {
            console.log(`[CookieManager] Active cookie pool ready with ${this.cookieFiles.length} source(s).`);
        }
    }

    public getRandomCookieFile(): string | null {
        if (this.cookieFiles.length === 0) {
            if (process.env.YOUTUBE_COOKIES_FILE && fs.existsSync(process.env.YOUTUBE_COOKIES_FILE)) {
                return process.env.YOUTUBE_COOKIES_FILE;
            }
            const defaultTxt = path.join(__dirname, '..', 'cookies.txt');
            if (fs.existsSync(defaultTxt)) return defaultTxt;
            return null;
        }

        const selected = this.cookieFiles[Math.floor(Math.random() * this.cookieFiles.length)];
        return selected.filePath;
    }

    public getRandomCookieHeader(): string | undefined {
        if (this.cookieFiles.length === 0) return undefined;
        const valid = this.cookieFiles.filter(c => c.cookieHeader);
        if (valid.length === 0) return undefined;
        const selected = valid[Math.floor(Math.random() * valid.length)];
        return selected.cookieHeader;
    }

    // Helper: AES-256-CBC Encrypt string
    public encryptText(text: string, keyString: string): string {
        const key = crypto.createHash('sha256').update(keyString).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Helper: AES-256-CBC Decrypt string
    public decryptText(encryptedText: string, keyString: string): string {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) throw new Error('Invalid encrypted format');
        const key = crypto.createHash('sha256').update(keyString).digest();
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    private parseNetscapeToHeader(content: string): string {
        const pairs: string[] = [];
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                const name = parts[5].trim();
                const value = parts[6].trim();
                if (name) pairs.push(`${name}=${value}`);
            }
        }
        return pairs.join('; ');
    }

    private parseJsonToHeader(content: string): string {
        try {
            const data = JSON.parse(content);
            const list = Array.isArray(data) ? data : (data.youtube || []);
            if (!Array.isArray(list)) return '';
            return list.map((item: any) => `${item.name || item.key}=${item.value}`).join('; ');
        } catch (e) {
            return '';
        }
    }
}

export const cookieManager = new CookieManager();
