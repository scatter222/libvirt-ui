import { ToolCard } from '@/app/components/tool-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Shield, Search, Zap, Key, Fingerprint, Code, Globe, Wifi,
  Database, Network, AlertTriangle, Eye, Lock, Server
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Category {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  toolCount: number;
}

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

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  recon: Search,
  scanning: Network,
  exploitation: Zap,
  'post-exploitation': Key,
  forensics: Fingerprint,
  'reverse-engineering': Code,
  'web-security': Globe,
  wireless: Wifi,
  database: Database,
  vulnerability: Shield,
  monitoring: Eye,
  persistence: Lock,
  'lateral-movement': Server
};

const categoryColors: Record<string, string> = {
  recon: 'from-blue-500 to-blue-400',
  scanning: 'from-purple-500 to-purple-400',
  exploitation: 'from-red-500 to-red-400',
  'post-exploitation': 'from-orange-500 to-orange-400',
  forensics: 'from-cyan-500 to-cyan-400',
  'reverse-engineering': 'from-green-500 to-green-400',
  'web-security': 'from-indigo-500 to-indigo-400',
  wireless: 'from-pink-500 to-pink-400'
};

export function CategoriesDashboard () {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategoriesAndTools();
  }, []);

  const loadCategoriesAndTools = async () => {
    try {
      const [categoriesList, toolsList] = await Promise.all([
        electron.ipcRenderer.invoke('tools:categories'),
        electron.ipcRenderer.invoke('tools:list')
      ]);

      // Count tools per category
      const categoriesWithCounts = categoriesList.map((cat: any) => ({
        ...cat,
        icon: categoryIcons[cat.id] || Shield,
        color: categoryColors[cat.id] || 'from-gray-500 to-gray-400',
        toolCount: toolsList.filter((tool: any) => tool.category === cat.id).length
      }));

      setCategories(categoriesWithCounts);
      setTools(toolsList);
    } catch (error) {
      console.error('Failed to load categories and tools:', error);
      // Fallback to hardcoded categories
      setCategories([
        {
          id: 'recon',
          name: 'Reconnaissance',
          icon: Search,
          color: 'from-blue-500 to-blue-400',
          description: 'Information gathering and enumeration tools',
          toolCount: 2
        },
        {
          id: 'scanning',
          name: 'Scanning & Enumeration',
          icon: Network,
          color: 'from-purple-500 to-purple-400',
          description: 'Network and service discovery tools',
          toolCount: 1
        },
        {
          id: 'exploitation',
          name: 'Exploitation',
          icon: Zap,
          color: 'from-red-500 to-red-400',
          description: 'Vulnerability exploitation frameworks and tools',
          toolCount: 5
        },
        {
          id: 'post-exploitation',
          name: 'Post-Exploitation',
          icon: Key,
          color: 'from-orange-500 to-orange-400',
          description: 'Persistence, privilege escalation, and lateral movement',
          toolCount: 0
        },
        {
          id: 'forensics',
          name: 'Digital Forensics',
          icon: Fingerprint,
          color: 'from-cyan-500 to-cyan-400',
          description: 'Evidence collection and analysis tools',
          toolCount: 2
        },
        {
          id: 'reverse-engineering',
          name: 'Reverse Engineering',
          icon: Code,
          color: 'from-green-500 to-green-400',
          description: 'Binary analysis and reverse engineering tools',
          toolCount: 2
        },
        {
          id: 'web-security',
          name: 'Web Security',
          icon: Globe,
          color: 'from-indigo-500 to-indigo-400',
          description: 'Web application security testing tools',
          toolCount: 3
        },
        {
          id: 'wireless',
          name: 'Wireless Security',
          icon: Wifi,
          color: 'from-pink-500 to-pink-400',
          description: 'Wireless network security tools',
          toolCount: 1
        }
      ]);
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchTool = async (toolId: string) => {
    try {
      await electron.ipcRenderer.invoke('tools:launch', toolId);
    } catch (error) {
      console.error('Failed to launch tool:', error);
    }
  };

  const handleViewDocs = async (toolId: string) => {
    console.log('View docs for:', toolId);
  };

  // Filter tools based on selected category and search query
  const filteredTools = tools.filter((tool) => {
    if (selectedCategory && tool.category !== selectedCategory) return false;

    if (searchQuery) {
      const matchesSearch =
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Shield className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading categories...</p>
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
              Tool Categories
            </h1>
            <p className='text-sm text-text-light/70 mt-2'>
              Browse security tools organized by category
            </p>
          </div>

          {/* Categories Grid */}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8'>
            {categories.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategory === category.id;

              return (
                <Card
                  key={category.id}
                  className={`
                    relative overflow-hidden cursor-pointer transition-all animate-slide-up
                    ${isSelected
                      ? 'glass-card-active ring-2 ring-primary shadow-lg shadow-primary/20'
                      : 'glass-card glass-card-hover'
                    }
                  `}
                  onClick={() => setSelectedCategory(isSelected ? null : category.id)}
                >
                  {/* Gradient background */}
                  <div className={`
                    absolute inset-0 bg-gradient-to-br ${category.color} opacity-10
                    ${isSelected ? 'opacity-20' : ''}
                  `}
                  />

                  <CardHeader className='relative pb-3'>
                    <div className='flex items-center justify-between mb-2'>
                      <div className={`
                        p-2 rounded-lg transition-colors
                        ${isSelected
                          ? 'bg-primary/30'
                          : 'bg-primary/10 group-hover:bg-primary/20'
                        }
                      `}
                      >
                        <Icon className='w-6 h-6 text-primary' />
                      </div>
                      <span className='text-xl font-bold text-white/90'>
                        {category.toolCount}
                      </span>
                    </div>
                    <CardTitle className='text-sm font-semibold text-white/95'>
                      {category.name}
                    </CardTitle>
                    <CardDescription className='text-xs text-text-light/70 line-clamp-2'>
                      {category.description}
                    </CardDescription>
                  </CardHeader>

                  {isSelected && (
                    <div className='absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-blue-selected' />
                  )}
                </Card>
              );
            })}
          </div>

          {/* Selected Category Info */}
          {selectedCategory && (
            <Card className='glass-card mb-6 animate-fade-in'>
              <CardHeader className='pb-3'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    {(() => {
                      const category = categories.find((c) => c.id === selectedCategory);
                      const Icon = category?.icon || Shield;
                      return (
                        <>
                          <div className='p-2 bg-primary/10 rounded-lg'>
                            <Icon className='w-5 h-5 text-primary' />
                          </div>
                          <div>
                            <CardTitle className='text-lg font-semibold text-white/95'>
                              {category?.name}
                            </CardTitle>
                            <CardDescription className='text-xs text-text-light/70'>
                              {category?.toolCount} tools in this category
                            </CardDescription>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className='text-sm text-primary/80 hover:text-primary transition-colors'
                  >
                    Clear filter ×
                  </button>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Search Bar */}
          {selectedCategory && (
            <div className='relative mb-6 animate-fade-in'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light/40' />
              <input
                type='text'
                placeholder={`Search within ${categories.find((c) => c.id === selectedCategory)?.name || 'category'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full pl-10 pr-4 py-2.5 bg-dark-300/50 border border-border-light/20 rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all'
              />
            </div>
          )}

          {/* Tools Grid */}
          {selectedCategory && (
            <>
              {filteredTools.length === 0
                ? (
                  <div className='flex flex-col items-center justify-center py-24 px-8 glass-card rounded-xl animate-slide-up'>
                    <AlertTriangle className='w-20 h-20 text-primary/60 mb-6' />
                    <h2 className='text-2xl font-semibold mb-3 text-white/90'>No Tools Found</h2>
                    <p className='text-sm text-text-light/60 text-center max-w-md'>
                      {searchQuery
                        ? `No tools match your search "${searchQuery}" in this category`
                        : 'No tools available in this category'}
                    </p>
                  </div>
                  )
                : (
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 animate-fade-in'>
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
                        onLaunch={handleLaunchTool}
                        onViewDocs={handleViewDocs}
                      />
                    ))}
                  </div>
                  )}
            </>
          )}

          {/* Category Statistics */}
          {!selectedCategory && (
            <Card className='glass-card mt-8 animate-slide-up'>
              <CardHeader>
                <CardTitle className='text-lg font-semibold text-white/95'>
                  Category Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {categories
                    .sort((a, b) => b.toolCount - a.toolCount)
                    .slice(0, 5)
                    .map((category) => {
                      const Icon = category.icon;
                      const maxCount = Math.max(...categories.map((c) => c.toolCount));
                      const percentage = (category.toolCount / maxCount) * 100;

                      return (
                        <div key={category.id} className='flex items-center gap-3'>
                          <Icon className='w-4 h-4 text-primary/60 flex-shrink-0' />
                          <div className='flex-1'>
                            <div className='flex items-center justify-between mb-1'>
                              <span className='text-sm text-text-light/80'>{category.name}</span>
                              <span className='text-sm font-medium text-white/90'>{category.toolCount}</span>
                            </div>
                            <div className='w-full bg-dark-300/50 rounded-full h-1.5'>
                              <div
                                className={`bg-gradient-to-r ${category.color} h-1.5 rounded-full transition-all`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
