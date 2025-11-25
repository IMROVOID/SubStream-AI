import React from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { LogIn, LogOut, User } from 'lucide-react';
import { Button } from './Button';

interface YouTubeAuthProps {
  onLoginSuccess: (tokenResponse: any) => void;
  onLogout: () => void;
  userInfo: { name: string; email: string; picture: string } | null;
}

export const YouTubeAuth: React.FC<YouTubeAuthProps> = ({ onLoginSuccess, onLogout, userInfo }) => {
  const login = useGoogleLogin({
    onSuccess: onLoginSuccess,
    scope: 'https://www.googleapis.com/auth/youtube.upload',
  });

  if (userInfo) {
    return (
      <div className="flex items-center gap-2">
        <img src={userInfo.picture} alt="User" className="w-8 h-8 rounded-full" />
        <Button variant="outline" onClick={() => { googleLogout(); onLogout(); }} icon={<LogOut className="w-4 h-4" />}>
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={() => login()} variant="secondary" icon={<LogIn className="w-4 h-4" />}>
      Sign in for YouTube
    </Button>
  );
};