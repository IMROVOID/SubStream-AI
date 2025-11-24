import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, ArrowRight, Download, Play, RefreshCw, Languages, Zap, AlertCircle, Settings, Key, BarChart3, Info, Cpu, CheckCircle2 } from 'lucide-react';
import { LANGUAGES, SubtitleNode, TranslationStatus, AVAILABLE_MODELS, AIModel } from './types';
import { parseSRT, stringifySRT, downloadFile } from './utils/srtUtils';
import { processFullSubtitleFile, BATCH_SIZE } from './services/geminiService';
import { Button } from './components/Button';
import { SubtitleCard } from './components/SubtitleCard';
import { StepIndicator } from './components/StepIndicator';
import { Modal } from './components/Modal';
import { Documentation } from './components/Documentation';

type Page = 'HOME' | 'DOCS';
type ModalType = 'NONE' | 'PRIVACY' | 'TOS' | 'CONFIG';

const ESTIMATED_DAILY_QUOTA = 1500; // Rough estimate for Free Tier

const App = () => {
  // Navigation State
  const [currentPage, setCurrentPage] = useState<Page>('HOME');
  const [activeModal, setActiveModal] = useState<ModalType>('NONE');

  // App Logic State
  const [file, setFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleNode[]>([]);
  const [status, setStatus] = useState<TranslationStatus>(TranslationStatus.IDLE);
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('es');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // API Key, Model & Quota State
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [tempApiKey, setTempApiKey] = useState<string>(''); // For the input field
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[0].id);
  const [requestsUsed, setRequestsUsed] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load persisted settings
  useEffect(() => {
    const storedKey = localStorage.getItem('substream_api_key');
    const storedModel = localStorage.getItem('substream_model_id');
    const storedUsage = localStorage.getItem('substream_daily_usage');
    const lastUsageDate = localStorage.getItem('substream_usage_date');
    const today = new Date().toDateString();

    if (storedKey) {
      setUserApiKey(storedKey);
      setTempApiKey(storedKey);
    }

    if (storedModel && AVAILABLE_MODELS.find(m => m.id === storedModel)) {
      setSelectedModelId(storedModel);
    }

    if (lastUsageDate === today && storedUsage) {
      setRequestsUsed(parseInt(storedUsage, 10));
    } else {
      // Reset usage if new day
      setRequestsUsed(0);
      localStorage.setItem('substream_usage_date', today);
      localStorage.setItem('substream_daily_usage', '0');
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('substream_api_key', tempApiKey);
    setUserApiKey(tempApiKey);
    
    localStorage.setItem('substream_model_id', selectedModelId);
    
    setActiveModal('NONE');
  };

  const clearApiKey = () => {
    localStorage.removeItem('substream_api_key');
    setUserApiKey('');
    setTempApiKey('');
  };

  const updateUsage = (newRequests: number) => {
    const total = requestsUsed + newRequests;
    setRequestsUsed(total);
    localStorage.setItem('substream_daily_usage', total.toString());
    localStorage.setItem('substream_usage_date', new Date().toDateString());
  };

  // Derived Calculations
  const estimatedRequests = subtitles.length > 0 ? Math.ceil(subtitles.length / BATCH_SIZE) : 0;
  const remainingQuota = Math.max(0, ESTIMATED_DAILY_QUOTA - requestsUsed);
  const quotaPercentage = Math.min(100, (requestsUsed / ESTIMATED_DAILY_QUOTA) * 100);
  const activeModelData = AVAILABLE_MODELS.find(m => m.id === selectedModelId) || AVAILABLE_MODELS[0];

  // Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.srt')) {
        setError("Please upload a valid .srt file");
        return;
      }
      setFile(selectedFile);
      setError(null);
      parseFile(selectedFile);
    }
  };

  const parseFile = async (f: File) => {
    setStatus(TranslationStatus.PARSING);
    const text = await f.text();
    try {
      const parsed = parseSRT(text);
      if (parsed.length === 0) {
        setError("No subtitles found in file.");
        setStatus(TranslationStatus.IDLE);
        return;
      }
      setSubtitles(parsed);
      setStatus(TranslationStatus.IDLE);
    } catch (e) {
      setError("Failed to parse SRT file.");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleTranslate = async () => {
    if (subtitles.length === 0) return;
    
    // Check if user has enough "quota" locally or if they need a key
    if (!userApiKey && !process.env.API_KEY) {
      setActiveModal('CONFIG');
      setError("Please Provide an API Key to continue.");
      return;
    }

    setStatus(TranslationStatus.TRANSLATING);
    setProgress(0);
    setError(null);

    // Scroll to results
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      const result = await processFullSubtitleFile(
        subtitles,
        sourceLang,
        targetLang,
        userApiKey || null,
        selectedModelId,
        (count) => {
          setProgress(Math.round((count / subtitles.length) * 100));
        }
      );
      
      setSubtitles(result); // Update with final results
      updateUsage(estimatedRequests); // Update local quota tracker
      setStatus(TranslationStatus.COMPLETED);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An error occurred during translation. Please try again.");
      setStatus(TranslationStatus.ERROR);
    }
  };

  const handleDownload = () => {
    if (subtitles.length === 0) return;
    const content = stringifySRT(subtitles);
    const filename = file ? `translated_${file.name}` : 'translated_subtitles.srt';
    downloadFile(filename, content);
  };

  // Render Documentation Page
  if (currentPage === 'DOCS') {
    return <Documentation onBack={() => setCurrentPage('HOME')} />;
  }

  // Render Main App
  return (
    <div className="min-h-screen bg-black text-neutral-200 font-sans selection:bg-white selection:text-black">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-neutral-900/30 blur-[120px] rounded-full mix-blend-screen" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-neutral-800/20 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* Navigation - Enhanced Blur */}
      <nav className="relative z-20 border-b border-neutral-900 bg-black/80 backdrop-blur-xl sticky top-0 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 bg-white text-black flex items-center justify-center font-bold text-xl rounded-lg font-display">S</div>
            <span className="font-display font-bold text-lg tracking-tight">SubStream <span className="text-neutral-600 font-sans font-normal text-sm ml-2">AI</span></span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-400">
             
             <button onClick={() => setCurrentPage('DOCS')} className="hover:text-white transition-colors focus:outline-none">Documentation</button>
             
             {/* Unified Model & API Key Selector */}
             <button 
                onClick={() => setActiveModal('CONFIG')}
                className={`flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-xl border transition-all group ${userApiKey ? 'bg-neutral-900/50 border-neutral-800 hover:border-white/30' : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-600'}`}
             >
                <div className="text-xs text-right">
                   <div className="font-bold text-white">
                       {activeModelData.name}
                   </div>
                   <div className={`text-[10px] uppercase ${userApiKey ? 'text-green-400' : 'text-neutral-500'}`}>
                       {userApiKey ? 'Pro Access' : `${remainingQuota} Credits`}
                   </div>
                </div>
                
                <div className={`w-8 h-8 rounded-full border relative flex items-center justify-center ${userApiKey ? 'border-green-900/50 bg-green-900/20' : 'border-neutral-700 bg-neutral-800/50'}`}>
                   <Cpu className={`w-4 h-4 ${userApiKey ? 'text-green-400' : 'text-neutral-400 group-hover:text-white'}`} />
                </div>
             </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 md:py-20">
        
        {/* Header Section */}
        <section className="mb-20 text-center">
          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter text-white mb-6 animate-slide-up">
            Bridge the Language <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-neutral-700">Gap Instantly.</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{animationDelay: '0.1s'}}>
            Transform your subtitles with context-aware AI. 
            Powered by Google's {activeModelData.name} for nuance and accuracy across {LANGUAGES.length}+ languages.
          </p>
        </section>

        {/* Workflow Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Steps Sidebar (Sticky) */}
          <div className="lg:col-span-3">
             <div className="sticky top-32 space-y-8 p-6 rounded-2xl border border-neutral-900 bg-neutral-950/50 backdrop-blur-sm">
               <StepIndicator 
                 number={1} 
                 title="Upload" 
                 isActive={status === TranslationStatus.IDLE && !file} 
                 isCompleted={!!file} 
               />
               <StepIndicator 
                 number={2} 
                 title="Configure" 
                 isActive={!!file && status !== TranslationStatus.TRANSLATING && status !== TranslationStatus.COMPLETED} 
                 isCompleted={status === TranslationStatus.TRANSLATING || status === TranslationStatus.COMPLETED} 
               />
               <StepIndicator 
                 number={3} 
                 title="Translate" 
                 isActive={status === TranslationStatus.TRANSLATING} 
                 isCompleted={status === TranslationStatus.COMPLETED} 
               />
               <StepIndicator 
                 number={4} 
                 title="Download" 
                 isActive={status === TranslationStatus.COMPLETED} 
                 isCompleted={false} 
               />
             </div>
          </div>

          {/* Action Area */}
          <div className="lg:col-span-9 space-y-8">

            {/* Step 1: Upload */}
            <div className="group relative rounded-3xl border border-neutral-800 bg-neutral-900/20 p-8 md:p-12 hover:bg-neutral-900/30 transition-all duration-300">
               {!file ? (
                 <div 
                   className="flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px]"
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => {
                     e.preventDefault();
                     const droppedFile = e.dataTransfer.files[0];
                     if(droppedFile && droppedFile.name.endsWith('.srt')) {
                       setFile(droppedFile);
                       parseFile(droppedFile);
                     } else {
                        setError("Only .srt files are supported.");
                     }
                   }}
                   onClick={() => fileInputRef.current?.click()}
                 >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".srt" 
                      onChange={handleFileChange} 
                    />
                    <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Upload className="text-white w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Drop your SRT file here</h2>
                    <p className="text-neutral-500">or click to browse local files</p>
                 </div>
               ) : (
                 <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">{file.name}</h3>
                            <p className="text-neutral-500 text-sm">{subtitles.length} lines parsed</p>
                          </div>
                        </div>
                        <Button variant="outline" onClick={() => {
                            setFile(null); 
                            setSubtitles([]);
                            setStatus(TranslationStatus.IDLE);
                            setProgress(0);
                        }}>
                          Change File
                        </Button>
                    </div>

                    {/* Cost Estimation Banner */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-900/20 border border-indigo-900/40 text-indigo-300 text-sm">
                        <Info className="w-4 h-4 shrink-0" />
                        <span>Processing this file will require approximately <strong>{estimatedRequests} API requests</strong>.</span>
                    </div>
                 </div>
               )}
            </div>

            {/* Step 2: Controls */}
            {file && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                  <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Source Language</label>
                    <div className="relative">
                      <select 
                        className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                        value={sourceLang}
                        onChange={(e) => setSourceLang(e.target.value)}
                        disabled={status === TranslationStatus.TRANSLATING}
                      >
                        <option value="auto">✨ Auto Detect</option>
                        {LANGUAGES.map(l => <option key={`source-${l.code}`} value={l.name}>{l.name}</option>)}
                      </select>
                      <Languages className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Target Language</label>
                    <div className="relative">
                      <select 
                         className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                         value={targetLang}
                         onChange={(e) => setTargetLang(e.target.value)}
                         disabled={status === TranslationStatus.TRANSLATING}
                      >
                         {LANGUAGES.map(l => <option key={`target-${l.code}`} value={l.name}>{l.name}</option>)}
                      </select>
                      <ArrowRight className="absolute right-4 top-3.5 w-5 h-5 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
               </div>
            )}

            {/* Action Buttons */}
            {file && (
              <div className="flex justify-end gap-4 animate-fade-in">
                {status === TranslationStatus.TRANSLATING ? (
                  <div className="flex-1 p-4 rounded-xl border border-neutral-800 bg-neutral-900/50 flex items-center gap-4">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <div className="flex-1">
                       <div className="flex justify-between text-xs font-medium mb-1">
                         <span>Translating with {activeModelData.name}...</span>
                         <span>{progress}%</span>
                       </div>
                       <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-white transition-all duration-300" style={{width: `${progress}%`}}></div>
                       </div>
                    </div>
                  </div>
                ) : (
                  <Button 
                    onClick={handleTranslate}
                    className="w-full md:w-auto text-lg"
                    icon={<Zap className="w-5 h-5" />}
                  >
                    Start Translation
                  </Button>
                )}
              </div>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-900/10 border border-red-900/40 text-red-200 text-sm flex items-center gap-3 animate-fade-in">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{error}</span>
              </div>
            )}

          </div>
        </div>

        {/* Step 3 & 4: Results Section */}
        {subtitles.length > 0 && (status === TranslationStatus.TRANSLATING || status === TranslationStatus.COMPLETED) && (
          <section ref={resultsRef} className="mt-24 border-t border-neutral-900 pt-12 animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">Live Preview</h2>
                <p className="text-neutral-500">Comparing original vs translated output.</p>
              </div>
              {status === TranslationStatus.COMPLETED && (
                <Button variant="primary" onClick={handleDownload} icon={<Download className="w-5 h-5"/>}>
                  Download SRT
                </Button>
              )}
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-black/50 backdrop-blur overflow-hidden min-h-[400px]">
              <div className="grid grid-cols-[100px_1fr] border-b border-neutral-800 bg-neutral-900/50 p-4 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky top-0 z-10">
                <div className="pl-2">Timestamp</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <span>Original ({sourceLang})</span>
                   <span className="text-white">Translated ({targetLang})</span>
                </div>
              </div>
              
              <div className="max-h-[800px] overflow-y-auto">
                {subtitles.map((sub) => (
                  <SubtitleCard 
                    key={sub.id} 
                    subtitle={sub} 
                    isActive={sub.text !== sub.originalText}
                  />
                ))}
              </div>
            </div>
            
            {status === TranslationStatus.COMPLETED && (
               <div className="mt-8 flex justify-center">
                  <Button variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} icon={<RefreshCw className="w-4 h-4" />}>
                     Translate Another File
                  </Button>
               </div>
            )}
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 py-12 bg-black mt-20 relative z-10">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-neutral-500 text-sm">
              &copy; 2025 SubStream AI. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-neutral-500 text-sm">
               <button onClick={() => setActiveModal('PRIVACY')} className="hover:text-white transition-colors">Privacy Policy</button>
               <button onClick={() => setActiveModal('TOS')} className="hover:text-white transition-colors">Terms of Service</button>
            </div>
         </div>
      </footer>

      {/* OVERLAYS / MODALS */}
      <Modal isOpen={activeModal === 'CONFIG'} onClose={() => setActiveModal('NONE')} title="AI Configuration">
        <div className="space-y-8">
           
           {/* Model Selection Section */}
           <div>
              <label className="block text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Select AI Model
              </label>
              <div className="grid grid-cols-1 gap-3">
                {AVAILABLE_MODELS.map((model) => (
                  <div 
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                    className={`relative cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedModelId === model.id ? 'bg-neutral-800 border-white' : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50 hover:border-neutral-700'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white mb-1">{model.name}</h4>
                        <p className="text-xs text-neutral-400 leading-relaxed pr-8">{model.description}</p>
                      </div>
                      {selectedModelId === model.id && (
                        <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {model.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-neutral-400 border border-neutral-800">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
           </div>

           <div className="h-px bg-neutral-800 w-full"></div>

           {/* API Key Section */}
           <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4" /> Custom API Key
                </label>
                <div className="relative">
                   <input 
                    type="password"
                    placeholder="AIzaSy..."
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-white focus:outline-none transition-colors"
                   />
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                  Required for heavy usage. Stored locally in your browser.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                {userApiKey && (
                  <button onClick={clearApiKey} className="text-sm text-red-500 hover:text-red-400 px-4 py-2">
                    Clear Key
                  </button>
                )}
                <Button onClick={saveSettings}>
                  Save Settings
                </Button>
              </div>
           </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'PRIVACY'} onClose={() => setActiveModal('NONE')} title="Privacy Policy">
         <div className="space-y-4 text-sm text-neutral-300">
            <p>Last Updated: November 2025</p>
            <h3 className="text-white font-bold text-lg">1. Data Collection</h3>
            <p>We do not store your subtitle files. All processing is done in-memory and via the Gemini API. Once your session ends, your data is cleared from our interface.</p>
            <h3 className="text-white font-bold text-lg">2. Third-Party Services</h3>
            <p>We use Google's Gemini API for processing translations. Data sent to Google is subject to their data processing terms.</p>
            <h3 className="text-white font-bold text-lg">3. User Rights</h3>
            <p>You retain full ownership of your uploaded content.</p>
         </div>
      </Modal>

      <Modal isOpen={activeModal === 'TOS'} onClose={() => setActiveModal('NONE')} title="Terms of Service">
         <div className="space-y-4 text-sm text-neutral-300">
            <p>Last Updated: November 2025</p>
            <h3 className="text-white font-bold text-lg">1. Usage</h3>
            <p>SubStream AI is provided "as is" for subtitle translation purposes. Do not use for illegal content.</p>
            <h3 className="text-white font-bold text-lg">2. Limitations</h3>
            <p>We do not guarantee 100% accuracy in translations. AI models can hallucinate or misinterpret context.</p>
            <h3 className="text-white font-bold text-lg">3. Liability</h3>
            <p>We are not liable for any damages arising from the use of this tool.</p>
         </div>
      </Modal>

    </div>
  );
};

export default App;