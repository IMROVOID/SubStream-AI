import { useState, useRef, useEffect, useMemo } from 'react';
import { AIModel, AVAILABLE_MODELS, RPMLimit } from '../types';
import { GeminiTier } from '../components/app/SettingsDrawer';
import { getAuthItem, setAuthItem, removeAuthItem } from '../utils/cookieUtils';
import { 
  setGlobalRPM, 
  validateGoogleApiKey, 
  validateOpenAIApiKey, 
  validateAnthropicApiKey 
} from '../services/aiService';
import { syncModels, getCachedModels, getSyncInfo } from '../services/modelSyncService';
import { resolveAvailableModel, isModelValidForCurrentAuth, TokenResponse } from '../utils/appHelpers';
import { requestGoogleAccessToken, revokeGoogleAccessToken, YOUTUBE_SCOPE } from '../utils/googleAuthHelper';

interface UseAppSettingsProps {
  showToast: (title: string, message?: string, type?: 'info' | 'success' | 'error') => void;
  onOpenConfigModal: () => void;
}

export function useAppSettings({ showToast, onOpenConfigModal }: UseAppSettingsProps) {
  const [modelsList, setModelsList] = useState<AIModel[]>(() => getCachedModels() || AVAILABLE_MODELS);
  const [syncInfo, setSyncInfo] = useState<any>(() => getSyncInfo());
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    youtube: true,
    google: true,
    openai: false,
    anthropic: false
  });

  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<{ name: string; picture: string } | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedRPM, setSelectedRPM] = useState<RPMLimit>(15);
  const [isCustomRPM, setIsCustomRPM] = useState(false);
  const [customRPMInput, setCustomRPMInput] = useState('15');
  const [selectedGeminiTier, setSelectedGeminiTier] = useState<GeminiTier>('free');

  const [userGoogleApiKey, setUserGoogleApiKey] = useState<string>('');
  const [tempGoogleApiKey, setTempGoogleApiKey] = useState<string>('');
  const [googleApiKeyStatus, setGoogleApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [userOpenAIApiKey, setUserOpenAIApiKey] = useState<string>('');
  const [tempOpenAIApiKey, setTempOpenAIApiKey] = useState<string>('');
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [userAnthropicApiKey, setUserAnthropicApiKey] = useState<string>('');
  const [tempAnthropicApiKey, setTempAnthropicApiKey] = useState<string>('');
  const [anthropicApiKeyStatus, setAnthropicApiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const [requestsUsed, setRequestsUsed] = useState<number>(0);

  const debounceGoogleKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceOpenAIKeyTimer = useRef<NodeJS.Timeout | null>(null);
  const debounceAnthropicKeyTimer = useRef<NodeJS.Timeout | null>(null);

  const activeModelData = useMemo<AIModel | null>(() => {
    if (!selectedModelId) return null;
    return modelsList.find(m => m.id === selectedModelId) || null;
  }, [selectedModelId, modelsList]);

  const activeApiKey = useMemo(() => {
    if (!activeModelData) return '';
    if (activeModelData.provider === 'openai') return userOpenAIApiKey;
    if (activeModelData.provider === 'anthropic') return userAnthropicApiKey;
    if (activeModelData.provider === 'google') return userGoogleApiKey;
    return '';
  }, [activeModelData, userGoogleApiKey, userOpenAIApiKey, userAnthropicApiKey]);

  const hasProAccess = Boolean(activeApiKey || (activeModelData?.provider === 'youtube' && googleUser));
  const remainingQuota = hasProAccess ? 999999 : Math.max(0, 10 - requestsUsed);

  const ensureMethodSelected = (actionDescription?: string): boolean => {
    if (!selectedModelId || !activeModelData) {
      const msg = actionDescription 
        ? `Please select an AI model or configure an API key in Settings before ${actionDescription}.` 
        : "Please select an AI model or configure an API key in Settings to continue.";
      showToast("No AI Method Selected", msg, "info");
      onOpenConfigModal();
      return false;
    }
    return true;
  };

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleSyncModels = async (isManual = false) => {
    setIsSyncingModels(true);
    try {
      const res = await syncModels(true);
      setModelsList(res.models);
      setSyncInfo(res.info);
      if (isManual) showToast("AI models updated from server!", undefined, "success");
    } catch (e: any) {
      console.error("Failed to sync models:", e);
      if (isManual) showToast("Failed to refresh models list.", e.message, "error");
    } finally {
      setIsSyncingModels(false);
    }
  };

  const handleGoogleLoginSuccess = (tokenResponse: TokenResponse) => {
    if (!tokenResponse || !tokenResponse.access_token) return;
    
    const accessToken = tokenResponse.access_token;
    if (googleAccessToken === accessToken && googleUser) return;

    setGoogleAccessToken(accessToken);
    setAuthItem('substream_google_token', accessToken, 1);
    setAuthItem('substream_google_token_timestamp', Date.now().toString(), 30);
    setAuthItem('substream_google_session', 'active', 30);
    
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then(async res => {
      if (!res.ok) throw new Error(`User info request failed with status ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (!data || !data.name) throw new Error("Invalid user profile received");
      setGoogleUser(data);
      setAuthItem('substream_google_user', JSON.stringify(data), 30);
      showToast(`Welcome, ${data.name}!`); 
    })
    .catch(error => {
      console.error("Failed to fetch user info", error);
      handleGoogleLogout();
    });
  };

  const handleGoogleLogout = () => {
    if (googleAccessToken) {
      revokeGoogleAccessToken(googleAccessToken);
    }
    setGoogleUser(null);
    setGoogleAccessToken(null);
    removeAuthItem('substream_google_token');
    removeAuthItem('substream_google_user');
    removeAuthItem('substream_google_token_timestamp');
    removeAuthItem('substream_google_session');
    showToast("Signed Out", "Google session cleared.", "info");
  };

  const handleSaveKeys = () => {
    setUserGoogleApiKey(tempGoogleApiKey);
    localStorage.setItem('substream_google_api_key', tempGoogleApiKey);
    setUserOpenAIApiKey(tempOpenAIApiKey);
    localStorage.setItem('substream_openai_api_key', tempOpenAIApiKey);
    setUserAnthropicApiKey(tempAnthropicApiKey);
    localStorage.setItem('substream_anthropic_api_key', tempAnthropicApiKey);
    localStorage.setItem('substream_rpm', selectedRPM.toString());
    localStorage.setItem('substream_gemini_tier', selectedGeminiTier);
    showToast("Configuration Saved", "Your API keys and settings have been updated.", "success");
  };

  const handleCustomRPMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRPMInput(e.target.value);
    const num = parseInt(e.target.value, 10);
    if (num && num > 0) setSelectedRPM(num as any);
  };

  // Sync Rate Limits
  useEffect(() => {
    if (activeModelData?.provider === 'google' && activeModelData.rateLimits) {
      if (selectedGeminiTier === 'free' && !activeModelData.rateLimits.free) {
        setSelectedGeminiTier('tier1');
      }
    }
  }, [activeModelData, selectedGeminiTier]);

  useEffect(() => {
    if (activeModelData?.provider === 'google' && activeModelData.rateLimits) {
      const rpm = activeModelData.rateLimits[selectedGeminiTier];
      if (rpm) {
        setSelectedRPM(rpm);
        setGlobalRPM(rpm);
      }
    } else if (activeModelData && (activeModelData.provider === 'openai' || activeModelData.provider === 'anthropic')) {
      setGlobalRPM(selectedRPM);
    }
  }, [selectedGeminiTier, activeModelData, selectedRPM]);

  // Main Window BroadcastChannel Listener
  useEffect(() => {
    const channel = new BroadcastChannel('substream_auth_channel');
    channel.onmessage = (event) => {
      if (event.data && event.data.token) {
        handleGoogleLoginSuccess({ access_token: event.data.token } as TokenResponse);
      }
    };
    return () => channel.close();
  }, []);

  // Restore saved state from LocalStorage & Cookies on mount
  useEffect(() => {
    const storedGoogleKey = localStorage.getItem('substream_google_api_key');
    const storedOpenAIKey = localStorage.getItem('substream_openai_api_key');
    const storedAnthropicKey = localStorage.getItem('substream_anthropic_api_key');
    const storedModel = localStorage.getItem('substream_model_id');
    const storedRPM = localStorage.getItem('substream_rpm');
    const storedGeminiTier = localStorage.getItem('substream_gemini_tier');
    const storedUsage = localStorage.getItem('substream_daily_usage');
    const lastUsageDate = localStorage.getItem('substream_usage_date');
    const today = new Date().toDateString();

    if (storedGoogleKey) {
      setUserGoogleApiKey(storedGoogleKey);
      setTempGoogleApiKey(storedGoogleKey);
      setGoogleApiKeyStatus('validating');
      validateGoogleApiKey(storedGoogleKey).then(isValid => {
        setGoogleApiKeyStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) setUserGoogleApiKey('');
      }).catch(() => {
        setGoogleApiKeyStatus('invalid');
        setUserGoogleApiKey('');
      });
    }
    if (storedOpenAIKey) {
      setUserOpenAIApiKey(storedOpenAIKey);
      setTempOpenAIApiKey(storedOpenAIKey);
      setOpenAIApiKeyStatus('validating');
      validateOpenAIApiKey(storedOpenAIKey).then(isValid => {
        setOpenAIApiKeyStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) setUserOpenAIApiKey('');
      }).catch(() => {
        setOpenAIApiKeyStatus('invalid');
        setUserOpenAIApiKey('');
      });
    }
    if (storedAnthropicKey) {
      setUserAnthropicApiKey(storedAnthropicKey);
      setTempAnthropicApiKey(storedAnthropicKey);
      setAnthropicApiKeyStatus('validating');
      validateAnthropicApiKey(storedAnthropicKey).then(isValid => {
        setAnthropicApiKeyStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) setUserAnthropicApiKey('');
      }).catch(() => {
        setAnthropicApiKeyStatus('invalid');
        setUserAnthropicApiKey('');
      });
    }

    if (storedGeminiTier) {
      setSelectedGeminiTier(storedGeminiTier as GeminiTier);
    }

    if (storedRPM) {
      const parsedRpm = parseInt(storedRPM, 10);
      if (!isNaN(parsedRpm) && parsedRpm > 0) {
        setSelectedRPM(parsedRpm);
        setGlobalRPM(parsedRpm);
        if (![2, 5, 15, 20, 30, 50].includes(parsedRpm)) {
          setIsCustomRPM(true);
          setCustomRPMInput(parsedRpm.toString());
        }
      } else {
        setSelectedRPM(15);
        setGlobalRPM(15);
      }
    } else {
      setGlobalRPM(15); 
    }

    if (lastUsageDate === today && storedUsage) {
      setRequestsUsed(parseInt(storedUsage, 10));
    } else {
      setRequestsUsed(0);
      localStorage.setItem('substream_usage_date', today);
      localStorage.setItem('substream_daily_usage', '0');
    }

    const savedUser = getAuthItem('substream_google_user');
    const savedToken = getAuthItem('substream_google_token');
    const savedTimestamp = getAuthItem('substream_google_token_timestamp');
    const hasGoogleSession = getAuthItem('substream_google_session') || (savedUser && savedTimestamp);
    
    let isValidAuth = false;

    if (savedUser && hasGoogleSession && savedTimestamp) {
      const tokenAge = Date.now() - parseInt(savedTimestamp, 10);
      if (tokenAge < 30 * 24 * 60 * 60 * 1000) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setGoogleUser(parsedUser);
          isValidAuth = true;

          if (savedToken && tokenAge < 50 * 60 * 1000) {
            setGoogleAccessToken(savedToken);
          } else {
            // Silently refresh expired access token in the background
            requestGoogleAccessToken({ scope: YOUTUBE_SCOPE, prompt: '' })
              .then(freshToken => {
                setGoogleAccessToken(freshToken);
                setAuthItem('substream_google_token', freshToken, 1);
                setAuthItem('substream_google_token_timestamp', Date.now().toString(), 30);
                setAuthItem('substream_google_session', 'active', 30);
              })
              .catch(() => {
                // Keep the saved user in UI even if offline; avoid premature logout
              });
          }
        } catch (e) {
          console.error("Failed to parse saved user", e);
          handleGoogleLogout();
        }
      } else {
        handleGoogleLogout(); 
      }
    }

    const currentCachedModels = getCachedModels() || AVAILABLE_MODELS;
    const currentGoogleUser = isValidAuth ? JSON.parse(savedUser) : null;
    if (storedModel && isModelValidForCurrentAuth(storedModel, storedGoogleKey || '', storedOpenAIKey || '', storedAnthropicKey || '', currentGoogleUser, currentCachedModels)) {
      setSelectedModelId(storedModel);
    } else {
      const autoModel = resolveAvailableModel(storedGoogleKey || '', storedOpenAIKey || '', storedAnthropicKey || '', currentGoogleUser, currentCachedModels);
      setSelectedModelId(autoModel);
    }
    
    setIsAuthLoaded(true);
    handleSyncModels(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('substream_model_id', selectedModelId || '');
  }, [selectedModelId]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    const isValid = isModelValidForCurrentAuth(
      selectedModelId,
      userGoogleApiKey,
      userOpenAIApiKey,
      userAnthropicApiKey,
      googleUser,
      modelsList
    );

    if (!isValid) {
      const nextModel = resolveAvailableModel(
        userGoogleApiKey,
        userOpenAIApiKey,
        userAnthropicApiKey,
        googleUser,
        modelsList
      );
      setSelectedModelId(nextModel);
    }
  }, [userGoogleApiKey, userOpenAIApiKey, userAnthropicApiKey, googleUser, modelsList, isAuthLoaded]);

  // Debounced Key Validation Effects
  useEffect(() => {
    if (tempGoogleApiKey === '') {
      setGoogleApiKeyStatus('idle');
      return;
    }
    if (tempGoogleApiKey === userGoogleApiKey) {
      return;
    }
    setGoogleApiKeyStatus('validating');
    if (debounceGoogleKeyTimer.current) clearTimeout(debounceGoogleKeyTimer.current);

    debounceGoogleKeyTimer.current = setTimeout(() => {
      validateGoogleApiKey(tempGoogleApiKey)
        .then(isValid => {
          setGoogleApiKeyStatus(isValid ? 'valid' : 'invalid');
        })
        .catch(() => {
          setGoogleApiKeyStatus('invalid');
        });
    }, 800);

    return () => { if (debounceGoogleKeyTimer.current) clearTimeout(debounceGoogleKeyTimer.current); };
  }, [tempGoogleApiKey, userGoogleApiKey]);
  
  useEffect(() => {
    if (tempOpenAIApiKey === '') {
      setOpenAIApiKeyStatus('idle');
      return;
    }
    if (tempOpenAIApiKey === userOpenAIApiKey) {
      return;
    }
    setOpenAIApiKeyStatus('validating');
    if (debounceOpenAIKeyTimer.current) clearTimeout(debounceOpenAIKeyTimer.current);

    debounceOpenAIKeyTimer.current = setTimeout(() => {
      validateOpenAIApiKey(tempOpenAIApiKey)
        .then(isValid => {
          setOpenAIApiKeyStatus(isValid ? 'valid' : 'invalid');
        })
        .catch(() => {
          setOpenAIApiKeyStatus('invalid');
        });
    }, 800);

    return () => { if (debounceOpenAIKeyTimer.current) clearTimeout(debounceOpenAIKeyTimer.current); };
  }, [tempOpenAIApiKey, userOpenAIApiKey]);

  useEffect(() => {
    if (tempAnthropicApiKey === '') {
      setAnthropicApiKeyStatus('idle');
      return;
    }
    if (tempAnthropicApiKey === userAnthropicApiKey) {
      return;
    }
    setAnthropicApiKeyStatus('validating');
    if (debounceAnthropicKeyTimer.current) clearTimeout(debounceAnthropicKeyTimer.current);

    debounceAnthropicKeyTimer.current = setTimeout(() => {
      validateAnthropicApiKey(tempAnthropicApiKey)
        .then(isValid => {
          setAnthropicApiKeyStatus(isValid ? 'valid' : 'invalid');
        })
        .catch(() => {
          setAnthropicApiKeyStatus('invalid');
        });
    }, 800);

    return () => { if (debounceAnthropicKeyTimer.current) clearTimeout(debounceAnthropicKeyTimer.current); };
  }, [tempAnthropicApiKey, userAnthropicApiKey]);

  return {
    modelsList,
    syncInfo,
    isSyncingModels,
    modelSearchQuery,
    setModelSearchQuery,
    openGroups,
    toggleGroup,
    handleSyncModels,
    googleAccessToken,
    googleUser,
    handleGoogleLoginSuccess,
    handleGoogleLogout,
    selectedModelId,
    setSelectedModelId,
    selectedRPM,
    setSelectedRPM,
    isCustomRPM,
    setIsCustomRPM,
    customRPMInput,
    setCustomRPMInput,
    handleCustomRPMChange,
    selectedGeminiTier,
    setSelectedGeminiTier,
    userGoogleApiKey,
    tempGoogleApiKey,
    setTempGoogleApiKey,
    googleApiKeyStatus,
    clearGoogleApiKey: () => {
      setUserGoogleApiKey('');
      setTempGoogleApiKey('');
      localStorage.removeItem('substream_google_api_key');
      setGoogleApiKeyStatus('idle');
    },
    userOpenAIApiKey,
    tempOpenAIApiKey,
    setTempOpenAIApiKey,
    openAIApiKeyStatus,
    clearOpenAIApiKey: () => {
      setUserOpenAIApiKey('');
      setTempOpenAIApiKey('');
      localStorage.removeItem('substream_openai_api_key');
      setOpenAIApiKeyStatus('idle');
    },
    userAnthropicApiKey,
    tempAnthropicApiKey,
    setTempAnthropicApiKey,
    anthropicApiKeyStatus,
    clearAnthropicApiKey: () => {
      setUserAnthropicApiKey('');
      setTempAnthropicApiKey('');
      localStorage.removeItem('substream_anthropic_api_key');
      setAnthropicApiKeyStatus('idle');
    },
    activeModelData,
    activeApiKey,
    hasProAccess,
    remainingQuota,
    ensureMethodSelected,
    handleSaveKeys
  };
}
