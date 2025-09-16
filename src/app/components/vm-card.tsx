import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Play, Square, RotateCw, Settings, Monitor, HardDrive, Cpu, MemoryStick } from 'lucide-react';

interface VMCardProps {
  name: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onManage: () => void;
  onConnect: () => void;
}

export function VMCard({
  name,
  state,
  memory,
  cpus,
  diskSize,
  imagePath,
  onStart,
  onStop,
  onRestart,
  onManage,
  onConnect
}: VMCardProps) {
  const getStateColor = () => {
    switch (state) {
      case 'running':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'stopped':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      case 'paused':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default:
        return '';
    }
  };

  const getStateDot = () => {
    switch (state) {
      case 'running':
        return 'bg-green-400';
      case 'stopped':
        return 'bg-gray-400';
      case 'paused':
        return 'bg-yellow-400';
      default:
        return '';
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 border-border/50 bg-card/50 backdrop-blur">
      <div className={`absolute top-0 left-0 right-0 h-1 ${state === 'running' ? 'bg-gradient-to-r from-primary/50 to-accent/50' : 'bg-border'}`} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">{name}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">{imagePath}</CardDescription>
          </div>
          <Badge variant="outline" className={`${getStateColor()} flex items-center gap-1.5`}>
            <span className={`w-2 h-2 rounded-full ${getStateDot()} ${state === 'running' ? 'animate-pulse' : ''}`} />
            {state}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-2 text-xs">
            <MemoryStick className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">RAM:</span>
            <span className="font-medium">{memory}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">CPUs:</span>
            <span className="font-medium">{cpus}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Disk:</span>
            <span className="font-medium">{diskSize}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {state === 'stopped' ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-8 bg-primary hover:bg-primary/90"
              onClick={onStart}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Start
            </Button>
          ) : (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 h-8"
                onClick={onStop}
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8"
                onClick={onRestart}
              >
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                Restart
              </Button>
            </>
          )}

          {state === 'running' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onConnect}
            >
              <Monitor className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onManage}
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}