import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { MainLayout, PortalLayout } from './components/layout';
import { GatewayLoginPage, LoginPage, RegisterPage } from './pages';
import { ROUTER_BASENAME } from './lib/base-path';
import { lazyWithRetry } from './lib/lazyWithRetry';

import './App.css';

// Route-level code splitting - lazy load pages for smaller initial bundle
const DashboardPage = lazy(() => lazyWithRetry(() => import('./pages/DashboardPage'), 'dashboard-page'));
const ProjectsPage = lazy(() => lazyWithRetry(() => import('./pages/ProjectsPage'), 'projects-page'));
const ProjectDetailPage = lazy(() => lazyWithRetry(
  () => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })),
  'project-detail-page',
));
const WorkLogsPage = lazy(() => lazyWithRetry(
  () => import('./pages/WorkLogsPage').then(m => ({ default: m.WorkLogsPage })),
  'worklogs-page',
));
const WorkLogTablePage = lazy(() => lazyWithRetry(
  () => import('./pages/WorkLogTablePage').then(m => ({ default: m.WorkLogTablePage })),
  'worklog-table-page',
));
const ResourcePlansPage = lazy(() => lazyWithRetry(
  () => import('./pages/ResourcePlansPage').then(m => ({ default: m.ResourcePlansPage })),
  'resource-plans-page',
));
const ResourceMatrixPage = lazy(() => lazyWithRetry(
  () => import('./pages/ResourceMatrixPage').then(m => ({ default: m.ResourceMatrixPage })),
  'resource-matrix-page',
));
const OrganizationPage = lazy(() => lazyWithRetry(
  () => import('./pages/OrganizationPage').then(m => ({ default: m.OrganizationPage })),
  'organization-page',
));
const ReportsPage = lazy(() => lazyWithRetry(
  () => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })),
  'reports-page',
));
const WeeklyReportHierarchyPage = lazy(() => lazyWithRetry(
  () => import('./pages/WeeklyReportHierarchyPage'),
  'weekly-report-hierarchy-page',
));
const RequestBoardPage = lazy(() => lazyWithRetry(
  () => import('./pages/RequestBoardPage').then(m => ({ default: m.RequestBoardPage })),
  'request-board-page',
));
const ProfilePage = lazy(() => lazyWithRetry(
  () => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })),
  'profile-page',
));
const UpdatesPage = lazy(() => lazyWithRetry(
  () => import('./pages/UpdatesPage').then(m => ({ default: m.UpdatesPage })),
  'updates-page',
));
const IntroductionPage = lazy(() => lazyWithRetry(() => import('./pages/IntroductionPage'), 'introduction-page'));
const PortalStatsPage = lazy(() => lazyWithRetry(() => import('./pages/PortalStatsPage'), 'portal-stats-page'));
const TeamCapacityPage = lazy(() => lazyWithRetry(() => import('./pages/TeamCapacityPage'), 'team-capacity-page'));

const EXTERNAL_PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://pcas-portal.atlascopco.group';

// Loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

function ExternalPortalRedirect() {
  useEffect(() => {
    window.location.replace(EXTERNAL_PORTAL_URL);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <a className="text-sm text-blue-600 underline" href={EXTERNAL_PORTAL_URL}>
        Redirecting to PCAS Portal...
      </a>
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router basename={ROUTER_BASENAME}>
      <Routes>
        {isAuthenticated ? (
          <>
            <Route path="/auth/gateway" element={<GatewayLoginPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/portal" element={<ExternalPortalRedirect />} />

            {/* Portal stats — legacy internal admin page */}
            <Route element={<PortalLayout />}>
              <Route path="/portal/stats" element={<Suspense fallback={<PageLoader />}><PortalStatsPage /></Suspense>} />
            </Route>

            {/* EOB app — full layout with sidebar */}
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              <Route path="/projects" element={<Suspense fallback={<PageLoader />}><ProjectsPage /></Suspense>} />
              <Route path="/projects/:id" element={<Suspense fallback={<PageLoader />}><ProjectDetailPage /></Suspense>} />
              <Route path="/worklogs" element={<Suspense fallback={<PageLoader />}><WorkLogsPage /></Suspense>} />
              <Route path="/worklogs-table" element={<Suspense fallback={<PageLoader />}><WorkLogTablePage /></Suspense>} />
              <Route path="/resource-plans" element={<Suspense fallback={<PageLoader />}><ResourcePlansPage /></Suspense>} />
              <Route path="/resource-matrix" element={<Suspense fallback={<PageLoader />}><ResourceMatrixPage /></Suspense>} />
              <Route path="/organization" element={<Suspense fallback={<PageLoader />}><OrganizationPage /></Suspense>} />
              <Route path="/reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
              <Route path="/reports/weekly" element={<Suspense fallback={<PageLoader />}><WeeklyReportHierarchyPage /></Suspense>} />
              <Route path="/team-capacity" element={<Suspense fallback={<PageLoader />}><TeamCapacityPage /></Suspense>} />
              <Route path="/requests" element={<Suspense fallback={<PageLoader />}><RequestBoardPage /></Suspense>} />
              <Route path="/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
              <Route path="/updates" element={<Suspense fallback={<PageLoader />}><UpdatesPage /></Suspense>} />
              <Route path="/introduction" element={<Suspense fallback={<PageLoader />}><IntroductionPage /></Suspense>} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Route>
          </>
        ) : (
          <>
            <Route path="/" element={<Navigate to="/introduction" replace />} />
            <Route path="/auth/gateway" element={<GatewayLoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="*" element={<Navigate to="/introduction" />} />
          </>
        )}

        {/* Public — accessible without login */}
        <Route path="/introduction" element={<Suspense fallback={<PageLoader />}><IntroductionPage /></Suspense>} />
      </Routes>
    </Router>
  );
}

export default App;
