import { TabNavigation } from '@/app/components/tab-navigation';
import { ThemeProvider } from '@/app/components/theme-provider';
import Titlebar from '@/app/components/titlebar';
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
      <Router>
        <div className='flex flex-col h-full'>
          <Titlebar />
          <TabNavigation />
          <main className='flex-1 overflow-auto'>
            <Routes>
              <Route path='/' element={<Dashboard />} />
              <Route path='/tools' element={<ToolsDashboard />} />
              <Route path='/vms' element={<VMDashboard />} />
              <Route path='/web-apps' element={<WebApplicationsDashboard />} />
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}
