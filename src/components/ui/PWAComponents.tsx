import * as React from 'react';
import { Download, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus, usePWAInstall } from '@/src/lib/pwa-hooks';
import { Button } from './Button';
import { Modal } from './Overlay';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = React.useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void install()}
        leftIcon={<Download className="h-3.5 w-3.5" />}
      >
        Install App
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setShowIOSModal(true)}>
          Install App
        </Button>
        <Modal
          open={showIOSModal}
          onOpenChange={setShowIOSModal}
          title="Install EduPulse AI on iPhone or iPad"
          size="sm"
          footer={
            <Button size="sm" onClick={() => setShowIOSModal(false)}>
              Close
            </Button>
          }
        >
          <ol className="list-decimal pl-5 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              Tap the <strong className="text-[var(--text-primary)]">Share</strong> button in
              Safari&apos;s toolbar.
            </li>
            <li>
              Scroll down and tap{' '}
              <strong className="text-[var(--text-primary)]">Add to Home Screen</strong>.
            </li>
            <li>Open EduPulse AI from your home screen for offline use.</li>
          </ol>
        </Modal>
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print fixed bottom-16 md:bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs font-medium text-[var(--warning-text)] shadow-md"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>{t('status.offlineMode')}</span>
    </div>
  );
}
