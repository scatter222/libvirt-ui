import { ToolCard } from '@/app/components/tool-card';
import { Button } from '@/app/components/ui/button';

import { RefreshCw, Search, Filter, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Tool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  launch: {
    type: 'terminal' | 'gui';
    command: string;
    requiresSudo: boolean;
  };
  documentation: {
    quickStart: string;
    examples: Array<{
      description: string;
      command: string;
    }>;
  };
}

export function ToolsDashboard () {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, _setSelectedCategory] = useState<string>('all');

  const loadTools = async () => {
    try {
      setRefreshing(true);
      const toolsList = await electron.ipcRenderer.invoke('tools:list');
      setTools(toolsList);
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

  const handleLaunch = async (toolId: string) => {
    try {
      await electron.ipcRenderer.invoke('tools:launch', toolId);
    } catch (error) {
      console.error('Failed to launch tool:', error);
      // You might want to show a toast notification here
    }
  };

  const handleViewDocs = async (toolId: string) => {
    try {
      const tool = tools.find((t) => t.id === toolId);
      if (tool) {
        // Open external documentation if available
        // For now, we'll just log it
        console.log('View docs for:', tool.name);
      }
    } catch (error) {
      console.error('Failed to open documentation:', error);
    }
  };

  // Filter tools based on search and category
  const filteredTools = tools.filter((tool) => {
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;

    return matchesSearch && matchesCategory;
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
                  {tools.length} tools available for security operations
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

            {/* Search and Filter Bar */}
            <div className='flex gap-4'>
              <div className='flex-1 relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light/40' />
                <input
                  type='text'
                  placeholder='Search tools by name, description, or tags...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='w-full pl-10 pr-4 py-2.5 bg-dark-300/50 border border-border-light/20 rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all'
                />
              </div>
              <Button
                variant='outline'
                className='gap-2 border-border-light/50 hover:bg-dark-300/50 hover:border-primary/50'
              >
                <Filter className='w-4 h-4' />
                Filters
              </Button>
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
                    : 'No tools available in this category'}
                </p>
              </div>
              )
            : (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-animation'>
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    id={tool.id}
                    name={tool.name}
                    displayName={tool.displayName}
                    description={tool.description}
                    category={tool.category}
                    tags={tool.tags}
                    requiresSudo={tool.launch.requiresSudo}
                    launchType={tool.launch.type}
                    quickStart={tool.documentation.quickStart}
                    onLaunch={handleLaunch}
                    onViewDocs={handleViewDocs}
                  />
                ))}
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
