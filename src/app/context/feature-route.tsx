import { useFeature } from '@/app/context/app-mode-provider';
import type { FeatureId } from '@/modes/features';

import { Navigate } from 'react-router-dom';

/**
 * Route guard: sends the user back to the dashboard when the deployment mode
 * has turned this area off, so an old hash URL cannot land on a disabled screen.
 */
export function FeatureRoute ({ name, children }: { name: FeatureId; children: React.ReactNode }) {
  return useFeature(name) ? <>{children}</> : <Navigate to='/' replace />;
}
