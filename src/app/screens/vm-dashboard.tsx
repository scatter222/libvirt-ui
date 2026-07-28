import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LocalTemplateCard, LocalVmCard, RemoteVmCard } from '@/app/components/vm-card';
import type { LocalVmTemplate, LocalVmInstance, RemoteVmInstance, VmAction } from '@/app/components/vm-card';

import {
  RefreshCw, Server, Monitor, Cloud,
  Cpu, MemoryStick, HardDrive, Rocket,
  Loader2, X, AlertTriangle, Boxes
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RemoteVmTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  specs: { memory: number; cpus: number; diskSize: number };
  tags: string[];
}

interface DeployProgress {
  templateName: string;
  instanceName: string;
  phase: string;
  message: string;
}

interface PendingOp {
  action: VmAction;
  message?: string;
}

interface UiError {
  id: number;
  title: string;
  message: string;
}

type Tab = 'local' | 'remote';

let errorId = 0;

export function VMDashboard () {
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const [localTemplates, setLocalTemplates] = useState<LocalVmTemplate[]>([]);
  const [localInstances, setLocalInstances] = useState<LocalVmInstance[]>([]);
  const [remoteTemplates, setRemoteTemplates] = useState<RemoteVmTemplate[]>([]);
  const [remoteInstances, setRemoteInstances] = useState<RemoteVmInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingOps, setPendingOps] = useState<Record<string, PendingOp>>({});
  const [deployingTemplates, setDeployingTemplates] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<UiError[]>([]);
  const [flashes, setFlashes] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const pushError = useCallback((title: string, error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error);
    // Electron prefixes IPC errors with "Error invoking remote method '...':" — strip it
    const message = raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    const id = ++errorId;
    setErrors((prev) => [...prev, { id, title, message }]);
    setTimeout(() => {
      if (mounted.current) setErrors((prev) => prev.filter((e) => e.id !== id));
    }, 12000);
  }, []);

  const dismissError = (id: number) => setErrors((prev) => prev.filter((e) => e.id !== id));

  // Short-lived per-card success confirmation (e.g. "Copied 3 files")
  const pushFlash = useCallback((key: string, message: string) => {
    setFlashes((prev) => ({ ...prev, [key]: message }));
    setTimeout(() => {
      if (!mounted.current) return;
      setFlashes((prev) => {
        if (prev[key] !== message) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 5000);
  }, []);

  const loadLocalVms = useCallback(async () => {
    try {
      const result = await electron.ipcRenderer.invoke('local-vms:list');
      if (!mounted.current) return;
      // Backwards compat: old handler returned a plain array
      if (Array.isArray(result)) return;
      setLocalTemplates(result.templates as LocalVmTemplate[]);
      setLocalInstances(result.instances as LocalVmInstance[]);
    } catch (error) {
      console.error('Failed to load local VMs:', error);
    }
  }, []);

  const loadRemoteData = useCallback(async () => {
    try {
      const [templatesRes, instancesRes] = await Promise.all([
        electron.ipcRenderer.invoke('remote-vms:list-templates'),
        electron.ipcRenderer.invoke('remote-vms:list-instances')
      ]);
      if (!mounted.current) return;
      if (templatesRes.success) setRemoteTemplates(templatesRes.data as RemoteVmTemplate[]);
      if (instancesRes.success) setRemoteInstances(instancesRes.data as RemoteVmInstance[]);
    } catch (error) {
      console.error('Failed to load remote VMs:', error);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadLocalVms(), loadRemoteData()]);
    if (mounted.current) setLoading(false);
  }, [loadLocalVms, loadRemoteData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    if (mounted.current) setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
    // Background poll — intentionally silent so the UI doesn't flicker every 5s
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Live deploy progress from the main process
  useEffect(() => {
    const listener = (_event: unknown, ...args: unknown[]) => {
      const progress = args[0] as DeployProgress;
      if (!progress?.templateName) return;
      setDeployingTemplates((prev) => {
        if (!(progress.templateName in prev)) return prev;
        return { ...prev, [progress.templateName]: progress.message };
      });
    };
    electron.ipcRenderer.on('local-vms:progress', listener);
    return () => {
      electron.ipcRenderer.removeListener('local-vms:progress', listener);
    };
  }, []);

  const setPending = (key: string, op: PendingOp | null) => {
    setPendingOps((prev) => {
      const next = { ...prev };
      if (op) next[key] = op;
      else delete next[key];
      return next;
    });
  };

  // Poll until the VM reaches (or leaves) a state, so buttons stay in their
  // busy state for the whole real-world duration of slow operations.
  const waitForState = async (name: string, done: (state: string) => boolean, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && mounted.current) {
      try {
        const state = await electron.ipcRenderer.invoke('local-vms:get-state', name);
        if (done(state as string)) return;
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  const ACTION_ERROR_VERBS: Record<VmAction, string> = {
    start: 'start',
    stop: 'stop',
    restart: 'restart',
    console: 'open console for',
    delete: 'delete',
    deploy: 'deploy',
    folder: 'open shared folder for',
    copy: 'copy files to',
    edit: 'save details for'
  };

  const runLocalAction = async (
    name: string,
    action: VmAction,
    message: string,
    fn: () => Promise<void>
  ) => {
    setPending(name, { action, message });
    try {
      await fn();
    } catch (error) {
      pushError(`Failed to ${ACTION_ERROR_VERBS[action]} ${name}`, error);
    } finally {
      if (mounted.current) setPending(name, null);
      loadLocalVms();
    }
  };

  // --- Local template deploy ---
  const handleDeploy = async (templateName: string) => {
    setDeployingTemplates((prev) => ({ ...prev, [templateName]: 'Preparing...' }));
    try {
      await electron.ipcRenderer.invoke('local-vms:deploy', templateName);
    } catch (error) {
      pushError(`Failed to deploy ${templateName}`, error);
    } finally {
      if (mounted.current) {
        setDeployingTemplates((prev) => {
          const next = { ...prev };
          delete next[templateName];
          return next;
        });
      }
      loadLocalVms();
    }
  };

  // --- Local instance actions ---
  const handleLocalStart = (name: string) => runLocalAction(name, 'start', 'Starting VM...', async () => {
    await electron.ipcRenderer.invoke('local-vms:start', name);
    await waitForState(name, (s) => s === 'running', 30000);
  });

  const handleLocalStop = (name: string) => runLocalAction(name, 'stop', 'Sending shutdown signal...', async () => {
    await electron.ipcRenderer.invoke('local-vms:stop', name);
    setPending(name, { action: 'stop', message: 'Waiting for guest to shut down...' });
    await waitForState(name, (s) => s !== 'running' && s !== 'paused', 90000);
    // Guest may be ignoring ACPI — force power off so Stop always works
    const state = await electron.ipcRenderer.invoke('local-vms:get-state', name);
    if (state === 'running' || state === 'paused') {
      setPending(name, { action: 'stop', message: 'Guest not responding — forcing power off...' });
      await electron.ipcRenderer.invoke('local-vms:stop', name, true);
      await waitForState(name, (s) => s !== 'running' && s !== 'paused', 20000);
    }
  });

  const handleLocalRestart = (name: string) => runLocalAction(name, 'restart', 'Restarting VM...', async () => {
    await electron.ipcRenderer.invoke('local-vms:restart', name);
    await waitForState(name, (s) => s === 'running', 30000);
  });

  const handleLocalConsole = (name: string) => runLocalAction(name, 'console', 'Opening console...', async () => {
    await electron.ipcRenderer.invoke('local-vms:open-console', name);
  });

  const handleLocalDelete = (name: string, deleteData: boolean) => runLocalAction(
    name,
    'delete',
    deleteData ? 'Removing VM, disks and shared folder data...' : 'Removing VM and its disks...',
    async () => {
      await electron.ipcRenderer.invoke('local-vms:delete', name, deleteData);
    }
  );

  const handleOpenSharedFolder = (name: string) => runLocalAction(name, 'folder', 'Opening shared folder...', async () => {
    await electron.ipcRenderer.invoke('local-vms:open-shared-folder', name);
  });

  const handleSaveMetadata = (name: string, label: string, notes: string) => runLocalAction(name, 'edit', 'Saving details...', async () => {
    await electron.ipcRenderer.invoke('local-vms:set-metadata', name, { label, notes });
    pushFlash(name, 'Details saved');
  });

  const handleDropFiles = (name: string, files: File[]) => runLocalAction(
    name,
    'copy',
    `Copying ${files.length} item${files.length === 1 ? '' : 's'} into shared folder...`,
    async () => {
      const paths = files
        .map((file) => {
          try {
            return electron.getPathForFile(file);
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      if (paths.length === 0) throw new Error('Could not resolve the dropped files to paths');
      const res = await electron.ipcRenderer.invoke('local-vms:copy-to-shared', name, paths);
      const copied = (res as { copied: number }).copied;
      pushFlash(name, `Copied ${copied} item${copied === 1 ? '' : 's'} into the shared folder`);
    }
  );

  // --- Remote VM actions ---
  const runRemoteAction = async (key: string, action: VmAction, fn: () => Promise<void>) => {
    setPending(key, { action });
    try {
      await fn();
    } catch (error) {
      pushError(`Remote VM ${action} failed`, error);
    } finally {
      if (mounted.current) setPending(key, null);
      loadRemoteData();
    }
  };

  const handleSpawn = (templateId: string) => runRemoteAction(`remote-tpl:${templateId}`, 'deploy', async () => {
    await electron.ipcRenderer.invoke('remote-vms:spawn', templateId);
  });

  const handleRemoteStart = (id: string) => runRemoteAction(`remote:${id}`, 'start', async () => {
    await electron.ipcRenderer.invoke('remote-vms:start', id);
  });

  const handleRemoteStop = (id: string) => runRemoteAction(`remote:${id}`, 'stop', async () => {
    await electron.ipcRenderer.invoke('remote-vms:stop', id);
  });

  const handleRemoteRestart = (id: string) => runRemoteAction(`remote:${id}`, 'restart', async () => {
    await electron.ipcRenderer.invoke('remote-vms:restart', id);
  });

  const handleRemoteConsole = (id: string) => runRemoteAction(`remote:${id}`, 'console', async () => {
    const res = await electron.ipcRenderer.invoke('remote-vms:console', id);
    if (res.success && res.data) {
      const info = res.data as { url: string };
      electron.ipcRenderer.send('open-external', info.url);
    }
  });

  const handleRemoteDelete = (id: string) => runRemoteAction(`remote:${id}`, 'delete', async () => {
    await electron.ipcRenderer.invoke('remote-vms:delete', id);
  });

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

  const localRunning = localInstances.filter((v) => v.state === 'running').length;
  const localStopped = localInstances.filter((v) => v.state !== 'running').length;
  const remoteRunning = remoteInstances.filter((v) => v.state === 'running').length;
  const remoteStopped = remoteInstances.filter((v) => v.state === 'stopped').length;

  const sortedInstances = [...localInstances].sort((a, b) => (a.templateName === b.templateName
    ? a.name.localeCompare(b.name, undefined, { numeric: true })
    : a.templateName.localeCompare(b.templateName)));

  return (
    <div className='h-full overflow-auto bg-dark-100 relative'>
      <div className='noise-overlay' />
      <div className='radial-blue-gradient' />

      {/* Error toasts */}
      {errors.length > 0 && (
        <div className='fixed top-4 right-4 z-50 space-y-2 max-w-md'>
          {errors.map((err) => (
            <div key={err.id} className='flex items-start gap-3 p-4 rounded-lg bg-dark-300 border border-red-500/50 shadow-xl shadow-red-500/10 animate-fade-in'>
              <AlertTriangle className='w-4 h-4 text-red-400 shrink-0 mt-0.5' />
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-medium text-white/90'>{err.title}</p>
                <p className='text-xs text-text-light/70 mt-1 break-words'>{err.message}</p>
              </div>
              <button
                onClick={() => dismissError(err.id)}
                className='text-text-light/50 hover:text-white transition-colors shrink-0'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          ))}
        </div>
      )}

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
              onClick={handleManualRefresh}
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
              {localInstances.length > 0 && (
                <span className='ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full'>{localInstances.length}</span>
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
            <div className='animate-fade-in space-y-8'>
              {/* Templates */}
              <div>
                <h2 className='text-lg font-semibold text-white/90 mb-4 flex items-center gap-2'>
                  <Rocket className='w-5 h-5 text-primary' />
                  Templates
                </h2>
                {localTemplates.length === 0
                  ? (
                    <div className='flex flex-col items-center justify-center py-16 px-8 glass-card rounded-xl'>
                      <Server className='w-16 h-16 text-primary/60 mb-6' />
                      <h3 className='text-xl font-semibold mb-3 text-white/90'>No Local VM Templates Configured</h3>
                      <p className='text-sm text-text-light/60 text-center max-w-md'>
                        Add OVA files to the images directory and configure them in local-vms.yaml.
                      </p>
                    </div>
                    )
                  : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                      {localTemplates.map((tpl) => (
                        <LocalTemplateCard
                          key={tpl.name}
                          template={tpl}
                          deploying={tpl.name in deployingTemplates}
                          deployMessage={deployingTemplates[tpl.name]}
                          onDeploy={() => handleDeploy(tpl.name)}
                        />
                      ))}
                    </div>
                    )}
              </div>

              {/* Deployed instances */}
              <div>
                <h2 className='text-lg font-semibold text-white/90 mb-4 flex items-center gap-2'>
                  <Boxes className='w-5 h-5 text-primary' />
                  Deployed VMs
                  {localInstances.length > 0 && (
                    <span className='text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full'>{localInstances.length}</span>
                  )}
                </h2>
                {sortedInstances.length === 0
                  ? (
                    <div className='p-6 glass-card rounded-xl text-center'>
                      <p className='text-sm text-text-light/60'>
                        No VMs deployed yet. Deploy one from a template above — VMs created manually in VirtualBox under a matching name are picked up automatically.
                      </p>
                    </div>
                    )
                  : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                      {sortedInstances.map((inst) => (
                        <LocalVmCard
                          key={inst.name}
                          instance={inst}
                          busyAction={pendingOps[inst.name]?.action ?? null}
                          busyMessage={pendingOps[inst.name]?.message}
                          flashMessage={flashes[inst.name]}
                          onStart={() => handleLocalStart(inst.name)}
                          onStop={() => handleLocalStop(inst.name)}
                          onRestart={() => handleLocalRestart(inst.name)}
                          onConsole={() => handleLocalConsole(inst.name)}
                          onDelete={(deleteData) => handleLocalDelete(inst.name, deleteData)}
                          onOpenSharedFolder={() => handleOpenSharedFolder(inst.name)}
                          onSaveMetadata={(label, notes) => handleSaveMetadata(inst.name, label, notes)}
                          onDropFiles={(files) => handleDropFiles(inst.name, files)}
                        />
                      ))}
                    </div>
                    )}
              </div>
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
                      {remoteTemplates.map((tpl) => {
                        const spawning = pendingOps[`remote-tpl:${tpl.id}`] !== undefined;
                        return (
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
                                disabled={spawning}
                              >
                                {spawning
                                  ? <Loader2 className='w-3.5 h-3.5 mr-1.5 animate-spin' />
                                  : <Rocket className='w-3.5 h-3.5 mr-1.5' />}
                                {spawning ? 'Spawning...' : 'Spawn Instance'}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
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
                          busyAction={pendingOps[`remote:${inst.id}`]?.action ?? null}
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
              {Object.keys(deployingTemplates).length > 0 && (
                <span className='flex items-center gap-2 text-text-light/70'>
                  <Loader2 className='w-3 h-3 text-amber-400 animate-spin' />
                  <span className='text-white/80 font-medium'>{Object.keys(deployingTemplates).length}</span>
                  <span>Deploying</span>
                </span>
              )}
            </div>
            <div className='flex items-center gap-4 text-text-light/70'>
              <span>Local: <span className='text-white/80 font-semibold'>{localInstances.length}</span></span>
              <span>Remote: <span className='text-white/80 font-semibold'>{remoteInstances.length}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
