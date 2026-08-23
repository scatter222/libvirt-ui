import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VMDashboard } from '@/app/screens/vm-dashboard';

import { emitRendererEvent } from '../../setup/electron-bridge-mock';

const host = {
  cpuCount: 8,
  totalMemMB: 16384,
  freeMemMB: 4096,
  allocatedMemMB: 3072,
  allocatedCpus: 3,
  runningCount: 1
};

const kaliTemplate = {
  name: 'kali',
  displayName: 'Kali Linux',
  description: 'Pentest distro',
  category: 'offensive',
  memory: 2048,
  cpus: 2,
  tags: ['linux'],
  ovaPath: '/images/kali.ova',
  ovaExists: true,
  instanceCount: 1,
  maxInstances: 2
};

const kaliInstance = {
  name: 'kali',
  templateName: 'kali',
  displayName: 'Kali Linux',
  description: 'Pentest distro',
  category: 'offensive',
  state: 'running',
  memory: 3072,
  cpus: 3,
  tags: ['linux'],
  sharedFolderPath: '/storage/vbox-share/rhys/kali',
  sharedFolderAttached: true,
  sharedFolderItemCount: 2,
  guestAdditionsActive: true
};

const remoteTemplate = {
  id: 't1',
  name: 'Kali Cloud',
  description: 'Server-side Kali',
  category: 'offensive',
  specs: { memory: 4096, cpus: 2, diskSize: 40 },
  tags: ['cloud']
};

const remoteInstance = {
  id: 'i-7',
  templateId: 't1',
  templateName: 'Kali Cloud',
  owner: 'rhys',
  state: 'stopped',
  createdAt: '2026-08-01T10:00:00Z',
  consoleType: 'vnc',
  consolePort: 5901,
  specs: { memory: 4096, cpus: 2, diskSize: 40 }
};

type Overrides = Record<string, (...args: unknown[]) => Promise<unknown>>;

function stubChannels (overrides: Overrides = {}) {
  const defaults: Overrides = {
    'local-vms:list': async () => ({ templates: [kaliTemplate], instances: [kaliInstance], host }),
    'remote-vms:list-templates': async () => ({ success: true, data: [remoteTemplate] }),
    'remote-vms:list-instances': async () => ({ success: true, data: [remoteInstance] })
  };
  const table = { ...defaults, ...overrides };
  vi.mocked(electron.ipcRenderer.invoke).mockImplementation((channel: string, ...args: unknown[]) => {
    const handler = table[channel];
    if (!handler) return Promise.resolve(undefined);
    return handler(...args);
  });
}

