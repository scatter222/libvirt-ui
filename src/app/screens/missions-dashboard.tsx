import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

import {
  Target, Shield, Bug, Users, Globe, Zap, Search, Lock, Clock,
  AlertTriangle, Activity, Eye, Fingerprint, Network, Brain
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Mission {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  categories: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  toolCount: number;
  tools?: Array<{
    id: string;
    name: string;
    category: string;
  }>;
}

const missionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'bug-bounty': Bug,
  'red-team': Target,
  'incident-response': AlertTriangle,
  'malware-analysis': Brain,
  'network-recon': Network,
  'web-assessment': Globe,
  forensics: Fingerprint,
  'vulnerability-scan': Shield
};

export function MissionsDashboard () {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);

  useEffect(() => {
    loadMissions();
  }, []);

  const loadMissions = async () => {
    try {
      // Try to load from config
      const missionsList = await electron.ipcRenderer.invoke('tools:missions');
      const toolsList = await electron.ipcRenderer.invoke('tools:list');

      // Enhance missions with tool counts and details
      const enhancedMissions = missionsList.map((mission: Record<string, unknown>) => {
        const missionTools = toolsList.filter((tool: Record<string, unknown>) => (mission.categories as string[]).includes(tool.category as string));

        return {
          ...mission,
          icon: missionIcons[mission.id as string] || Target,
          toolCount: missionTools.length,
          tools: missionTools.slice(0, 5), // Show first 5 tools
          difficulty: getDifficulty(mission.id as string),
          estimatedTime: getEstimatedTime(mission.id as string)
        };
      });

      setMissions(enhancedMissions);
    } catch (error) {
      console.error('Failed to load missions:', error);
      // Fallback to hardcoded missions
      setMissions([
        {
          id: 'bug-bounty',
          name: 'Bug Bounty Hunting',
          description: 'Complete toolkit for web vulnerability discovery and exploitation',
          icon: Bug,
          categories: [
            'recon',
            'web-security',
            'scanning'
          ],
          difficulty: 'intermediate',
          estimatedTime: '2-4 hours',
          toolCount: 8,
          tools: [
            { id: 'nmap', name: 'Nmap', category: 'scanning' },
            { id: 'gobuster', name: 'Gobuster', category: 'recon' },
            { id: 'burpsuite', name: 'Burp Suite', category: 'web-security' },
            { id: 'sqlmap', name: 'SQLMap', category: 'web-security' },
            { id: 'nikto', name: 'Nikto', category: 'web-security' }
          ]
        },
        {
          id: 'red-team',
          name: 'Red Team Operations',
          description: 'Full offensive security toolkit for penetration testing',
          icon: Target,
          categories: [
            'recon',
            'scanning',
            'exploitation',
            'post-exploitation'
          ],
          difficulty: 'advanced',
          estimatedTime: '4-8 hours',
          toolCount: 12,
          tools: [
            { id: 'metasploit', name: 'Metasploit', category: 'exploitation' },
            { id: 'nmap', name: 'Nmap', category: 'scanning' },
            { id: 'hydra', name: 'Hydra', category: 'exploitation' },
            { id: 'john', name: 'John the Ripper', category: 'exploitation' },
            { id: 'hashcat', name: 'Hashcat', category: 'exploitation' }
          ]
        },
        {
          id: 'incident-response',
          name: 'Incident Response',
          description: 'Tools for investigating and responding to security incidents',
          icon: AlertTriangle,
          categories: ['forensics', 'scanning'],
          difficulty: 'intermediate',
          estimatedTime: '3-6 hours',
          toolCount: 6,
          tools: [
            { id: 'wireshark', name: 'Wireshark', category: 'forensics' },
            { id: 'volatility', name: 'Volatility', category: 'forensics' },
            { id: 'nmap', name: 'Nmap', category: 'scanning' }
          ]
        },
        {
          id: 'malware-analysis',
          name: 'Malware Analysis',
          description: 'Static and dynamic malware analysis toolkit',
          icon: Brain,
          categories: ['reverse-engineering', 'forensics'],
          difficulty: 'advanced',
          estimatedTime: '6-12 hours',
          toolCount: 5,
          tools: [
            { id: 'ghidra', name: 'Ghidra', category: 'reverse-engineering' },
            { id: 'radare2', name: 'Radare2', category: 'reverse-engineering' },
            { id: 'volatility', name: 'Volatility', category: 'forensics' }
          ]
        },
        {
          id: 'network-recon',
          name: 'Network Reconnaissance',
          description: 'Network discovery and enumeration mission',
          icon: Network,
          categories: ['recon', 'scanning'],
          difficulty: 'beginner',
          estimatedTime: '1-2 hours',
          toolCount: 4,
          tools: [
            { id: 'nmap', name: 'Nmap', category: 'scanning' },
            { id: 'gobuster', name: 'Gobuster', category: 'recon' }
          ]
        },
        {
          id: 'web-assessment',
          name: 'Web Application Assessment',
          description: 'Comprehensive web application security testing',
          icon: Globe,
          categories: ['web-security', 'scanning'],
          difficulty: 'intermediate',
          estimatedTime: '3-5 hours',
          toolCount: 7,
          tools: [
            { id: 'burpsuite', name: 'Burp Suite', category: 'web-security' },
            { id: 'sqlmap', name: 'SQLMap', category: 'web-security' },
            { id: 'nikto', name: 'Nikto', category: 'web-security' }
          ]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getDifficulty = (missionId: string): 'beginner' | 'intermediate' | 'advanced' => {
    const difficulties: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
      'network-recon': 'beginner',
      'bug-bounty': 'intermediate',
      'web-assessment': 'intermediate',
      'incident-response': 'intermediate',
      'red-team': 'advanced',
      'malware-analysis': 'advanced'
    };
    return difficulties[missionId] || 'intermediate';
  };

  const getEstimatedTime = (missionId: string): string => {
    const times: Record<string, string> = {
      'network-recon': '1-2 hours',
      'bug-bounty': '2-4 hours',
      'web-assessment': '3-5 hours',
      'incident-response': '3-6 hours',
      'red-team': '4-8 hours',
      'malware-analysis': '6-12 hours'
    };
    return times[missionId] || '2-4 hours';
  };

  const handleLaunchMission = async (missionId: string) => {
    try {
      // Get all tools for this mission
      const missionTools = await electron.ipcRenderer.invoke('tools:by-mission', missionId);
      console.log(`Launching mission ${missionId} with ${missionTools.length} tools`);
      // Here you could open a new window or navigate to a mission-specific view
    } catch (error) {
      console.error('Failed to launch mission:', error);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'intermediate':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'advanced':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-blue-selected/20 text-blue-selected border-blue-selected/30';
    }
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full bg-dark-100'>
        <div className='text-center space-y-6 animate-fade-in'>
          <div className='relative'>
            <div className='absolute -inset-8 bg-primary/20 rounded-full blur-3xl animate-pulse' />
            <Target className='w-16 h-16 text-primary mx-auto animate-float relative' />
          </div>
          <p className='text-text-light/80 text-lg'>Loading missions...</p>
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
              Mission Control
            </h1>
            <p className='text-sm text-text-light/70 mt-2'>
              Pre-configured tool sets for specific security operations
            </p>
          </div>

          {/* Quick Stats */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8'>
            <Card className='glass-card animate-slide-up'>
              <CardContent className='p-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-xs text-text-light/60 mb-1'>Total Missions</p>
                    <p className='text-2xl font-bold text-white/90'>{missions.length}</p>
                  </div>
                  <Target className='w-8 h-8 text-primary/60' />
                </div>
              </CardContent>
            </Card>

            <Card className='glass-card animate-slide-up'>
              <CardContent className='p-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-xs text-text-light/60 mb-1'>Available Tools</p>
                    <p className='text-2xl font-bold text-white/90'>
                      {missions.reduce((acc, m) => acc + m.toolCount, 0)}
                    </p>
                  </div>
                  <Zap className='w-8 h-8 text-yellow-400/60' />
                </div>
              </CardContent>
            </Card>

            <Card className='glass-card animate-slide-up'>
              <CardContent className='p-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-xs text-text-light/60 mb-1'>Active Mission</p>
                    <p className='text-2xl font-bold text-white/90'>None</p>
                  </div>
                  <Activity className='w-8 h-8 text-green-400/60' />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Missions Grid */}
          <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6'>
            {missions.map((mission) => {
              const Icon = mission.icon;
              const isExpanded = expandedMission === mission.id;

              return (
                <Card
                  key={mission.id}
                  className='relative overflow-hidden glass-card glass-card-hover group animate-slide-up'
                >
                  {/* Gradient glow effect on hover */}
                  <div className='absolute -inset-2 bg-gradient-to-tr from-primary/20 to-transparent rounded-xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500' />

                  <CardHeader className='relative'>
                    <div className='flex items-start justify-between mb-3'>
                      <div className='p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors'>
                        <Icon className='w-8 h-8 text-primary' />
                      </div>
                      <span className={`
                        text-xs px-2 py-1 rounded-full font-medium border
                        ${getDifficultyColor(mission.difficulty)}
                      `}
                      >
                        {mission.difficulty}
                      </span>
                    </div>
                    <CardTitle className='text-xl font-semibold text-white/95'>
                      {mission.name}
                    </CardTitle>
                    <CardDescription className='text-sm text-text-light/80 mt-2'>
                      {mission.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className='relative'>
                    {/* Mission Stats */}
                    <div className='flex items-center gap-4 mb-4 text-xs'>
                      <div className='flex items-center gap-1.5'>
                        <Search className='w-3.5 h-3.5 text-text-light/60' />
                        <span className='text-text-light/70'>{mission.toolCount} tools</span>
                      </div>
                      <div className='flex items-center gap-1.5'>
                        <Clock className='w-3.5 h-3.5 text-text-light/60' />
                        <span className='text-text-light/70'>{mission.estimatedTime}</span>
                      </div>
                    </div>

                    {/* Tool Preview */}
                    {mission.tools && mission.tools.length > 0 && (
                      <div className='mb-4'>
                        <button
                          onClick={() => setExpandedMission(isExpanded ? null : mission.id)}
                          className='text-xs text-primary/80 hover:text-primary transition-colors mb-2'
                        >
                          {isExpanded ? 'Hide' : 'Show'} included tools →
                        </button>
                        {isExpanded && (
                          <div className='bg-dark-100/50 rounded-lg p-3 border border-border-light/20 animate-fade-in'>
                            <div className='space-y-1'>
                              {mission.tools.map((tool) => (
                                <div key={tool.id} className='flex items-center gap-2'>
                                  <span className='w-1.5 h-1.5 bg-primary/60 rounded-full' />
                                  <span className='text-xs text-text-light/80'>{tool.name}</span>
                                  <span className='text-xs text-text-light/50'>({tool.category})</span>
                                </div>
                              ))}
                              {mission.toolCount > 5 && (
                                <p className='text-xs text-text-light/60 pt-1'>
                                  +{mission.toolCount - 5} more tools...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className='flex gap-2'>
                      <Button
                        variant='default'
                        size='sm'
                        className='flex-1 h-9 bg-primary hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20'
                        onClick={() => handleLaunchMission(mission.id)}
                      >
                        <Zap className='w-3.5 h-3.5 mr-1.5' />
                        Launch Mission
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-9 px-3 border-border-light/50 hover:bg-secondary/50 hover:border-primary/50'
                        title='View Details'
                      >
                        <Eye className='w-4 h-4' />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Mission Tips */}
          <Card className='glass-card mt-8 animate-slide-up'>
            <CardHeader>
              <CardTitle className='text-lg font-semibold text-white/95'>
                Mission Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div className='flex gap-3'>
                  <Shield className='w-5 h-5 text-green-400 flex-shrink-0 mt-0.5' />
                  <div>
                    <p className='text-sm font-medium text-white/90'>Start Simple</p>
                    <p className='text-xs text-text-light/70 mt-1'>
                      Begin with beginner missions to familiarize yourself with the tools
                    </p>
                  </div>
                </div>
                <div className='flex gap-3'>
                  <Lock className='w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5' />
                  <div>
                    <p className='text-sm font-medium text-white/90'>Use Safely</p>
                    <p className='text-xs text-text-light/70 mt-1'>
                      Always use these tools in authorized environments only
                    </p>
                  </div>
                </div>
                <div className='flex gap-3'>
                  <Users className='w-5 h-5 text-primary flex-shrink-0 mt-0.5' />
                  <div>
                    <p className='text-sm font-medium text-white/90'>Learn & Share</p>
                    <p className='text-xs text-text-light/70 mt-1'>
                      Document findings and share knowledge with your team
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
