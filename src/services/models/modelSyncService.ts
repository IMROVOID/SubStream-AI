import { AIModel, AVAILABLE_MODELS } from '../../types';
import { fetchFromOpenRouter } from './openRouterModelFetcher';
import { fetchFromLiteLLM } from './liteLLMModelFetcher';

const SYNC_CACHE_KEY = 'substream_synced_models_v4';
const SYNC_INFO_KEY = 'substream_models_sync_info_v4';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

export function getCachedModels(): AIModel[] | null {
  try {
    const raw = localStorage.getItem(SYNC_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getSyncInfo(): ModelSyncInfo | null {
  try {
    const raw = localStorage.getItem(SYNC_INFO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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
