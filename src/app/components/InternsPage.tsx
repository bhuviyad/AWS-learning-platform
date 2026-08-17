import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, RefreshCw, ShieldAlert, Users, FlaskConical, BookOpenCheck } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { isAdminEmail } from '../lib/admin';
import { fetchAdminDashboard, type DashboardData } from '../lib/adminDashboardApi';
import type { AppUserIdentity } from '../lib/internProfiles';
import DashboardOverview from './admin/DashboardOverview';
import SessionsTable from './admin/SessionsTable';
import ProgressDashboard from './admin/ProgressDashboard';
import ProfileManagement from './admin/ProfileManagement';

interface InternsPageProps {
  currentUser: AppUserIdentity;
}

function formatIst(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export default function InternsPage({ currentUser }: InternsPageProps) {
  const adminAllowed = isAdminEmail(currentUser.email);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(adminAllowed);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadDashboard = useCallback(async (background = false) => {
    if (!adminAllowed) return;

    if (background) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');

    try {
      const next = await fetchAdminDashboard(currentUser.email);
      setDashboard(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the admin dashboard.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [adminAllowed, currentUser.email]);

  useEffect(() => {
    if (!adminAllowed) return;
    void loadDashboard();
    const interval = window.setInterval(() => void loadDashboard(true), 30_000);
    return () => window.clearInterval(interval);
  }, [adminAllowed, loadDashboard]);

  if (!adminAllowed) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-600" />
            Admin only
          </CardTitle>
          <CardDescription>This dashboard is restricted to the configured admin account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>Intern sessions, progress, presence, and identity management are hidden from regular interns.</p>
          <p>If you should have access, sign in with the email configured in <span className="font-mono">VITE_ADMIN_EMAIL</span>.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Admin operations</h1>
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Admin only</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Monitor platform presence, AWS lab sessions, cleanup health, learning progress, and identity assignments.
          </p>
          {dashboard && (
            <p className="mt-1 text-xs text-slate-500">Last updated {formatIst(dashboard.generatedAt)} IST · Auto-refreshes every 30 seconds</p>
          )}
        </div>
        <Button variant="outline" onClick={() => void loadDashboard(true)} disabled={isLoading || isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Dashboard data could not be loaded.</p>
          <p className="mt-1">{errorMessage}</p>
          <p className="mt-2 text-xs">Check the Render backend environment variables <span className="font-mono">ADMIN_EMAIL</span>, <span className="font-mono">SUPABASE_URL</span>, and <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>.</p>
        </div>
      )}

      {isLoading && !dashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index}><CardContent className="h-32 animate-pulse bg-slate-50" /></Card>
          ))}
        </div>
      ) : dashboard ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="sessions"><FlaskConical className="h-4 w-4" />Sessions</TabsTrigger>
            <TabsTrigger value="progress"><BookOpenCheck className="h-4 w-4" />Progress</TabsTrigger>
            <TabsTrigger value="profiles"><Users className="h-4 w-4" />Profiles</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <DashboardOverview data={dashboard} />
          </TabsContent>

          <TabsContent value="sessions">
            <SessionsTable sessions={dashboard.sessions} />
          </TabsContent>

          <TabsContent value="progress">
            <ProgressDashboard rows={dashboard.progress} />
          </TabsContent>

          <TabsContent value="profiles">
            <ProfileManagement currentUser={currentUser} />
          </TabsContent>
        </Tabs>
      ) : !errorMessage ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">No dashboard data is available yet.</CardContent>
        </Card>
      ) : null}

      <Card className="border-blue-200 bg-blue-50/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-900">What “activity” means</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800">
          This dashboard reports platform login presence, current page/lesson, stored learning completion, and lab-session lifecycle. Exact AWS Console actions require CloudTrail integration and are not inferred here.
        </CardContent>
      </Card>
    </div>
  );
}
