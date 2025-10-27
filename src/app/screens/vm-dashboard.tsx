import { Button } from '@/app/components/ui/button';
import { VMCard } from '@/app/components/vm-card';

import { RefreshCw, Plus, Server } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VM {
  name: string;
  displayName?: string;
  description?: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
  category?: string;
  tags?: string[];
}

export function VMDashboard () {
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVMs = async () => {
    try {
      setRefreshing(true);
      const vmList = await electron.ipcRenderer.invoke('libvirt:list-vms');
      setVms(vmList);
    } catch (error) {
      console.error('Failed to load VMs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadVMs();

    const interval = setInterval(loadVMs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (vmName: string) => {
    try {
      await electron.ipcRenderer.invoke('libvirt:start-vm', vmName);
      await loadVMs();
    } catch (error) {
      console.error('Failed to start VM:', error);
    }
  };

  const handleStop = async (vmName: string) => {
    try {
      await electron.ipcRenderer.invoke('libvirt:stop-vm', vmName);
      await loadVMs();
    } catch (error) {
      console.error('Failed to stop VM:', error);
    }
  };

  const handleRestart = async (vmName: string) => {
    try {
      await electron.ipcRenderer.invoke('libvirt:restart-vm', vmName);
      await loadVMs();
    } catch (error) {
      console.error('Failed to restart VM:', error);
    }
  };

  const handleConnect = async (vmName: string) => {
    try {
      await electron.ipcRenderer.invoke('libvirt:connect-vm', vmName);
    } catch (error) {
      console.error('Failed to connect to VM:', error);
    }
  };

  const handleCreateVM = async () => {
    try {
      await electron.ipcRenderer.invoke('libvirt:create-vm');
    } catch (error) {
      console.error('Failed to create VM:', error);
    }
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Server className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading virtual machines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='h-full overflow-auto bg-dark-100 relative'>
      {/* Noise overlay for texture */}
      <div className='noise-overlay' />

      {/* Radial gradient background */}
      <div className='radial-blue-gradient' />

      {/* Main content */}
      <div className='relative z-10 p-8'>
        <div className='max-w-7xl mx-auto'>
          {/* Header with enhanced styling */}
          <div className='flex items-center justify-between mb-8 animate-fade-in'>
            <div>
              <h1 className='text-3xl font-bold tracking-tight text-white/95 bg-gradient-to-r from-white to-text-light bg-clip-text text-transparent'>
                Virtual Machines
              </h1>
              <p className='text-sm text-text-light/70 mt-2'>
                Manage your QEMU/KVM virtual machines from a guided experience
              </p>
            </div>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                onClick={loadVMs}
                disabled={refreshing}
                className='gap-2 border-border-light/50 hover:bg-dark-300/50 hover:border-primary/50 transition-all'
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size='sm'
                onClick={handleCreateVM}
                className='gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all'
              >
                <Plus className='w-4 h-4' />
                New VM
              </Button>
            </div>
          </div>

          {vms.length === 0
            ? (
              <div className='flex flex-col items-center justify-center py-24 px-8 glass-card rounded-xl animate-slide-up'>
                <div className='relative'>
                  <div className='absolute -inset-8 bg-primary/10 rounded-full blur-3xl animate-pulse' />
                  <Server className='w-20 h-20 text-primary/60 mb-6 relative' />
                </div>
                <h2 className='text-2xl font-semibold mb-3 text-white/90'>No Virtual Machines Found</h2>
                <p className='text-sm text-text-light/60 text-center max-w-md leading-relaxed'>
                  No virtual machines were found in your configuration.
                  Create a new VM to get started with your cybersecurity lab environment.
                </p>
                <Button
                  className='mt-8 gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all px-6'
                  onClick={handleCreateVM}
                >
                  <Plus className='w-4 h-4' />
                  Create Your First VM
                </Button>
              </div>
              )
            : (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-animation'>
                {vms.map((vm) => (
                  <VMCard
                    key={vm.name}
                    name={vm.name}
                    displayName={vm.displayName}
                    description={vm.description}
                    category={vm.category}
                    state={vm.state}
                    memory={vm.memory}
                    cpus={vm.cpus}
                    diskSize={vm.diskSize}
                    imagePath={vm.imagePath}
                    tags={vm.tags}
                    onStart={() => handleStart(vm.name)}
                    onStop={() => handleStop(vm.name)}
                    onRestart={() => handleRestart(vm.name)}
                    onConnect={() => handleConnect(vm.name)}
                  />
                ))}
              </div>
              )}

          {/* Status bar with enhanced styling */}
          <div className='mt-8 p-4 glass-card rounded-lg flex items-center justify-between text-xs'>
            <div className='flex items-center gap-6'>
              <span className='flex items-center gap-2 text-text-light/70'>
                <span className='w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-sm shadow-green-400/50' />
                <span className='text-white/80 font-medium'>{vms.filter((vm) => vm.state === 'running').length}</span>
                <span>Running</span>
              </span>
              <span className='flex items-center gap-2 text-text-light/70'>
                <span className='w-2 h-2 rounded-full bg-gray-400' />
                <span className='text-white/80 font-medium'>{vms.filter((vm) => vm.state === 'stopped').length}</span>
                <span>Stopped</span>
              </span>
              <span className='flex items-center gap-2 text-text-light/70'>
                <span className='w-2 h-2 rounded-full bg-yellow-400' />
                <span className='text-white/80 font-medium'>{vms.filter((vm) => vm.state === 'paused').length}</span>
                <span>Paused</span>
              </span>
            </div>
            <div className='flex items-center gap-2 text-text-light/70'>
              <span>Total VMs:</span>
              <span className='text-white/80 font-semibold'>{vms.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
