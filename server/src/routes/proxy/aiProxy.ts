import { Router, Request, Response } from 'express';
import { makeRequestWithRetry } from '../../proxy';

export const aiProxyRouter = Router();

// Helper to filter and prepare outgoing headers
const extractHeaders = (req: Request, allowedHeaderNames: string[]): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const name of allowedHeaderNames) {
    const val = req.headers[name.toLowerCase()];
    if (val) {
      headers[name] = Array.isArray(val) ? val.join('; ') : val;
    }
  }
  return headers;
};

// Generic forwarder for OpenAI
aiProxyRouter.all('/openai/*', async (req: Request, res: Response) => {
  const rawPath = req.originalUrl.split('?')[0];
  const subPath = rawPath.replace(/^\/api\/proxy\/ai\/openai/, '');
  const targetUrl = `https://api.openai.com${subPath}`;

  const headers = extractHeaders(req, [
    'authorization',
    'content-type',
    'content-length',
    'openai-organization',
    'openai-project',
    'user-agent'
  ]);

  try {
    const isGetOrHead = ['GET', 'HEAD'].includes(req.method.toUpperCase());
    const response = await makeRequestWithRetry({
      method: req.method as any,
      url: targetUrl,
      params: req.query,
      data: isGetOrHead ? undefined : (req.is('multipart/form-data') ? req : req.body),
      headers,
      validateStatus: () => true // Allow all status codes (including 400, 401, 429) to pass through cleanly
    });

    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`[AI Proxy] OpenAI Error on ${subPath}:`, error?.message);
    const status = error.response?.status || 502;
    const data = error.response?.data || {
      error: {
        message: error.message || 'AI Proxy failed to reach OpenAI'
      }
    };
    res.status(status).json(data);
  }
});

// Generic forwarder for Anthropic
aiProxyRouter.all('/anthropic/*', async (req: Request, res: Response) => {
  const rawPath = req.originalUrl.split('?')[0];
  const subPath = rawPath.replace(/^\/api\/proxy\/ai\/anthropic/, '');
  const targetUrl = `https://api.anthropic.com${subPath}`;

  const headers = extractHeaders(req, [
    'x-api-key',
    'anthropic-version',
    'anthropic-dangerous-direct-browser-access',
    'anthropic-beta',
    'authorization',
    'content-type',
    'content-length',
    'user-agent'
  ]);

  // Default anthropic-version if not provided
  if (!headers['anthropic-version']) {
    headers['anthropic-version'] = '2023-06-01';
  }

  try {
    const isGetOrHead = ['GET', 'HEAD'].includes(req.method.toUpperCase());
    const response = await makeRequestWithRetry({
      method: req.method as any,
      url: targetUrl,
      params: req.query,
      data: isGetOrHead ? undefined : req.body,
      headers,
      validateStatus: () => true
    });

    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`[AI Proxy] Anthropic Error on ${subPath}:`, error?.message);
    const status = error.response?.status || 502;
    const data = error.response?.data || {
      error: {
        message: error.message || 'AI Proxy failed to reach Anthropic'
      }
    };
    res.status(status).json(data);
  }
});

// Generic forwarder for Google Generative AI
aiProxyRouter.all('/google/*', async (req: Request, res: Response) => {
  const rawPath = req.originalUrl.split('?')[0];
  const subPath = rawPath.replace(/^\/api\/proxy\/ai\/google/, '');
  const targetUrl = `https://generativelanguage.googleapis.com${subPath}`;

  const headers = extractHeaders(req, [
    'x-goog-api-key',
    'x-goog-api-client',
    'authorization',
    'content-type',
    'content-length',
    'user-agent'
  ]);

  try {
    const isGetOrHead = ['GET', 'HEAD'].includes(req.method.toUpperCase());
    const response = await makeRequestWithRetry({
      method: req.method as any,
      url: targetUrl,
      params: req.query,
      data: isGetOrHead ? undefined : req.body,
      headers,
      validateStatus: () => true
    });

    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`[AI Proxy] Google Error on ${subPath}:`, error?.message);
    const status = error.response?.status || 502;
    const data = error.response?.data || {
      error: {
        message: error.message || 'AI Proxy failed to reach Google Generative Language API'
      }
    };
    res.status(status).json(data);
  }
});

// Generic forwarder for OpenRouter
aiProxyRouter.all('/openrouter/*', async (req: Request, res: Response) => {
  const rawPath = req.originalUrl.split('?')[0];
  const subPath = rawPath.replace(/^\/api\/proxy\/ai\/openrouter/, '');
  const targetUrl = `https://openrouter.ai${subPath}`;

  const headers = extractHeaders(req, [
    'authorization',
    'content-type',
    'content-length',
    'user-agent',
    'http-referer',
    'x-title',
    'accept'
  ]);

  try {
    const isGetOrHead = ['GET', 'HEAD'].includes(req.method.toUpperCase());
    const response = await makeRequestWithRetry({
      method: req.method as any,
      url: targetUrl,
      params: req.query,
      data: isGetOrHead ? undefined : req.body,
      headers,
      validateStatus: () => true
    });

    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`[AI Proxy] OpenRouter Error on ${subPath}:`, error?.message);
    const status = error.response?.status || 502;
    const data = error.response?.data || {
      error: {
        message: error.message || 'AI Proxy failed to reach OpenRouter'
      }
    };
    res.status(status).json(data);
  }
});

// Generic forwarder for LiteLLM
aiProxyRouter.all('/litellm/*', async (req: Request, res: Response) => {
  const rawPath = req.originalUrl.split('?')[0];
  const subPath = rawPath.replace(/^\/api\/proxy\/ai\/litellm/, '');
  const targetUrl = `https://raw.githubusercontent.com/BerriAI/litellm/main${subPath || '/model_prices_and_context_window.json'}`;

  const headers = extractHeaders(req, [
    'accept',
    'user-agent'
  ]);

  try {
    const response = await makeRequestWithRetry({
      method: 'GET',
      url: targetUrl,
      params: req.query,
      headers,
      validateStatus: () => true
    });

    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error(`[AI Proxy] LiteLLM Error on ${subPath}:`, error?.message);
    const status = error.response?.status || 502;
    const data = error.response?.data || {
      error: {
        message: error.message || 'AI Proxy failed to reach LiteLLM definitions'
      }
    };
    res.status(status).json(data);
  }
});