describe('VMDashboard', () => {
  it('renders host capacity, template lanes, and instance cards from the IPC data', async () => {
    stubChannels();
    render(<VMDashboard />);

    // Loading screen resolves into the local tab content
    expect(screen.getByText('Loading virtual machines...')).toBeInTheDocument();
    expect(await screen.findByText('Virtual Machines')).toBeInTheDocument();

    // Host capacity line
    expect(screen.getByText('This machine')).toBeInTheDocument();
    expect(screen.getByText('16 GB')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/1 running VM assigned/)).toBeInTheDocument();

    // Template lane with its instance count and the instance card inside
    expect(screen.getByText('1/2 instances')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('/storage/vbox-share/rhys/kali')).toBeInTheDocument();

    // Status bar counts local + remote states (1 running local, 1 stopped remote)
    expect(screen.getByText('Running').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Stopped').previousElementSibling).toHaveTextContent('1');
  });

  it('switches to the remote tab with server templates and instances', async () => {
    const user = userEvent.setup();
    stubChannels();
    render(<VMDashboard />);
    await screen.findByText('Virtual Machines');

    await user.click(screen.getByRole('button', { name: /Remote VMs/ }));

    expect(screen.getByText('Available Templates')).toBeInTheDocument();
    // The template card and the instance card both carry the template name
    expect(screen.getAllByText('Kali Cloud')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Spawn Instance/ })).toBeEnabled();
    expect(screen.getByText('My Instances')).toBeInTheDocument();
    // The stopped remote instance offers Start
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument();
  });

  it('deploys with the configured specs and narrates live progress events', async () => {
    const user = userEvent.setup();
    let resolveDeploy!: (v: unknown) => void;
    const deployCalls: unknown[][] = [];
    stubChannels({
      'local-vms:deploy': (...args: unknown[]) => {
        deployCalls.push(args);
        return new Promise((resolve) => { resolveDeploy = resolve; });
      }
    });
    render(<VMDashboard />);
    await screen.findByText('Virtual Machines');

    await user.click(screen.getByRole('button', { name: /Create Instance/ }));
    const ram = screen.getByRole('spinbutton', { name: 'RAM (MB)' });
    await user.clear(ram);
    await user.type(ram, '4096');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // The deploy contract: template name plus the user's spec overrides
    expect(deployCalls).toEqual([['kali', { memory: 4096, cpus: 2 }]]);
    expect(screen.getByText('Creating...')).toBeInTheDocument();
    expect(screen.getByText('Preparing...')).toBeInTheDocument();

    // A progress event from the main process replaces the placeholder message
    act(() => {
      emitRendererEvent('local-vms:progress', {
        templateName: 'kali',
        instanceName: 'kali-2',
        phase: 'importing',
        message: 'Importing OVA (this can take a few minutes)...'
      });
    });
    expect(screen.getByText('Importing OVA (this can take a few minutes)...')).toBeInTheDocument();

    // Completion clears the deploying state again
    act(() => { resolveDeploy({ success: true, instanceName: 'kali-2' }); });
    await waitFor(() => {
      expect(screen.queryByText('Creating...')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Create Instance/ })).toBeEnabled();
  });

  it('surfaces deploy failures as a dismissable toast with the IPC prefix stripped', async () => {
    const user = userEvent.setup();
    stubChannels({
      'local-vms:deploy': async () => {
        throw new Error("Error invoking remote method 'local-vms:deploy': Error: Instance limit reached for Kali Linux (2/2)");
      }
    });
    render(<VMDashboard />);
    await screen.findByText('Virtual Machines');

    await user.click(screen.getByRole('button', { name: /Create Instance/ }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Failed to deploy kali')).toBeInTheDocument();
    // Electron's noisy prefix is stripped, the real reason is kept
    expect(screen.getByText('Instance limit reached for Kali Linux (2/2)')).toBeInTheDocument();

    const toast = screen.getByText('Failed to deploy kali').closest('div')!.parentElement!;
    await user.click(toast.querySelector('button')!);
    expect(screen.queryByText('Failed to deploy kali')).not.toBeInTheDocument();
  });

  it('saves card edits and confirms the new specs in a flash message', async () => {
    const user = userEvent.setup();
    const setSpecs: unknown[][] = [];
    const setMetadata: unknown[][] = [];
    stubChannels({
      'local-vms:list': async () => ({
        templates: [kaliTemplate],
        instances: [{ ...kaliInstance, state: 'stopped' }],
        host
      }),
      'local-vms:set-metadata': async (...args: unknown[]) => { setMetadata.push(args); return { success: true }; },
      'local-vms:set-specs': async (...args: unknown[]) => { setSpecs.push(args); return { success: true }; }
    });
    render(<VMDashboard />);
    await screen.findByText('Virtual Machines');

    await user.click(screen.getByRole('button', { name: 'Rename / add notes' }));
    await user.type(screen.getByPlaceholderText('Kali Linux'), 'Case 4211');
    const ram = screen.getByRole('spinbutton', { name: 'RAM (MB)' });
    await user.clear(ram);
    await user.type(ram, '2048');
    await user.click(screen.getByRole('button', { name: /Save/ }));

    await screen.findByText('Saved — now 2 GB RAM / 3 CPUs');
    expect(setMetadata).toEqual([['kali', { label: 'Case 4211', notes: '' }]]);
    expect(setSpecs).toEqual([['kali', { memory: 2048, cpus: 3 }]]);
  });

  it('shows the empty state when no templates are configured', async () => {
    stubChannels({
      'local-vms:list': async () => ({ templates: [], instances: [], host: null })
    });
    render(<VMDashboard />);

    expect(await screen.findByText('No Local VM Templates Configured')).toBeInTheDocument();
  });
});
