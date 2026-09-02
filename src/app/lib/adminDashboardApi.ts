export interface DashboardSummary {
  onlineNow: number;
  activeSessions: number;
  totalInterns: number;
  averageCompletion: number;
  cleanupFailures: number;
}

export interface DashboardPresence {
  appUserId: string;
  email: string;
  name: string;
  currentPage: string;
  currentLessonId: string | null;
  currentLessonTitle: string | null;
  firstLoginAt: string;
  lastLoginAt: string;
  lastSeenAt: string;
  signedOutAt: string | null;
  online: boolean;
}

export interface DashboardSession {
  id: string;
  sessionId: string;
  appUserId: string;
  name: string;
  email: string;
  status: string;
  cleanupState: string;
  revocationState: string;
  revocationError: string | null;
  revokedAt: string | null;
  startTime: string;
  endTime: string;
  remainingMs: number;
  accountId: string;
  awsUsername: string;
  online: boolean;
}

export interface DashboardProgress {
  appUserId: string;
  name: string;
  email: string;
  profileStatus: string;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  lastCompletedAt: string | null;
  currentPage: string;
  currentLessonTitle: string | null;
  online: boolean;
}

export interface DashboardData {
  generatedAt: string;
  summary: DashboardSummary;
  presence: DashboardPresence[];
  sessions: DashboardSession[];
  progress: DashboardProgress[];
  sessionsByDay: Array<{ day: string; sessions: number }>;
  cleanupBreakdown: Array<{ name: string; value: number }>;
}

function getBackendBaseUrl() {
  const startLabUrl = (import.meta.env.VITE_LOCAL_START_LAB_URL as string) || '';
  return startLabUrl.trim().replace(/\/start-lab\/?$/, '');
}

export async function fetchAdminDashboard(adminEmail: string): Promise<DashboardData> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) throw new Error('The backend URL is not configured.');

  const response = await fetch(`${baseUrl}/admin-dashboard`, {
    headers: { 'x-admin-email': adminEmail },
    credentials: 'omit',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Admin dashboard returned ${response.status}`);
  }

  return response.json() as Promise<DashboardData>;
}
