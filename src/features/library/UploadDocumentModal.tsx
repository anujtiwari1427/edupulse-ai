import * as React from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FileDropzone,
  Input,
  Label,
  Modal,
  RadioGroup,
  Select,
  Switch,
} from '@/src/components/ui';
import { startIngestionJob } from '@/src/features/ingestion/ingestion-service';
import { getErrorMessage } from '@/src/lib/errors';
import type { BoardType, LanguageCode } from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';

export interface UploadDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBoard?: BoardType;
  defaultClassLevel?: number;
  defaultSubject?: string;
  defaultLanguage?: LanguageCode;
  initialSourceType?: 'textbook' | 'question_bank';
}

export function UploadDocumentModal(props: UploadDocumentModalProps) {
  if (!props.open) return null;
  return (
    <UploadDocumentModalInner
      key={`${props.initialSourceType ?? 'textbook'}-${props.defaultBoard ?? 'CBSE'}`}
      {...props}
    />
  );
}

function UploadDocumentModalInner({
  open,
  onOpenChange,
  defaultBoard = 'CBSE',
  defaultClassLevel = 10,
  defaultSubject = 'Science',
  defaultLanguage = 'en',
  initialSourceType = 'textbook',
}: UploadDocumentModalProps) {
  const addToast = useUIStore((s) => s.addToast);

  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [sourceType, setSourceType] = React.useState<'textbook' | 'question_bank'>(
    initialSourceType
  );
  const [board, setBoard] = React.useState<BoardType>(defaultBoard);
  const [classLevel, setClassLevel] = React.useState(defaultClassLevel);
  const [subject, setSubject] = React.useState(defaultSubject);
  const [language, setLanguage] = React.useState<LanguageCode>(defaultLanguage);
  const [ocrEnabled, setOcrEnabled] = React.useState(true);
  const [defaultMarks, setDefaultMarks] = React.useState('1');
  const [copyrightConfirmed, setCopyrightConfirmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleFilePick = (files: File[]) => {
    const chosen = files[0];
    if (!chosen) return;
    setFile(chosen);
    setError(null);
    if (!title.trim()) {
      setTitle(chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }
    if (!copyrightConfirmed) {
      setError('Please confirm educational-use rights before proceeding.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await startIngestionJob({
        file,
        title: title.trim() || file.name,
        board,
        classLevel,
        subject: subject.trim() || 'General',
        language,
        sourceType,
        ocrEnabled,
        copyrightConfirmed,
        defaultMarks: Math.max(1, Number(defaultMarks) || 1),
      });
      addToast({
        title: 'Ingestion started in background worker',
        description: `Processing "${title.trim() || file.name}" locally.`,
        variant: 'default',
      });
      setFile(null);
      setTitle('');
      setCopyrightConfirmed(false);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Upload Textbook or Question Bank"
      description="Files stay in your browser IndexedDB and optional local Library folder."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={submitting}
            disabled={!file || !copyrightConfirmed}
            onClick={(e) => void handleSubmit(e)}
          >
            Start Local Ingestion
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <RadioGroup
          value={sourceType}
          onValueChange={(v) => setSourceType(v as 'textbook' | 'question_bank')}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 space-y-0"
          options={[
            {
              value: 'textbook',
              label: 'Textbook / Study Material',
              description: 'Detects chapters and builds 500–800 token indexed chunks.',
            },
            {
              value: 'question_bank',
              label: 'Question Bank / PYQ',
              description: 'Extracts individual questions, options, marks, and tags.',
            },
          ]}
        />

        <FileDropzone
          accept={['.pdf', '.docx', '.epub', '.txt', '.md', '.csv', '.json', '.png', '.jpg', '.jpeg']}
          maxSizeBytes={100 * 1024 * 1024}
          onFilesSelected={handleFilePick}
          onError={(msg) => setError(msg)}
          title={file ? `Selected: ${file.name}` : 'Drop PDF, DOCX, EPUB, TXT, CSV, JSON, or Image'}
          description="Maximum 100 MB per file. Scanned pages can be OCR-processed offline."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="up-title" requiredMark>
              Document Title
            </Label>
            <Input
              id="up-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., NCERT Class 10 Science"
            />
          </div>

          <div>
            <Label>Board</Label>
            <Select
              value={board}
              onValueChange={(v) => setBoard(v as BoardType)}
              ariaLabel="Board"
              options={[
                { value: 'CBSE', label: 'CBSE' },
                { value: 'ICSE', label: 'ICSE' },
                { value: 'MAHARASHTRA', label: 'Maharashtra State Board' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          </div>

          <div>
            <Label>Class</Label>
            <Select
              value={String(classLevel)}
              onValueChange={(v) => setClassLevel(Number(v))}
              ariaLabel="Class"
              options={Array.from({ length: 12 }, (_, idx) => ({
                value: String(idx + 1),
                label: `Class ${idx + 1}`,
              }))}
            />
          </div>

          <div>
            <Label htmlFor="up-subject">Subject</Label>
            <Input
              id="up-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Science, Mathematics"
            />
          </div>

          <div>
            <Label>Document Language (for chunking &amp; OCR)</Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as LanguageCode)}
              ariaLabel="Language"
              options={[
                { value: 'en', label: 'English (eng)' },
                { value: 'hi', label: 'Hindi — हिन्दी (hin)' },
                { value: 'mr', label: 'Marathi — मराठी (mar)' },
              ]}
            />
          </div>
        </div>

        {sourceType === 'question_bank' && (
          <div className="max-w-xs">
            <Label htmlFor="up-marks">Default Marks (when not stated in text)</Label>
            <Input
              id="up-marks"
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={defaultMarks}
              onChange={(e) => setDefaultMarks(e.target.value)}
            />
          </div>
        )}

        <Switch
          checked={ocrEnabled}
          onCheckedChange={setOcrEnabled}
          label="Run local OCR on scanned PDF pages"
          description="Automatically detects image-only pages (< 35 characters) and extracts text with Tesseract."
        />

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
          <Checkbox
            checked={copyrightConfirmed}
            onCheckedChange={setCopyrightConfirmed}
            label="Educational-use confirmation"
            description="I confirm that I am authorized to use this textbook or question bank for classroom teaching and assessment preparation."
          />
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
