import * as React from 'react';
import { FolderOpen, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  RadioGroup,
  Select,
  Stepper,
} from '@/src/components/ui';
import { changeAppLanguage } from '@/src/lib/i18n';
import type { BoardType, LanguageCode } from '@/src/lib/zod-schemas';
import { repository } from '@/src/features/storage/repository';
import {
  isFileSystemAccessSupported,
  pickLibraryFolder,
} from '@/src/features/storage/folder-sync';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import { useUIStore } from '@/src/app/store';

export interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const { t } = useTranslation();
  const addToast = useUIStore((s) => s.addToast);

  const [step, setStep] = React.useState(0);
  const [language, setLanguage] = React.useState<LanguageCode>('en');
  const [board, setBoard] = React.useState<BoardType>('CBSE');
  const [schoolName, setSchoolName] = React.useState('');
  const [folderName, setFolderName] = React.useState<string | null>(null);
  const [loadingSample, setLoadingSample] = React.useState(false);

  const fsSupported = isFileSystemAccessSupported();

  const handleLanguageChange = (val: string) => {
    const lang = val as LanguageCode;
    setLanguage(lang);
    changeAppLanguage(lang);
  };

  const handlePickFolder = async () => {
    try {
      const picked = await pickLibraryFolder();
      if (picked) {
        setFolderName(picked.folderName);
        await repository.settingsRepo.update({
          folderSyncEnabled: true,
          folderName: picked.folderName,
        });
        addToast({
          title: 'Library folder linked',
          description: `Auto-saving exports to "${picked.folderName}".`,
          variant: 'success',
        });
      }
    } catch {
      addToast({
        title: 'Folder selection cancelled',
        description: 'You can link a folder anytime in Settings > Storage & Backup.',
        variant: 'warning',
      });
    }
  };

  const finishOnboarding = async (withSample: boolean) => {
    setLoadingSample(true);
    try {
      await repository.settingsRepo.update({
        language,
        defaultBoard: board,
        schoolName: schoolName.trim(),
        onboardingCompleted: true,
      });
      void repository.storageRepo.requestPersistence();
      if (withSample) {
        const res = await loadSampleClass10Library();
        addToast({
          title: 'Sample Class 10 Science pack loaded',
          description: `Added NCERT sample chapters, ${res.questionsAdded} questions, and 1 unit test draft.`,
          variant: 'success',
        });
      }
      onComplete();
    } finally {
      setLoadingSample(false);
    }
  };

  const steps = [
    { id: 'lang', label: t('onboarding.stepLanguage') },
    { id: 'folder', label: t('onboarding.stepStorage') },
    { id: 'sample', label: t('onboarding.stepSample') },
  ];

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          void finishOnboarding(false);
        }
      }}
      title={t('onboarding.title')}
      description={t('onboarding.subtitle')}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void finishOnboarding(false)}
            disabled={loadingSample}
          >
            {t('actions.skip')}
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
                disabled={loadingSample}
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                {t('actions.continue')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void finishOnboarding(false)}
                disabled={loadingSample}
              >
                Start Empty
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Stepper steps={steps} currentStepIndex={step} onStepClick={setStep} />

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="onb-lang">Interface Language</Label>
              <Select
                value={language}
                onValueChange={handleLanguageChange}
                ariaLabel="Interface Language"
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'हिन्दी (Hindi)' },
                  { value: 'mr', label: 'मराठी (Marathi)' },
                ]}
              />
            </div>

            <div>
              <Label htmlFor="onb-board">Default School Board</Label>
              <Select
                value={board}
                onValueChange={(v) => setBoard(v as BoardType)}
                ariaLabel="Default School Board"
                options={[
                  { value: 'CBSE', label: 'CBSE (Central Board of Secondary Education)' },
                  { value: 'ICSE', label: 'ICSE / CISCE' },
                  { value: 'MAHARASHTRA', label: 'Maharashtra State Board (SSC / HSC)' },
                  { value: 'OTHER', label: 'Other State / School Board' },
                ]}
              />
            </div>

            <div>
              <Label htmlFor="onb-school">School Name (optional, used on paper headers)</Label>
              <Input
                id="onb-school"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g., Vidya Mandir High School, Pune"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Alert tone="info" title="100% Local Storage">
              Your textbooks, question banks, and papers stay in browser IndexedDB on this device.
              {fsSupported
                ? ' You can also link an "EduPulse Library" folder on your computer for automatic file sync.'
                : ' On this browser, use one-click ZIP backups in Settings to back up your workspace.'}
            </Alert>

            {fsSupported ? (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {folderName ? `Linked: ${folderName}` : 'No folder linked yet'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    Creates /Textbooks, /QuestionBanks, /Papers, and /Exports subfolders.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePickFolder()}
                  leftIcon={<FolderOpen className="h-4 w-4" />}
                >
                  {folderName ? 'Change Folder' : 'Pick Folder'}
                </Button>
              </div>
            ) : (
              <RadioGroup
                value="zip"
                onValueChange={() => undefined}
                options={[
                  {
                    value: 'zip',
                    label: 'Browser IndexedDB + ZIP Backups',
                    description:
                      'Folder auto-sync requires Chromium (Chrome/Edge). ZIP backups and auto-downloads work everywhere.',
                  },
                ]}
              />
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Would you like to load a real CBSE Class 10 Science starter pack (3 chapters, 10
              sample questions, and 1 unit test draft) so you can explore the workspace right away?
            </p>
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  NCERT Class 10 Science — Sample Pack
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  Chemical Reactions · Acids &amp; Bases · Life Processes
                </div>
              </div>
              <Button
                size="sm"
                loading={loadingSample}
                onClick={() => void finishOnboarding(true)}
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                {t('actions.loadSample')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
