import { ToolCard } from '@/app/components/tool-card';
import { Button } from '@/app/components/ui/button';

import { RefreshCw, Search, Terminal, Server } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Tool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  system: string;
  category: string;
  interface: 'cli' | 'gui';
  isDefault?: boolean;
  requiresSudo?: boolean;
  tags: string[];
  documentation: {
    quickStart: string;
    examples: Array<{
      description: string;
      command: string;
    }>;
  };
}

interface System {
  id: string;
  name: string;
  os: string;
  color: string;
  icon: string;
  description: string;
}

export function ToolsDashboard () {
  const [tools, setTools] = useState<Tool[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, _setSelectedCategory] = useState<string>('all');
  const [selectedSystem, setSelectedSystem] = useState<string>('all');

  const loadTools = async () => {
    try {
      setRefreshing(true);
      const [toolsList, systemsList] = await Promise.all([
        electron.ipcRenderer.invoke('tools:list'),
        electron.ipcRenderer.invoke('tools:systems')
      ]);
      setTools(toolsList);
      setSystems(systemsList);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const systemsById = new Map(systems.map((s) => [s.id, s]));

  // Filter tools based on search, category and system
  const filteredTools = tools.filter((tool) => {
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSystem = selectedSystem === 'all' || tool.system === selectedSystem;

    return matchesSearch && matchesCategory && matchesSystem;
  });

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Terminal className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading security tools...</p>
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
          {/* Header with search and filters */}
          <div className='mb-8 animate-fade-in'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h1 className='text-3xl font-bold tracking-tight text-white/95 bg-gradient-to-r from-white to-text-light bg-clip-text text-transparent'>
                  Security Tools Arsenal
                </h1>
                <p className='text-sm text-text-light/70 mt-2'>
                  {tools.length} tools across {systems.length} systems — explore what's available in the lab
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={loadTools}
                disabled={refreshing}
                className='gap-2 border-border-light/50 hover:bg-dark-300/50 hover:border-primary/50 transition-all'
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Search Bar */}
            <div className='relative mb-4'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light/40' />
              <input
                type='text'
                placeholder='Search tools by name, description, or tags...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full pl-10 pr-4 py-2.5 bg-dark-300/50 border border-border-light/20 rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all'
              />
            </div>

            {/* System filter chips */}
            <div className='flex flex-wrap items-center gap-2'>
              <span className='flex items-center gap-1.5 text-xs text-text-light/50 mr-1'>
                <Server className='w-3.5 h-3.5' /> System:
              </span>
              <button
                onClick={() => setSelectedSystem('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  selectedSystem === 'all'
                    ? 'bg-primary/20 text-primary border-primary/50'
                    : 'bg-dark-300/50 text-text-light/70 border-border-light/20 hover:border-primary/40'
                }`}
              >
                All ({tools.length})
              </button>
              {systems.map((system) => {
                const count = tools.filter((t) => t.system === system.id).length;
                const isActive = selectedSystem === system.id;
                return (
                  <button
                    key={system.id}
                    onClick={() => setSelectedSystem(isActive ? 'all' : system.id)}
                    title={`${system.name} · ${system.os}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      isActive
                        ? 'bg-primary/20 text-primary border-primary/50'
                        : 'bg-dark-300/50 text-text-light/70 border-border-light/20 hover:border-primary/40'
                    }`}
                  >
                    {system.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tools Grid */}
          {filteredTools.length === 0
            ? (
              <div className='flex flex-col items-center justify-center py-24 px-8 glass-card rounded-xl animate-slide-up'>
                <Terminal className='w-20 h-20 text-primary/60 mb-6' />
                <h2 className='text-2xl font-semibold mb-3 text-white/90'>No Tools Found</h2>
                <p className='text-sm text-text-light/60 text-center max-w-md'>
                  {searchQuery
                    ? `No tools match your search "${searchQuery}"`
                    : 'No tools available for this filter'}
                </p>
              </div>
              )
            : (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-animation'>
                {filteredTools.map((tool) => {
                  const system = systemsById.get(tool.system);
                  return (
                    <ToolCard
                      key={tool.id}
                      id={tool.id}
                      name={tool.name}
                      displayName={tool.displayName}
                      description={tool.description}
                      category={tool.category}
                      tags={tool.tags}
                      requiresSudo={tool.requiresSudo}
                      interface={tool.interface}
                      isDefault={tool.isDefault}
                      quickStart={tool.documentation.quickStart}
                      systemId={tool.system}
                      systemName={system?.name}
                      systemOs={system?.os}
                      systemColor={system?.color}
                    />
                  );
                })}
              </div>
              )}

          {/* Status bar */}
          <div className='mt-8 p-4 glass-card rounded-lg flex items-center justify-between text-xs'>
            <div className='text-text-light/70'>
              Showing <span className='text-white/80 font-medium'>{filteredTools.length}</span> of{' '}
              <span className='text-white/80 font-medium'>{tools.length}</span> tools
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
