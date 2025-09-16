import { useEffect, useState } from 'react';
import { VMCard } from '@/app/components/vm-card';
import { Button } from '@/app/components/ui/button';
import { RefreshCw, Plus, Server } from 'lucide-react';

interface VM {
  name: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
}

export function VMDashboard() {
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

  const handleManage = async (vmName: string) => {
    try {
      await electron.ipcRenderer.invoke('libvirt:manage-vm', vmName);
    } catch (error) {
      console.error('Failed to manage VM:', error);
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
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Server className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading virtual machines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Virtual Machines</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your QEMU/KVM virtual machines from /var/lib/libvirt/images
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadVMs}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleCreateVM}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              New VM
            </Button>
          </div>
        </div>

        {vms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 bg-card/30 rounded-lg border border-border/50 backdrop-blur">
            <Server className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Virtual Machines Found</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No virtual machines were found in /var/lib/libvirt/images.
              Create a new VM or check your libvirt configuration.
            </p>
            <Button
              className="mt-6 gap-2"
              onClick={handleCreateVM}
            >
              <Plus className="w-4 h-4" />
              Create Your First VM
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vms.map((vm) => (
              <VMCard
                key={vm.name}
                name={vm.name}
                state={vm.state}
                memory={vm.memory}
                cpus={vm.cpus}
                diskSize={vm.diskSize}
                imagePath={vm.imagePath}
                onStart={() => handleStart(vm.name)}
                onStop={() => handleStop(vm.name)}
                onRestart={() => handleRestart(vm.name)}
                onManage={() => handleManage(vm.name)}
                onConnect={() => handleConnect(vm.name)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Running: {vms.filter(vm => vm.state === 'running').length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Stopped: {vms.filter(vm => vm.state === 'stopped').length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              Paused: {vms.filter(vm => vm.state === 'paused').length}
            </span>
          </div>
          <div>
            Total VMs: {vms.length}
          </div>
        </div>
      </div>
    </div>
  );
}