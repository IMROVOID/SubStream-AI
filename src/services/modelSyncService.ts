import { AIModel, AVAILABLE_MODELS } from '../types';

const SYNC_CACHE_KEY = 'substream_synced_models_v4';
const SYNC_INFO_KEY = 'substream_models_sync_info_v4';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ModelSyncInfo {
  provider: 'OpenRouter' | 'LiteLLM' | 'Static Fallback';
  syncedAt: number;
  count: number;
  error?: string;
}

export interface SyncResult {
  models: AIModel[];
  info: ModelSyncInfo;
}

const EXCLUDED_PATTERNS = [
  'batch', ':batch', '-batch',
  'banana', 'image', 'audio', 'video', 'speech', 'tts', 'whisper', 'realtime', 'vision', 'transcribe', 'diarize', 'music', 'sound', 'lyria',
  'codex', 'chat-latest', 'gpt-chat', 'safeguard', 'oss', 'container', 'search-api', 'robotics', 'computer-use', 'omni-flash',
  'embedding', 'imagen', 'dall-e', 'dalle', 'flux', 'stable-diffusion', 'sdxl', 'midjourney', 'recraft', 'sora', 'runway', 'veo', 'luma', 'pika', 'kling',
  'cogvideo', 'hunyuan', 'wan2', 'gemma', 'exp-', 'customtools', 'search-preview', 'live-translate', 'paygo', 'global.', 'us.', 'eu.', 'au.', 'jp.', 'anthropic.'
];

function isMainTextModel(id: string, name: string, modalities?: { input?: string[]; output?: string[] }): boolean {
  const lowerId = id.toLowerCase();
  const lowerName = (name || '').toLowerCase();

  // Enforce text output
  if (modalities && Array.isArray(modalities.output)) {
    const outputs = modalities.output.map(s => String(s).toLowerCase());
    if (outputs.includes('image') || outputs.includes('video') || outputs.includes('audio')) {
      return false;
    }
    if (!outputs.includes('text')) {
      return false;
    }
  }

  // Reject dated snapshot suffixes (e.g. -2024-05-13, -20241022)
  if (/-\d{4}-\d{2}-\d{2}/.test(lowerId) || /-\d{8}$/.test(lowerId)) {
    return false;
  }

  // Reject excluded patterns against ID and display name
  for (const pat of EXCLUDED_PATTERNS) {
    if (lowerId.includes(pat) || lowerName.includes(pat)) {
      return false;
    }
  }

  return true;
}

