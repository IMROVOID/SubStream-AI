import React from 'react';
import { StepIndicator } from '../workflow/StepIndicator';
import { TranslationStatus } from '../../types';

interface WorkflowStepsProps {
  status: TranslationStatus;
  hasMedia: boolean;
  isConfigureStepActive: boolean;
  subtitlesLength: number;
  isYouTubeWorkflow: boolean;
}

export const WorkflowSteps: React.FC<WorkflowStepsProps> = ({
  status,
  hasMedia,
  isConfigureStepActive,
  subtitlesLength,
  isYouTubeWorkflow
}) => {
  return (
    <div className="order-2 lg:order-1 lg:col-span-3 flex flex-col">
      <div className="h-full flex flex-row items-center justify-between px-2.5 py-4 sm:px-6 sm:py-6 rounded-3xl border border-neutral-900 bg-neutral-950/50 backdrop-blur-sm lg:flex-col lg:justify-between lg:p-6">
        <StepIndicator 
          number={1} 
          title="Upload" 
          isActive={status === TranslationStatus.IDLE && !hasMedia} 
          isCompleted={hasMedia} 
        />
        <StepIndicator 
          number={2} 
          title="Configure" 
          isActive={isConfigureStepActive} 
          isCompleted={status === TranslationStatus.TRANSLATING || status === TranslationStatus.COMPLETED || subtitlesLength > 0} 
        />
        <StepIndicator 
          number={3} 
          title="Translate" 
          isActive={status === TranslationStatus.TRANSLATING} 
          isCompleted={status === TranslationStatus.COMPLETED || (!isYouTubeWorkflow && subtitlesLength > 0 && status !== TranslationStatus.TRANSLATING)} 
        />
        <StepIndicator 
          number={4} 
          title="Download" 
          isActive={status === TranslationStatus.COMPLETED || (subtitlesLength > 0 && status !== TranslationStatus.TRANSLATING)} 
          isCompleted={false} 
        />
      </div>
    </div>
  );
};
