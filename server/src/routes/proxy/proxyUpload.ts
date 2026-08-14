import { Router } from 'express';
import { 
  makeRequestWithRetry, 
  getActiveProxyConfig, 
  createAxiosClient, 
  directAxiosClient 
} from '../../proxy';

export const proxyUploadRouter = Router();

// YouTube upload init proxy
proxyUploadRouter.post('/upload-init', async (req, res) => {
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
proxyUploadRouter.put('/upload-finish', async (req, res) => {
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
        timeout: 0,
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
proxyUploadRouter.get('/captions', async (req, res) => {
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
proxyUploadRouter.get('/download-caption', async (req, res) => {
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
