import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import { ExternalLink, RefreshCw, Search, Globe, Server, Shield, BarChart } from 'lucide-react';
import { useEffect, useState } from 'react';

interface WebApp {
  id: string;
  name: string;
  displayName: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  icon?: string;
  requiresAuth?: boolean;
  status?: 'online' | 'offline' | 'unknown';
}

export function WebApplicationsDashboard () {
  const [webApps, setWebApps] = useState<WebApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadWebApps = async () => {
    try {
      setRefreshing(true);
      const webAppsList = await electron.ipcRenderer.invoke('webapps:list');
      setWebApps(webAppsList);
    } catch (error) {
      console.error('Failed to load web applications:', error);
      // Fallback to hardcoded apps for now
      setWebApps([
        {
          id: 'splunk',
          name: 'Splunk',
          displayName: 'Splunk Enterprise',
          description: 'Search, monitor, and analyze machine data',
          url: 'http://localhost:8000',
          category: 'siem',
          tags: [
            'siem',
            'logs',
            'monitoring',
            'analytics'
          ],
          icon: '📊',
          requiresAuth: true,
          status: 'online'
        },
        {
          id: 'arkime',
          name: 'Arkime',
          displayName: 'Arkime (Moloch)',
          description: 'Large scale, open source, indexed packet capture and search',
          url: 'http://localhost:8005',
          category: 'network',
          tags: [
            'pcap',
            'network',
            'forensics',
            'packet-analysis'
          ],
          icon: '🔍',
          requiresAuth: true,
          status: 'online'
        },
        {
          id: 'kibana',
          name: 'Kibana',
          displayName: 'Kibana',
          description: 'Elasticsearch data visualization and exploration',
          url: 'http://localhost:5601',
          category: 'siem',
          tags: [
            'elastic',
            'visualization',
            'logs',
            'dashboard'
          ],
          icon: '📈',
          requiresAuth: false,
          status: 'online'
        },
        {
          id: 'grafana',
          name: 'Grafana',
          displayName: 'Grafana',
          description: 'Open source analytics and interactive visualization',
          url: 'http://localhost:3000',
          category: 'monitoring',
          tags: [
            'metrics',
            'visualization',
            'monitoring',
            'dashboard'
          ],
          icon: '📉',
          requiresAuth: true,
          status: 'online'
        },
        {
          id: 'cyberchef',
          name: 'CyberChef',
          displayName: 'CyberChef',
          description: 'The Cyber Swiss Army Knife for encoding, decoding, and analyzing data',
          url: 'http://localhost:8080/cyberchef',
          category: 'analysis',
          tags: [
            'encoding',
            'decoding',
            'crypto',
            'analysis'
          ],
          icon: '🔐',
          requiresAuth: false,
          status: 'online'
        },
        {
          id: 'misp',
          name: 'MISP',
          displayName: 'MISP Threat Sharing',
          description: 'Threat intelligence platform for sharing, storing and correlating IOCs',
          url: 'http://localhost:8443',
          category: 'threat-intel',
          tags: [
            'threat-intel',
            'ioc',
            'sharing',
            'correlation'
          ],
          icon: '🌐',
          requiresAuth: true,
          status: 'offline'
        }
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWebApps();
  }, []);

  const handleLaunchWebApp = async (url: string) => {
    try {
      await electron.ipcRenderer.invoke('webapps:open', url);
    } catch (error) {
      console.error('Failed to open web app:', error);
      // Fallback to opening in default browser
      window.open(url, '_blank');
    }
  };

  // Filter web apps based on search
  const filteredWebApps = webApps.filter((app) => {
    const matchesSearch = searchQuery === '' ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSearch;
  });

  // Group apps by category
  const groupedApps = filteredWebApps.reduce((acc, app) => {
    if (!acc[app.category]) {
      acc[app.category] = [];
    }
    acc[app.category].push(app);
    return acc;
  }, {} as Record<string, WebApp[]>);

  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    siem: BarChart,
    network: Globe,
    monitoring: Server,
    'threat-intel': Shield,
    analysis: Search
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Globe className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading web applications...</p>
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
          {/* Header with search */}
          <div className='mb-8 animate-fade-in'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h1 className='text-3xl font-bold tracking-tight text-white/95 bg-gradient-to-r from-white to-text-light bg-clip-text text-transparent'>
                  Web Applications
                </h1>
                <p className='text-sm text-text-light/70 mt-2'>
                  {webApps.length} web-based security tools and dashboards
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={loadWebApps}
                disabled={refreshing}
                className='gap-2 border-border-light/50 hover:bg-dark-300/50 hover:border-primary/50 transition-all'
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Search Bar */}
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light/40' />
              <input
                type='text'
                placeholder='Search web applications by name, description, or tags...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full pl-10 pr-4 py-2.5 bg-dark-300/50 border border-border-light/20 rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all'
              />
            </div>
          </div>

          {/* Web Apps by Category */}
          {Object.keys(groupedApps).length === 0
            ? (
              <div className='flex flex-col items-center justify-center py-24 px-8 glass-card rounded-xl animate-slide-up'>
                <Globe className='w-20 h-20 text-primary/60 mb-6' />
                <h2 className='text-2xl font-semibold mb-3 text-white/90'>No Applications Found</h2>
                <p className='text-sm text-text-light/60 text-center max-w-md'>
                  {searchQuery
                    ? `No web applications match your search "${searchQuery}"`
                    : 'No web applications available'}
                </p>
              </div>
              )
            : (
              <div className='space-y-8'>
                {Object.entries(groupedApps).map(([category, apps]) => {
                  const CategoryIcon = categoryIcons[category] || Globe;
                  return (
                    <div key={category} className='animate-slide-up'>
                      <div className='flex items-center gap-3 mb-4'>
                        <CategoryIcon className='w-5 h-5 text-primary' />
                        <h2 className='text-lg font-semibold text-white/90 capitalize'>
                          {category.replace('-', ' ')}
                        </h2>
                        <span className='text-xs text-text-light/60 bg-dark-300/50 px-2 py-1 rounded-full'>
                          {apps.length} {apps.length === 1 ? 'app' : 'apps'}
                        </span>
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'>
                        {apps.map((app) => (
                          <Card key={app.id} className='relative overflow-hidden glass-card glass-card-hover group'>
                            {/* Gradient glow effect on hover */}
                            <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />

                            {/* Status indicator */}
                            <div className={`absolute top-0 left-0 right-0 h-0.5 ${
                            app.status === 'online'
                              ? 'bg-gradient-to-r from-green-500 to-green-400'
                              : app.status === 'offline'
                              ? 'bg-gradient-to-r from-red-500 to-red-400'
                              : 'bg-border-light/30'
                          }`}
                            />

                            <CardHeader className='relative pb-3'>
                              <div className='flex items-start justify-between'>
                                <div className='flex-1'>
                                  <div className='flex items-center gap-2'>
                                    {app.icon && <span className='text-2xl'>{app.icon}</span>}
                                    <CardTitle className='text-lg font-semibold text-white/95'>
                                      {app.displayName}
                                    </CardTitle>
                                  </div>
                                  <CardDescription className='text-xs text-text-light/80 mt-1'>
                                    {app.description}
                                  </CardDescription>
                                </div>
                                <div className={`
                                w-2 h-2 rounded-full
                                ${app.status === 'online'
? 'bg-green-400 animate-pulse'
                                  : app.status === 'offline' ? 'bg-red-400' : 'bg-gray-400'}
                              `}
                                />
                              </div>

                              {/* Tags */}
                              {app.tags && app.tags.length > 0 && (
                                <div className='flex flex-wrap items-center gap-1.5 mt-3'>
                                  {app.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className='bg-blue-selected/15 text-blue-selected/90 border border-blue-selected/30 text-xs px-2 py-0.5 rounded-full font-medium'
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {app.requiresAuth && (
                                    <span className='bg-yellow-500/15 text-yellow-400/90 border border-yellow-500/30 text-xs px-2 py-0.5 rounded-full font-medium'>
                                      auth
                                    </span>
                                  )}
                                </div>
                              )}
                            </CardHeader>

                            <CardContent className='relative'>
                              {/* URL display */}
                              <div className='bg-dark-100/50 rounded-lg p-2.5 mb-4 border border-border-light/20'>
                                <p className='text-xs font-mono text-primary/80 truncate'>
                                  {app.url}
                                </p>
                              </div>

                              {/* Launch button */}
                              <Button
                                variant='default'
                                size='sm'
                                className='w-full h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                                onClick={() => handleLaunchWebApp(app.url)}
                              >
                                <ExternalLink className='w-3.5 h-3.5 mr-1.5' />
                                Open in Browser
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

          {/* Status bar */}
          <div className='mt-8 p-4 glass-card rounded-lg flex items-center justify-between text-xs'>
            <div className='text-text-light/70'>
              Showing <span className='text-white/80 font-medium'>{filteredWebApps.length}</span> of{' '}
              <span className='text-white/80 font-medium'>{webApps.length}</span> applications
            </div>
            <div className='flex items-center gap-6'>
              <div className='flex items-center gap-2'>
                <span className='w-2 h-2 rounded-full bg-green-400' />
                <span className='text-text-light/70'>Online</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className='w-2 h-2 rounded-full bg-red-400' />
                <span className='text-text-light/70'>Offline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
