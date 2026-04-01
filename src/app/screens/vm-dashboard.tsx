import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LocalVmCard, RemoteVmCard } from '@/app/components/vm-card';
import type { LocalVm, RemoteVmInstance } from '@/app/components/vm-card';

import {
  RefreshCw, Server, Monitor, Cloud,
  Cpu, MemoryStick, HardDrive, Rocket
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface RemoteVmTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  specs: { memory: number; cpus: number; diskSize: number };
  tags: string[];
}

type Tab = 'local' | 'remote';

export function VMDashboard () {
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const [localVms, setLocalVms] = useState<LocalVm[]>([]);
  const [remoteTemplates, setRemoteTemplates] = useState<RemoteVmTemplate[]>([]);
  const [remoteInstances, setRemoteInstances] = useState<RemoteVmInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocalVms = async () => {
    try {
      const vms = await electron.ipcRenderer.invoke('local-vms:list');
      setLocalVms(vms);
    } catch (error) {
      console.error('Failed to load local VMs:', error);
    }
  };

  const loadRemoteData = async () => {
    try {
      const [templatesRes, instancesRes] = await Promise.all([
        electron.ipcRenderer.invoke('remote-vms:list-templates'),
        electron.ipcRenderer.invoke('remote-vms:list-instances')
      ]);
      if (templatesRes.success) setRemoteTemplates(templatesRes.data as RemoteVmTemplate[]);
      if (instancesRes.success) setRemoteInstances(instancesRes.data as RemoteVmInstance[]);
    } catch (error) {
      console.error('Failed to load remote VMs:', error);
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    await Promise.all([loadLocalVms(), loadRemoteData()]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Local VM actions ---
  const handleLocalStart = async (name: string) => {
    await electron.ipcRenderer.invoke('local-vms:start', name);
    await loadLocalVms();
  };

  const handleLocalStop = async (name: string) => {
    await electron.ipcRenderer.invoke('local-vms:stop', name);
    await loadLocalVms();
  };

  const handleLocalRestart = async (name: string) => {
    await electron.ipcRenderer.invoke('local-vms:restart', name);
    await loadLocalVms();
  };

  const handleLocalConsole = async (name: string) => {
    await electron.ipcRenderer.invoke('local-vms:open-console', name);
  };

  const handleLocalDelete = async (name: string) => {
    await electron.ipcRenderer.invoke('local-vms:delete', name);
    await loadLocalVms();
  };

  // --- Remote VM actions ---
  const handleSpawn = async (templateId: string) => {
    await electron.ipcRenderer.invoke('remote-vms:spawn', templateId);
    await loadRemoteData();
  };

  const handleRemoteStart = async (id: string) => {
    await electron.ipcRenderer.invoke('remote-vms:start', id);
    await loadRemoteData();
  };

  const handleRemoteStop = async (id: string) => {
    await electron.ipcRenderer.invoke('remote-vms:stop', id);
    await loadRemoteData();
  };

  const handleRemoteRestart = async (id: string) => {
    await electron.ipcRenderer.invoke('remote-vms:restart', id);
    await loadRemoteData();
  };

  const handleRemoteConsole = async (id: string) => {
    const res = await electron.ipcRenderer.invoke('remote-vms:console', id);
    if (res.success && res.data) {
      const info = res.data as { url: string };
      electron.ipcRenderer.send('open-external', info.url);
    }
  };

  const handleRemoteDelete = async (id: string) => {
    await electron.ipcRenderer.invoke('remote-vms:delete', id);
    await loadRemoteData();
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

  const localRunning = localVms.filter((v) => v.state === 'running').length;
  const localStopped = localVms.filter((v) => v.state === 'stopped').length;
  const localAvailable = localVms.filter((v) => v.state === 'available').length;
  const remoteRunning = remoteInstances.filter((v) => v.state === 'running').length;
  const remoteStopped = remoteInstances.filter((v) => v.state === 'stopped').length;

  return (
    <div className='h-full overflow-auto bg-dark-100 relative'>
      <div className='noise-overlay' />
      <div className='radial-blue-gradient' />

      <div className='relative z-10 p-8'>
        <div className='max-w-7xl mx-auto'>
          {/* Header */}
          <div className='flex items-center justify-between mb-8 animate-fade-in'>
            <div>
              <h1 className='text-3xl font-bold tracking-tight text-white/95 bg-gradient-to-r from-white to-text-light bg-clip-text text-transparent'>
                Virtual Machines
              </h1>
              <p className='text-sm text-text-light/70 mt-2'>
                Manage local and remote virtual machines
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={loadAll}
              disabled={refreshing}
              className='gap-2 border-border-light/50 hover:bg-dark-300/50 hover:border-primary/50 transition-all'
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Tabs */}
          <div className='flex gap-1 mb-8 p-1 bg-dark-300/50 rounded-lg w-fit border border-border-light/20'>
            <button
              onClick={() => setActiveTab('local')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'local'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-text-light/70 hover:text-white hover:bg-dark-300/50'
              }`}
            >
              <Monitor className='w-4 h-4' />
              Local VMs
              {localVms.length > 0 && (
                <span className='ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full'>{localVms.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('remote')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'remote'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-text-light/70 hover:text-white hover:bg-dark-300/50'
              }`}
            >
              <Cloud className='w-4 h-4' />
              Remote VMs
              {remoteInstances.length > 0 && (
                <span className='ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full'>{remoteInstances.length}</span>
              )}
            </button>
          </div>

          {/* Local VMs Tab */}
          {activeTab === 'local' && (
            <div className='animate-fade-in'>
              {localVms.length === 0
                ? (
                  <div className='flex flex-col items-center justify-center py-24 px-8 glass-card rounded-xl'>
                    <Server className='w-20 h-20 text-primary/60 mb-6' />
                    <h2 className='text-2xl font-semibold mb-3 text-white/90'>No Local VMs Configured</h2>
                    <p className='text-sm text-text-light/60 text-center max-w-md'>
                      Add OVA files to the images directory and configure them in local-vms.yaml.
                    </p>
                  </div>
                  )
                : (
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                    {localVms.map((vm) => (
                      <LocalVmCard
                        key={vm.name}
                        vm={vm}
                        onStart={() => handleLocalStart(vm.name)}
                        onStop={() => handleLocalStop(vm.name)}
                        onRestart={() => handleLocalRestart(vm.name)}
                        onConsole={() => handleLocalConsole(vm.name)}
                        onDelete={() => handleLocalDelete(vm.name)}
                      />
                    ))}
                  </div>
                  )}
            </div>
          )}

          {/* Remote VMs Tab */}
          {activeTab === 'remote' && (
            <div className='animate-fade-in space-y-8'>
              {/* Available Templates */}
              <div>
                <h2 className='text-lg font-semibold text-white/90 mb-4 flex items-center gap-2'>
                  <Rocket className='w-5 h-5 text-purple-400' />
                  Available Templates
                </h2>
                {remoteTemplates.length === 0
                  ? (
                    <div className='p-6 glass-card rounded-xl text-center'>
                      <p className='text-sm text-text-light/60'>No templates available from the server.</p>
                    </div>
                    )
                  : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                      {remoteTemplates.map((tpl) => (
                        <Card key={tpl.id} className='relative overflow-hidden glass-card glass-card-hover group'>
                          <div className='absolute -inset-2 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />
                          <div className='absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-purple-400/60' />

                          <CardHeader className='relative pb-3'>
                            <div className='flex items-center gap-2'>
                              <Cloud className='w-4 h-4 text-purple-400' />
                              <CardTitle className='text-lg font-semibold text-white/95'>{tpl.name}</CardTitle>
                            </div>
                            <CardDescription className='text-xs text-text-light/80 line-clamp-2'>{tpl.description}</CardDescription>
                            {tpl.tags.length > 0 && (
                              <div className='flex flex-wrap items-center gap-1.5 mt-3'>
                                {tpl.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className='bg-purple-500/15 text-purple-400/90 border border-purple-500/30 text-xs px-2 py-0.5 rounded-full font-medium'>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardHeader>

                          <CardContent className='relative'>
                            <div className='bg-dark-100/50 rounded-lg p-3 mb-4 border border-border-light/20'>
                              <div className='grid grid-cols-3 gap-3'>
                                <div className='flex flex-col items-center text-center'>
                                  <MemoryStick className='w-4 h-4 text-purple-400/80 mb-1' />
                                  <span className='text-xs text-text-light/60'>RAM</span>
                                  <span className='text-sm font-semibold text-white/90'>{tpl.specs.memory} MB</span>
                                </div>
                                <div className='flex flex-col items-center text-center'>
                                  <Cpu className='w-4 h-4 text-purple-400/80 mb-1' />
                                  <span className='text-xs text-text-light/60'>CPUs</span>
                                  <span className='text-sm font-semibold text-white/90'>{tpl.specs.cpus}</span>
                                </div>
                                <div className='flex flex-col items-center text-center'>
                                  <HardDrive className='w-4 h-4 text-purple-400/80 mb-1' />
                                  <span className='text-xs text-text-light/60'>Disk</span>
                                  <span className='text-sm font-semibold text-white/90'>{tpl.specs.diskSize} GB</span>
                                </div>
                              </div>
                            </div>

                            <Button
                              variant='default'
                              size='sm'
                              className='w-full h-9 bg-purple-600 hover:bg-purple-500 transition-all hover:shadow-lg hover:shadow-purple-500/20'
                              onClick={() => handleSpawn(tpl.id)}
                            >
                              <Rocket className='w-3.5 h-3.5 mr-1.5' />
                              Spawn Instance
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    )}
              </div>

              {/* My Instances */}
              <div>
                <h2 className='text-lg font-semibold text-white/90 mb-4 flex items-center gap-2'>
                  <Server className='w-5 h-5 text-purple-400' />
                  My Instances
                  {remoteInstances.length > 0 && (
                    <span className='text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full'>{remoteInstances.length}</span>
                  )}
                </h2>
                {remoteInstances.length === 0
                  ? (
                    <div className='p-6 glass-card rounded-xl text-center'>
                      <p className='text-sm text-text-light/60'>No running instances. Spawn one from a template above.</p>
                    </div>
                    )
                  : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                      {remoteInstances.map((inst) => (
                        <RemoteVmCard
                          key={inst.id}
                          instance={inst}
                          onStart={() => handleRemoteStart(inst.id)}
                          onStop={() => handleRemoteStop(inst.id)}
                          onRestart={() => handleRemoteRestart(inst.id)}
                          onConsole={() => handleRemoteConsole(inst.id)}
                          onDelete={() => handleRemoteDelete(inst.id)}
                        />
                      ))}
                    </div>
                    )}
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className='mt-8 p-4 glass-card rounded-lg flex items-center justify-between text-xs'>
            <div className='flex items-center gap-6'>
              <span className='flex items-center gap-2 text-text-light/70'>
                <span className='w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-sm shadow-green-400/50' />
                <span className='text-white/80 font-medium'>{localRunning + remoteRunning}</span>
                <span>Running</span>
              </span>
              <span className='flex items-center gap-2 text-text-light/70'>
                <span className='w-2 h-2 rounded-full bg-gray-400' />
                <span className='text-white/80 font-medium'>{localStopped + remoteStopped}</span>
                <span>Stopped</span>
              </span>
              {localAvailable > 0 && (
                <span className='flex items-center gap-2 text-text-light/70'>
                  <span className='w-2 h-2 rounded-full bg-blue-400' />
                  <span className='text-white/80 font-medium'>{localAvailable}</span>
                  <span>Available</span>
                </span>
              )}
            </div>
            <div className='flex items-center gap-4 text-text-light/70'>
              <span>Local: <span className='text-white/80 font-semibold'>{localVms.length}</span></span>
              <span>Remote: <span className='text-white/80 font-semibold'>{remoteInstances.length}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
