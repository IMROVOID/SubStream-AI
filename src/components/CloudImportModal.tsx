import React, { useState, useEffect, useRef } from 'react';
import { HardDrive, Search, ArrowLeft, Folder, FileVideo, FileText, ChevronRight, ChevronDown, Download, Loader2, LogOut, LayoutGrid, AlertCircle, Clock, Database, Calendar, RefreshCw, Film, Captions, Menu, X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { DriveFile } from '../types';
import { listDriveFiles, downloadDriveFile } from '../services/googleDriveService';

interface CloudImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFile: (file: File) => void;
}

type Step = 'PROVIDERS' | 'AUTH_GDRIVE' | 'EXPLORER';
type ViewMode = 'GRID' | 'LIST';

// --- SVG ICONS ---
const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 2048 2048" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M2048 1403L1807.52 1823.87C1786.13 1858.36 1756.1 1886.66 1720.4 1905.97C1684.71 1925.27 1644.59 1934.91 1604.02 1933.93H444.259C403.689 1934.91 363.567 1925.27 327.87 1905.97C292.173 1886.66 262.142 1858.36 240.753 1823.87L142 1651.02L550.718 1403H2048Z" fill="#4285F4"/>
    <path d="M749.556 124C694.923 143.602 649.036 181.981 620.087 232.285L34.7273 1233.7C13.402 1268.24 1.47482 1307.75 0.128208 1348.31C-1.2184 1388.88 8.06235 1429.09 27.0503 1464.97L143.115 1652L550.479 1403.61L1024 593.519L749.556 124Z" fill="#00AC47"/>
    <path d="M550 1403H5C8.94846 1424.51 16.3732 1445.23 26.9825 1464.36L142.353 1650.51L141.481 1651.05L240.205 1823.89C263.849 1863 299.361 1893.52 341.56 1911L550 1403Z" fill="#0066DA"/>
    <path d="M1297.45 124C1352.08 143.6 1397.96 181.98 1426.9 232.285L2012.27 1233.7C2033.6 1268.24 2045.52 1307.75 2046.87 1348.31C2048.22 1388.88 2038.94 1429.09 2019.95 1464.97L1903.93 1652L1496.52 1403.61L1023 593.519L1297.45 124Z" fill="#FFBA00"/>
    <path d="M1497 1403H2042C2038.05 1424.51 2030.63 1445.23 2020.02 1464.36L1904.62 1650.52L1905.5 1651.05L1806.79 1823.89C1783.15 1862.99 1747.64 1893.51 1705.44 1911L1497 1403Z" fill="#EA4435"/>
    <path d="M1297.62 124.192L1297.8 123.889C1288.86 120.786 1279.73 118.292 1270.46 116.423L1023.8 114L777.129 116.423C767.86 118.292 758.729 120.786 749.795 123.889C740.26 127.481 730.974 131.709 722 136.542L1022.95 594L1325 136.732C1316.16 131.956 1307.01 127.767 1297.62 124.192Z" fill="#188038"/>
  </svg>
);

const MegaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 1024 1024" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle fill="#D9272E" cx="512" cy="512" r="512"/>
    <path fill="#FFFFFF" d="M512,256.1c-141.3,0-255.9,114.5-255.9,255.9S370.7,767.9,512,767.9S767.9,653.3,767.9,512
      S653.3,256.1,512,256.1z M644.8,602.5c0,4.4-3.5,7.9-7.9,7.9c0,0,0,0-0.1,0h-33.4c-4.4,0-7.9-3.5-7.9-7.9c0,0,0,0,0,0V499.5
      c0-0.9-1-1.3-1.7-0.7L523,569.6c-6.2,6.1-16.1,6.1-22.2,0L430,498.8c-0.6-0.6-1.7-0.1-1.7,0.7v102.9c0,4.4-3.5,7.9-7.9,7.9
      c0,0,0,0,0,0H387c-4.4,0-7.9-3.5-7.9-7.9c0,0,0,0,0,0v-181c0-4.4,3.5-7.9,7.9-7.9h22.9c4.2,0,8.2,1.7,11.2,4.7l88.1,88.1
      c1.5,1.5,3.9,1.6,5.4,0.1c0,0,0.1-0.1,0.1-0.1l88.1-88.1c3-3,6.9-4.7,11.2-4.7h22.9c4.4,0,7.9,3.5,7.9,7.9L644.8,602.5z"/>
  </svg>
);

const DropboxIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 128 128" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect clipRule="evenodd" fill="none" fillRule="evenodd" height="128" width="128"/>
    <path clipRule="evenodd" d="M128,28.78L90.348,4L64,26.167l37.964,23.626    L128,28.78z M64.077,78.191l-26.424,22.102l-11.308-7.443v8.342L64.077,124l37.732-22.808v-8.342l-11.308,7.443L64.077,78.191z     M37.653,4L0.001,28.779l26.036,21.014l37.964-23.626L37.653,4z M64,73.422L37.652,95.589L0,70.809l26.036-21.014L64,73.422    l37.963-23.63l26.036,21.018L90.347,95.589L64,73.422L64,73.422z" fill="#0F82E2" fillRule="evenodd"/>
  </svg>
);

// --- Recursive Folder Tree Item ---
const FolderTreeItem: React.FC<{
    folder: { id: string, name: string };
    activeFolderId: string;
    level: number;
    onSelect: (id: string, name: string) => void;
    accessToken: string;
    defaultExpanded?: boolean;
}> = ({ folder, activeFolderId, level, onSelect, accessToken, defaultExpanded = false }) => {
    
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [subFolders, setSubFolders] = useState<{id: string, name: string}[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (defaultExpanded && !loaded) {
            handleExpand(null);
        }
    }, [defaultExpanded]);

    const handleExpand = async (e: React.MouseEvent | null) => {
        e?.stopPropagation();
        
        if (!loaded) {
            try {
                const files = await listDriveFiles(accessToken, folder.id);
                const foldersOnly = files
                    .filter(f => f.mimeType === 'application/vnd.google-apps.folder')
                    .map(f => ({ id: f.id, name: f.name }));
                setSubFolders(foldersOnly);
                setLoaded(true);
            } catch (err) {
                console.error("Failed to load subfolders", err);
            }
        }
        
        if (e) {
            setIsExpanded(!isExpanded);
        } else {
            setIsExpanded(true);
        }
    };

    const isSelected = folder.id === activeFolderId;

    return (
        <div>
            <div 
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm
                    ${isSelected ? 'bg-indigo-900/40 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}
                `}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => onSelect(folder.id, folder.name)}
            >
                <button 
                    onClick={handleExpand}
                    className="p-0.5 hover:bg-neutral-700 rounded text-neutral-500 hover:text-white"
                >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <Folder className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-neutral-500'}`} />
                <span className="truncate">{folder.name}</span>
            </div>
            {isExpanded && (
                <div>
                    {subFolders.map(sub => (
                        <FolderTreeItem 
                            key={sub.id} 
                            folder={sub} 
                            activeFolderId={activeFolderId} 
                            level={level + 1} 
                            onSelect={onSelect}
                            accessToken={accessToken}
                        />
                    ))}
                    
                    {subFolders.length === 0 && loaded && (
                        <div className="text-[10px] text-neutral-600 pl-8 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}>Empty</div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CloudImportModal: React.FC<CloudImportModalProps> = ({ isOpen, onClose, onImportFile }) => {
  const [step, setStep] = useState<Step>('PROVIDERS');
  const [provider, setProvider] = useState<'GDRIVE' | 'MEGA' | 'DROPBOX' | null>(null);
  
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{name: string, picture: string} | null>(null);
  const [userProfileBlob, setUserProfileBlob] = useState<string | null>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'My Drive'}]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Mobile State
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // --- INITIAL LOAD: CHECK STORAGE ---
  useEffect(() => {
      const storedToken = localStorage.getItem('substream_drive_token');
      const storedExpiry = localStorage.getItem('substream_drive_token_timestamp');

      if (storedToken && storedExpiry) {
          const now = Date.now();
          const age = now - parseInt(storedExpiry, 10);
          
          if (age < 50 * 60 * 1000) {
              setAccessToken(storedToken);
              fetchDriveProfile(storedToken);
          } else {
              localStorage.removeItem('substream_drive_token');
              localStorage.removeItem('substream_drive_token_timestamp');
          }
      }
  }, []);

  // --- AUTO FETCH PROFILE & FILES ---
  useEffect(() => {
      if (accessToken) {
          fetchDriveProfile(accessToken);
      }
  }, [accessToken]);

  // --- AUTH LISTENER ---
  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
        if (event.data?.type === 'DRIVE_AUTH_SUCCESS' && event.data.token) {
            handleLoginSuccess(event.data.token);
        }
    };
    window.addEventListener('message', handleAuthMessage);

    const channel = new BroadcastChannel('substream_drive_auth_channel');
    channel.onmessage = (event) => {
        if (event.data?.token) {
            handleLoginSuccess(event.data.token);
        }
    };

    return () => {
        window.removeEventListener('message', handleAuthMessage);
        channel.close();
    };
  }, []);

  const handleLoginSuccess = (token: string) => {
      setAccessToken(token);
      localStorage.setItem('substream_drive_token', token);
      localStorage.setItem('substream_drive_token_timestamp', Date.now().toString());
      
      setStep('EXPLORER');
      setProvider('GDRIVE'); 
      fetchDriveProfile(token);
  };

  const handleDisconnect = () => {
      setAccessToken(null);
      setStep('PROVIDERS');
      setProvider(null);
      setFiles([]);
      setError(null);
      localStorage.removeItem('substream_drive_token');
      localStorage.removeItem('substream_drive_token_timestamp');
      if (userProfileBlob) URL.revokeObjectURL(userProfileBlob);
      setUserProfileBlob(null);
      setUserInfo(null);
  };

  const handleDriveProviderClick = () => {
      setProvider('GDRIVE');
      if (accessToken) {
          setStep('EXPLORER');
      } else {
          setStep('AUTH_GDRIVE');
      }
  };

  // --- FETCH FILES ---
  useEffect(() => {
    if (step === 'EXPLORER' && accessToken) {
        setIsLoading(true);
        setError(null);
        setFiles([]); // Clear old files immediately on refetch
        
        listDriveFiles(accessToken, currentFolderId, searchQuery)
            .then(setFiles)
            .catch(err => {
                console.error("List Error:", err);
                let msg = err.message || "Failed to load files";
                if (typeof msg === 'object') msg = JSON.stringify(msg);
                
                if (msg.includes("403")) msg = "Access Denied: Please enable 'Google Drive API' in your Google Cloud Console.";
                if (msg.includes("socket disconnected") || msg.includes("500")) msg = "Connection Error: Server could not connect to Google Drive. Please retry.";
                if (msg.includes("400")) msg = "Invalid Request: Malformed query or missing permissions.";
                if (msg.includes("timeout")) msg = "Connection Timed Out: Google Drive is taking too long to respond. Please retry.";
                
                setError(msg);
            })
            .finally(() => setIsLoading(false));
    }
  }, [currentFolderId, accessToken, searchQuery, step, refreshKey]);

  const fetchDriveProfile = async (token: string) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setUserInfo(data);

        if (data.picture) {
            const proxyUrl = `http://localhost:4000/api/proxy/file-get?url=${encodeURIComponent(data.picture)}`;
            const imgRes = await fetch(proxyUrl);
            if (imgRes.ok) {
                const blob = await imgRes.blob();
                const blobUrl = URL.createObjectURL(blob);
                setUserProfileBlob(blobUrl);
            }
        }

      } catch (e) { console.error("Profile fetch failed", e); }
  };

  const handleDriveLogin = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = window.location.origin + window.location.pathname; 
      const scope = 'https://www.googleapis.com/auth/drive.readonly profile email';
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=drive_auth&prompt=consent`;
      
      const width = 500, height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      window.open(authUrl, 'Google Drive Auth', `width=${width},height=${height},top=${top},left=${left}`);
  };

  const handleFolderSelect = (id: string, name: string) => {
      if (id === 'virtual-videos' || id === 'virtual-subtitles') {
          setFolderPath([{id: 'root', name: 'My Drive'}, {id, name}]);
      } else if (id === 'root') {
          setFolderPath([{id: 'root', name: 'My Drive'}]);
      } else {
          const idx = folderPath.findIndex(p => p.id === id);
          if (idx !== -1) {
              setFolderPath(folderPath.slice(0, idx + 1));
          } else {
              setFolderPath([...folderPath, {id, name}]);
          }
      }
      setCurrentFolderId(id);
      setSelectedFile(null);
      setShowMobileSidebar(false); // Close sidebar on selection
  };

  const handleFileClick = (file: DriveFile) => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
          setFolderPath([...folderPath, {id: file.id, name: file.name}]);
          setCurrentFolderId(file.id);
          setSelectedFile(null);
      } else {
          setSelectedFile(file);
      }
  };

  const handleRefresh = () => {
      setError(null);
      setIsLoading(true); 
      setRefreshKey(prev => prev + 1); 
  };

  const handleImport = async () => {
      if (!selectedFile || !accessToken) return;

      setIsImporting(true);
      setImportProgress(10); 

      try {
          const file = await downloadDriveFile(accessToken, selectedFile.id, selectedFile.name);
          setImportProgress(100);
          setTimeout(() => {
              onImportFile(file);
              onClose();
              setIsImporting(false);
          }, 500);
      } catch (e: any) {
          console.error("Import failed", e);
          setIsImporting(false);
          alert("Import failed: " + e.message);
      }
  };

  const formatSize = (bytes?: string) => {
      if (!bytes) return 'Unknown';
      const b = parseInt(bytes);
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (b === 0) return '0 Byte';
      const i = Math.floor(Math.log(b) / Math.log(1024));
      return Math.round(b / Math.pow(1024, i)) + ' ' + sizes[i];
  };

  const formatDuration = (ms?: number) => {
      if (!ms) return '-';
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}:${parseInt(seconds) < 10 ? '0' : ''}${seconds}`;
  };

  useEffect(() => {
      if (isOpen) {
          setStep('PROVIDERS');
      }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from Cloud">
        <div className="h-[600px] flex flex-col overflow-hidden -m-6 md:-m-8 relative">
            
            {/* BODY */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* 1. PROVIDER SELECTION */}
                {step === 'PROVIDERS' && (
                    <div className="w-full h-full flex items-center justify-center p-8 bg-neutral-900/20">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
                            <button 
                                onClick={handleDriveProviderClick}
                                className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group"
                            >
                                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                    <GoogleDriveIcon className="w-12 h-12" />
                                </div>
                                <div className="text-center">
                                    <span className="text-lg font-bold text-white block">Google Drive</span>
                                    {accessToken && <span className="text-xs text-green-400 font-medium bg-green-900/20 px-2 py-0.5 rounded-full border border-green-900/50 mt-1 inline-block">Connected</span>}
                                </div>
                            </button>
                            
                            <button disabled className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-neutral-900/20 border border-neutral-800 opacity-50 cursor-not-allowed">
                                <div className="w-20 h-20 bg-neutral-800 rounded-2xl flex items-center justify-center grayscale">
                                    <MegaIcon className="w-12 h-12" />
                                </div>
                                <span className="text-lg font-bold text-neutral-500">Mega (Coming Soon)</span>
                            </button>

                             <button disabled className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-neutral-900/20 border border-neutral-800 opacity-50 cursor-not-allowed">
                                <div className="w-20 h-20 bg-neutral-800 rounded-2xl flex items-center justify-center grayscale">
                                    <DropboxIcon className="w-12 h-12" />
                                </div>
                                <span className="text-lg font-bold text-neutral-500">Dropbox (Coming Soon)</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 2. AUTH SCREEN */}
                {step === 'AUTH_GDRIVE' && (
                    <div className="w-full h-full relative flex flex-col items-center justify-center p-8 text-center space-y-6">
                        <div className="absolute top-6 left-6">
                            <button onClick={() => setStep('PROVIDERS')} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                                <span className="text-sm font-medium">Back to Providers</span>
                            </button>
                        </div>

                        <GoogleDriveIcon className="w-24 h-24 mb-4" />
                        <h2 className="text-2xl font-bold text-white">Connect Google Drive</h2>
                        <p className="text-neutral-400 max-w-md">
                            SubStream AI needs read-only access to your Drive to list and download video or subtitle files.
                        </p>
                        <Button onClick={handleDriveLogin} className="px-8 py-4 text-lg">
                            Authenticate Google
                        </Button>
                        <p className="text-xs text-neutral-600 mt-4">We do not store your credentials. Access is temporary.</p>
                    </div>
                )}

                {/* 3. EXPLORER */}
                {step === 'EXPLORER' && accessToken && (
                    <div className="w-full h-full flex flex-col relative">
                        
                        {/* EXPLORER HEADER */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50 gap-4 md:gap-0 z-20 relative">
                            {/* Row 1: Back + Brand + User/Logout */}
                            <div className="flex items-center justify-between w-full md:w-auto gap-3">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setStep('PROVIDERS')} className="p-2 hover:bg-neutral-800 rounded-full transition-colors" title="Back to Providers">
                                        <ArrowLeft className="w-5 h-5 text-neutral-400" />
                                    </button>
                                    <div className="flex items-center gap-2 text-sm text-neutral-400">
                                       <GoogleDriveIcon className="w-5 h-5" />
                                       <span className="font-bold text-white">Google Drive</span>
                                    </div>
                                </div>

                                {/* Mobile: User & Logout shows here on row 1 */}
                                <div className="flex items-center gap-3 md:hidden">
                                    {userProfileBlob ? (
                                        <img src={userProfileBlob} className="w-7 h-7 rounded-full border border-neutral-700 object-cover" alt="User" />
                                    ) : userInfo ? (
                                        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
                                            {userInfo.name.charAt(0)}
                                        </div>
                                    ) : null}
                                    <button onClick={handleDisconnect} title="Logout" className="p-1.5 hover:bg-neutral-800 rounded-full transition-colors text-neutral-500 hover:text-red-400">
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Row 2 (Mobile) / Right Side (Desktop): Search + Sidebar Toggle */}
                            <div className="flex items-center gap-3 w-full md:w-auto md:flex-1 md:justify-end">
                                {/* Mobile Sidebar Toggle */}
                                <button 
                                    className="md:hidden p-3 bg-neutral-800 rounded-lg text-white hover:bg-neutral-700 transition-colors h-12 w-12 flex items-center justify-center"
                                    onClick={() => setShowMobileSidebar(true)}
                                >
                                    <Menu className="w-5 h-5" />
                                </button>

                                <div className="relative flex-1 md:flex-none md:w-full md:max-w-md h-12">
                                    <Search className="absolute left-3 top-3.5 w-4 h-4 text-neutral-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Search Drive..." 
                                        className="w-full h-full bg-black border border-neutral-800 rounded-lg py-3 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {/* Desktop: User & Logout */}
                                <div className="hidden md:flex items-center gap-3">
                                    {userProfileBlob ? (
                                        <img src={userProfileBlob} className="w-8 h-8 rounded-full border border-neutral-700 object-cover" alt="User" />
                                    ) : userInfo ? (
                                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
                                            {userInfo.name.charAt(0)}
                                        </div>
                                    ) : null}
                                    <button onClick={handleDisconnect} title="Logout" className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-500 hover:text-red-400">
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden relative">
                            {/* LEFT: FOLDER TREE (Desktop & Mobile Overlay) */}
                            <div className={`
                                absolute inset-y-0 left-0 w-64 bg-neutral-900 border-r border-neutral-800 z-30 transform transition-transform duration-300
                                md:relative md:translate-x-0 md:bg-neutral-900/30
                                ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
                            `}>
                                <div className="flex items-center justify-between p-4 border-b border-neutral-800 md:hidden">
                                    <h3 className="font-bold text-white">Folders</h3>
                                    <button onClick={() => setShowMobileSidebar(false)}>
                                        <X className="w-5 h-5 text-neutral-400" />
                                    </button>
                                </div>

                                <div className="overflow-y-auto custom-scrollbar p-3 h-full">
                                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3 px-2 hidden md:block">Folders</h3>
                                    
                                    {/* Virtual Folders */}
                                    <div 
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm mb-1
                                            ${currentFolderId === 'virtual-videos' ? 'bg-indigo-900/40 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}
                                        `}
                                        onClick={() => handleFolderSelect('virtual-videos', 'All Videos')}
                                    >
                                        <Film className={`w-4 h-4 ${currentFolderId === 'virtual-videos' ? 'text-red-400' : 'text-neutral-500'}`} />
                                        <span className="truncate">All Videos</span>
                                    </div>
                                    <div 
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm mb-3
                                            ${currentFolderId === 'virtual-subtitles' ? 'bg-indigo-900/40 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}
                                        `}
                                        onClick={() => handleFolderSelect('virtual-subtitles', 'All Subtitles')}
                                    >
                                        <Captions className={`w-4 h-4 ${currentFolderId === 'virtual-subtitles' ? 'text-green-400' : 'text-neutral-500'}`} />
                                        <span className="truncate">All Subtitles</span>
                                    </div>

                                    <div className="h-px bg-neutral-800 my-2 mx-2"></div>

                                    <FolderTreeItem 
                                        folder={{id: 'root', name: 'My Drive'}} 
                                        activeFolderId={currentFolderId} 
                                        level={0} 
                                        onSelect={handleFolderSelect} 
                                        accessToken={accessToken}
                                        defaultExpanded={true} 
                                    />
                                </div>
                            </div>

                            {/* Mobile Overlay Backdrop */}
                            {showMobileSidebar && (
                                <div 
                                    className="absolute inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
                                    onClick={() => setShowMobileSidebar(false)}
                                />
                            )}

                            {/* MIDDLE: FILE GRID */}
                            <div className="flex-1 flex flex-col min-w-0 relative">
                                {/* Breadcrumbs */}
                                <div className="flex items-center gap-2 p-3 text-sm text-neutral-400 border-b border-neutral-800 overflow-x-auto whitespace-nowrap bg-neutral-900/20 no-scrollbar">
                                    {folderPath.map((folder, idx) => (
                                        <React.Fragment key={folder.id}>
                                            <button 
                                                onClick={() => handleFolderSelect(folder.id, folder.name)}
                                                className="hover:text-white transition-colors shrink-0"
                                            >
                                                {folder.name}
                                            </button>
                                            {idx < folderPath.length - 1 && <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />}
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                                    {isLoading ? (
                                        <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3">
                                            <Loader2 className="w-8 h-8 animate-spin" />
                                            <span>Loading files...</span>
                                        </div>
                                    ) : error ? (
                                        <div className="h-full flex flex-col items-center justify-center text-red-400 gap-4 text-center px-8">
                                            <AlertCircle className="w-12 h-12 opacity-50" />
                                            <div className="space-y-1">
                                                <h3 className="font-bold text-lg">Connection Error</h3>
                                                <p className="text-sm text-neutral-400">{error}</p>
                                            </div>
                                            <Button variant="outline" onClick={handleRefresh} icon={<RefreshCw className="w-4 h-4"/>}>
                                                Try Again
                                            </Button>
                                        </div>
                                    ) : files.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3 opacity-50">
                                            <Folder className="w-12 h-12" />
                                            <span>Folder is empty</span>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {files.map(file => {
                                                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                                                const isSelected = selectedFile?.id === file.id;

                                                return (
                                                    <div 
                                                        key={file.id}
                                                        onClick={() => handleFileClick(file)}
                                                        className={`
                                                            group relative p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-3
                                                            ${isSelected ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-neutral-900/40 border-neutral-800 hover:bg-neutral-800'}
                                                        `}
                                                        onDoubleClick={() => isFolder && handleFolderSelect(file.id, file.name)}
                                                    >
                                                        <div className="aspect-video bg-neutral-950 rounded-lg overflow-hidden relative flex items-center justify-center">
                                                            {file.thumbnailLink && !isFolder ? (
                                                                <img 
                                                                    src={`http://localhost:4000/api/proxy/file-get?url=${encodeURIComponent(file.thumbnailLink)}&token=${encodeURIComponent(accessToken)}`} 
                                                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100" 
                                                                    alt="" 
                                                                />
                                                            ) : (
                                                                <div className="text-neutral-600">
                                                                    {isFolder ? <Folder className="w-10 h-10" /> : file.mimeType.includes('video') ? <FileVideo className="w-10 h-10" /> : <FileText className="w-10 h-10" />}
                                                                </div>
                                                            )}
                                                            {file.videoMediaMetadata && (
                                                                <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] text-white px-1.5 py-0.5 rounded">
                                                                    {formatDuration(file.videoMediaMetadata.durationMillis)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-medium text-white truncate" title={file.name}>{file.name}</h4>
                                                            <p className="text-[10px] text-neutral-500 mt-1 flex justify-between">
                                                                <span>{isFolder ? 'Folder' : formatSize(file.size)}</span>
                                                                <span>{new Date(file.modifiedTime!).toLocaleDateString()}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT: DETAILS PANEL (Desktop: Sidebar / Mobile: Full Overlay) */}
                            <div className={`
                                absolute inset-0 z-50 bg-black/95 md:bg-neutral-900/30 md:relative md:w-72 md:border-l md:border-neutral-800 md:flex md:flex-col md:inset-auto
                                transition-transform duration-300
                                ${selectedFile ? 'flex translate-x-0' : 'hidden md:flex translate-x-full md:translate-x-0'}
                            `}>
                                <div className="h-full p-4 flex flex-col gap-6 overflow-y-auto w-full">
                                    
                                    {/* Mobile Back Button */}
                                    <div className="md:hidden flex items-center gap-2 border-b border-neutral-800 pb-4 mb-2">
                                        <button onClick={() => setSelectedFile(null)} className="p-2 -ml-2 hover:bg-neutral-800 rounded-full text-white">
                                            <ArrowLeft className="w-6 h-6" />
                                        </button>
                                        <span className="font-bold text-lg">File Details</span>
                                    </div>

                                    {selectedFile ? (
                                        <>
                                            <div className="space-y-4 flex-1">
                                                <div className="aspect-video bg-neutral-950 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800">
                                                    {selectedFile.thumbnailLink ? (
                                                        <img 
                                                            src={`http://localhost:4000/api/proxy/file-get?url=${encodeURIComponent(selectedFile.thumbnailLink.replace('s220', 's600'))}&token=${encodeURIComponent(accessToken)}`} 
                                                            className="w-full h-full object-cover" 
                                                            alt="Preview" 
                                                        />
                                                    ) : (
                                                        <div className="text-neutral-600">
                                                            {selectedFile.mimeType.includes('video') ? <FileVideo className="w-16 h-16" /> : <FileText className="w-16 h-16" />}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-lg leading-tight break-words">{selectedFile.name}</h3>
                                                    <p className="text-xs text-neutral-500 mt-1">{selectedFile.mimeType}</p>
                                                </div>

                                                <div className="space-y-3 pt-4 border-t border-neutral-800">
                                                    <div className="flex items-center gap-3 text-sm text-neutral-300">
                                                        <Database className="w-4 h-4 text-neutral-500" />
                                                        <span>{formatSize(selectedFile.size)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-neutral-300">
                                                        <Calendar className="w-4 h-4 text-neutral-500" />
                                                        <span>{new Date(selectedFile.createdTime!).toLocaleDateString()}</span>
                                                    </div>
                                                    {selectedFile.videoMediaMetadata && (
                                                        <div className="flex items-center gap-3 text-sm text-neutral-300">
                                                            <Clock className="w-4 h-4 text-neutral-500" />
                                                            <span>{formatDuration(selectedFile.videoMediaMetadata.durationMillis)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <Button 
                                                onClick={handleImport}
                                                disabled={isImporting}
                                                className="w-full mt-auto md:mt-0 !w-full"
                                                progress={isImporting ? importProgress : undefined}
                                                statusText={isImporting ? "Downloading..." : ""}
                                            >
                                                Import File
                                            </Button>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center space-y-3">
                                            <LayoutGrid className="w-12 h-12 opacity-50" />
                                            <p>Select a file to view details</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </Modal>
  );
};