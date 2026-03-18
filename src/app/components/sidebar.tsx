import { ConnectionStatus } from '@/app/components/connection-status';
import { Home, Server, Terminal, Target, Shield, Settings, Search, BookOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: Home,
    description: 'Overview and quick launch'
  },
  {
    path: '/tools',
    label: 'Tools',
    icon: Terminal,
    description: 'Security tools arsenal'
  },
  {
    path: '/vms',
    label: 'Virtual Machines',
    icon: Server,
    description: 'QEMU/KVM management'
  },
  {
    path: '/missions',
    label: 'Missions',
    icon: Target,
    description: 'Operational toolsets'
  },
  {
    path: '/categories',
    label: 'Categories',
    icon: Shield,
    description: 'Tools by category'
  }
];

export function Sidebar () {
  return (
    <aside className='w-64 h-full bg-dark-200 border-r border-border-light/20 flex flex-col'>
      {/* Logo/Brand Section */}
      <div className='p-6 border-b border-border-light/20'>
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center'>
            <Shield className='w-6 h-6 text-primary' />
          </div>
          <div>
            <h1 className='text-lg font-bold text-white/95'>Cyber Launchpad</h1>
            <p className='text-xs text-text-light/60'>Security Operations Hub</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className='p-4 border-b border-border-light/20'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light/40' />
          <input
            type='text'
            placeholder='Quick search...'
            className='w-full pl-10 pr-3 py-2 bg-dark-300/50 border border-border-light/20 rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all'
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className='flex-1 px-3 py-4 space-y-1 overflow-y-auto'>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                ${isActive
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-dark-300/50 text-text-light/70 hover:text-white border border-transparent'
                }
              `}
            >
              <Icon className='w-5 h-5 flex-shrink-0' />
              <div className='flex-1 min-w-0'>
                <div className='font-medium text-sm'>{item.label}</div>
                {item.description && (
                  <div className='text-xs opacity-60 truncate'>{item.description}</div>
                )}
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* API Connection Status */}
      <div className='border-t border-border-light/20'>
        <ConnectionStatus />
      </div>

      {/* Bottom Section */}
      <div className='p-4 border-t border-border-light/20'>
        <button className='w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-light/70 hover:bg-dark-300/50 hover:text-white transition-all'>
          <BookOpen className='w-5 h-5' />
          <span className='text-sm'>Documentation</span>
        </button>
        <button className='w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-light/70 hover:bg-dark-300/50 hover:text-white transition-all'>
          <Settings className='w-5 h-5' />
          <span className='text-sm'>Settings</span>
        </button>
      </div>
    </aside>
  );
}
