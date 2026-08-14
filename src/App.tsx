import React, { useState, useMemo, useEffect } from 'react';
import { Documentation } from './components/docs/Documentation';
import { HeaderBar } from './components/app/HeaderBar';
import { SettingsDrawer } from './components/app/SettingsDrawer';
import { Footer } from './components/app/Footer';
import { LegalModals } from './components/app/LegalModals';
import { ImportUrlModal } from './components/modals/ImportUrlModal';
import { CloudImportModal } from './components/modals/CloudImportModal';
import { AuthCallbackView } from './components/app/AuthCallbackView';
import { HeroSection } from './components/app/HeroSection';
import { WorkflowSection } from './components/app/WorkflowSection';
import { LivePreviewSection } from './components/app/LivePreviewSection';
import { useToast } from './hooks/useToast';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useAppSettings } from './hooks/useAppSettings';
import { useMediaWorkflow } from './hooks/useMediaWorkflow';

export function App() {
  const [currentPage, setCurrentPage] = useState<'HOME' | 'DOCS'>('HOME');
  const [activeModal, setActiveModal] = useState<'NONE' | 'CONFIG' | 'TOS' | 'PRIVACY'>('NONE');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [importType, setImportType] = useState<'URL' | 'YOUTUBE' | null>(null);

  const { toasts, showToast } = useToast();

  const isYouTubeAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=youtube_auth');
  }, []);

  const isDriveAuthCallback = useMemo(() => {
    return window.location.hash.includes('access_token') && window.location.hash.includes('state=drive_auth');
  }, []);

  // OAuth Callback Popup Handler Effect
  useEffect(() => {
    if (isYouTubeAuthCallback) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (accessToken) {
        const channel = new BroadcastChannel('substream_auth_channel');
        channel.postMessage({ token: accessToken });
        channel.close();
        window.close();
      }
    }

    if (isDriveAuthCallback) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');

      if (accessToken) {
        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'DRIVE_AUTH_SUCCESS', token: accessToken }, '*');
          } catch (e) {
            console.error(e);
          }
        }
        const channel = new BroadcastChannel('substream_drive_auth_channel');
        channel.postMessage({ token: accessToken });
        channel.close();
        setTimeout(() => {
          window.close();
          window.open('', '_self')?.close();
        }, 1000);
      }
    }
  }, [isYouTubeAuthCallback, isDriveAuthCallback]);

  const appSettings = useAppSettings({
    showToast,
    onOpenConfigModal: () => setActiveModal('CONFIG')
  });

  const { isDraggingFile, draggedFileInfo, resetDrag } = useDragAndDrop((f) => mediaWorkflow.processFile(f));

  const mediaWorkflow = useMediaWorkflow({
    activeModelData: appSettings.activeModelData,
    activeApiKey: appSettings.activeApiKey,
    googleAccessToken: appSettings.googleAccessToken,
    googleUser: appSettings.googleUser,
    showToast,
    ensureMethodSelected: appSettings.ensureMethodSelected,
    onOpenConfigModal: () => setActiveModal('CONFIG'),
    resetDrag
  });

  if (isYouTubeAuthCallback || isDriveAuthCallback) {
    return <AuthCallbackView />;
  }

  if (currentPage === 'DOCS') {
    return (
      <div key="docs-page" className="animate-fade-in min-h-screen bg-black">
        <Documentation onBack={() => setCurrentPage('HOME')} />
      </div>
    );
  }

  return (
    <div key="home-page" className="animate-fade-in min-h-screen bg-black text-neutral-200 font-sans selection:bg-white selection:text-black flex flex-col scroll-smooth snap-y snap-proximity">
      <HeaderBar 
        onGoToDocs={() => setCurrentPage('DOCS')}
        onOpenConfig={() => setActiveModal('CONFIG')}
        activeModelData={appSettings.activeModelData}
        hasProAccess={appSettings.hasProAccess}
        remainingQuota={appSettings.remainingQuota}
      />

      <main className="relative z-10 max-w-5xl mx-auto px-3 sm:px-4 md:px-6 w-full flex-grow flex flex-col">
        <div className="flex-grow flex flex-col justify-start pt-8 md:pt-16">
          <HeroSection />

          <WorkflowSection 
            status={mediaWorkflow.status}
            hasMedia={mediaWorkflow.hasMedia}
            isConfigureStepActive={mediaWorkflow.isConfigureStepActive}
            subtitles={mediaWorkflow.subtitles}
            isYouTubeWorkflow={mediaWorkflow.isYouTubeWorkflow}
            fileType={mediaWorkflow.fileType}
            file={mediaWorkflow.file}
            videoSrc={mediaWorkflow.videoSrc}
            youtubeMeta={mediaWorkflow.youtubeMeta}
            videoThumbnail={mediaWorkflow.videoThumbnail}
            localAvailableResolutions={mediaWorkflow.localAvailableResolutions}
            isDraggingFile={isDraggingFile}
            draggedFileInfo={draggedFileInfo}
            fileInputRef={mediaWorkflow.fileInputRef}
            handleDrop={mediaWorkflow.handleDrop}
            handleFileChange={mediaWorkflow.handleFileChange}
            onOpenUrlModal={(type) => { setImportType(type); setImportModalOpen(true); }}
            onOpenCloudModal={() => setCloudModalOpen(true)}
            showToast={showToast}
            hasMethodSelected={Boolean(appSettings.selectedModelId && appSettings.activeModelData)}
            onRequireMethod={() => appSettings.ensureMethodSelected("uploading files")}
            videoProcessingStatus={mediaWorkflow.videoProcessingStatus}
            videoProcessingMessage={mediaWorkflow.videoProcessingMessage}
            showProgressBar={mediaWorkflow.showProgressBar}
            ffmpegProgress={mediaWorkflow.ffmpegProgress}
            extractedTracks={mediaWorkflow.extractedTracks}
            handleTrackSelection={mediaWorkflow.handleTrackSelection}
            handleGenerateSubtitles={mediaWorkflow.handleGenerateSubtitles}
            activeModelData={appSettings.activeModelData}
            googleUser={appSettings.googleUser}
            sourceLang={mediaWorkflow.sourceLang}
            setSourceLang={mediaWorkflow.setSourceLang}
            targetLang={mediaWorkflow.targetLang}
            setTargetLang={mediaWorkflow.setTargetLang}
            resetState={mediaWorkflow.resetState}
            selectedCaptionId={mediaWorkflow.selectedCaptionId}
            setSelectedCaptionId={mediaWorkflow.setSelectedCaptionId}
            handleYouTubeCaptionDownload={mediaWorkflow.handleYouTubeCaptionDownload}
            handleTranslate={mediaWorkflow.handleTranslate}
            progress={mediaWorkflow.progress}
            error={mediaWorkflow.error}
            activeApiKey={appSettings.activeApiKey}
            onOpenSettings={() => setActiveModal('CONFIG')}
          />
        </div>

        <LivePreviewSection 
          resultsRef={mediaWorkflow.resultsRef}
          previewMode={mediaWorkflow.previewMode}
          setPreviewMode={mediaWorkflow.setPreviewMode}
          subtitles={mediaWorkflow.subtitles}
          isYouTubeWorkflow={mediaWorkflow.isYouTubeWorkflow}
          targetLang={mediaWorkflow.targetLang}
          sourceLang={mediaWorkflow.sourceLang}
          youtubeMeta={mediaWorkflow.youtubeMeta}
          selectedCaptionId={mediaWorkflow.selectedCaptionId}
          fileType={mediaWorkflow.fileType}
          resolutionMenuRef={mediaWorkflow.resolutionMenuRef}
          status={mediaWorkflow.status}
          downloadProgress={mediaWorkflow.downloadProgress}
          downloadStatusText={mediaWorkflow.downloadStatusText}
          isDownloadComplete={mediaWorkflow.isDownloadComplete}
          showResolutionMenu={mediaWorkflow.showResolutionMenu}
          setShowResolutionMenu={mediaWorkflow.setShowResolutionMenu}
          localAvailableResolutions={mediaWorkflow.localAvailableResolutions}
          localVideoDimensions={mediaWorkflow.localVideoDimensions}
          handleDownloadVideo={mediaWorkflow.handleDownloadVideo}
          handleDownloadSrt={mediaWorkflow.handleDownloadSrt}
          sourceLangFont={mediaWorkflow.sourceLangFont}
          targetLangFont={mediaWorkflow.targetLangFont}
          videoSrc={mediaWorkflow.videoSrc}
          resetState={mediaWorkflow.resetState}
        />
      </main>

      <Footer onOpenModal={(modal) => setActiveModal(modal)} />

      <SettingsDrawer 
        isOpen={activeModal === 'CONFIG'}
        onClose={() => setActiveModal('NONE')}
        selectedModelId={appSettings.selectedModelId}
        setSelectedModelId={appSettings.setSelectedModelId}
        modelsList={appSettings.modelsList}
        syncInfo={appSettings.syncInfo}
        isSyncingModels={appSettings.isSyncingModels}
        handleSyncModels={appSettings.handleSyncModels}
        modelSearchQuery={appSettings.modelSearchQuery}
        setModelSearchQuery={appSettings.setModelSearchQuery}
        openGroups={appSettings.openGroups}
        toggleGroup={appSettings.toggleGroup}
        googleUser={appSettings.googleUser}
        onGoogleLoginSuccess={appSettings.handleGoogleLoginSuccess}
        onGoogleLogout={appSettings.handleGoogleLogout}
        userGoogleApiKey={appSettings.userGoogleApiKey}
        tempGoogleApiKey={appSettings.tempGoogleApiKey}
        setTempGoogleApiKey={appSettings.setTempGoogleApiKey}
        googleApiKeyStatus={appSettings.googleApiKeyStatus}
        clearGoogleApiKey={appSettings.clearGoogleApiKey}
        userOpenAIApiKey={appSettings.userOpenAIApiKey}
        tempOpenAIApiKey={appSettings.tempOpenAIApiKey}
        setTempOpenAIApiKey={appSettings.setTempOpenAIApiKey}
        openAIApiKeyStatus={appSettings.openAIApiKeyStatus}
        clearOpenAIApiKey={appSettings.clearOpenAIApiKey}
        userAnthropicApiKey={appSettings.userAnthropicApiKey}
        tempAnthropicApiKey={appSettings.tempAnthropicApiKey}
        setTempAnthropicApiKey={appSettings.setTempAnthropicApiKey}
        anthropicApiKeyStatus={appSettings.anthropicApiKeyStatus}
        clearAnthropicApiKey={appSettings.clearAnthropicApiKey}
        handleSaveKeys={() => {
          appSettings.handleSaveKeys();
          setActiveModal('NONE');
        }}
        selectedRPM={appSettings.selectedRPM}
        setSelectedRPM={appSettings.setSelectedRPM}
        isCustomRPM={appSettings.isCustomRPM}
        setIsCustomRPM={appSettings.setIsCustomRPM}
        customRPMInput={appSettings.customRPMInput}
        setCustomRPMInput={appSettings.setCustomRPMInput}
        handleCustomRPMChange={appSettings.handleCustomRPMChange}
        selectedGeminiTier={appSettings.selectedGeminiTier}
        setSelectedGeminiTier={appSettings.setSelectedGeminiTier}
        activeModelData={appSettings.activeModelData}
      />

      <LegalModals activeModal={activeModal} onClose={() => setActiveModal('NONE')} />

      <ImportUrlModal 
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        type={importType}
        onImportFile={mediaWorkflow.processFile}
        onImportYouTube={mediaWorkflow.handleImportYouTube}
        googleAccessToken={appSettings.googleAccessToken}
        hasMethodSelected={Boolean(appSettings.selectedModelId && appSettings.activeModelData)}
        onRequireMethod={() => appSettings.ensureMethodSelected("importing files")}
      />

      <CloudImportModal 
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        onImportFile={mediaWorkflow.processFile}
        hasMethodSelected={Boolean(appSettings.selectedModelId && appSettings.activeModelData)}
        onRequireMethod={() => appSettings.ensureMethodSelected("importing files from Cloud Drive")}
      />
    </div>
  );
}

export default App;