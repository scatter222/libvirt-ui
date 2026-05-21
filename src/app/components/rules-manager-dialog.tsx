import { Button } from '@/app/components/ui/button';

import { AlertTriangle, Check, FileText, Loader2, RefreshCw, RotateCw, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface RuleSet {
  id: string;
  name: string;
  description?: string;
  directory: string;
  allowedExtensions: string[];
  maxFileSizeBytes: number;
  restartAvailable?: boolean;
  restartDescription?: string;
  restartVmName?: string;
}

interface RuleFileSummary {
  name: string;
  size: number;
  lastModified: string;
}

interface RuleFileContent {
  name: string;
  content: string;
  size: number;
  lastModified: string;
}

interface SetsResponse {
  count: number;
  sets: RuleSet[];
}

interface ListResponse {
  set: string;
  name: string;
  directory: string;
  count: number;
  files: RuleFileSummary[];
}

interface RestartResult {
  success: boolean;
  vmName?: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: string | null;
  durationSeconds?: number;
}

interface PendingUpload {
  name: string;
  content: string;
  needsOverwriteConfirm: boolean;
}

interface RulesManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatBytes (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function RulesManagerDialog ({ open, onClose }: RulesManagerDialogProps) {
  const [sets, setSets] = useState<RuleSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [files, setFiles] = useState<RuleFileSummary[]>([]);
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RuleFileContent | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<RestartResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSet = useMemo(
    () => sets.find((s) => s.id === activeSetId) ?? null,
    [sets, activeSetId]
  );
  const allowedAccept = useMemo(
    () => (activeSet?.allowedExtensions ?? []).join(','),
    [activeSet]
  );

  const loadSets = async () => {
    setSetsLoading(true);
    setError(null);
    try {
      const res = await electron.ipcRenderer.invoke('rules:sets') as {
        success: boolean;
        data?: SetsResponse;
        error?: string;
      };
      if (res.success && res.data) {
        setSets(res.data.sets);
        if (res.data.sets.length > 0) {
          const next = res.data.sets.find((s) => s.id === activeSetId) ?? res.data.sets[0];
          setActiveSetId(next.id);
        } else {
          setActiveSetId('');
        }
      } else {
        setError(res.error || 'Failed to load rule sets from server.');
      }
    } finally {
      setSetsLoading(false);
    }
  };

  const loadFiles = async (setId: string) => {
    if (!setId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await electron.ipcRenderer.invoke('rules:list', setId) as {
        success: boolean;
        data?: ListResponse;
        error?: string;
      };
      if (res.success && res.data) {
        setFiles(res.data.files);
        setDirectory(res.data.directory);
      } else {
        setFiles([]);
        setDirectory('');
        setError(res.error || 'Failed to load files.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelected(null);
      setPending(null);
      setStatusMessage(null);
      setError(null);
      setRestartResult(null);
      loadSets();
    }
  }, [open]);

  useEffect(() => {
    if (open && activeSetId) {
      setSelected(null);
      setPending(null);
      setStatusMessage(null);
      setRestartResult(null);
      loadFiles(activeSetId);
    }
  }, [activeSetId, open]);

  const handleSelect = async (name: string) => {
    if (!activeSetId) return;
    setSelectedLoading(true);
    setSelected(null);
    setError(null);
    try {
      const res = await electron.ipcRenderer.invoke('rules:get', activeSetId, name) as {
        success: boolean;
        data?: RuleFileContent;
        error?: string;
      };
      if (res.success && res.data) {
        setSelected(res.data);
      } else {
        setError(res.error || 'Failed to read file.');
      }
    } finally {
      setSelectedLoading(false);
    }
  };

  const doUpload = async (name: string, content: string, overwrite: boolean) => {
    if (!activeSetId) return;
    setUploading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await electron.ipcRenderer.invoke('rules:upload', activeSetId, { name, content, overwrite }) as {
        success: boolean;
        conflict?: boolean;
        error?: string;
      };
      if (res.success) {
        setStatusMessage(`Uploaded "${name}" successfully.`);
        setPending(null);
        await loadFiles(activeSetId);
      } else if (res.conflict) {
        setPending({ name, content, needsOverwriteConfirm: true });
      } else {
        setError(res.error || 'Upload failed.');
        setPending(null);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const exists = files.some((r) => r.name === file.name);
    if (exists) {
      setPending({ name: file.name, content: text, needsOverwriteConfirm: true });
    } else {
      await doUpload(file.name, text, false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!activeSetId) return;
    if (!confirm(`Delete rule "${name}" from the server?`)) return;
    setError(null);
    const res = await electron.ipcRenderer.invoke('rules:delete', activeSetId, name) as {
      success: boolean;
      error?: string;
    };
    if (res.success) {
      setStatusMessage(`Deleted "${name}".`);
      if (selected?.name === name) setSelected(null);
      await loadFiles(activeSetId);
    } else {
      setError(res.error || 'Delete failed.');
    }
  };

  const handleRestart = async () => {
    if (!activeSet || !activeSet.restartAvailable) return;
    const label = activeSet.restartVmName
      ? `Restart ${activeSet.name} in VM "${activeSet.restartVmName}"?`
      : `Restart ${activeSet.name}?`;
    if (!confirm(label)) return;

    setRestarting(true);
    setError(null);
    setStatusMessage(null);
    setRestartResult(null);
    try {
      const res = await electron.ipcRenderer.invoke('rules:restart', activeSet.id) as {
        success: boolean;
        data?: RestartResult;
        error?: string;
      };
      if (res.success && res.data) {
        setRestartResult(res.data);
        setStatusMessage(`Restarted ${activeSet.name} on "${res.data.vmName || activeSet.restartVmName}".`);
      } else {
        // Structured failure body comes back via res.data even when !success.
        if (res.data) setRestartResult(res.data);
        setError(res.error || `Restart failed for ${activeSet.name}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestarting(false);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleFile(file);
  };

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4'>
      <div className='glass-card rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-border-light/30'>
        {/* Header */}
        <div className='flex items-center justify-between p-5 border-b border-border-light/20'>
          <div>
            <h2 className='text-xl font-bold text-white/95'>Detection Rules</h2>
            <p className='text-xs text-text-light/60 mt-0.5'>
              {activeSet
                ? `${activeSet.name}${directory ? ` · ${directory}` : ''}`
                : 'Connect to rules API to view files'}
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-2 rounded-lg text-text-light/60 hover:text-white hover:bg-dark-300/50 transition-all'
            aria-label='Close'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Rule set tabs */}
        <div className='px-5 py-3 border-b border-border-light/20 flex items-center gap-2 flex-wrap'>
          {setsLoading
            ? (
              <span className='text-xs text-text-light/60 flex items-center gap-1.5'>
                <Loader2 className='w-3 h-3 animate-spin' /> Loading rule sets…
              </span>
              )
            : sets.length === 0
              ? (
                <span className='text-xs text-text-light/60'>
                  No rule sets configured on the server.
                </span>
                )
              : sets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSetId(s.id)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all border
                    ${activeSetId === s.id
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-dark-300/40 border-border-light/30 text-text-light/70 hover:border-primary/40 hover:text-white'}`}
                  title={s.description || s.directory}
                >
                  {s.name}
                </button>
              ))}
        </div>

        {/* Body */}
        <div className='flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-5 overflow-hidden min-h-0'>
          {/* Left: list */}
          <div className='flex flex-col min-h-0 bg-dark-100/40 rounded-lg border border-border-light/20'>
            <div className='flex items-center justify-between p-3 border-b border-border-light/20'>
              <span className='text-sm font-medium text-white/90'>
                Files ({files.length})
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => loadFiles(activeSetId)}
                disabled={loading || !activeSetId}
                className='h-7 px-2 gap-1.5 border-border-light/40 hover:border-primary/50'
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span className='text-xs'>Refresh</span>
              </Button>
            </div>
            <div className='flex-1 overflow-auto p-2'>
              {loading
                ? (
                  <div className='flex items-center justify-center py-12 text-text-light/60 text-sm gap-2'>
                    <Loader2 className='w-4 h-4 animate-spin' /> Loading…
                  </div>
                  )
                : files.length === 0
                  ? (
                    <div className='flex flex-col items-center justify-center py-12 text-text-light/60 text-sm text-center px-4'>
                      <FileText className='w-10 h-10 mb-2 opacity-50' />
                      No rules in this folder. Upload one below.
                    </div>
                    )
                  : (
                    <ul className='space-y-1'>
                      {files.map((r) => (
                        <li key={r.name}>
                          <div
                            onClick={() => handleSelect(r.name)}
                            className={`w-full text-left rounded-md px-3 py-2 flex items-center justify-between gap-2 group transition-all cursor-pointer
                              ${selected?.name === r.name
                                ? 'bg-primary/15 border border-primary/40'
                                : 'border border-transparent hover:bg-dark-300/40 hover:border-border-light/30'}`}
                          >
                            <div className='min-w-0'>
                              <div className='text-sm text-white/95 font-medium truncate'>{r.name}</div>
                              <div className='text-[11px] text-text-light/55 mt-0.5'>
                                {formatBytes(r.size)} · {new Date(r.lastModified).toLocaleString()}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(r.name); }}
                              className='p-1.5 rounded text-text-light/40 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100'
                              title='Delete rule'
                            >
                              <Trash2 className='w-3.5 h-3.5' />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    )}
            </div>
          </div>

          {/* Right: preview */}
          <div className='flex flex-col min-h-0 bg-dark-100/40 rounded-lg border border-border-light/20'>
            <div className='p-3 border-b border-border-light/20'>
              <span className='text-sm font-medium text-white/90'>
                {selected ? selected.name : 'Preview'}
              </span>
            </div>
            <div className='flex-1 overflow-auto p-3'>
              {selectedLoading
                ? (
                  <div className='flex items-center gap-2 text-text-light/60 text-sm'>
                    <Loader2 className='w-4 h-4 animate-spin' /> Loading content…
                  </div>
                  )
                : selected
                  ? (
                    <pre className='text-xs font-mono text-text-light/85 whitespace-pre-wrap break-words'>
                      {selected.content}
                    </pre>
                    )
                  : (
                    <div className='text-text-light/50 text-sm'>
                      Select a file on the left to view its contents.
                    </div>
                    )}
            </div>
          </div>
        </div>

        {/* Status / Error messages */}
        {(error || statusMessage) && (
          <div className='px-5 pb-2 space-y-1'>
            {error && (
              <div className='flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2'>
                <AlertTriangle className='w-4 h-4 flex-shrink-0 mt-0.5' />
                <span>{error}</span>
              </div>
            )}
            {statusMessage && (
              <div className='flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2'>
                <Check className='w-4 h-4 flex-shrink-0 mt-0.5' />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Restart result detail (stdout/stderr) */}
        {restartResult && (restartResult.stdout || restartResult.stderr || restartResult.command) && (
          <div className='mx-5 mb-2 bg-dark-100/60 border border-border-light/20 rounded-md p-3 text-[11px] text-text-light/80 font-mono space-y-1 max-h-32 overflow-auto'>
            {restartResult.command && (
              <div><span className='text-text-light/50'>$</span> {restartResult.command}</div>
            )}
            {typeof restartResult.exitCode === 'number' && (
              <div className='text-text-light/50'>
                exit={restartResult.exitCode}
                {typeof restartResult.durationSeconds === 'number' && ` · ${restartResult.durationSeconds.toFixed(1)}s`}
              </div>
            )}
            {restartResult.stdout && <pre className='whitespace-pre-wrap break-words text-text-light/85'>{restartResult.stdout}</pre>}
            {restartResult.stderr && <pre className='whitespace-pre-wrap break-words text-red-300/80'>{restartResult.stderr}</pre>}
          </div>
        )}

        {/* Overwrite confirmation */}
        {pending?.needsOverwriteConfirm && (
          <div className='mx-5 mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 flex items-center justify-between gap-3'>
            <div className='flex items-start gap-2'>
              <AlertTriangle className='w-4 h-4 text-yellow-400 mt-0.5' />
              <div className='text-xs text-yellow-200/90'>
                A rule named <span className='font-mono font-semibold'>{pending.name}</span> already exists on the server. Overwrite it?
              </div>
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPending(null)}
                disabled={uploading}
                className='h-7 px-3 border-border-light/40 text-xs'
              >
                Cancel
              </Button>
              <Button
                size='sm'
                onClick={() => doUpload(pending.name, pending.content, true)}
                disabled={uploading}
                className='h-7 px-3 bg-yellow-500 hover:bg-yellow-500/90 text-yellow-950 text-xs'
              >
                Overwrite
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className='p-4 border-t border-border-light/20 flex items-center justify-between gap-3'>
          <input
            ref={fileInputRef}
            type='file'
            accept={allowedAccept}
            className='hidden'
            onChange={onFileChange}
          />
          <div className='text-[11px] text-text-light/50 min-w-0 flex-1'>
            {activeSet
              ? (
                <>
                  Allowed extensions:{' '}
                  {activeSet.allowedExtensions.map((ext) => (
                    <code key={ext} className='text-primary/80 mr-1'>{ext}</code>
                  ))}
                </>
                )
              : 'Select a rule set above to upload.'}
          </div>
          <div className='flex gap-2 flex-shrink-0'>
            <Button
              variant='outline'
              onClick={onClose}
              className='border-border-light/40 hover:border-primary/50'
            >
              Close
            </Button>
            {activeSet?.restartAvailable && (
              <Button
                variant='outline'
                onClick={handleRestart}
                disabled={restarting}
                title={activeSet.restartDescription || `Restart ${activeSet.name} in VM "${activeSet.restartVmName || ''}"`}
                className='border-yellow-500/50 hover:bg-yellow-500/10 hover:border-yellow-400 text-yellow-300 gap-2'
              >
                {restarting ? <Loader2 className='w-4 h-4 animate-spin' /> : <RotateCw className='w-4 h-4' />}
                Restart {activeSet.name}
              </Button>
            )}
            <Button
              onClick={onPickFile}
              disabled={uploading || !activeSet}
              className='bg-primary hover:bg-primary/90 gap-2'
            >
              {uploading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Upload className='w-4 h-4' />}
              Upload Rule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
