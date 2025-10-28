import { Home, Terminal, Server, Globe2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

interface TabItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function TabNavigation () {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs: TabItem[] = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/tools', label: 'Tools', icon: Terminal },
    { path: '/vms', label: 'VMs', icon: Server },
    { path: '/web-apps', label: 'Web Apps', icon: Globe2 }
  ];

  return (
    <div className='bg-dark-200/80 backdrop-blur-sm border-b border-border-light/20'>
      <div className='max-w-7xl mx-auto px-6'>
        <div className='flex items-center gap-1'>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;

            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`
                  relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium
                  transition-all duration-200 hover:text-white
                  ${
                    isActive
                      ? 'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-primary after:to-blue-selected'
                      : 'text-text-light/70 hover:bg-dark-300/30'
                  }
                `}
              >
                <Icon className='w-4 h-4' />
                <span>{tab.label}</span>
                {isActive && (
                  <div className='absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none' />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
