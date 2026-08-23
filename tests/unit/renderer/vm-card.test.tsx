import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  LocalTemplateLane, LocalVmCard, RemoteVmCard, formatMB
} from '@/app/components/vm-card';
import type {
  LocalHostInfo, LocalVmInstance, LocalVmTemplate, RemoteVmInstance
} from '@/app/components/vm-card';

const host: LocalHostInfo = {
  cpuCount: 8,
  totalMemMB: 16384,
  freeMemMB: 4096,
  allocatedMemMB: 3072,
  allocatedCpus: 3,
  runningCount: 1
};

const template = (overrides: Partial<LocalVmTemplate> = {}): LocalVmTemplate => ({
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
  maxInstances: 3,
  ...overrides
});

const instance = (overrides: Partial<LocalVmInstance> = {}): LocalVmInstance => ({
  name: 'kali-2',
  templateName: 'kali',
  displayName: 'Kali Linux #2',
  description: 'Pentest distro',
  category: 'offensive',
  state: 'stopped',
  memory: 2048,
  cpus: 2,
  tags: ['linux'],
  sharedFolderPath: '/storage/vbox-share/rhys/kali-2',
  sharedFolderAttached: true,
  sharedFolderItemCount: 0,
  guestAdditionsActive: null,
  ...overrides
});

const laneHandlers = () => ({ onDeploy: vi.fn() });

const cardHandlers = () => ({
  onStart: vi.fn(),
  onStop: vi.fn(),
  onRestart: vi.fn(),
  onConsole: vi.fn(),
  onDelete: vi.fn(),
  onOpenSharedFolder: vi.fn(),
  onSaveEdits: vi.fn(),
  onDropFiles: vi.fn()
});

describe('formatMB', () => {
  it('renders MB below 1 GB and trims whole GB values', () => {
    expect(formatMB(512)).toBe('512 MB');
    expect(formatMB(1024)).toBe('1 GB');
    expect(formatMB(1536)).toBe('1.5 GB');
    expect(formatMB(16384)).toBe('16 GB');
  });
});

