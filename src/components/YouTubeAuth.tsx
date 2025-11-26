import React, { useState } from 'react';
import { googleLogout } from '@react-oauth/google';
import { LogOut, Youtube } from 'lucide-react';
import { Button } from './Button';

interface YouTubeAuthProps {
  onLoginSuccess: (tokenResponse: any) => void;
  onLogout: () => void;
  userInfo: { name: string; email: string; picture: string } | null;
}

export const YouTubeAuth: React.FC<YouTubeAuthProps> = ({ onLoginSuccess, onLogout, userInfo }) => {
  const [imageError, setImageError] = useState(false);

  const handleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.href.split('#')[0]; // Current URL
    
    // Add specific state to identify this request later
    const state = 'youtube_auth';
    
    const scope = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl', // Required for downloading captions
      'profile',
      'email'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scope,
      include_granted_scopes: 'true',
      state: state,
      prompt: 'consent' // <--- CRITICAL: Forces the user to re-accept scopes, ensuring force-ssl is granted
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    // Calculate center position for the popup
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl, 
      'Google Auth', 
      `width=${width},height=${height},top=${top},left=${left}`
    );
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
            onClick={() => { googleLogout(); onLogout(); }} 
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-neutral-500 hover:text-red-400 transition-colors"
            title="Disconnect Channel"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <Button 
        onClick={handleLogin} 
        type="button" 
        className="bg-[#151515] hover:bg-[#252525] text-white border border-neutral-800 hover:border-neutral-700 px-4 py-3 transition-colors"
        icon={<Youtube className="w-4 h-4 text-red-500" />}
    >
      Authenticate YouTube
    </Button>
  );
};