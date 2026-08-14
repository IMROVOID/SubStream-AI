import React from 'react';
import { 
  Settings, 
  Maximize, 
  Minimize, 
  PictureInPicture2, 
  Subtitles, 
  ChevronRight, 
  ChevronLeft, 
  Gauge, 
  Monitor, 
  Check,
  Volume2,
  Volume1,
  VolumeX
} from 'lucide-react';

interface PlayerControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  selectedQuality: string;
  qualityOptions: string[];
  activeQualityText: string;
  showSubtitles: boolean;
  isFullscreen: boolean;
  isSeeking: boolean;
  showControls: boolean;
  showSettings: boolean;
  settingsView: 'main' | 'quality' | 'speed' | 'subtitles' | 'subtitleSize' | 'subtitleBg' | 'subtitleColor' | 'subtitleOpacity';
  subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
  subtitleBg: 'dark' | 'solid' | 'semi' | 'none';
  subtitleColor: 'white' | 'yellow';
  subtitleOpacity: number;
  togglePlay: () => void;
  toggleMute: () => void;
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setIsSeeking: (seeking: boolean) => void;
  setShowSubtitles: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setSettingsView: (view: 'main' | 'quality' | 'speed' | 'subtitles' | 'subtitleSize' | 'subtitleBg' | 'subtitleColor' | 'subtitleOpacity') => void;
  changeQuality: (quality: string) => void;
  changeSpeed: (speed: number) => void;
  setSubtitleSize: (size: 'small' | 'medium' | 'large' | 'xlarge') => void;
  setSubtitleBg: (bg: 'dark' | 'solid' | 'semi' | 'none') => void;
  setSubtitleColor: (color: 'white' | 'yellow') => void;
  setSubtitleOpacity: (opacity: number) => void;
  togglePictureInPicture: () => void;
  toggleFullscreen: () => void;
  formatTime: (seconds: number) => string;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  isMuted,
  volume,
  currentTime,
  duration,
  playbackSpeed,
  selectedQuality,
  qualityOptions,
  activeQualityText,
  showSubtitles,
  isFullscreen,
  isSeeking,
  showControls,
  showSettings,
  settingsView,
  subtitleSize,
  subtitleBg,
  subtitleColor,
  subtitleOpacity,
  togglePlay,
  toggleMute,
  handleVolumeChange,
  handleSeekChange,
  setIsSeeking,
  setShowSubtitles,
  setShowSettings,
  setSettingsView,
  changeQuality,
  changeSpeed,
  setSubtitleSize,
  setSubtitleBg,
  setSubtitleColor,
  setSubtitleOpacity,
  togglePictureInPicture,
  toggleFullscreen,
  formatTime
}) => {
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const isCurrentlyMuted = isMuted || volume <= 0.05;
  const volumePercent = isCurrentlyMuted ? 0 : volume * 100;

  return (
    <div 
      className={`absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between gap-3 transition-all duration-300 z-30 ${
        showControls || !isPlaying || isSeeking ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <button 
          onClick={togglePlay} 
          className="text-white/80 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex items-center justify-center"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-white text-white" viewBox="0 0 24 24">
              <path d="M7 4.75a1 1 0 0 1 1.53-.84l11 6.25a1 1 0 0 1 0 1.68l-11 6.25A1 1 0 0 1 7 17.25V4.75z" />
            </svg>
          )}
        </button>

        <div className="flex items-center group/volume relative">
          <button 
            onClick={toggleMute} 
            className="text-white/80 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex items-center justify-center"
            title={isCurrentlyMuted ? "Unmute" : "Mute"}
          >
            {isCurrentlyMuted ? (
              <VolumeX className="w-4 h-4 text-white/60" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-4 h-4 text-white" />
            ) : (
              <Volume2 className="w-4 h-4 text-white" />
            )}
          </button>

          <div className="max-w-0 opacity-0 overflow-hidden group-hover/volume:max-w-[70px] group-hover/volume:opacity-100 transition-all duration-300 ease-out flex items-center">
            <div className="w-14 h-1 relative flex items-center rounded-full overflow-hidden bg-white/20 ml-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isCurrentlyMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-full opacity-0 cursor-pointer relative z-10"
              />
              <div 
                className="absolute left-0 top-0 bottom-0 bg-white rounded-full pointer-events-none transition-all"
                style={{ width: `${volumePercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono text-neutral-300 font-medium tracking-tight whitespace-nowrap">
          <span>{formatTime(currentTime)}</span>
          <span className="mx-1 text-neutral-500">/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex-1 relative flex items-center group/timeline mx-1 h-3">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onMouseDown={() => setIsSeeking(true)}
          onTouchStart={() => setIsSeeking(true)}
          onChange={handleSeekChange}
          onMouseUp={() => setIsSeeking(false)}
          onTouchEnd={() => setIsSeeking(false)}
          className="w-full h-full opacity-0 cursor-pointer relative z-10"
        />
        <div className="w-full h-1 bg-white/20 rounded-full pointer-events-none absolute left-0 right-0 group-hover/timeline:h-1.5 transition-all overflow-hidden">
          <div 
            className="h-full bg-white rounded-full pointer-events-none transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md pointer-events-none opacity-0 group-hover/timeline:opacity-100 transition-opacity z-20"
          style={{ left: `calc(${Math.min(98.5, Math.max(0, progressPercent))}% - 4px)` }}
        />
      </div>

      <div className="flex items-center gap-1.5 shrink-0 relative">
        <button
          onClick={() => setShowSubtitles(!showSubtitles)}
          className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
            showSubtitles ? 'text-white bg-white/20 border border-white/30' : 'text-neutral-400 hover:text-white hover:bg-white/10'
          }`}
          title="Toggle Subtitles"
        >
          <Subtitles className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setShowSettings(!showSettings);
              setSettingsView('main');
            }}
            className={`p-1.5 rounded-lg transition-all ${
              showSettings ? 'text-white bg-white/20' : 'text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {showSettings && (
            <div className="absolute bottom-10 right-0 w-56 bg-neutral-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/80 z-50 text-xs overflow-hidden transition-all duration-200 animate-fade-in">
              {settingsView === 'main' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('quality')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <div className="flex items-center gap-2.5">
                      <Monitor className="w-4 h-4 text-neutral-400" />
                      <span className="font-semibold">Quality</span>
                    </div>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span>{activeQualityText}</span>
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>

                  <button
                    onClick={() => setSettingsView('speed')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <div className="flex items-center gap-2.5">
                      <Gauge className="w-4 h-4 text-neutral-400" />
                      <span className="font-semibold">Speed</span>
                    </div>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span>{playbackSpeed}×</span>
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>

                  <button
                    onClick={() => setSettingsView('subtitles')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 active:scale-[0.98] text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <div className="flex items-center gap-2.5">
                      <Subtitles className="w-4 h-4 text-neutral-400" />
                      <span className="font-semibold">Subtitles</span>
                    </div>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span className="capitalize">{subtitleSize}</span>
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                </div>
              )}

              {settingsView === 'quality' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('main')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Quality</span>
                  </button>
                  <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-0.5">
                    {qualityOptions.map((q) => (
                      <button
                        key={q}
                        onClick={() => changeQuality(q)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                          selectedQuality === q ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <span>{q}</span>
                        {selectedQuality === q && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {settingsView === 'speed' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('main')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Playback Speed</span>
                  </button>
                  <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-0.5">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => changeSpeed(spd)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                          playbackSpeed === spd ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                        }`}
                      >
                        <span>{spd === 1 ? '1× (Normal)' : `${spd}×`}</span>
                        {playbackSpeed === spd && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {settingsView === 'subtitles' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('main')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Subtitles</span>
                  </button>
                  <button
                    onClick={() => setSettingsView('subtitleSize')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <span className="font-medium">Font Size</span>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span className="capitalize">{subtitleSize}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={() => setSettingsView('subtitleColor')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <span className="font-medium">Caption Color</span>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span className="capitalize">{subtitleColor}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={() => setSettingsView('subtitleBg')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <span className="font-medium">Background</span>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span className="capitalize">{subtitleBg === 'none' ? 'No BG' : subtitleBg}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={() => setSettingsView('subtitleOpacity')}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/10 text-neutral-200 hover:text-white transition-all duration-150"
                  >
                    <span className="font-medium">Opacity</span>
                    <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
                      <span>{Math.round(subtitleOpacity * 100)}%</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                </div>
              )}

              {settingsView === 'subtitleSize' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('subtitles')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Font Size</span>
                  </button>
                  {[
                    { id: 'small', label: 'Small' },
                    { id: 'medium', label: 'Medium (Default)' },
                    { id: 'large', label: 'Large' },
                    { id: 'xlarge', label: 'Extra Large' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setSubtitleSize(opt.id as any); setSettingsView('subtitles'); }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                        subtitleSize === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {subtitleSize === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}

              {settingsView === 'subtitleColor' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('subtitles')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Caption Color</span>
                  </button>
                  {[
                    { id: 'white', label: 'White (Default)' },
                    { id: 'yellow', label: 'Yellow' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setSubtitleColor(opt.id as any); setSettingsView('subtitles'); }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                        subtitleColor === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <span className={opt.id === 'yellow' ? 'text-yellow-300 font-semibold' : ''}>{opt.label}</span>
                      {subtitleColor === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}

              {settingsView === 'subtitleBg' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('subtitles')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Background Style</span>
                  </button>
                  {[
                    { id: 'dark', label: 'Dark Glass' },
                    { id: 'solid', label: 'Solid Black' },
                    { id: 'semi', label: 'Semi-Transparent' },
                    { id: 'none', label: 'No Background' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setSubtitleBg(opt.id as any); setSettingsView('subtitles'); }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                        subtitleBg === opt.id ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {subtitleBg === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}

              {settingsView === 'subtitleOpacity' && (
                <div className="flex flex-col gap-1 transition-all duration-200">
                  <button
                    onClick={() => setSettingsView('subtitles')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-neutral-400 hover:text-white font-semibold border-b border-white/10 mb-1 active:scale-[0.98] transition-all duration-150"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Background Opacity</span>
                  </button>
                  {[
                    { val: 1, label: '100%' },
                    { val: 0.85, label: '85%' },
                    { val: 0.6, label: '60%' }
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => { setSubtitleOpacity(opt.val); setSettingsView('subtitles'); }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                        subtitleOpacity === opt.val ? 'bg-white/15 text-white font-bold' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {subtitleOpacity === opt.val && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={togglePictureInPicture}
          className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          title="Picture in Picture"
        >
          <PictureInPicture2 className="w-4 h-4" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
