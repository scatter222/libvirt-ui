import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import { Play, Square, RotateCw, Monitor, HardDrive, Cpu, MemoryStick } from 'lucide-react';

interface VMCardProps {
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
  tags?: string[];
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onConnect: () => void;
}

export function VMCard ({
  name,
  displayName,
  description,
  category: _category,
  state,
  memory,
  cpus,
  diskSize,
  imagePath,
  tags,
  onStart,
  onStop,
  onRestart,
  onConnect
}: VMCardProps) {
  return (
    <Card className='relative overflow-hidden glass-card glass-card-hover group'>
      {/* Gradient glow effect on hover */}
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />

      {/* Top status bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${state === 'running' ? 'bg-gradient-to-r from-primary to-blue-selected/60' : 'bg-border-light/30'}`} />

      <CardHeader className='relative pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>{displayName || name}</CardTitle>
            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>{description || imagePath}</CardDescription>
          </div>
          <Badge
            variant='outline'
            className={`
              ${state === 'running'
                ? 'bg-green-500/20 text-green-400 border-green-500/50'
                : state === 'paused'
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                : 'bg-gray-500/20 text-gray-400 border-gray-500/50'
              }
              flex items-center gap-1.5 ml-2
            `}
          >
            <span className={`
              w-2 h-2 rounded-full
              ${state === 'running' ? 'bg-green-400 animate-pulse' : state === 'paused' ? 'bg-yellow-400' : 'bg-gray-400'}
            `}
            />
            <span className='capitalize'>{state}</span>
          </Badge>
        </div>
        {tags && tags.length > 0 && (
          <div className='flex flex-wrap items-center gap-1.5 mt-3'>
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-xs px-2 py-0.5 font-medium'>
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className='relative'>
        {/* System specs with improved styling */}
        <div className='bg-dark-100/50 rounded-lg p-3 mb-4 border border-border-light/20'>
          <div className='grid grid-cols-3 gap-3'>
            <div className='flex flex-col items-center text-center'>
              <MemoryStick className='w-4 h-4 text-primary/80 mb-1' />
              <span className='text-xs text-text-light/60'>RAM</span>
              <span className='text-sm font-semibold text-white/90'>{memory}</span>
            </div>
            <div className='flex flex-col items-center text-center'>
              <Cpu className='w-4 h-4 text-primary/80 mb-1' />
              <span className='text-xs text-text-light/60'>CPUs</span>
              <span className='text-sm font-semibold text-white/90'>{cpus}</span>
            </div>
            <div className='flex flex-col items-center text-center'>
              <HardDrive className='w-4 h-4 text-primary/80 mb-1' />
              <span className='text-xs text-text-light/60'>Disk</span>
              <span className='text-sm font-semibold text-white/90'>{diskSize}</span>
            </div>
          </div>
        </div>

        {/* Action buttons with improved styling */}
        <div className='flex gap-2'>
          {state === 'stopped'
            ? (
              <Button
                variant='default'
                size='sm'
                className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                onClick={onStart}
              >
                <Play className='w-3.5 h-3.5 mr-1.5' />
                Start VM
              </Button>
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

          {state === 'running' && (
            <Button
              variant='outline'
              size='sm'
              className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
              onClick={onConnect}
              title='Connect to VM'
            >
              <Monitor className='w-4 h-4' />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