function extractModelVersion(id: string): number {
  const match = id.match(/(\d+\.\d+|\d+)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Filter models to keep ONLY 1 main variant per model family.
 * If a stable variant exists, preview variants are dropped.
 */
function deduplicateToMainModels(models: AIModel[]): AIModel[] {
  const familyMap = new Map<string, AIModel>();

  for (const model of models) {
    const normId = model.id.toLowerCase();
    const cleanId = normId
      .replace(/-\d{4,8}$/, '')
      .replace(/-\d{2}-\d{2}$/, '');
    
    let familyKey = `${model.provider}/${cleanId}`
      .replace(/-preview$/, '')
      .replace(/-latest$/, '');

    const isStable = !cleanId.includes('preview');
    const existing = familyMap.get(familyKey);

    if (!existing) {
      familyMap.set(familyKey, { ...model, id: cleanId });
    } else {
      const existingIsStable = !existing.id.toLowerCase().includes('preview');
      if (isStable && !existingIsStable) {
        familyMap.set(familyKey, { ...model, id: cleanId });
      }
    }
  }

  return Array.from(familyMap.values());
}

/**
 * Sort models from newest to oldest
 */
function sortModelsNewestFirst(models: AIModel[]): AIModel[] {
  return models.sort((a, b) => {
    if (a.releaseDate && b.releaseDate) {
      if (a.releaseDate !== b.releaseDate) {
        return b.releaseDate.localeCompare(a.releaseDate);
      }
    } else if (a.releaseDate && !b.releaseDate) {
      return -1;
    } else if (!a.releaseDate && b.releaseDate) {
      return 1;
    }

    const versionA = extractModelVersion(a.id);
    const versionB = extractModelVersion(b.id);
    if (versionA !== versionB) {
      return versionB - versionA;
    }

    return b.name.localeCompare(a.name);
  });
}

/**
 * Fetch models from OpenRouter public API (Primary Provider)
 */
async function fetchFromOpenRouter(): Promise<AIModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned status ${response.status}`);
  }

  const json = await response.json();
  if (!json || !Array.isArray(json.data)) {
    throw new Error('Invalid OpenRouter API response format');
  }

  const rawModels: any[] = json.data;
  const nowSec = Math.floor(Date.now() / 1000);
  const modelsList: AIModel[] = [];

  for (const item of rawModels) {
    const rawId: string = item.id || '';
    
    if (item.expiration_date && item.expiration_date < nowSec) {
      continue;
    }

    let provider: 'google' | 'openai' | 'anthropic' | null = null;
    let normalizedId = rawId;

    if (rawId.startsWith('google/')) {
      provider = 'google';
      normalizedId = rawId.replace(/^google\//, '');
    } else if (rawId.startsWith('openai/')) {
      provider = 'openai';
      normalizedId = rawId.replace(/^openai\//, '');
    } else if (rawId.startsWith('anthropic/')) {
      provider = 'anthropic';
      normalizedId = rawId.replace(/^anthropic\//, '');
    } else {
      continue;
    }

    if (!isMainTextModel(normalizedId, item.name || '', item.architecture)) {
      continue;
    }

    let cleanName = item.name || normalizedId;
    cleanName = cleanName.replace(/^(Google:\s*|OpenAI:\s*|Anthropic:\s*)/i, '').trim();

    const tags: string[] = [];
    if (item.context_length) {
      const kTokens = Math.round(item.context_length / 1000);
      tags.push(`${kTokens >= 1000 ? Math.round(kTokens / 1000) + 'M' : kTokens + 'k'} Context`);
    }

    const lowerId = normalizedId.toLowerCase();
    if (lowerId.includes('flash') || lowerId.includes('mini') || lowerId.includes('haiku') || lowerId.includes('nano')) {
      tags.push('Fast');
    } else if (lowerId.includes('pro') || lowerId.includes('opus') || lowerId.includes('sonnet') || lowerId.includes('gpt-5')) {
      tags.push('High Quality');
    }

    const releaseDateStr = item.created
      ? new Date(item.created * 1000).toISOString().split('T')[0]
      : undefined;

    modelsList.push({
      id: normalizedId,
      name: cleanName,
      description: item.description || `${cleanName} frontier AI text model.`,
      tags,
      provider,
      transcriptionModel: provider === 'openai' || provider === 'anthropic' ? 'whisper-1' : undefined,
      contextLength: item.context_length,
      releaseDate: releaseDateStr,
      isDynamic: true,
    });
  }

  const deduplicated = deduplicateToMainModels(modelsList);
  return sortModelsNewestFirst(deduplicated);
}

/**
 * Fetch models from LiteLLM GitHub database (Fallback Provider)
 */
async function fetchFromLiteLLM(): Promise<AIModel[]> {
  const response = await fetch(
    'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
  );

  if (!response.ok) {
    throw new Error(`LiteLLM returned status ${response.status}`);
  }

  const data: Record<string, any> = await response.json();
  const modelsList: AIModel[] = [];

  for (const [rawId, info] of Object.entries(data)) {
    let provider: 'google' | 'openai' | 'anthropic' | null = null;
    let normalizedId = rawId;

    if (rawId.startsWith('google/') || rawId.includes('gemini')) {
      provider = 'google';
      normalizedId = rawId.replace(/^(google\/|vertex_ai\/)/, '');
    } else if (rawId.startsWith('openai/') || rawId.startsWith('gpt-')) {
      provider = 'openai';
      normalizedId = rawId.replace(/^openai\//, '');
    } else if (rawId.startsWith('anthropic/') || rawId.includes('claude')) {
      provider = 'anthropic';
      normalizedId = rawId.replace(/^anthropic\//, '');
    } else {
      continue;
    }

    if (!isMainTextModel(normalizedId, normalizedId, info.modalities)) {
      continue;
    }

    if (normalizedId.includes('/') || normalizedId.includes(':')) {
      continue;
    }

    const tags: string[] = [];
    if (info.max_input_tokens || info.max_tokens) {
      const tokens = info.max_input_tokens || info.max_tokens;
      const kTokens = Math.round(tokens / 1000);
      tags.push(`${kTokens >= 1000 ? Math.round(kTokens / 1000) + 'M' : kTokens + 'k'} Context`);
    }

    modelsList.push({
      id: normalizedId,
      name: normalizedId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: `Frontier ${provider.toUpperCase()} text AI model automatically discovered.`,
      tags,
      provider,
      transcriptionModel: provider === 'openai' || provider === 'anthropic' ? 'whisper-1' : undefined,
      contextLength: info.max_input_tokens || info.max_tokens,
      isDynamic: true,
    });
  }

  const deduplicated = deduplicateToMainModels(modelsList);
  return sortModelsNewestFirst(deduplicated);
}

/**
 * Combine dynamic models with system special models (e.g. youtube-auto).
 * Hides manual static models unless API calls fail completely.
 */
function mergeWithSystemModels(dynamicModels: AIModel[]): AIModel[] {
  const systemModels = AVAILABLE_MODELS.filter(m => m.provider === 'youtube');
  const staticRatesMap = new Map<string, any>();
  for (const m of AVAILABLE_MODELS) {
    if (m.rateLimits) {
      staticRatesMap.set(m.id, m.rateLimits);
    }
  }

  const enrichedDynamic = dynamicModels.map(dm => {
    const rateLimits = staticRatesMap.get(dm.id);
    return rateLimits ? { ...dm, rateLimits } : dm;
  });

  return [...systemModels, ...enrichedDynamic];
}

/**
 * Get cached models from localStorage
 */
export function getCachedModels(): AIModel[] | null {
  try {
    const raw = localStorage.getItem(SYNC_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Get sync metadata info
 */
export function getSyncInfo(): ModelSyncInfo | null {
  try {
    const raw = localStorage.getItem(SYNC_INFO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Primary sync orchestrator:
 * Tries OpenRouter first. If fails, tries LiteLLM fallback.
 * If both fail, falls back to local storage cache or static AVAILABLE_MODELS.
 */
export async function syncModels(forceRefresh = false): Promise<SyncResult> {
  const cachedInfo = getSyncInfo();
  const cachedModels = getCachedModels();

  if (!forceRefresh && cachedInfo && cachedModels && (Date.now() - cachedInfo.syncedAt < CACHE_TTL_MS)) {
    return {
      models: cachedModels,
      info: cachedInfo,
    };
  }

  let dynamicModels: AIModel[] = [];
  let providerName: ModelSyncInfo['provider'] = 'OpenRouter';
  let syncError: string | undefined;

  try {
    console.log('[ModelSyncService] Fetching text models from Primary Provider (OpenRouter)...');
    dynamicModels = await fetchFromOpenRouter();
    providerName = 'OpenRouter';
  } catch (primaryErr: any) {
    console.warn('[ModelSyncService] Primary provider failed, attempting Fallback (LiteLLM)...', primaryErr);
    try {
      dynamicModels = await fetchFromLiteLLM();
      providerName = 'LiteLLM';
    } catch (fallbackErr: any) {
      console.error('[ModelSyncService] Fallback provider failed:', fallbackErr);
      syncError = `Primary and Fallback APIs unreachable (${primaryErr.message}). Using static defaults.`;
    }
  }

  if (dynamicModels.length > 0) {
    const finalModels = mergeWithSystemModels(dynamicModels);
    const info: ModelSyncInfo = {
      provider: providerName,
      syncedAt: Date.now(),
      count: finalModels.length,
    };

    try {
      localStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(finalModels));
      localStorage.setItem(SYNC_INFO_KEY, JSON.stringify(info));
    } catch (e) {
      console.warn('[ModelSyncService] Failed to save models to localStorage:', e);
    }

    return { models: finalModels, info };
  }

  const fallbackModels = cachedModels || AVAILABLE_MODELS;
  const fallbackInfo: ModelSyncInfo = cachedInfo || {
    provider: 'Static Fallback',
    syncedAt: Date.now(),
    count: fallbackModels.length,
    error: syncError,
  };

  return { models: fallbackModels, info: fallbackInfo };
}
