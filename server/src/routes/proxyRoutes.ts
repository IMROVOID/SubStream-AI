import { Router } from 'express';
import { 
    makeRequestWithRetry, 
    getActiveProxyConfig, 
    createAxiosClient, 
    directAxiosClient 
} from '../proxy';

export const proxyRouter = Router();

// General file head check
proxyRouter.get('/file-head', async (req, res) => {
    const url = req.query.url as string;
    const proxyAuth = req.headers['x-proxy-auth'] as string;

    if (!url) return res.status(400).json({ error: "Missing URL" });

    const baseHeaders: Record<string, string> = {};
    if (proxyAuth) baseHeaders['Authorization'] = proxyAuth;

    // Tier 1: Try HEAD request
    try {
        const response = await makeRequestWithRetry({ method: 'head', url, headers: { ...baseHeaders } });
        if (response.status >= 200 && response.status < 400) {
            return res.json({
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-length'],
                ok: true
            });
        }
    } catch (e: any) {
        // Fall through to Tier 2
    }

    // Tier 2: Try GET with Range header
    try {
        const response = await makeRequestWithRetry({ 
            method: 'get', 
            url, 
            headers: { ...baseHeaders, Range: 'bytes=0-1' } 
        });
        if (response.status >= 200 && response.status < 400) {
            const rangeLength = response.headers['content-range'] ? response.headers['content-range'].split('/')[1] : null;
            return res.json({
                contentType: response.headers['content-type'],
                contentLength: rangeLength || response.headers['content-length'],
                ok: true
            });
        }
    } catch (e: any) {
        // Fall through to Tier 3
    }

    // Tier 3: Try GET with responseType 'stream' and immediately destroy stream after reading headers
    try {
        const response = await makeRequestWithRetry({ 
            method: 'get', 
            url, 
            headers: { ...baseHeaders },
            responseType: 'stream'
        });
        
        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];
        
        // Immediately destroy response stream to avoid downloading full file body
        if (response.data && typeof response.data.destroy === 'function') {
            response.data.destroy();
        }

        if (response.status >= 200 && response.status < 400) {
            return res.json({
                contentType,
                contentLength,
                ok: true
            });
        }
    } catch (innerError: any) {
        console.error("Proxy file-head all tiers failed:", innerError?.message);
    }

    return res.status(400).json({ error: "Could not access URL" });
});

// General file get streaming
proxyRouter.get('/file-get', async (req, res) => {
    const url = req.query.url as string;
    const token = req.query.token as string;
    let proxyAuth = req.headers['x-proxy-auth'] as string;

    if (!url) return res.status(400).json({ error: "Missing URL" });

    if (!proxyAuth && token) {
        proxyAuth = `Bearer ${token}`;
    }

    try {
        const headers: Record<string, string> = {};
        if (proxyAuth) headers['Authorization'] = proxyAuth;

        let response;
        try {
            const currentProxyUrl = await getActiveProxyConfig();
            const client = createAxiosClient(currentProxyUrl);
            response = await client({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: headers
            });
        } catch (err: any) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                console.warn('[Proxy] Proxy file-get failed, retrying directly...');
                response = await directAxiosClient({
                    method: 'get',
                    url: url,
                    responseType: 'stream',
                    headers: headers
                });
            } else {
                throw err;
            }
        }

        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);

        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        response.data.pipe(res);

    } catch (e: any) {
        console.error("Proxy File Get Error:", e?.message);
        res.status(500).send("Failed to fetch file via proxy.");
    }
});

// Google Drive file list proxy
proxyRouter.get('/drive/list', async (req, res) => {
    const { token, query, fields, orderBy, pageSize } = req.query;

    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: 'https://www.googleapis.com/drive/v3/files',
            params: { q: query, fields, orderBy, pageSize },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (e: any) {
        const errorData = e.response ? e.response.data : { error: e.message };
        const status = e.response ? e.response.status : 500;
        
        console.error("Drive List Proxy Error:", JSON.stringify(errorData, null, 2));
        res.status(status).json(errorData);
    }
});

// YouTube upload init proxy
proxyRouter.post('/upload-init', async (req, res) => {
    const { token, metadata, fileType, fileSize } = req.body;

    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        console.log("Proxy: Initiating Upload...");
        const response = await makeRequestWithRetry({
            method: 'post',
            url: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            data: metadata,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Length': fileSize,
                'X-Upload-Content-Type': fileType
            }
        });
        
        console.log("Proxy: Upload URL received.");
        res.json({ location: response.headers.location });
    } catch (e: any) {
        const status = e.response?.status || 500;
        const data = e.response?.data || { error: e.message };
        
        console.error(`Proxy Upload Init Error (${status}):`);
        if (e.code) console.error(`Error Code: ${e.code}`);
        if (data) console.error(JSON.stringify(data, null, 2));
        
        res.status(status).json(data);
    }
});

// YouTube upload finish binary stream proxy
proxyRouter.put('/upload-finish', async (req, res) => {
    const uploadUrl = req.headers['x-upload-url'] as string;
    const contentType = req.headers['content-type'] as string;
    const contentLength = req.headers['content-length'] as string;

    if (!uploadUrl) {
        return res.status(400).json({ error: "Missing 'x-upload-url' header" });
    }

    try {
        console.log("Proxy: Streaming binary upload to Google...");
        
        let response;
        try {
            const currentProxyUrl = await getActiveProxyConfig();
            const client = createAxiosClient(currentProxyUrl);
            response = await client({
                method: 'put',
                url: uploadUrl,
                data: req, 
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': contentLength
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 0, // Disable timeout for large video uploads
                responseType: 'json' 
            });
        } catch (err: any) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                console.warn('[Proxy] Proxy upload-finish failed, retrying directly...');
                response = await directAxiosClient({
                    method: 'put',
                    url: uploadUrl,
                    data: req, 
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': contentLength
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 0,
                    responseType: 'json' 
                });
            } else {
                throw err;
            }
        }

        console.log("Proxy: Upload completed successfully.");
        res.json(response.data);

    } catch (e: any) {
        console.error("Proxy Upload Finish Error:", e?.message);
        const status = e.response?.status || 500;
        const data = e.response?.data || { error: e.message };
        res.status(status).json(data);
    }
});

// YouTube captions list proxy
proxyRouter.get('/captions', async (req, res) => {
    const { token, videoId } = req.query;

    if (!token || !videoId) return res.status(400).json({ error: "Missing params" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: 'https://www.googleapis.com/youtube/v3/captions',
            params: { part: 'snippet', videoId },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (e: any) {
        res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
    }
});

// YouTube caption download proxy
proxyRouter.get('/download-caption', async (req, res) => {
    const { token, captionId } = req.query;

    if (!token || !captionId) return res.status(400).json({ error: "Missing params" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: `https://www.googleapis.com/youtube/v3/captions/${captionId}`,
            params: { tfmt: 'srt' },
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'text'
        });
        res.send(response.data);
    } catch (e: any) {
        res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
    }
});
