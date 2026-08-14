import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { listDriveFiles } from '../../../services/googleDriveService';

interface FolderTreeItemProps {
  folder: { id: string; name: string };
  activeFolderId: string;
  level: number;
  onSelect: (id: string, name: string) => void;
  accessToken: string;
  defaultExpanded?: boolean;
}

export const FolderTreeItem: React.FC<FolderTreeItemProps> = ({
  folder,
  activeFolderId,
  level,
  onSelect,
  accessToken,
  defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [subFolders, setSubFolders] = useState<{ id: string; name: string }[]>([]);
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
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
          isSelected ? 'bg-neutral-800 text-white font-medium border border-neutral-700/60' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(folder.id, folder.name)}
      >
        <button 
          onClick={handleExpand}
          className="p-0.5 hover:bg-neutral-700 rounded text-neutral-500 hover:text-white"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <Folder className={`w-4 h-4 ${isSelected ? 'text-neutral-200' : 'text-neutral-500'}`} />
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
            <div className="text-[10px] text-neutral-600 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}>Empty</div>
          )}
        </div>
      )}
    </div>
  );
};
