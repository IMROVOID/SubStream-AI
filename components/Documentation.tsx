
import React, { useState, useMemo } from 'react';
import { Search, ArrowLeft, ChevronRight, AlertCircle, FileText, Zap, Shield, Cpu, Layers, Key, Gauge } from 'lucide-react';

interface DocItem {
  id: string;
  title: string;
  category: string;
  content: React.ReactNode;
}

const DOCS_DATA: DocItem[] = [
  // --- GENERAL ---
  {
    id: 'intro',
    title: 'Getting Started',
    category: 'General',
    content: (
      <div className="space-y-6">
        <p className="text-lg leading-relaxed text-neutral-300">
          SubStream AI is a next-generation subtitle translation tool powered by Google's <strong className="text-white">Gemini</strong> models. 
          Unlike traditional translators that process line-by-line, SubStream understands the full context of a scene, ensuring dialogue flows naturally in the target language.
        </p>
        
        <div className="p-6 bg-neutral-900/40 rounded-2xl border border-neutral-800">
          <h3 className="text-xl font-bold text-white mb-4">Quick Start</h3>
          <ol className="relative border-l border-neutral-800 ml-3 space-y-6">
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-neutral-600 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Upload</h4>
              <p className="text-neutral-400 text-sm">Drag & drop your <code>.srt</code> file into the upload zone.</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-neutral-600 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Select Languages</h4>
              <p className="text-neutral-400 text-sm">Choose your target language. Source language is auto-detected by default.</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-neutral-600 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Translate</h4>
              <p className="text-neutral-400 text-sm">Click "Start Translation". The AI processes subtitles in smart batches.</p>
            </li>
             <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-green-500 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Download</h4>
              <p className="text-neutral-400 text-sm">Review the side-by-side preview and download your new SRT file.</p>
            </li>
          </ol>
        </div>
      </div>
    )
  },
  {
    id: 'limits',
    title: 'File Limits & Formats',
    category: 'General',
    content: (
      <div className="space-y-6">
        <p>Ensure your files meet the following criteria for optimal processing:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-bold uppercase text-neutral-400">Supported Format</span>
            </div>
            <span className="text-xl text-white font-medium">.SRT (SubRip)</span>
            <p className="text-xs text-neutral-500 mt-1">UTF-8 Encoding recommended</p>
          </div>
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
             <div className="flex items-center gap-3 mb-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              <span className="text-sm font-bold uppercase text-neutral-400">Max File Size</span>
            </div>
            <span className="text-xl text-white font-medium">~5 MB</span>
            <p className="text-xs text-neutral-500 mt-1">Approx. 2 hours of dialogue</p>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-yellow-900/10 border border-yellow-900/30 text-yellow-200/80 text-sm">
          <strong>Note:</strong> Very large files are processed in chunks. Ensure you have a stable internet connection during the process.
        </div>
      </div>
    )
  },
  
  // --- SETUP ---
  {
    id: 'api-config',
    title: 'Model & API Config',
    category: 'Setup',
    content: (
      <div className="space-y-4">
        <p>SubStream AI supports using your own Google Gemini API Key and selecting different AI models.</p>
        
        <div className="flex items-start gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 mt-4">
           <Cpu className="w-6 h-6 text-green-400 shrink-0 mt-1" />
           <div>
              <h4 className="font-bold text-white">Changing Models</h4>
              <p className="text-sm text-neutral-400 mt-2 mb-3">
                 Click the Model Name in the top right of the navigation bar. 
                 This opens the Configuration overlay where you can switch between <strong>Gemini 3 Pro</strong> (Best Quality), <strong>Gemini 2.5 Pro/Flash</strong>, and others to suit your needs.
              </p>
           </div>
        </div>

        <div className="flex items-start gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 mt-4">
           <Key className="w-6 h-6 text-green-400 shrink-0 mt-1" />
           <div>
              <h4 className="font-bold text-white">Using Custom API Keys</h4>
              <p className="text-sm text-neutral-400 mt-2 mb-3">
                 In the same Configuration overlay, paste your key starting with <code>AIzaSy...</code>.
              </p>
              <ul className="list-disc list-inside text-xs text-neutral-500 space-y-1">
                 <li>Your key is stored in your browser's local storage.</li>
                 <li>It is never sent to our servers, only directly to Google APIs.</li>
                 <li>You can clear it at any time.</li>
              </ul>
           </div>
        </div>

      </div>
    )
  },
  {
    id: 'quota-estimation',
    title: 'Quota & Estimations',
    category: 'Setup',
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Gauge className="w-6 h-6 text-cyan-400" />
          <h3 className="text-xl font-bold text-white">Understanding Usage</h3>
        </div>
        <p>
          The app displays an estimated "Cost" in API requests when you upload a file. 
        </p>
        <div className="p-4 rounded-lg bg-neutral-800/30 border-l-4 border-cyan-500">
           <p className="text-white font-medium">Formula:</p>
           <code className="block mt-2 text-cyan-300 font-mono text-sm">Total API Requests = Total Subtitle Lines / 10</code>
        </div>
        <p className="text-sm text-neutral-400">
           We batch subtitles in groups of 10 to optimize for context and speed. A typical movie with 1,500 lines will consume approximately 150 API requests.
        </p>
        <p className="text-sm text-neutral-400">
           The "Remaining Requests" indicator in the top right is a local estimator based on the standard Gemini Free Tier limit (1,500 requests/day). It resets daily on your browser.
        </p>
      </div>
    )
  },

  // --- FEATURES ---
  {
    id: 'context-aware',
    title: 'Context Awareness',
    category: 'Features',
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-indigo-400" />
          <h3 className="text-xl font-bold text-white">Smart Batching</h3>
        </div>
        <p>
          Standard translators translate one line at a time, often resulting in broken sentences when a speaker's thought spans multiple subtitles.
        </p>
        <p>
          <strong>SubStream AI</strong> groups subtitles into "Semantic Batches" (typically 10-20 lines). It sends the entire batch to Gemini 3 Pro, allowing the model to:
        </p>
        <ul className="space-y-2 list-disc list-inside text-neutral-300">
          <li>See the previous and next lines before translating.</li>
          <li>Understand gender and formality (e.g., distinct "You" in Spanish/French).</li>
          <li>Maintain consistent terminology for names and places.</li>
        </ul>
      </div>
    )
  },
  {
    id: 'advanced-settings',
    title: 'Advanced Settings',
    category: 'Features',
    content: (
      <div className="space-y-4">
        <p>Currently, the app uses optimized default settings for the best balance of speed and quality.</p>
        <div className="grid grid-cols-1 gap-4 mt-4">
          <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/30">
            <h4 className="font-bold text-white mb-1">Temperature: 0.7</h4>
            <p className="text-sm text-neutral-400">Balanced for creativity and accuracy. Ensures translations aren't too robotic but stick to the original meaning.</p>
          </div>
           <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/30">
            <h4 className="font-bold text-white mb-1">Model Selection</h4>
            <p className="text-sm text-neutral-400">You can now switch between models via the top navigation bar. Use <strong>Flash</strong> models for speed and <strong>Pro</strong> models for quality.</p>
          </div>
        </div>
      </div>
    )
  },

  // --- SUPPORT ---
  {
    id: 'common-errors',
    title: 'Common Errors',
    category: 'Support',
    content: (
      <div className="space-y-6">
        <p>If you encounter issues, check the error code or message displayed.</p>

        <div className="space-y-4">
          {/* Error 1 */}
          <div className="flex gap-4 p-4 bg-red-950/20 border border-red-900/30 rounded-xl">
             <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
             <div>
               <h4 className="text-red-200 font-bold">Translation Failed (500 / XHR Error)</h4>
               <p className="text-sm text-red-200/70 mt-1">
                 This usually means the AI service is temporarily overloaded or the batch size was too large for the network.
               </p>
               <div className="mt-3 p-2 bg-black/40 rounded text-xs font-mono text-red-300">
                 Fix: The app automatically retries. If it fails repeatedly, try refreshing the page or checking your internet connection.
               </div>
             </div>
          </div>

          {/* Error 2 */}
          <div className="flex gap-4 p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl">
             <Shield className="w-6 h-6 text-orange-400 shrink-0" />
             <div>
               <h4 className="text-white font-bold">Empty Output / Safety Filter</h4>
               <p className="text-sm text-neutral-400 mt-1">
                 Gemini has built-in safety filters. If your subtitle file contains extreme violence, hate speech, or explicit content, the model may refuse to generate text.
               </p>
             </div>
          </div>

          {/* Error 3 */}
          <div className="flex gap-4 p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl">
             <Zap className="w-6 h-6 text-yellow-400 shrink-0" />
             <div>
               <h4 className="text-white font-bold">Rate Limit Exceeded (429)</h4>
               <p className="text-sm text-neutral-400 mt-1">
                 You are sending too many requests too quickly. The app has a built-in delay (1 second) between batches to prevent this, but it can still happen under heavy load.
               </p>
             </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'parsing-issues',
    title: 'Parsing Issues',
    category: 'Support',
    content: (
      <div className="space-y-4">
        <p>If the app says <strong>"Failed to parse SRT file"</strong> or shows 0 lines:</p>
        <ul className="list-disc list-inside space-y-2 text-neutral-300 text-sm">
          <li>Check if the file is a valid <code>.srt</code>. It should look like this:</li>
        </ul>
        <div className="bg-black p-4 rounded-lg border border-neutral-800 font-mono text-xs text-neutral-400">
          1<br/>
          00:00:01,000 --> 00:00:04,000<br/>
          Hello world.
        </div>
        <ul className="list-disc list-inside space-y-2 text-neutral-300 text-sm pt-2">
          <li>Ensure the file encoding is <strong>UTF-8</strong>.</li>
          <li>Some SRT files have malformed timestamps (e.g., using dots instead of commas). SubStream tries to correct this, but severe errors may fail.</li>
        </ul>
      </div>
    )
  }
];

