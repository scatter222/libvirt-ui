import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Play, Square, RotateCw, Monitor, HardDrive,
  Cpu, MemoryStick, Trash2, Cloud, Rocket,
  Loader2, FolderOpen, AlertTriangle, Copy
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  sharedFolderPath: string;
  sharedFolderAttached: boolean;
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

export type VmAction = 'start' | 'stop' | 'restart' | 'console' | 'delete' | 'deploy';

interface LocalTemplateCardProps {
  template: LocalVmTemplate;
  deploying: boolean;
  deployMessage?: string;
  onDeploy: () => void;
}

interface LocalVmCardProps {
  instance: LocalVmInstance;
  busyAction: VmAction | null;
  busyMessage?: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConsole: () => void;
  onDelete: () => void;
  onOpenSharedFolder: () => void;
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
  deploy: 'Deploying'
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

export function LocalTemplateCard ({ template, deploying, deployMessage, onDeploy }: LocalTemplateCardProps) {
  return (
    <Card className='relative overflow-hidden glass-card glass-card-hover group'>
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
      <div className='absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-300/60' />

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>{template.displayName}</CardTitle>
            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>{template.description}</CardDescription>
          </div>
          {template.instanceCount > 0 && (
            <Badge variant='outline' className='bg-primary/15 text-primary border-primary/40 flex items-center gap-1 ml-2 shrink-0'>
              <Copy className='w-3 h-3' />
              <span>{template.instanceCount} deployed</span>
            </Badge>
          )}
        </div>
        {template.tags.length > 0 && (
          <div className='flex flex-wrap items-center gap-1.5 mt-3'>
            {template.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-xs px-2 py-0.5 font-medium'>
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className='relative'>
        <SpecsBar memory={template.memory} cpus={template.cpus} />

        <Button
          variant='default'
          size='sm'
          className='w-full h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20 disabled:opacity-60'
          onClick={onDeploy}
          disabled={deploying || !template.ovaExists}
        >
          {deploying
            ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
            : <Rocket className='w-3.5 h-3.5 mr-1.5' />}
          {deploying
            ? 'Deploying...'
            : template.instanceCount > 0
              ? 'Deploy Another'
              : 'Deploy'}
        </Button>

        {deploying && deployMessage && <ProgressLine message={deployMessage} />}

        {!template.ovaExists && (
          <div className='flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30'>
            <AlertTriangle className='w-3.5 h-3.5 text-amber-400 shrink-0' />
            <span className='text-xs text-text-light/80 truncate' title={template.ovaPath}>
              OVA image not found
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LocalVmCard ({
  instance, busyAction, busyMessage,
  onStart, onStop, onRestart, onConsole, onDelete, onOpenSharedFolder
}: LocalVmCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const handleDeleteClick = () => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      onDelete();
    } else {
      setConfirmingDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 4000);
    }
  };

  const busy = busyAction !== null;

  const topBarColor = busy
    ? 'bg-gradient-to-r from-amber-500 to-amber-400/60'
    : instance.state === 'running'
      ? 'bg-gradient-to-r from-primary to-blue-selected/60'
      : 'bg-border-light/30';

  const actionIcon = (action: VmAction, Icon: typeof Play) => (busyAction === action
    ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
    : <Icon className='w-3.5 h-3.5 mr-1.5' />);

  return (
    <Card className={`relative overflow-hidden glass-card glass-card-hover group transition-opacity ${busy ? 'opacity-90' : ''}`}>
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
      <div className={`absolute top-0 left-0 right-0 h-1 ${topBarColor}`} />

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>{instance.displayName}</CardTitle>
            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>{instance.description}</CardDescription>
          </div>
          <StateBadge state={instance.state} busyAction={busyAction} />
        </div>
        {instance.tags.length > 0 && (
          <div className='flex flex-wrap items-center gap-1.5 mt-3'>
            {instance.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-xs px-2 py-0.5 font-medium'>
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className='relative'>
        <SpecsBar memory={instance.memory} cpus={instance.cpus} />

        {/* Shared folder */}
        <button
          onClick={onOpenSharedFolder}
          disabled={busy}
          title={`Open shared folder\n${instance.sharedFolderPath}${instance.sharedFolderAttached ? '' : '\n(attaches to the VM on next start)'}`}
          className='w-full flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-dark-100/50 border border-border-light/20 hover:border-primary/50 hover:bg-dark-100/80 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed'
        >
          <FolderOpen className='w-3.5 h-3.5 text-primary/80 shrink-0' />
          <span className='text-xs text-text-light/70 font-mono truncate flex-1' dir='rtl'>{instance.sharedFolderPath}</span>
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
                  className={`h-9 px-3 transition-all ${
                    confirmingDelete
                      ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                      : 'border-border-light/50 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400'
                  }`}
                  onClick={handleDeleteClick}
                  disabled={busy}
                  title={confirmingDelete ? 'Click again to permanently delete this VM' : 'Delete VM'}
                >
                  {busyAction === 'delete'
                    ? <Loader2 className='w-4 h-4 animate-spin' />
                    : <Trash2 className='w-4 h-4' />}
                  {confirmingDelete && <span className='ml-1.5 text-xs font-semibold'>Sure?</span>}
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
