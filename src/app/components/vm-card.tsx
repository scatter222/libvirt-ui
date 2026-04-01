import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Play, Square, RotateCw, Monitor, HardDrive,
  Cpu, MemoryStick, Download, Trash2, Cloud
} from 'lucide-react';

export interface LocalVm {
  name: string;
  displayName: string;
  description: string;
  category: string;
  state: 'running' | 'stopped' | 'paused' | 'suspended' | 'available';
  memory: number;
  cpus: number;
  tags: string[];
  imported: boolean;
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

interface LocalVmCardProps {
  vm: LocalVm;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConsole: () => void;
  onDelete: () => void;
}

interface RemoteVmCardProps {
  instance: RemoteVmInstance;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConsole: () => void;
  onDelete: () => void;
}

function StateBadge ({ state }: { state: string }) {
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

export function LocalVmCard ({ vm, onStart, onStop, onRestart, onConsole, onDelete }: LocalVmCardProps) {
  const topBarColor = vm.state === 'running'
    ? 'bg-gradient-to-r from-primary to-blue-selected/60'
    : vm.state === 'available'
      ? 'bg-gradient-to-r from-blue-400 to-blue-300/60'
      : 'bg-border-light/30';

  return (
    <Card className='relative overflow-hidden glass-card glass-card-hover group'>
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
      <div className={`absolute top-0 left-0 right-0 h-1 ${topBarColor}`} />

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>{vm.displayName}</CardTitle>
            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>{vm.description}</CardDescription>
          </div>
          <StateBadge state={vm.state} />
        </div>
        {vm.tags.length > 0 && (
          <div className='flex flex-wrap items-center gap-1.5 mt-3'>
            {vm.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-xs px-2 py-0.5 font-medium'>
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className='relative'>
        <SpecsBar memory={vm.memory} cpus={vm.cpus} />

        <div className='flex gap-2'>
          {vm.state === 'available'
            ? (
              <Button
                variant='default'
                size='sm'
                className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                onClick={onStart}
              >
                <Download className='w-3.5 h-3.5 mr-1.5' />
                Import & Start
              </Button>
              )
            : vm.state === 'stopped'
              ? (
                <>
                  <Button
                    variant='default'
                    size='sm'
                    className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                    onClick={onStart}
                  >
                    <Play className='w-3.5 h-3.5 mr-1.5' />
                    Start
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-9 px-3 border-border-light/50 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400'
                    onClick={onDelete}
                    title='Delete VM'
                  >
                    <Trash2 className='w-4 h-4' />
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
                  >
                    <Square className='w-3.5 h-3.5 mr-1.5' />
                    Stop
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='flex-1 h-9 border-border-light/50 hover:bg-secondary/50'
                    onClick={onRestart}
                  >
                    <RotateCw className='w-3.5 h-3.5 mr-1.5' />
                    Restart
                  </Button>
                </>
                )}

          {vm.state === 'running' && (
            <Button
              variant='outline'
              size='sm'
              className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
              onClick={onConsole}
              title='Open Console'
            >
              <Monitor className='w-4 h-4' />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RemoteVmCard ({ instance, onStart, onStop, onRestart, onConsole, onDelete }: RemoteVmCardProps) {
  const topBarColor = instance.state === 'running'
    ? 'bg-gradient-to-r from-purple-500 to-purple-400/60'
    : 'bg-border-light/30';

  const createdDate = new Date(instance.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

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
          <StateBadge state={instance.state} />
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
                >
                  <Play className='w-3.5 h-3.5 mr-1.5' />
                  Start
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 px-3 border-border-light/50 hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400'
                  onClick={onDelete}
                  title='Delete Instance'
                >
                  <Trash2 className='w-4 h-4' />
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
                  >
                    <Square className='w-3.5 h-3.5 mr-1.5' />
                    Stop
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='flex-1 h-9 border-border-light/50 hover:bg-secondary/50'
                    onClick={onRestart}
                  >
                    <RotateCw className='w-3.5 h-3.5 mr-1.5' />
                    Restart
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-purple-500/50'
                    onClick={onConsole}
                    title='Console'
                  >
                    <Monitor className='w-4 h-4' />
                  </Button>
                </>
                )
              : null}
        </div>
      </CardContent>
    </Card>
  );
}
