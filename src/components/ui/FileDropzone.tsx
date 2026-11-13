import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn, formatBytes } from '@/src/lib/utils';

export interface FileDropzoneProps {
  accept?: string[];
  maxSizeBytes?: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  onError?: (message: string) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({
  accept,
  maxSizeBytes = 100 * 1024 * 1024,
  multiple = false,
  onFilesSelected,
  onError,
  title = 'Select or drop a file',
  description,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const validateAndEmit = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const valid: File[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > maxSizeBytes) {
        onError?.(`"${file.name}" exceeds the ${formatBytes(maxSizeBytes)} limit.`);
        continue;
      }
      if (accept && accept.length > 0) {
        const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
        const matchesExt = accept.some((a) => a.toLowerCase() === ext);
        const matchesMime = accept.some((a) => a === file.type);
        if (!matchesExt && !matchesMime) {
          onError?.(`"${file.name}" is not a supported file type (${accept.join(', ')}).`);
          continue;
        }
      }
      valid.push(file);
    }

    if (valid.length > 0) {
      onFilesSelected(multiple ? valid : [valid[0]!]);
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) validateAndEmit(e.dataTransfer.files);
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors cursor-pointer',
        dragging
          ? 'border-[#4338ca] bg-[var(--brand-50)]'
          : 'border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept?.join(',')}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          validateAndEmit(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
        <Upload className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">{description}</div>
      )}
    </div>
  );
}