describe('LocalTemplateLane', () => {
  it('shows the template identity, instance count against its limit, and default specs', () => {
    render(<LocalTemplateLane template={template()} host={host} deploying={false} {...laneHandlers()} />);

    expect(screen.getByText('Kali Linux')).toBeInTheDocument();
    expect(screen.getByText('1/3 instances')).toBeInTheDocument();
    expect(screen.getByText('2 GB')).toBeInTheDocument();
    expect(screen.getByText('2 CPUs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Instance/ })).toBeEnabled();
  });

  it('disables creation and says so when the instance limit is reached', () => {
    render(
      <LocalTemplateLane
        template={template({ instanceCount: 3, maxInstances: 3 })}
        host={host}
        deploying={false}
        {...laneHandlers()}
      />
    );

    expect(screen.getByRole('button', { name: /Limit Reached/ })).toBeDisabled();
    expect(screen.getByText('3/3 instances')).toBeInTheDocument();
  });

  it('disables creation and warns when the OVA image is missing', () => {
    render(
      <LocalTemplateLane
        template={template({ ovaExists: false })}
        host={host}
        deploying={false}
        {...laneHandlers()}
      />
    );

    expect(screen.getByText('OVA image not found — new instances cannot be created')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Instance/ })).toBeDisabled();
  });

  it('lets the user tune RAM/CPUs within host bounds before deploying', async () => {
    const user = userEvent.setup();
    const handlers = laneHandlers();
    render(<LocalTemplateLane template={template()} host={host} deploying={false} {...handlers} />);

    await user.click(screen.getByRole('button', { name: /Create Instance/ }));

    // Inputs are prefilled with the template defaults
    const ram = screen.getByRole('spinbutton', { name: 'RAM (MB)' });
    const cpus = screen.getByRole('spinbutton', { name: 'CPUs' });
    expect(ram).toHaveValue(2048);
    expect(cpus).toHaveValue(2);

    // Host capacity context is shown for the decision
    expect(screen.getByText(/16 GB/)).toBeInTheDocument();

    await user.clear(ram);
    await user.type(ram, '8192');
    await user.clear(cpus);
    await user.type(cpus, '4');

    // 8 GB requested > 4 GB free → warned, but still allowed
    expect(screen.getByText(/More RAM than the host currently has free/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(handlers.onDeploy).toHaveBeenCalledExactlyOnceWith(8192, 4);
  });

  it('blocks deploying with specs the host cannot satisfy', async () => {
    const user = userEvent.setup();
    const handlers = laneHandlers();
    render(<LocalTemplateLane template={template()} host={host} deploying={false} {...handlers} />);

    await user.click(screen.getByRole('button', { name: /Create Instance/ }));

    const ram = screen.getByRole('spinbutton', { name: 'RAM (MB)' });
    await user.clear(ram);
    await user.type(ram, '100');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    // More CPUs than the host has is equally invalid
    await user.clear(ram);
    await user.type(ram, '2048');
    const cpus = screen.getByRole('spinbutton', { name: 'CPUs' });
    await user.clear(cpus);
    await user.type(cpus, '9');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(handlers.onDeploy).not.toHaveBeenCalled();
  });

  it('shows deploy progress instead of the config panel while deploying', () => {
    render(
      <LocalTemplateLane
        template={template()}
        host={host}
        deploying
        deployMessage='Importing OVA (this can take a few minutes)...'
        {...laneHandlers()}
      />
    );

    expect(screen.getByText('Creating...')).toBeInTheDocument();
    expect(screen.getByText('Importing OVA (this can take a few minutes)...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
  });

  it('renders an empty state until the template has instances', () => {
    const { rerender } = render(
      <LocalTemplateLane template={template({ instanceCount: 0 })} host={host} deploying={false} {...laneHandlers()} />
    );
    expect(screen.getByText(/No instances yet/)).toBeInTheDocument();

    rerender(
      <LocalTemplateLane template={template({ instanceCount: 1 })} host={host} deploying={false} {...laneHandlers()}>
        <div data-testid='instance-card' />
      </LocalTemplateLane>
    );
    expect(screen.queryByText(/No instances yet/)).not.toBeInTheDocument();
    expect(screen.getByTestId('instance-card')).toBeInTheDocument();
  });
});

describe('LocalVmCard', () => {
  it('offers Start for a stopped VM and Resume for a suspended one', () => {
    const { rerender } = render(<LocalVmCard instance={instance()} host={host} busyAction={null} {...cardHandlers()} />);
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled();
    expect(screen.getByText('stopped')).toBeInTheDocument();

    rerender(<LocalVmCard instance={instance({ state: 'suspended' })} host={host} busyAction={null} {...cardHandlers()} />);
    expect(screen.getByRole('button', { name: /Resume/ })).toBeEnabled();
  });

  it('offers Stop/Restart/Console for a running VM', () => {
    const handlers = cardHandlers();
    render(<LocalVmCard instance={instance({ state: 'running' })} host={host} busyAction={null} {...handlers} />);

    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Console' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
  });

  it('disables all actions and shows the busy badge while an operation runs', () => {
    render(
      <LocalVmCard
        instance={instance()}
        host={host}
        busyAction='start'
        busyMessage='Starting VM...'
        {...cardHandlers()}
      />
    );

    expect(screen.getByText('Starting')).toBeInTheDocument();
    expect(screen.getByText('Starting VM...')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('describes the shared folder state: path, item count, and attach-on-next-start', () => {
    render(
      <LocalVmCard
        instance={instance({ sharedFolderAttached: false, sharedFolderItemCount: 3 })}
        host={host}
        busyAction={null}
        {...cardHandlers()}
      />
    );

    expect(screen.getByText('/storage/vbox-share/rhys/kali-2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTitle('Shared folder attaches on next start')).toBeInTheDocument();
  });

  it('warns when the guest lacks Guest Additions while running', () => {
    render(
      <LocalVmCard
        instance={instance({ state: 'running', guestAdditionsActive: false })}
        host={host}
        busyAction={null}
        {...cardHandlers()}
      />
    );

    expect(screen.getByText(/Guest Additions not detected/)).toBeInTheDocument();
  });

  it('requires confirmation before deleting and forwards the shared-data choice', async () => {
    const user = userEvent.setup();
    const handlers = cardHandlers();
    render(
      <LocalVmCard
        instance={instance({ sharedFolderItemCount: 5 })}
        host={host}
        busyAction={null}
        {...handlers}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete VM' }));
    expect(screen.getByText('Delete Kali Linux #2?')).toBeInTheDocument();
    // The destructive checkbox spells out how much data it would remove
    expect(screen.getByText('(5 items)')).toBeInTheDocument();
    expect(handlers.onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Delete$/ }));
    expect(handlers.onDelete).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('cancelling the delete confirmation keeps the VM', async () => {
    const user = userEvent.setup();
    const handlers = cardHandlers();
    render(<LocalVmCard instance={instance()} host={host} busyAction={null} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Delete VM' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Delete Kali Linux #2\?/)).not.toBeInTheDocument();
  });

  it('edits label, notes, and specs on a stopped VM', async () => {
    const user = userEvent.setup();
    const handlers = cardHandlers();
    render(<LocalVmCard instance={instance()} host={host} busyAction={null} {...handlers} />);

    await user.click(screen.getByRole('button', { name: 'Rename / add notes' }));

    await user.type(screen.getByPlaceholderText('Kali Linux #2'), '  Case 4211  ');
    await user.type(screen.getByPlaceholderText(/What is this VM for/), 'phishing payload');
    const ram = screen.getByRole('spinbutton', { name: 'RAM (MB)' });
    await user.clear(ram);
    await user.type(ram, '4096');

    await user.click(screen.getByRole('button', { name: /Save/ }));
    expect(handlers.onSaveEdits).toHaveBeenCalledExactlyOnceWith({
      label: 'Case 4211',
      notes: 'phishing payload',
      memory: 4096,
      cpus: 2
    });
  });

  it('locks spec inputs while the VM is running and keeps the current values', async () => {
    const user = userEvent.setup();
    const handlers = cardHandlers();
    render(
      <LocalVmCard
        instance={instance({ state: 'running', memory: 3072, cpus: 3 })}
        host={host}
        busyAction={null}
        {...handlers}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rename / add notes' }));

    expect(screen.getByRole('spinbutton', { name: 'RAM (MB)' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'CPUs' })).toBeDisabled();
    expect(screen.getByText('Stop the VM to change specs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save/ }));
    expect(handlers.onSaveEdits).toHaveBeenCalledExactlyOnceWith({
      label: '',
      notes: '',
      memory: 3072,
      cpus: 3
    });
  });

  it('shows the user label as the title with the instance name demoted below it', () => {
    render(
      <LocalVmCard
        instance={instance({ label: 'Case 4211', notes: 'payload triage' })}
        host={host}
        busyAction={null}
        {...cardHandlers()}
      />
    );

    expect(screen.getByText('Case 4211')).toBeInTheDocument();
    expect(screen.getByText('Kali Linux #2')).toBeInTheDocument();
    expect(screen.getByText('payload triage')).toBeInTheDocument();
  });
});

describe('RemoteVmCard', () => {
  const remote = (overrides: Partial<RemoteVmInstance> = {}): RemoteVmInstance => ({
    id: 'i-7',
    templateId: 't1',
    templateName: 'Kali Cloud',
    owner: 'rhys',
    state: 'running',
    createdAt: '2026-08-01T10:00:00Z',
    consoleType: 'vnc',
    consolePort: 5901,
    specs: { memory: 4096, cpus: 2, diskSize: 40 },
    ...overrides
  });

  it('shows specs including disk and running-state controls', () => {
    render(<RemoteVmCard instance={remote()} {...cardHandlers()} />);

    expect(screen.getByText('Kali Cloud')).toBeInTheDocument();
    expect(screen.getByText('4096 MB')).toBeInTheDocument();
    expect(screen.getByText('40 GB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Console' })).toBeInTheDocument();
  });

  it('offers Start and Delete when stopped', async () => {
    const user = userEvent.setup();
    const handlers = cardHandlers();
    render(<RemoteVmCard instance={remote({ state: 'stopped' })} {...handlers} />);

    await user.click(screen.getByRole('button', { name: /Start/ }));
    expect(handlers.onStart).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Delete Instance' }));
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it('shows no lifecycle controls while the instance is being created', () => {
    render(<RemoteVmCard instance={remote({ state: 'creating' })} {...cardHandlers()} />);

    expect(screen.getByText('creating')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
