import { useApiConnection } from '@/app/hooks/useApiConnection';

import { Loader2, Wifi, WifiOff, User } from 'lucide-react';

export function ConnectionStatus () {
  const { connected, user, loading, error } = useApiConnection();

  if (loading) {
    return (
      <div className='flex items-center gap-2 px-3 py-1.5 text-xs text-text-light/50'>
        <Loader2 className='w-3.5 h-3.5 animate-spin' />
        <span>Connecting...</span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className='flex items-center gap-2 px-3 py-1.5 text-xs text-red-400/80' title={error || 'Disconnected'}>
        <WifiOff className='w-3.5 h-3.5' />
        <span>Offline</span>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-2 px-3 py-1.5 text-xs'>
      <div className='flex items-center gap-1.5 text-green-400/80'>
        <Wifi className='w-3.5 h-3.5' />
        <span>Connected</span>
      </div>
      {user && (
        <div className='flex items-center gap-1.5 text-text-light/60 border-l border-border-light/20 pl-2'>
          <User className='w-3 h-3' />
          <span>{user.name}</span>
        </div>
      )}
    </div>
  );
}
