import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Play, Square, RotateCw, Monitor, HardDrive,
  Cpu, MemoryStick, Trash2, Cloud,
  Loader2, FolderOpen, AlertTriangle, Copy,
  Pencil, StickyNote, Check, FileDown,
  Server, Plus, Boxes
} from 'lucide-react';
import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';

export type LocalVmState = 'running' | 'stopped' | 'paused' | 'suspended';

export interface LocalVmTemplate {
  name: string;
  displayName: string;
  description: string;
  category: string;
  memory: number;
  cpus: number;
  tags: string[];
  ovaPath: string;
  ovaExists: boolean;
  instanceCount: number;
}

export interface LocalVmInstance {
  name: string;
  templateName: string;
  displayName: string;
  description: string;
  category: string;
  state: LocalVmState;
  memory: number;
  cpus: number;
  tags: string[];
  label?: string;
  notes?: string;
  sharedFolderPath: string;
  sharedFolderAttached: boolean;
  sharedFolderItemCount: number;
}

export interface RemoteVmInstance {
  id: string;
  templateId: string;
  templateName: string;
  owner: string;
  state: 'running' | 'stopped' | 'creating' | 'error';
  createdAt: string;
  consoleType: string;
  consolePort: number;
  specs: {
    memory: number;
    cpus: number;
    diskSize: number;
  };
}

export type VmAction = 'start' | 'stop' | 'restart' | 'console' | 'delete' | 'deploy' | 'folder' | 'copy' | 'edit';

interface LocalTemplateLaneProps {
  template: LocalVmTemplate;
  deploying: boolean;
  deployMessage?: string;
  onDeploy: () => void;
  children?: ReactNode;
}

interface LocalVmCardProps {
  instance: LocalVmInstance;
  busyAction: VmAction | null;
  busyMessage?: string;
  flashMessage?: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConsole: () => void;
  onDelete: (deleteData: boolean) => void;
  onOpenSharedFolder: () => void;
  onSaveMetadata: (label: string, notes: string) => void;
  onDropFiles: (files: File[]) => void;
}

interface RemoteVmCardProps {
  instance: RemoteVmInstance;
  busyAction?: VmAction | null;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConsole: () => void;
  onDelete: () => void;
}

const BUSY_LABELS: Record<VmAction, string> = {
  start: 'Starting',
  stop: 'Stopping',
  restart: 'Restarting',
  console: 'Opening console',
  delete: 'Deleting',
  deploy: 'Deploying',
  folder: 'Opening folder',
  copy: 'Copying files',
  edit: 'Saving'
};

function StateBadge ({ state, busyAction }: { state: string; busyAction?: VmAction | null }) {
  if (busyAction) {
    return (
      <Badge variant='outline' className='bg-amber-500/20 text-amber-400 border-amber-500/50 flex items-center gap-1.5 ml-2'>
        <Loader2 className='w-3 h-3 animate-spin' />
        <span>{BUSY_LABELS[busyAction]}</span>
      </Badge>
    );
  }

  const styles: Record<string, string> = {
    running: 'bg-green-500/20 text-green-400 border-green-500/50',
    stopped: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    suspended: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    available: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    creating: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    error: 'bg-red-500/20 text-red-400 border-red-500/50'
  };

  const dotStyles: Record<string, string> = {
    running: 'bg-green-400 animate-pulse',
    stopped: 'bg-gray-400',
    paused: 'bg-yellow-400',
    suspended: 'bg-yellow-400',
    available: 'bg-blue-400',
    creating: 'bg-purple-400 animate-pulse',
    error: 'bg-red-400'
  };

  return (
    <Badge variant='outline' className={`${styles[state] || styles.stopped} flex items-center gap-1.5 ml-2`}>
      <span className={`w-2 h-2 rounded-full ${dotStyles[state] || dotStyles.stopped}`} />
      <span className='capitalize'>{state}</span>
    </Badge>
  );
}

