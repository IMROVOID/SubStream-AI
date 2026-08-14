import React, { useMemo } from 'react';
import { Languages, ArrowRight, Download, Loader2, Zap } from 'lucide-react';
import { Button } from '../common/Button';
import { ComboBox } from '../common/ComboBox';
import { LANGUAGES } from '../../constants/languages';
import { AIModel, TranslationStatus } from '../../types';

interface SubtitleGeneratorPanelProps {
  isYouTubeWorkflow: boolean;
  youtubeMeta: any;
  selectedCaptionId: string;
  setSelectedCaptionId: (id: string) => void;
  videoProcessingStatus: string;
  handleYouTubeCaptionDownload: () => void;
  subtitles: any[];
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
  isTranslationInProgress: boolean;
  status: TranslationStatus;
  progress: number;
  activeModelData: AIModel | null;
  handleTranslate: () => void;
}

export const SubtitleGeneratorPanel: React.FC<SubtitleGeneratorPanelProps> = ({
  isYouTubeWorkflow,
  youtubeMeta,
  selectedCaptionId,
  setSelectedCaptionId,
  videoProcessingStatus,
  handleYouTubeCaptionDownload,
  subtitles,
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  isTranslationInProgress,
  status,
  progress,
  activeModelData,
  handleTranslate
}) => {
  const availableCaptions = youtubeMeta?.availableCaptions || [];

  const captionOptions = useMemo(() => {
    if (availableCaptions.length === 0) {
      return [{ value: '', label: 'No captions available for this video', disabled: true }];
    }
    return availableCaptions.map((caption: any) => ({
      value: caption.id,
      label: caption.name || caption.language
    }));
  }, [availableCaptions]);

  const sourceOptions = useMemo(() => [
    { value: 'auto', label: '✨ Auto Detect' },
    ...LANGUAGES.map(l => ({ value: l.name, label: l.name }))
  ], []);

  const targetOptions = useMemo(() => [
    ...LANGUAGES.map(l => ({ value: l.name, label: l.name }))
  ], []);

  React.useEffect(() => {
    if (isYouTubeWorkflow && youtubeMeta && availableCaptions.length > 0 && !selectedCaptionId) {
      const defaultCaption = availableCaptions.find((c: any) => 
        c.language === 'en' || 
        c.language === 'en-orig' || 
        c.language?.startsWith('en-') || 
        c.name?.toLowerCase().includes('english')
      ) || availableCaptions[0];
      setSelectedCaptionId(defaultCaption.id);
    }
  }, [isYouTubeWorkflow, youtubeMeta, availableCaptions, selectedCaptionId, setSelectedCaptionId]);

  if (isYouTubeWorkflow && youtubeMeta && subtitles.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
        <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
          <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Target Language</label>
          <ComboBox
            options={captionOptions}
            value={selectedCaptionId}
            onChange={setSelectedCaptionId}
            disabled={videoProcessingStatus === 'EXTRACTING_SUBTITLES'}
            icon={<Languages className="w-4 h-4 text-neutral-500" />}
          />
        </div>
        <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 flex flex-col justify-end">
          <div className="h-full flex items-end">
            <Button
              className="w-full py-3.5 text-base"
              onClick={handleYouTubeCaptionDownload}
              disabled={!selectedCaptionId || videoProcessingStatus === 'EXTRACTING_SUBTITLES'}
              icon={videoProcessingStatus === 'EXTRACTING_SUBTITLES' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            >
              {videoProcessingStatus === 'EXTRACTING_SUBTITLES' ? 'Downloading...' : 'Generate & Process'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (subtitles.length > 0) {
    if (isTranslationInProgress) {
      return (
        <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between text-sm font-bold text-white">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
              <span>Translating with {activeModelData?.name || 'AI'}...</span>
            </div>
            <span className="font-mono text-white">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      );
    }

    if (status === TranslationStatus.IDLE) {
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Source Language</label>
              <ComboBox
                options={sourceOptions}
                value={sourceLang}
                onChange={setSourceLang}
                icon={<Languages className="w-4 h-4 text-neutral-500" />}
              />
            </div>

            <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 flex flex-col justify-end">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Target Language</label>
              <ComboBox
                options={targetOptions}
                value={targetLang}
                onChange={setTargetLang}
                icon={<ArrowRight className="w-4 h-4 text-neutral-500" />}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleTranslate} className="w-full md:w-auto text-lg px-8 py-3.5" icon={<Zap className="w-5 h-5" />}>
              Start Translation
            </Button>
          </div>
        </div>
      );
    }
  }

  return null;
};
