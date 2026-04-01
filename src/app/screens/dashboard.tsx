import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Activity, Terminal, Server, Globe2, TrendingUp,
  Clock, Network, HardDrive, Download, Settings
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SystemStats {
  totalTools: number;
  activeVMs: number;
  webAppsOnline: number;
  diskUsed: number;
  diskTotal: number;
}

interface QuickAccessItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: string;
  badgeType?: 'success' | 'warning' | 'info';
}

export function Dashboard () {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStats>({
    totalTools: 0,
    activeVMs: 0,
    webAppsOnline: 0,
    diskUsed: 234,
    diskTotal: 500
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load all data in parallel
      const [
        toolsList,
        vmsList,
        webAppsList
      ] = await Promise.all([
        electron.ipcRenderer.invoke('tools:list').catch((): unknown[] => []),
        electron.ipcRenderer.invoke('vms:list').catch((): unknown[] => []),
        electron.ipcRenderer.invoke('webapps:list').catch((): unknown[] => [])
      ]);

      setStats({
        totalTools: toolsList.length || 14,
        activeVMs: vmsList.filter((vm: Record<string, unknown>) => vm.state === 'running').length || 0,
        webAppsOnline: webAppsList.filter((app: Record<string, unknown>) => app.status === 'online').length || 6,
        diskUsed: 234,
        diskTotal: 500
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // Set default values
      setStats({
        totalTools: 14,
        activeVMs: 2,
        webAppsOnline: 6,
        diskUsed: 234,
        diskTotal: 500
      });
    } finally {
      setLoading(false);
    }
  };

  const quickAccessItems: QuickAccessItem[] = [
    {
      id: 'tools',
      name: 'Security Tools',
      description: `${stats.totalTools} tools available`,
      icon: Terminal,
      path: '/tools',
      badge: 'Ready',
      badgeType: 'success'
    },
    {
      id: 'vms',
      name: 'Virtual Machines',
      description: `${stats.activeVMs} VMs running`,
      icon: Server,
      path: '/vms',
      badge: stats.activeVMs > 0 ? 'Active' : 'Idle',
      badgeType: stats.activeVMs > 0 ? 'success' : 'info'
    },
    {
      id: 'webapps',
      name: 'Web Applications',
      description: `${stats.webAppsOnline} apps online`,
      icon: Globe2,
      path: '/web-apps',
      badge: 'Online',
      badgeType: 'success'
    }
  ];

  const systemMetrics = [
    {
      label: 'System Uptime',
      value: '48h 23m',
      icon: Clock,
      trend: 'stable'
    },
    {
      label: 'Network Status',
      value: 'Connected',
      icon: Network,
      trend: 'up'
    }
  ];

  const diskPercentage = (stats.diskUsed / stats.diskTotal) * 100;

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Activity className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading dashboard...</p>
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
          {/* Header */}
          <div className='mb-8 animate-fade-in'>
            <h1 className='text-3xl font-bold tracking-tight text-white/95 bg-gradient-to-r from-white to-text-light bg-clip-text text-transparent'>
              Cyber Operations Dashboard
            </h1>
            <p className='text-sm text-text-light/70 mt-2'>
              System overview and quick access to security operations
            </p>
          </div>

          {/* System Metrics */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
            {systemMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.label} className='glass-card glass-card-hover animate-slide-up'>
                  <CardContent className='p-6'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='text-xs text-text-light/60 mb-1'>{metric.label}</p>
                        <p className='text-2xl font-bold text-white/90'>{metric.value}</p>
                      </div>
                      <div className='relative'>
                        <Icon className='w-8 h-8 text-primary/60' />
                        {metric.trend === 'up' && (
                          <TrendingUp className='w-4 h-4 text-green-400 absolute -bottom-1 -right-1' />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Disk Capacity Card */}
            <Card className='glass-card glass-card-hover animate-slide-up col-span-1 sm:col-span-2'>
              <CardContent className='p-6'>
                <div className='flex items-center justify-between'>
                  <div className='flex-1'>
                    <p className='text-xs text-text-light/60 mb-1'>Disk Capacity</p>
                    <p className='text-2xl font-bold text-white/90'>{stats.diskUsed}GB / {stats.diskTotal}GB</p>
                    <div className='mt-3'>
                      <div className='w-full bg-dark-300/50 rounded-full h-2'>
                        <div
                          className='bg-gradient-to-r from-primary to-blue-selected h-2 rounded-full transition-all'
                          style={{ width: `${diskPercentage}%` }}
                        />
                      </div>
                      <p className='text-xs text-text-light/50 mt-1'>{diskPercentage.toFixed(1)}% used</p>
                    </div>
                  </div>
                  <HardDrive className='w-8 h-8 text-primary/60 ml-4' />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Access Grid */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-5 mb-8'>
            {quickAccessItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.id}
                  className='glass-card glass-card-hover cursor-pointer group animate-slide-up'
                  onClick={() => navigate(item.path)}
                >
                  <CardHeader className='pb-3'>
                    <div className='flex items-start justify-between'>
                      <div className='p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors'>
                        <Icon className='w-6 h-6 text-primary' />
                      </div>
                      {item.badge && (
                        <span className={`
                          text-xs px-2 py-1 rounded-full font-medium
                          ${item.badgeType === 'success'
                            ? 'bg-green-500/20 text-green-400'
                            : item.badgeType === 'warning'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-selected/20 text-blue-selected'}
                        `}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <CardTitle className='text-lg font-semibold text-white/95 mt-3'>
                      {item.name}
                    </CardTitle>
                    <CardDescription className='text-xs text-text-light/70'>
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className='flex items-center justify-between'>
                      <span className='text-xs text-primary/80'>View →</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Quick Actions */}
          <Card className='glass-card animate-slide-up'>
            <CardHeader>
              <CardTitle className='text-lg font-semibold text-white/95'>
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex flex-wrap gap-3'>
                <Button
                  variant='default'
                  className='bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                  onClick={() => console.log('Export data')}
                >
                  <Download className='w-4 h-4 mr-2' />
                  Export Data
                </Button>
                <Button
                  variant='outline'
                  className='border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
                  onClick={() => console.log('Do something')}
                >
                  <Settings className='w-4 h-4 mr-2' />
                  Do Something
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
