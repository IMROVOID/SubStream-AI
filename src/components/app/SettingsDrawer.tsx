import React from 'react';
import { 
  Search, 
  RefreshCw, 
  Key, 
  Check, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertCircle, 
  Info, 
  Cpu, 
  ChevronDown, 
  Gauge, 
  ExternalLink 
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ScrollFadeContainer } from '../common/ScrollFadeContainer';
import { YouTubeAuth } from '../common/YouTubeAuth';
import { AIModel, RPMLimit } from '../../types';
import { OPENAI_RPM_OPTIONS, ANTHROPIC_RPM_OPTIONS } from '../../constants/models';

export type GeminiTier = 'free' | 'tier1' | 'tier2' | 'tier3';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  modelsList: AIModel[];
  syncInfo: any;
  isSyncingModels: boolean;
  handleSyncModels: (force?: boolean) => void;
  modelSearchQuery: string;
  setModelSearchQuery: (query: string) => void;
  openGroups: Record<string, boolean>;
  toggleGroup: (group: string) => void;
  googleUser: any;
  googleAccessToken?: string | null;
  onGoogleLoginSuccess: (res: any) => void;
  onGoogleLogout: () => void;
  userGoogleApiKey: string;
  tempGoogleApiKey: string;
  setTempGoogleApiKey: (key: string) => void;
  googleApiKeyStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  clearGoogleApiKey: () => void;
  userOpenAIApiKey: string;
  tempOpenAIApiKey: string;
  setTempOpenAIApiKey: (key: string) => void;
  openAIApiKeyStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  clearOpenAIApiKey: () => void;
  userAnthropicApiKey: string;
  tempAnthropicApiKey: string;
  setTempAnthropicApiKey: (key: string) => void;
  anthropicApiKeyStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  clearAnthropicApiKey: () => void;
  handleSaveKeys: () => void;
  selectedRPM: RPMLimit;
  setSelectedRPM: (rpm: RPMLimit) => void;
  isCustomRPM: boolean;
  setIsCustomRPM: (custom: boolean) => void;
  customRPMInput: string;
  setCustomRPMInput: (val: string) => void;
  handleCustomRPMChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedGeminiTier: GeminiTier;
  setSelectedGeminiTier: (tier: GeminiTier) => void;
  activeModelData: AIModel | null;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  setSelectedModelId,
  modelsList,
  syncInfo,
  isSyncingModels,
  handleSyncModels,
  modelSearchQuery,
  setModelSearchQuery,
  openGroups,
  toggleGroup,
  googleUser,
  googleAccessToken,
  onGoogleLoginSuccess,
  onGoogleLogout,
  userGoogleApiKey,
  tempGoogleApiKey,
  setTempGoogleApiKey,
  googleApiKeyStatus,
  clearGoogleApiKey,
  userOpenAIApiKey,
  tempOpenAIApiKey,
  setTempOpenAIApiKey,
  openAIApiKeyStatus,
  clearOpenAIApiKey,
  userAnthropicApiKey,
  tempAnthropicApiKey,
  setTempAnthropicApiKey,
  anthropicApiKeyStatus,
  clearAnthropicApiKey,
  handleSaveKeys,
  selectedRPM,
  setSelectedRPM,
  isCustomRPM,
  setIsCustomRPM,
  customRPMInput,
  setCustomRPMInput,
  handleCustomRPMChange,
  selectedGeminiTier,
  setSelectedGeminiTier,
  activeModelData
}) => {
  const filteredModels = modelsList.filter(m => 
    m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || 
    m.description.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );

  const youtubeModel = filteredModels.filter(m => m.provider === 'youtube');
  const googleModels = filteredModels.filter(m => m.provider === 'google');
  const openaiModels = filteredModels.filter(m => m.provider === 'openai');
  const anthropicModels = filteredModels.filter(m => m.provider === 'anthropic');

  const isGoogleActive = googleApiKeyStatus === 'valid';
  const isOpenAIActive = openAIApiKeyStatus === 'valid';
  const isAnthropicActive = anthropicApiKeyStatus === 'valid';
  const hasYouTubeAuth = Boolean(googleUser);

  const isSaveDisabled = 
    googleApiKeyStatus === 'validating' || 
    openAIApiKeyStatus === 'validating' || 
    anthropicApiKeyStatus === 'validating' ||
    (tempGoogleApiKey.trim() !== '' && googleApiKeyStatus === 'invalid') ||
    (tempOpenAIApiKey.trim() !== '' && openAIApiKeyStatus === 'invalid') ||
    (tempAnthropicApiKey.trim() !== '' && anthropicApiKeyStatus === 'invalid');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Configuration">
      <div className="flex flex-col md:grid md:grid-cols-2 gap-x-8 gap-y-6 items-stretch">
        
        {/* LEFT COLUMN: Model Selection */}
        <div className="flex flex-col gap-4 bg-neutral-900/60 border border-neutral-800/80 md:bg-transparent md:border-0 rounded-2xl md:rounded-none p-4 md:p-0">
          <label className="block text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Select AI Model
          </label>
          
          <div className="flex items-center justify-between bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>
                Auto-synced via <strong className="text-white">{syncInfo?.provider || 'OpenRouter'}</strong> ({modelsList.length} models)
              </span>
            </div>
            <button
              onClick={() => handleSyncModels(true)}
              disabled={isSyncingModels}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors disabled:opacity-50"
              title="Fetch latest models from free public API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingModels ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{isSyncingModels ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-neutral-500 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Search models..." 
              value={modelSearchQuery} 
              onChange={(e) => setModelSearchQuery(e.target.value)} 
              className="w-full bg-black/50 border border-neutral-700 rounded-xl py-2 pl-10 pr-4 text-white focus:border-white focus:outline-none transition-colors" 
            />
          </div>
          
          <ScrollFadeContainer 
            className="space-y-4 pr-2 overflow-y-auto max-h-[380px] md:max-h-[430px] flex-1 custom-scrollbar"
            topFadeClassName="from-[#121212] via-[#121212]/40 to-transparent"
            bottomFadeClassName="from-[#121212] via-[#121212]/40 to-transparent"
            roundedCorner="rounded-xl"
          >
            {youtubeModel.length > 0 && (
              <div>
                <div 
                  onClick={() => toggleGroup('youtube')}
                  className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                >
                  <span className="font-bold text-neutral-300">YouTube Services</span>
                  <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.youtube ? 'rotate-180' : ''}`} />
                </div>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.youtube ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                      {youtubeModel.map((model) => {
                        const isDisabled = !hasYouTubeAuth;
                        return (
                          <div 
                            key={model.id} 
                            onClick={() => !isDisabled && setSelectedModelId(model.id)} 
                            className={`relative p-4 rounded-xl border transition-all duration-200 ${
                              isDisabled ? 'opacity-40 cursor-not-allowed bg-neutral-900/30 border-neutral-800' : 
                              selectedModelId === model.id ? 'bg-neutral-800 border-white cursor-pointer' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                  {model.name}
                                  {isDisabled && <span className="text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">Auth Required</span>}
                                </h4>
                                <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                              </div>
                              {selectedModelId === model.id && <CheckCircle2 className="w-5 h-5 text-white shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {model.tags?.map(tag => (
                                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {googleModels.length > 0 && (
              <div>
                <div 
                  onClick={() => toggleGroup('google')}
                  className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                >
                  <span className="font-bold text-neutral-300">Google Gemini Models</span>
                  <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.google ? 'rotate-180' : ''}`} />
                </div>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.google ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                      {googleModels.map((model) => {
                        const isDisabled = !isGoogleActive;
                        const badgeText = 
                          googleApiKeyStatus === 'validating' ? 'Validating Key...' :
                          googleApiKeyStatus === 'invalid' ? 'Invalid API Key' :
                          'API Key Required';
                        const badgeStyle =
                          googleApiKeyStatus === 'invalid' ? 'text-red-400 bg-red-900/20 border-red-900/50' :
                          googleApiKeyStatus === 'validating' ? 'text-neutral-400 bg-neutral-900/40 border-neutral-800 animate-pulse' :
                          'text-amber-400 bg-amber-900/20 border-amber-900/50';

                        return (
                          <div 
                            key={model.id} 
                            onClick={() => !isDisabled && setSelectedModelId(model.id)} 
                            className={`relative p-4 rounded-xl border transition-all duration-200 ${
                              isDisabled ? 'opacity-40 cursor-not-allowed bg-neutral-900/30 border-neutral-800' : 
                              selectedModelId === model.id ? 'bg-neutral-800 border-white cursor-pointer' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                  {model.name}
                                  {isDisabled && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeStyle}`}>{badgeText}</span>}
                                </h4>
                                <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                              </div>
                              {selectedModelId === model.id && <CheckCircle2 className="w-5 h-5 text-white shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {model.tags?.map(tag => (
                                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {openaiModels.length > 0 && (
              <div>
                <div 
                  onClick={() => toggleGroup('openai')}
                  className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                >
                  <span className="font-bold text-neutral-300">OpenAI Models</span>
                  <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.openai ? 'rotate-180' : ''}`} />
                </div>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.openai ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                      {openaiModels.map((model) => {
                        const isDisabled = !isOpenAIActive;
                        const badgeText = 
                          openAIApiKeyStatus === 'validating' ? 'Validating Key...' :
                          openAIApiKeyStatus === 'invalid' ? 'Invalid API Key' :
                          'API Key Required';
                        const badgeStyle =
                          openAIApiKeyStatus === 'invalid' ? 'text-red-400 bg-red-900/20 border-red-900/50' :
                          openAIApiKeyStatus === 'validating' ? 'text-neutral-400 bg-neutral-900/40 border-neutral-800 animate-pulse' :
                          'text-amber-400 bg-amber-900/20 border-amber-900/50';

                        return (
                          <div 
                            key={model.id} 
                            onClick={() => !isDisabled && setSelectedModelId(model.id)} 
                            className={`relative p-4 rounded-xl border transition-all duration-200 ${
                              isDisabled ? 'opacity-40 cursor-not-allowed bg-neutral-900/30 border-neutral-800' : 
                              selectedModelId === model.id ? 'bg-neutral-800 border-white cursor-pointer' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                  {model.name}
                                  {isDisabled && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeStyle}`}>{badgeText}</span>}
                                </h4>
                                <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                              </div>
                              {selectedModelId === model.id && <CheckCircle2 className="w-5 h-5 text-white shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {model.tags?.map(tag => (
                                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {anthropicModels.length > 0 && (
              <div>
                <div 
                  onClick={() => toggleGroup('anthropic')}
                  className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-neutral-800/50 transition-colors select-none"
                >
                  <span className="font-bold text-neutral-300">Anthropic Claude Models</span>
                  <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform duration-300 ${openGroups.anthropic ? 'rotate-180' : ''}`} />
                </div>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${openGroups.anthropic ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-3 pt-2 pb-1 pl-2 border-l border-neutral-800 ml-2">
                      {anthropicModels.map((model) => {
                        const isDisabled = !isAnthropicActive;
                        const badgeText = 
                          anthropicApiKeyStatus === 'validating' ? 'Validating Key...' :
                          anthropicApiKeyStatus === 'invalid' ? 'Invalid API Key' :
                          'API Key Required';
                        const badgeStyle =
                          anthropicApiKeyStatus === 'invalid' ? 'text-red-400 bg-red-900/20 border-red-900/50' :
                          anthropicApiKeyStatus === 'validating' ? 'text-neutral-400 bg-neutral-900/40 border-neutral-800 animate-pulse' :
                          'text-amber-400 bg-amber-900/20 border-amber-900/50';

                        return (
                          <div 
                            key={model.id} 
                            onClick={() => !isDisabled && setSelectedModelId(model.id)} 
                            className={`relative p-4 rounded-xl border transition-all duration-200 ${
                              isDisabled ? 'opacity-40 cursor-not-allowed bg-neutral-900/30 border-neutral-800' : 
                              selectedModelId === model.id ? 'bg-neutral-800 border-white cursor-pointer' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                  {model.name}
                                  {isDisabled && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeStyle}`}>{badgeText}</span>}
                                </h4>
                                <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                              </div>
                              {selectedModelId === model.id && <CheckCircle2 className="w-5 h-5 text-white shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {model.tags?.map(tag => (
                                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollFadeContainer>
        </div>

        {/* RIGHT COLUMN: API Keys, Rate Limits, and Action Bar */}
        <div className="flex flex-col justify-between h-full">
          <div className="space-y-4">
            
            {/* Google Gemini API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4" /> Google Gemini API Key
                </label>
                {userGoogleApiKey && (
                  <button onClick={clearGoogleApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button>
                )}
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  placeholder="AIzaSy..." 
                  value={tempGoogleApiKey} 
                  onChange={(e) => setTempGoogleApiKey(e.target.value)} 
                  className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${
                    googleApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''
                  } ${googleApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${
                    googleApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''
                  } ${googleApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {googleApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                  {googleApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {googleApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </div>
              <p className="text-xs text-neutral-500">For Gemini models. Stored locally in your browser.</p>
            </div>

            {/* OpenAI API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4" /> OpenAI API Key
                </label>
                {userOpenAIApiKey && (
                  <button onClick={clearOpenAIApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button>
                )}
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  placeholder="sk-..." 
                  value={tempOpenAIApiKey} 
                  onChange={(e) => setTempOpenAIApiKey(e.target.value)} 
                  className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${
                    openAIApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''
                  } ${openAIApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${
                    openAIApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''
                  } ${openAIApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {openAIApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                  {openAIApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {openAIApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </div>
              <p className="text-xs text-neutral-500">For GPT models. Stored locally in your browser.</p>
            </div>

            {/* Anthropic API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4" /> Anthropic Claude API Key
                </label>
                {userAnthropicApiKey && (
                  <button onClick={clearAnthropicApiKey} className="text-xs text-red-500 hover:text-red-400">Clear Key</button>
                )}
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  placeholder="sk-ant-..." 
                  value={tempAnthropicApiKey} 
                  onChange={(e) => setTempAnthropicApiKey(e.target.value)} 
                  className={`w-full bg-black border rounded-xl pl-3.5 pr-10 py-2 text-sm text-white focus:outline-none transition-colors ${
                    anthropicApiKeyStatus === 'idle' ? 'border-neutral-800 focus:border-white' : ''
                  } ${anthropicApiKeyStatus === 'validating' ? 'border-neutral-700 animate-pulse' : ''} ${
                    anthropicApiKeyStatus === 'valid' ? 'border-emerald-800/90 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/50' : ''
                  } ${anthropicApiKeyStatus === 'invalid' ? 'border-red-700/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50' : ''}`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {anthropicApiKeyStatus === 'validating' && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
                  {anthropicApiKeyStatus === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {anthropicApiKeyStatus === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </div>
              <p className="text-xs text-neutral-500">For Claude models. Stored locally in your browser.</p>
            </div>

            {/* RATE LIMIT SECTION */}
            {activeModelData && activeModelData.provider !== 'youtube' ? (() => {
              const currentRpmOptions = activeModelData.provider === 'anthropic' ? ANTHROPIC_RPM_OPTIONS : OPENAI_RPM_OPTIONS;
              const standardIdx = currentRpmOptions.findIndex(o => o.value === selectedRPM);
              const currentRpmOptionIndex = isCustomRPM ? 3 : (standardIdx >= 0 ? standardIdx : 1);

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-white flex items-center gap-2">
                      <Gauge className="w-4 h-4" /> Rate Limit
                    </label>
                    <p className="font-medium text-white text-sm">
                      {`${typeof selectedRPM === 'number' ? selectedRPM : 15} RPM`}
                    </p>
                  </div>
                  
                  {activeModelData.provider === 'google' && activeModelData.rateLimits ? (
                    <>
                      <div className="grid grid-cols-4 gap-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                        {(['free', 'tier1', 'tier2', 'tier3'] as GeminiTier[]).map((tier) => {
                          const rpm = activeModelData.rateLimits![tier];
                          const isDisabled = rpm === undefined;
                          const isActive = selectedGeminiTier === tier;
                          const labelMap = { free: 'Free Tier', tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' };
                          
                          return (
                            <button
                              key={tier}
                              onClick={() => !isDisabled && setSelectedGeminiTier(tier)}
                              disabled={isDisabled}
                              className={`relative flex flex-col items-center justify-center py-2 rounded-lg text-xs transition-all duration-200 ${
                                isDisabled ? 'opacity-30 cursor-not-allowed text-neutral-600' : 
                                isActive ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                              }`}
                            >
                              <span className="font-bold mb-0.5">{labelMap[tier]}</span>
                              <span className="text-[10px] opacity-80">{rpm ? rpm : 'N/A'}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-center">
                        <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                          Check your limits on Google AI Studio <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative flex w-full p-1 bg-neutral-900 border border-neutral-800 rounded-xl select-none">
                        <div 
                          className="absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/4)] bg-neutral-700 rounded-lg transition-transform duration-300 ease-out shadow-sm" 
                          style={{ transform: `translateX(calc(${currentRpmOptionIndex} * 100%))` }} 
                        />
                        {currentRpmOptions.map((option, idx) => (
                          <button 
                            key={option.label} 
                            onClick={() => {
                              if (option.value === 'custom') {
                                setIsCustomRPM(true);
                                const num = parseInt(customRPMInput, 10);
                                if (num && num > 0) setSelectedRPM(num);
                              } else {
                                setIsCustomRPM(false);
                                setSelectedRPM(option.value as RPMLimit);
                              }
                            }}
                            className={`relative z-10 flex-1 py-1.5 text-xs font-semibold transition-colors duration-300 rounded-lg ${
                              currentRpmOptionIndex === idx ? 'text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {isCustomRPM && (
                        <div className="flex items-center gap-3 pt-1 animate-fade-in">
                          <label className="text-xs text-neutral-400 whitespace-nowrap">Custom RPM Limit:</label>
                          <input 
                            type="number" 
                            min="1" 
                            max="10000" 
                            value={customRPMInput} 
                            onChange={handleCustomRPMChange} 
                            placeholder="e.g. 60" 
                            className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white transition-colors"
                          />
                        </div>
                      )}

                      <div className="mt-2 text-center">
                        {activeModelData.provider === 'anthropic' ? (
                          <a href="https://console.anthropic.com/settings/limits" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                            Check your limits on Anthropic Console <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <a href="https://platform.openai.com/account/rate-limits" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500 hover:text-white flex items-center justify-center gap-1 transition-colors">
                            Check your limits on OpenAI Platform <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })() : !activeModelData ? (
              <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 text-center text-xs text-neutral-500">
                No AI model or method selected. Enter an API key or authenticate YouTube to enable methods.
              </div>
            ) : null}

          </div>

          {/* BOTTOM ACTION BAR: YouTube Auth & Save Settings */}
          <div className="flex items-center justify-between w-full pt-4 mt-6 border-t border-neutral-800 shrink-0">
            <YouTubeAuth 
              onLoginSuccess={onGoogleLoginSuccess} 
              onLogout={onGoogleLogout} 
              userInfo={googleUser}
              activeToken={googleAccessToken}
            />
            <Button 
              onClick={handleSaveKeys} 
              variant="secondary"
              className="px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold !bg-neutral-800 hover:!bg-neutral-700 !text-neutral-200 border border-neutral-700 hover:border-neutral-600 rounded-xl transition-all flex items-center justify-center"
              disabled={isSaveDisabled}
            >
              Save Settings
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  );
};
