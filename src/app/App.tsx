import { TabNavigation } from '@/app/components/tab-navigation';
import { ThemeProvider } from '@/app/components/theme-provider';
import Titlebar from '@/app/components/titlebar';
import { AppModeProvider } from '@/app/context/app-mode-provider';
import { FeatureRoute } from '@/app/context/feature-route';
import { useRendererListener } from '@/app/hooks';
import { Dashboard } from '@/app/screens/dashboard';
import { ToolsDashboard } from '@/app/screens/tools-dashboard';
import { VMDashboard } from '@/app/screens/vm-dashboard';
import { WebApplicationsDashboard } from '@/app/screens/web-applications-dashboard';
import { MenuChannels } from '@/channels/menuChannels';

import { Route, HashRouter as Router, Routes, Navigate } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

export default function App () {
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  return (
    <ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
      <AppModeProvider>
        <Router>
          <div className='flex flex-col h-full'>
            <Titlebar />
            <TabNavigation />
            <main className='flex-1 overflow-auto'>
              <Routes>
                <Route path='/' element={<Dashboard />} />
                <Route
                  path='/tools'
                  element={<FeatureRoute name='tools'><ToolsDashboard /></FeatureRoute>}
                />
                <Route
                  path='/vms'
                  element={<FeatureRoute name='vms'><VMDashboard /></FeatureRoute>}
                />
                <Route
                  path='/web-apps'
                  element={<FeatureRoute name='webApps'><WebApplicationsDashboard /></FeatureRoute>}
                />
                <Route path='*' element={<Navigate to='/' replace />} />
              </Routes>
            </main>
          </div>
        </Router>
      </AppModeProvider>
    </ThemeProvider>
  );
}