interface DocumentationProps {
  onBack: () => void;
}

export const Documentation: React.FC<DocumentationProps> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string>(DOCS_DATA[0].id);

  const groupedDocs = useMemo(() => {
    const groups: Record<string, DocItem[]> = {};
    const filtered = DOCS_DATA.filter(doc => 
       doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
       (typeof doc.content === 'string' && doc.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    filtered.forEach(doc => {
      if (!groups[doc.category]) groups[doc.category] = [];
      groups[doc.category].push(doc);
    });

    // Get unique categories in original order
    const uniqueCategories = Array.from(new Set(DOCS_DATA.map(d => d.category)));
    
    return uniqueCategories
      .filter(cat => groups[cat] && groups[cat].length > 0)
      .map(cat => ({
        category: cat,
        docs: groups[cat]
      }));
  }, [searchQuery]);

  const activeDoc = DOCS_DATA.find(d => d.id === selectedDocId) || DOCS_DATA[0];

  return (
    <div className="min-h-screen bg-black text-neutral-200 animate-fade-in flex flex-col">
       {/* Background Ambience */}
       <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-neutral-900/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 py-8 md:py-12 flex flex-col h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 rounded-full hover:bg-neutral-800 transition-colors group"
            >
              <ArrowLeft className="w-6 h-6 text-neutral-400 group-hover:text-white" />
            </button>
            <h1 className="text-3xl font-display font-bold text-white">Documentation</h1>
          </div>
          
          <div className="relative w-full max-w-md hidden md:block">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search guides..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-1 focus:ring-white focus:border-white transition-all outline-none"
            />
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-hidden min-h-0">
          
          {/* Sidebar - Tree View Style */}
          <div className="lg:col-span-3 overflow-y-auto pr-2 custom-scrollbar pb-10">
            
            {/* Mobile Search */}
            <div className="relative w-full md:hidden mb-6 sticky top-0 bg-black z-10 py-2">
              <Search className="absolute left-4 top-5 w-5 h-5 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl py-3 pl-12 pr-4 text-white outline-none"
              />
            </div>

            <div className="space-y-2">
              {groupedDocs.length > 0 ? (
                groupedDocs.map((group) => (
                  <div key={group.category} className="animate-slide-up mb-6 relative">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
                      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{group.category}</h3>
                    </div>
                    
                    {/* Tree Vertical Line - Runs from header down to last item */}
                    <div className="absolute left-[3px] top-6 bottom-4 w-px bg-neutral-900"></div>
                    
                    <div className="space-y-1 relative">
                      {group.docs.map((doc, index) => (
                        <div key={doc.id} className="relative pl-6">
                          {/* Curved Connector for Tree View */}
                          <div className="absolute left-[3px] top-0 h-[24px] w-4 border-l border-b border-neutral-800 rounded-bl-xl"></div>
                          
                          <button
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-all flex items-center justify-between group relative
                              ${selectedDocId === doc.id
                                ? 'text-white bg-neutral-800/50 font-medium'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-900/30'
                              }
                            `}
                          >
                            <span className="truncate">{doc.title}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-neutral-500 text-sm italic px-4">No matching articles found.</div>
              )}
            </div>
          </div>

          {/* Main Reading Area */}
          <div className="lg:col-span-9 bg-neutral-900/30 border border-neutral-800 rounded-3xl p-8 md:p-12 overflow-y-auto custom-scrollbar backdrop-blur-sm relative">
            <div className="max-w-3xl mx-auto pb-20">
              <div className="flex items-center gap-3 mb-6">
                 <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase tracking-wider">
                    <span>{activeDoc.category}</span>
                    <span className="text-neutral-600">/</span>
                    <span className="text-white">{activeDoc.title}</span>
                 </div>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-8 tracking-tight">{activeDoc.title}</h1>
              
              <div className="prose prose-invert prose-lg prose-neutral max-w-none text-neutral-300">
                {activeDoc.content}
              </div>

              <div className="mt-16 pt-8 border-t border-neutral-800 flex items-center justify-between text-sm text-neutral-500">
                <span>Last updated: Feb 2025</span>
                <div className="flex gap-4">
                   <button className="flex items-center gap-2 hover:text-white transition-colors">
                      <FileText className="w-4 h-4" /> Suggest Edit
                   </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};