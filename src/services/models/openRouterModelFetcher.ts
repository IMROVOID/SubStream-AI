import { AIModel } from '../../types';

const EXCLUDED_PATTERNS = [
  'batch', ':batch', '-batch',
  'banana', 'image', 'audio', 'video', 'speech', 'tts', 'whisper', 'realtime', 'vision', 'transcribe', 'diarize', 'music', 'sound', 'lyria',
  'codex', 'chat-latest', 'gpt-chat', 'safeguard', 'oss', 'container', 'search-api', 'robotics', 'computer-use', 'omni-flash',
  'embedding', 'imagen', 'dall-e', 'dalle', 'flux', 'stable-diffusion', 'sdxl', 'midjourney', 'recraft', 'sora', 'runway', 'veo', 'luma', 'pika', 'kling',
  'cogvideo', 'hunyuan', 'wan2', 'gemma', 'exp-', 'customtools', 'search-preview', 'live-translate', 'paygo', 'global.', 'us.', 'eu.', 'au.', 'jp.', 'anthropic.'
];

export function isMainTextModel(id: string, name: string, modalities?: { input?: string[]; output?: string[] }): boolean {
  const lowerId = id.toLowerCase();
  const lowerName = (name || '').toLowerCase();

  if (modalities && Array.isArray(modalities.output)) {
    const outputs = modalities.output.map(s => String(s).toLowerCase());
    if (outputs.includes('image') || outputs.includes('video') || outputs.includes('audio')) {
      return false;
    }
    if (!outputs.includes('text')) {
      return false;
    }
  }

  if (/-\d{4}-\d{2}-\d{2}/.test(lowerId) || /-\d{8}$/.test(lowerId)) {
    return false;
  }

  for (const pat of EXCLUDED_PATTERNS) {
    if (lowerId.includes(pat) || lowerName.includes(pat)) {
      return false;
    }
  }

  return true;
}

export function extractModelVersion(id: string): number {
  const match = id.match(/(\d+\.\d+|\d+)/);
  return match ? parseFloat(match[1]) : 0;
}

export function deduplicateToMainModels(models: AIModel[]): AIModel[] {
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

export function sortModelsNewestFirst(models: AIModel[]): AIModel[] {
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

export async function fetchFromOpenRouter(): Promise<AIModel[]> {
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
    if (item.expiration_date && item.expiration_date < nowSec) continue;

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

    if (!isMainTextModel(normalizedId, item.name || '', item.architecture)) continue;

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

    const releaseDateStr = item.created ? new Date(item.created * 1000).toISOString().split('T')[0] : undefined;

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
