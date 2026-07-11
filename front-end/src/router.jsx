import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

const KioskApp = lazy(() => import('./modes/kiosk/KioskApp'));
const DashboardApp = lazy(() => import('./modes/dashboard/DashboardApp'));
const TrackApp = lazy(() => import('./modes/track/TrackApp'));

function withSuspense(Component) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <div>LLMTriage - go to /kiosk, /dashboard, or /track/:sessionToken</div> },
  { path: '/kiosk', element: withSuspense(KioskApp) },
  { path: '/dashboard/*', element: withSuspense(DashboardApp) },
  { path: '/track/:sessionToken', element: withSuspense(TrackApp) },
]);
