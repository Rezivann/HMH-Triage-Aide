import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

const HomeApp = lazy(() => import('./modes/home/HomeApp'));
const NotFoundApp = lazy(() => import('./modes/home/NotFoundApp'));
const KioskApp = lazy(() => import('./modes/kiosk/KioskApp'));
const MobileCaptureApp = lazy(() => import('./modes/kiosk/MobileCaptureApp'));
const DashboardApp = lazy(() => import('./modes/dashboard/DashboardApp'));
const TrackApp = lazy(() => import('./modes/track/TrackApp'));

function withSuspense(Component) {
  return (
    <Suspense
      fallback={
        <div className="shell">
          <p>Loading...</p>
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: withSuspense(HomeApp) },
  { path: '/kiosk', element: withSuspense(KioskApp) },
  { path: '/kiosk-photo/:photoToken', element: withSuspense(MobileCaptureApp) },
  { path: '/dashboard/*', element: withSuspense(DashboardApp) },
  { path: '/track/:sessionToken', element: withSuspense(TrackApp) },
  { path: '*', element: withSuspense(NotFoundApp) },
]);
