import React, { useState } from 'react';
import { LogOut, Youtube, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { requestGoogleAccessToken, revokeGoogleAccessToken, YOUTUBE_SCOPE } from '../../utils/googleAuthHelper';

interface YouTubeAuthProps {
  onLoginSuccess: (tokenResponse: any) => void;
  onLogout: () => void;
  userInfo: { name: string; email?: string; picture: string } | null;
  activeToken?: string | null;
}

export const YouTubeAuth: React.FC<YouTubeAuthProps> = ({ onLoginSuccess, onLogout, userInfo, activeToken }) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setAuthError(null);
      const token = await requestGoogleAccessToken({
        scope: YOUTUBE_SCOPE,
        prompt: 'consent'
      });
      onLoginSuccess({ access_token: token });
    } catch (err: any) {
      console.error("YouTube Auth Error:", err);
      setAuthError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (activeToken) {
      revokeGoogleAccessToken(activeToken);
    }
    onLogout();
  };

  if (userInfo) {
    return (
      <div className="flex items-center gap-3 bg-neutral-900/50 border border-neutral-800 rounded-xl p-2 pr-4 transition-all">
        <div className="relative shrink-0">
            {!imageError ? (
              <img 
                src={userInfo.picture} 
                alt="User" 
                className="w-8 h-8 rounded-full border border-neutral-700 object-cover" 
                onError={() => setImageError(true)}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-8 h-8 rounded-full border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                {userInfo.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-red-600 rounded-full p-0.5 border border-black">
                <Youtube className="w-2 h-2 text-white" />
            </div>
        </div>
        <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white leading-none truncate max-w-[100px]">{userInfo.name}</span>
            <span className="text-[10px] text-neutral-500 leading-none mt-1">Connected</span>
        </div>
        <div className="h-4 w-px bg-neutral-800 mx-1"></div>
        <button 
            onClick={handleDisconnect} 
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-neutral-500 hover:text-red-400 transition-colors"
            title="Disconnect Channel"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button 
          onClick={handleLogin} 
          type="button" 
          variant="secondary"
          disabled={isLoading}
          className="px-[1.2rem] py-[0.8rem] text-[0.8rem] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-600 rounded-xl transition-all flex items-center gap-2"
          icon={isLoading ? <Loader2 className="w-[20px] h-[20px] text-red-500 animate-spin shrink-0" /> : <Youtube className="w-[20px] h-[20px] text-red-500 shrink-0" />}
      >
        {isLoading ? "Authenticating..." : "Authenticate YouTube"}
      </Button>
      {authError && (
        <span className="text-[11px] text-red-400 max-w-[220px] truncate" title={authError}>
          {authError}
        </span>
      )}
    </div>
  );
};