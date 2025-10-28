import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import { Terminal, ExternalLink, Play, Copy, Shield } from 'lucide-react';

interface ToolCardProps {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  requiresSudo?: boolean;
  launchType?: 'terminal' | 'gui';
  quickStart?: string;
  onLaunch: (id: string) => void;
  onViewDocs?: (id: string) => void;
}

export function ToolCard ({
  id,
  name,
  displayName,
  description,
  category: _category,
  tags,
  requiresSudo,
  launchType,
  quickStart,
  onLaunch,
  onViewDocs
}: ToolCardProps) {
  const handleCopyCommand = () => {
    if (quickStart) {
      navigator.clipboard.writeText(quickStart);
    }
  };

  return (
    <Card className='relative overflow-hidden glass-card glass-card-hover group h-full flex flex-col'>
      {/* Gradient glow effect on hover */}
      <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />

      {/* Top accent bar */}
      <div className='absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-blue-selected/60' />

      <CardHeader className='relative pb-3 flex-shrink-0'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1 flex-1'>
            <div className='flex items-center gap-2'>
              <CardTitle className='text-lg font-semibold text-white/95 tracking-tight'>
                {displayName || name}
              </CardTitle>
              {requiresSudo && (
                <div className='text-yellow-500' title='Requires sudo/admin privileges'>
                  <Shield className='w-4 h-4' />
                </div>
              )}
            </div>
            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>
              {description}
            </CardDescription>
          </div>
          <Badge
            variant='outline'
            className='bg-dark-300/50 text-text-light/70 border-border-light/30 flex items-center gap-1.5 ml-2'
          >
            {launchType === 'gui'
              ? (
                <>
                  <span className='w-2 h-2 rounded-full bg-green-400' />
                  <span>GUI</span>
                </>
                )
              : (
                <>
                  <Terminal className='w-3 h-3' />
                  <span>CLI</span>
                </>
                )}
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

      <CardContent className='relative flex-1 flex flex-col'>
        {/* Quick start command */}
        {quickStart && (
          <div className='bg-dark-100/50 rounded-lg p-3 mb-4 border border-border-light/20 flex-1'>
            <div className='flex items-center justify-between mb-1'>
              <span className='text-xs text-text-light/60 font-medium'>Quick Start</span>
              <button
                onClick={handleCopyCommand}
                className='text-text-light/40 hover:text-primary transition-colors'
                title='Copy command'
              >
                <Copy className='w-3 h-3' />
              </button>
            </div>
            <code className='text-xs font-mono text-primary/90 break-all'>
              {quickStart}
            </code>
          </div>
        )}

        {/* Action buttons */}
        <div className='flex gap-2 mt-auto'>
          <Button
            variant='default'
            size='sm'
            className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
            onClick={() => onLaunch(id)}
          >
            <Play className='w-3.5 h-3.5 mr-1.5' />
            Launch
          </Button>
          {onViewDocs && (
            <Button
              variant='outline'
              size='sm'
              className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
              onClick={() => onViewDocs(id)}
              title='View Documentation'
            >
              <ExternalLink className='w-4 h-4' />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