function SpecsBar ({ memory, cpus, diskSize }: { memory: number; cpus: number; diskSize?: number }) {
  return (
    <div className='bg-dark-100/50 rounded-lg p-3 mb-4 border border-border-light/20'>
      <div className={`grid ${diskSize ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
        <div className='flex flex-col items-center text-center'>
          <MemoryStick className='w-4 h-4 text-primary/80 mb-1' />
          <span className='text-xs text-text-light/60'>RAM</span>
          <span className='text-sm font-semibold text-white/90'>{memory} MB</span>
        </div>
        <div className='flex flex-col items-center text-center'>
          <Cpu className='w-4 h-4 text-primary/80 mb-1' />
          <span className='text-xs text-text-light/60'>CPUs</span>
          <span className='text-sm font-semibold text-white/90'>{cpus}</span>
        </div>
        {diskSize && (
          <div className='flex flex-col items-center text-center'>
            <HardDrive className='w-4 h-4 text-primary/80 mb-1' />
            <span className='text-xs text-text-light/60'>Disk</span>
            <span className='text-sm font-semibold text-white/90'>{diskSize} GB</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressLine ({ message }: { message: string }) {
  return (
    <div className='flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 animate-fade-in'>
      <Loader2 className='w-3.5 h-3.5 text-primary animate-spin shrink-0' />
      <span className='text-xs text-text-light/90 truncate' title={message}>{message}</span>
    </div>
  );
}

/**
 * A swim-lane for one VM template: the header carries the template identity
 * (name, description, specs) and the "Create Instance" action; the lane body
 * holds that template's instance cards.
 */
export function LocalTemplateLane ({ template, deploying, deployMessage, onDeploy, children }: LocalTemplateLaneProps) {
  const hasInstances = template.instanceCount > 0;

  return (
    <section className='relative overflow-hidden glass-card rounded-xl animate-fade-in'>
      <div className='absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-primary via-blue-selected/60 to-transparent' />

      {/* Lane header — template identity + create action */}
      <div className='relative px-5 py-4 border-b border-border-light/15 bg-dark-300/30'>
        <div className='flex flex-wrap items-center gap-4 justify-between'>
          <div className='flex items-center gap-3 min-w-0 flex-1'>
            <div className='w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0'>
              <Server className='w-5 h-5 text-primary' />
            </div>
            <div className='min-w-0'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='text-lg font-semibold text-white/95 tracking-tight'>{template.displayName}</h3>
                <Badge variant='outline' className={`flex items-center gap-1 text-xs ${hasInstances ? 'bg-primary/15 text-primary border-primary/40' : 'bg-dark-100/60 text-text-light/50 border-border-light/30'}`}>
                  <Copy className='w-3 h-3' />
                  <span>{template.instanceCount} instance{template.instanceCount === 1 ? '' : 's'}</span>
                </Badge>
                {template.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-[10px] px-1.5 py-0 font-medium hidden sm:inline-flex'>
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className='text-xs text-text-light/70 mt-0.5 truncate' title={template.description}>{template.description}</p>
            </div>
          </div>

          <div className='flex items-center gap-4 shrink-0'>
            <div className='hidden md:flex items-center gap-3 text-xs text-text-light/60'>
              <span className='flex items-center gap-1.5'>
                <MemoryStick className='w-3.5 h-3.5 text-primary/70' />
                <span className='text-white/80 font-medium'>{template.memory} MB</span>
              </span>
              <span className='flex items-center gap-1.5'>
                <Cpu className='w-3.5 h-3.5 text-primary/70' />
                <span className='text-white/80 font-medium'>{template.cpus} CPU{template.cpus === 1 ? '' : 's'}</span>
              </span>
            </div>
            <Button
              variant='default'
              size='sm'
              className='h-9 px-4 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20 disabled:opacity-60'
              onClick={onDeploy}
              disabled={deploying || !template.ovaExists}
            >
              {deploying
                ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
                : <Plus className='w-3.5 h-3.5 mr-1.5' />}
              {deploying ? 'Creating...' : 'Create Instance'}
            </Button>
          </div>
        </div>

        {deploying && deployMessage && <ProgressLine message={deployMessage} />}

        {!template.ovaExists && (
          <div className='flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30'>
            <AlertTriangle className='w-3.5 h-3.5 text-amber-400 shrink-0' />
            <span className='text-xs text-text-light/80 truncate' title={template.ovaPath}>
              OVA image not found — new instances cannot be created
            </span>
          </div>
        )}
      </div>

      {/* Lane body — this template's instances */}
      <div className='relative p-5'>
        {hasInstances
          ? (
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
              {children}
            </div>
            )
          : (
            <div className='flex items-center justify-center gap-3 py-8 px-4 rounded-lg border border-dashed border-border-light/30 text-center'>
              <Boxes className='w-5 h-5 text-text-light/40 shrink-0' />
              <p className='text-xs text-text-light/50'>
                No instances yet. Create one to get started — each instance gets its own shared folder.
              </p>
            </div>
            )}
      </div>
    </section>
  );
}

export function LocalVmCard ({
  instance, busyAction, busyMessage, flashMessage,
  onStart, onStop, onRestart, onConsole, onDelete, onOpenSharedFolder, onSaveMetadata, onDropFiles
}: LocalVmCardProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);

  const busy = busyAction !== null;
  const dragOver = dragDepth > 0;
  const title = instance.label || instance.displayName;

  const startEditing = () => {
    setEditLabel(instance.label ?? '');
    setEditNotes(instance.notes ?? '');
    setEditing(true);
  };

  const saveEdits = () => {
    setEditing(false);
    onSaveMetadata(editLabel.trim(), editNotes.trim());
  };

  const confirmDelete = () => {
    setConfirmingDelete(false);
    onDelete(deleteData);
  };

  // Drag files from the desktop straight onto the card to copy them into the
  // VM's shared folder
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (busy || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (busy || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  };
  const handleDragLeave = () => setDragDepth((d) => Math.max(0, d - 1));
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth(0);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onDropFiles(files);
  };

  const topBarColor = busy
    ? 'bg-gradient-to-r from-amber-500 to-amber-400/60'
    : instance.state === 'running'
      ? 'bg-gradient-to-r from-primary to-blue-selected/60'
      : 'bg-border-light/30';

  const actionIcon = (action: VmAction, Icon: typeof Play) => (busyAction === action
    ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
    : <Icon className='w-3.5 h-3.5 mr-1.5' />);

  return (
    <Card
      className={`relative overflow-hidden glass-card glass-card-hover group transition-all ${busy ? 'opacity-90' : ''} ${dragOver ? 'ring-2 ring-primary shadow-lg shadow-primary/30' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
      <div className={`absolute top-0 left-0 right-0 h-1 ${topBarColor}`} />

      {/* Drop target overlay */}
      {dragOver && (
        <div className='absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-dark-100/90 border-2 border-dashed border-primary rounded-xl pointer-events-none'>
          <FileDown className='w-8 h-8 text-primary animate-bounce' />
          <p className='text-sm font-medium text-white/90'>Drop to copy into shared folder</p>
          <p className='text-xs text-text-light/60'>{title}</p>
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirmingDelete && (
        <div className='absolute inset-0 z-20 flex items-center justify-center bg-dark-100/95 rounded-xl p-4 animate-fade-in'>
          <div className='w-full space-y-3'>
            <div className='flex items-center gap-2'>
              <AlertTriangle className='w-4 h-4 text-red-400 shrink-0' />
              <p className='text-sm font-semibold text-white/95'>Delete {title}?</p>
            </div>
            <p className='text-xs text-text-light/70'>
              The VM and its disks are removed permanently.
            </p>
            <label className='flex items-start gap-2 px-3 py-2 rounded-lg bg-dark-300/60 border border-border-light/20 cursor-pointer hover:border-red-500/40 transition-colors'>
              <input
                type='checkbox'
                checked={deleteData}
                onChange={(e) => setDeleteData(e.target.checked)}
                className='mt-0.5 accent-red-500'
              />
              <span className='text-xs text-text-light/80'>
                Also delete shared folder data
                {instance.sharedFolderItemCount > 0 && (
                  <span className='text-red-400 font-medium'> ({instance.sharedFolderItemCount} item{instance.sharedFolderItemCount === 1 ? '' : 's'})</span>
                )}
                <span className='block text-text-light/50 mt-0.5'>Otherwise the folder is kept on disk.</span>
              </span>
            </label>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='flex-1 h-8 border-border-light/50 hover:bg-secondary/50'
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant='destructive'
                size='sm'
                className='flex-1 h-8 bg-red-600 hover:bg-red-500'
                onClick={confirmDelete}
              >
                <Trash2 className='w-3.5 h-3.5 mr-1.5' />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          {editing
            ? (
              <div className='flex-1 space-y-2 mr-2'>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder={instance.displayName}
                  maxLength={60}
                  autoFocus
                  className='w-full bg-dark-100/60 border border-border-light/40 focus:border-primary/60 rounded-md px-2.5 py-1.5 text-sm font-semibold text-white/95 outline-none placeholder:text-text-light/40 transition-colors'
                />
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder='What is this VM for? e.g. "Case #4211 — phishing payload"'
                  rows={2}
                  maxLength={200}
                  className='w-full bg-dark-100/60 border border-border-light/40 focus:border-primary/60 rounded-md px-2.5 py-1.5 text-xs text-text-light/90 outline-none placeholder:text-text-light/40 resize-none transition-colors'
                />
                <div className='flex gap-2'>
                  <Button
                    variant='default'
                    size='sm'
                    className='h-7 px-3 text-xs bg-primary hover:bg-primary/90'
                    onClick={saveEdits}
                  >
                    <Check className='w-3 h-3 mr-1' />
                    Save
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 px-3 text-xs border-border-light/50 hover:bg-secondary/50'
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              )
            : (
              <div className='space-y-1 flex-1 min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <CardTitle className='text-lg font-semibold text-white/95 tracking-tight truncate'>{title}</CardTitle>
                  <button
                    onClick={startEditing}
                    disabled={busy}
                    title='Rename / add notes'
                    className='opacity-0 group-hover:opacity-100 text-text-light/50 hover:text-primary transition-all shrink-0 disabled:opacity-0'
                  >
                    <Pencil className='w-3.5 h-3.5' />
                  </button>
                </div>
                {instance.label && (
                  <p className='text-[11px] text-text-light/50 uppercase tracking-wide'>{instance.displayName}</p>
                )}
                {instance.notes
                  ? (
                    <p className='text-xs text-amber-200/80 flex items-start gap-1.5'>
                      <StickyNote className='w-3 h-3 mt-0.5 shrink-0 text-amber-400/80' />
                      <span className='line-clamp-2'>{instance.notes}</span>
                    </p>
                    )
                  : (
                    <CardDescription className='text-xs text-text-light/40 italic'>No notes — use the pencil to say what this is for</CardDescription>
                    )}
              </div>
              )}
          {!editing && <StateBadge state={instance.state} busyAction={busyAction} />}
        </div>
      </CardHeader>

      <CardContent className='relative'>
        <SpecsBar memory={instance.memory} cpus={instance.cpus} />

        {/* Shared folder — click to open, or drop files anywhere on the card */}
        <button
          onClick={onOpenSharedFolder}
          disabled={busy}
          title={`Open shared folder — drag files onto this card to copy them in\n${instance.sharedFolderPath}${instance.sharedFolderAttached ? '' : '\n(attaches to the VM on next start)'}`}
          className='w-full flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-dark-100/50 border border-border-light/20 hover:border-primary/50 hover:bg-dark-100/80 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed'
        >
          {busyAction === 'folder' || busyAction === 'copy'
            ? <Loader2 className='w-3.5 h-3.5 text-primary animate-spin shrink-0' />
            : <FolderOpen className='w-3.5 h-3.5 text-primary/80 shrink-0' />}
          <span className='text-xs text-text-light/70 font-mono truncate flex-1' dir='rtl'>{instance.sharedFolderPath}</span>
          {instance.sharedFolderItemCount > 0 && (
            <span className='text-[10px] text-text-light/60 bg-dark-300/80 border border-border-light/20 px-1.5 py-0.5 rounded-full shrink-0'>
              {instance.sharedFolderItemCount}
            </span>
          )}
          {!instance.sharedFolderAttached && (
            <span className='w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0' title='Shared folder attaches on next start' />
          )}
        </button>

        <div className='flex gap-2'>
          {instance.state === 'stopped' || instance.state === 'suspended'
            ? (
              <>
                <Button
                  variant='default'
                  size='sm'
                  className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                  onClick={onStart}
                  disabled={busy}
                >
                  {actionIcon('start', Play)}
                  {instance.state === 'suspended' ? 'Resume' : 'Start'}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
                  onClick={onOpenSharedFolder}
                  disabled={busy}
                  title='Open shared folder'
                >
                  {busyAction === 'folder'
                    ? <Loader2 className='w-4 h-4 animate-spin' />
                    : <FolderOpen className='w-4 h-4' />}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 px-3 border-border-light/50 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400'
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  title='Delete VM'
                >
                  {busyAction === 'delete'
                    ? <Loader2 className='w-4 h-4 animate-spin' />
                    : <Trash2 className='w-4 h-4' />}
                </Button>
              </>
              )
            : (
              <>
                <Button
                  variant='destructive'
                  size='sm'
                  className='flex-1 h-9 bg-red-600/80 hover:bg-red-600 border-red-600/50'
                  onClick={onStop}
                  disabled={busy}
                >
                  {actionIcon('stop', Square)}
                  Stop
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='flex-1 h-9 border-border-light/50 hover:bg-secondary/50'
                  onClick={onRestart}
                  disabled={busy}
                >
                  {actionIcon('restart', RotateCw)}
                  Restart
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
                  onClick={onOpenSharedFolder}
                  disabled={busy}
                  title='Open shared folder'
                >
                  {busyAction === 'folder'
                    ? <Loader2 className='w-4 h-4 animate-spin' />
                    : <FolderOpen className='w-4 h-4' />}
                </Button>
              </>
              )}

          {instance.state === 'running' && (
            <Button
              variant='outline'
              size='sm'
              className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
              onClick={onConsole}
              disabled={busy}
              title='Open Console'
            >
              {busyAction === 'console'
                ? <Loader2 className='w-4 h-4 animate-spin' />
                : <Monitor className='w-4 h-4' />}
            </Button>
          )}
        </div>

        {busy && busyMessage && <ProgressLine message={busyMessage} />}

        {!busy && flashMessage && (
          <div className='flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 animate-fade-in'>
            <Check className='w-3.5 h-3.5 text-green-400 shrink-0' />
            <span className='text-xs text-green-200/90 truncate' title={flashMessage}>{flashMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RemoteVmCard ({ instance, busyAction = null, onStart, onStop, onRestart, onConsole, onDelete }: RemoteVmCardProps) {
  const busy = busyAction !== null;

  const topBarColor = instance.state === 'running'
    ? 'bg-gradient-to-r from-purple-500 to-purple-400/60'
    : 'bg-border-light/30';

  const createdDate = new Date(instance.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const actionIcon = (action: VmAction, Icon: typeof Play) => (busyAction === action
    ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
    : <Icon className='w-3.5 h-3.5 mr-1.5' />);

  return (
    <Card className='relative overflow-hidden glass-card glass-card-hover group'>
      <div className='absolute -inset-2 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
      <div className={`absolute top-0 left-0 right-0 h-1 ${topBarColor}`} />

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <div className='flex items-center gap-2'>
              <Cloud className='w-4 h-4 text-purple-400' />
              <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>{instance.templateName}</CardTitle>
            </div>
            <CardDescription className='text-xs text-text-light/80'>
              Created {createdDate}
            </CardDescription>
          </div>
          <StateBadge state={instance.state} busyAction={busyAction} />
        </div>
      </CardHeader>

      <CardContent className='relative'>
        <SpecsBar
          memory={instance.specs.memory}
          cpus={instance.specs.cpus}
          diskSize={instance.specs.diskSize}
        />

        <div className='flex gap-2'>
          {instance.state === 'stopped'
            ? (
              <>
                <Button
                  variant='default'
                  size='sm'
                  className='flex-1 h-9 bg-purple-600 hover:bg-purple-500 transition-all hover:shadow-lg hover:shadow-purple-500/20'
                  onClick={onStart}
                  disabled={busy}
                >
                  {actionIcon('start', Play)}
                  Start
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 px-3 border-border-light/50 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400'
                  onClick={onDelete}
                  disabled={busy}
                  title='Delete Instance'
                >
                  {busyAction === 'delete'
                    ? <Loader2 className='w-4 h-4 animate-spin' />
                    : <Trash2 className='w-4 h-4' />}
                </Button>
              </>
              )
            : instance.state === 'running'
              ? (
                <>
                  <Button
                    variant='destructive'
                    size='sm'
                    className='flex-1 h-9 bg-red-600/80 hover:bg-red-600 border-red-600/50'
                    onClick={onStop}
                    disabled={busy}
                  >
                    {actionIcon('stop', Square)}
                    Stop
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='flex-1 h-9 border-border-light/50 hover:bg-secondary/50'
                    onClick={onRestart}
                    disabled={busy}
                  >
                    {actionIcon('restart', RotateCw)}
                    Restart
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-purple-500/50'
                    onClick={onConsole}
                    disabled={busy}
                    title='Console'
                  >
                    {busyAction === 'console'
                      ? <Loader2 className='w-4 h-4 animate-spin' />
                      : <Monitor className='w-4 h-4' />}
                  </Button>
                </>
                )
              : null}
        </div>
      </CardContent>
    </Card>
  );
}
