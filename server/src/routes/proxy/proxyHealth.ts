import { Router } from 'express';
import { 
  makeRequestWithRetry, 
  getActiveProxyConfig, 
  createAxiosClient, 
  directAxiosClient 
} from '../../proxy';

export const proxyHealthRouter = Router();

// General file head check
proxyHealthRouter.get('/file-head', async (req, res) => {
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

  // Tier 3: Try GET with responseType 'stream'
  try {
    const response = await makeRequestWithRetry({ 
      method: 'get', 
      url, 
      headers: { ...baseHeaders },
      responseType: 'stream'
    });
    
    const contentType = response.headers['content-type'];
    const contentLength = response.headers['content-length'];
    
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

// General file get streaming (with HTTP Range Request / Seeking support)
proxyHealthRouter.get('/file-get', async (req, res) => {
  const url = req.query.url as string;
  const token = req.query.token as string;
  let proxyAuth = req.headers['x-proxy-auth'] as string;

  if (!url) return res.status(400).json({ error: "Missing URL" });

  if (!proxyAuth && token) {
    proxyAuth = `Bearer ${token}`;
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (proxyAuth) headers['Authorization'] = proxyAuth;
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let response;
    try {
      const currentProxyUrl = await getActiveProxyConfig();
      const client = createAxiosClient(currentProxyUrl);
      response = await client({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: headers,
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        console.warn('[Proxy] Proxy file-get failed, retrying directly...');
        response = await directAxiosClient({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers: headers,
          validateStatus: (status) => status >= 200 && status < 400
        });
      } else {
        throw err;
      }
    }

    res.status(response.status);

    const contentType = response.headers['content-type'];
    const contentLength = response.headers['content-length'];
    const contentRange = response.headers['content-range'];
    const acceptRanges = response.headers['accept-ranges'] || 'bytes';

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    response.data.pipe(res);

  } catch (e: any) {
    console.error("Proxy File Get Error:", e?.message);
    res.status(500).send("Failed to fetch file via proxy.");
  }
});

// Google Drive file list proxy
proxyHealthRouter.get('/drive/list', async (req, res) => {
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
