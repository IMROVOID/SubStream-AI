import React, { useState, useMemo } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import { ScrollFadeContainer } from '../common/ScrollFadeContainer';
import { DOCS_DATA, DocItem } from './DocData';

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
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-neutral-900/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 md:py-12 flex flex-col min-h-screen lg:h-screen">
        <div className="flex items-center justify-between mb-6 md:mb-8 shrink-0">
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
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Search guides..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-1 focus:ring-white focus:border-white transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:overflow-hidden lg:min-h-0">
          <div className="lg:col-span-3 bg-neutral-900/30 border border-neutral-800/80 lg:bg-transparent lg:border-0 rounded-2xl lg:rounded-none p-4 sm:p-5 lg:p-0 max-h-[260px] overflow-y-auto lg:max-h-none lg:pr-2 custom-scrollbar lg:pb-10">
            <div className="relative w-full md:hidden mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/60 border border-neutral-800 rounded-xl py-3 pl-12 pr-4 text-white outline-none"
              />
            </div>

            <div className="space-y-2">
              {groupedDocs.length > 0 ? (
                groupedDocs.map((group) => (
                  <div key={group.category} className="animate-slide-up mb-6 relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
                      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{group.category}</h3>
                    </div>
                    
                    <div className="absolute left-[3px] top-6 bottom-4 w-px bg-neutral-900"></div>
                    
                    <div className="space-y-1 relative">
                      {group.docs.map((doc) => (
                        <div key={doc.id} className="relative pl-6">
                          <div className="absolute left-[3px] top-0 h-[24px] w-4 border-l border-b border-neutral-800 rounded-bl-xl"></div>
                          
                          <button
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-all flex items-center justify-between group relative ${
                              selectedDocId === doc.id
                                ? 'text-white bg-neutral-800/50 font-medium'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-900/30'
                            }`}
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

          <div className="lg:col-span-9 bg-transparent lg:bg-neutral-900/30 border-0 lg:border border-neutral-800 rounded-none lg:rounded-3xl overflow-hidden backdrop-blur-none lg:backdrop-blur-sm relative flex flex-col">
            <ScrollFadeContainer 
              className="w-full h-full p-0 sm:p-2 lg:p-12 lg:overflow-y-auto custom-scrollbar"
              topFadeClassName="from-black lg:from-[#121212] via-black/40 lg:via-[#121212]/40 to-transparent"
              bottomFadeClassName="from-black lg:from-[#121212] via-black/40 lg:via-[#121212]/40 to-transparent"
              roundedCorner="rounded-none lg:rounded-3xl"
            >
              <div key={selectedDocId} className="max-w-3xl mx-auto pb-4 md:pb-6 animate-fade-in">
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
                  <span>Last updated: November 2025</span>
                </div>
              </div>
            </ScrollFadeContainer>
          </div>
        </div>
      </div>
    </div>
  );
};