import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** `accept` attribute value, e.g. "image/*" or ".csv,text/csv". */
  accept: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

/** Accepts a dropped/picked file when it matches any `accept` token (mime wildcard, exact mime or extension). */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((t) =>
    t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t,
  );
}

export function Dropzone({ onFiles, accept, multiple = true, label, hint, disabled }: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(0);
  const hintId = useId();

  const take = (list: FileList | null) => {
    const all = [...(list ?? [])];
    const ok = all.filter((f) => matchesAccept(f, accept));
    setRejected(all.length - ok.length);
    if (ok.length > 0) onFiles(multiple ? ok : ok.slice(0, 1));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.current?.click();
    }
  };

  return (
    <div>
      <div
        className={`dropzone${over ? ' over' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={hintId}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={onKey}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <strong>{label ?? 'Drop files here or press to choose'}</strong>
        <span className="muted small" id={hintId}>
          {hint ?? (multiple ? 'You can select many files at once.' : 'One file.')}
        </span>
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          disabled={disabled}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {rejected > 0 && (
        <p className="small" role="status" style={{ color: 'var(--danger)' }}>
          {rejected} file{rejected > 1 ? 's were' : ' was'} skipped because the type is not supported here.
        </p>
      )}
    </div>
  );
}
