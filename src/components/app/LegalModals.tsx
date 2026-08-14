import React from 'react';
import { Shield, HardDrive, Youtube } from 'lucide-react';
import { Modal } from '../common/Modal';

interface LegalModalsProps {
  activeModal: 'NONE' | 'CONFIG' | 'TOS' | 'PRIVACY';
  onClose: () => void;
}

export const LegalModals: React.FC<LegalModalsProps> = ({ activeModal, onClose }) => {
  return (
    <>
      <Modal isOpen={activeModal === 'PRIVACY'} onClose={onClose} title="Privacy Policy">
        <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
          <p className="text-xs text-neutral-500">Last Updated: November 2025</p>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" /> Data Handling & Storage
            </h3>
            <p>
              <strong>SubStream AI</strong> is a "Client-Side" application. We do not store your API keys, subtitle files, or personal data on our servers.
              All API keys are stored locally in your browser's <code>localStorage</code>.
            </p>
          </div>
          
          <div className="space-y-3 pt-4 border-t border-neutral-800">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-400" /> Google Drive Integration
            </h3>
            <p>
              When using Cloud Import, we request <code>drive.readonly</code> permission. This allows us to list your folders and download specific files you select.
            </p>
            <ul className="list-disc list-inside pl-2 mt-1 space-y-1 text-neutral-400">
              <li><strong>Data Flow:</strong> Google Drive → Local Proxy Server (Your Machine) → Browser Application.</li>
              <li><strong>No Storage:</strong> We do not store, copy, or analyze your files outside of the immediate translation session.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-4 border-t border-neutral-800">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Youtube className="w-4 h-4 text-red-500" /> YouTube API Services
            </h3>
            <p>
              This application uses YouTube API Services to provide features such as importing videos from your channel and uploading videos for auto-captioning.
              By using these features, you agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-white underline">YouTube Terms of Service</a>.
            </p>
            <p>We access the following data only when you explicitly authenticate:</p>
            <ul className="list-disc list-inside pl-2 mt-1 space-y-1 text-neutral-400">
              <li><strong>Uploads:</strong> To upload videos as "Unlisted" for transcription purposes.</li>
              <li><strong>Channel List:</strong> To display your videos in the import selector.</li>
            </ul>
            <p>
              Please refer to the <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-white underline">Google Privacy Policy</a> for more information on how Google handles your data.
            </p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'TOS'} onClose={onClose} title="Terms of Service">
        <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
          <p className="text-xs text-neutral-500">Last Updated: November 2025</p>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg">1. Acceptance of Terms</h3>
            <p>By accessing and using SubStream AI, you accept and agree to be bound by the terms and provision of this agreement.</p>
          </div>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg">2. Third-Party Integrations</h3>
            <p>
              Our service integrates with YouTube and Google Drive. By using these features, you agree to their respective Terms of Service:
            </p>
            <ul className="list-disc list-inside pl-2 text-neutral-400">
              <li><a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">YouTube Terms of Service</a></li>
              <li><a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Google Drive Terms of Service</a></li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg">3. API Usage & Rate Limits</h3>
            <p>
              You are responsible for managing your own API keys (Gemini/OpenAI). SubStream AI implements rate limiting to help prevent errors, but we are not responsible for any costs incurred or account suspensions due to excessive usage.
            </p>
          </div>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg">4. User Responsibility</h3>
            <p>
              You are solely responsible for the content you process using this tool. You agree not to upload content that violates copyright laws, contains illegal material, or infringes on the rights of others.
            </p>
          </div>
          <div className="space-y-3">
            <h3 className="text-white font-bold text-lg">5. Disclaimer</h3>
            <p>
              This software is provided "as is", without warranty of any kind, express or implied. The developers are not liable for any damages or data loss arising from the use of this software.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
};
