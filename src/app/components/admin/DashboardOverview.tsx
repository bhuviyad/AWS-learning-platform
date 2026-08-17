import { Activity, AlertTriangle, BookOpenCheck, FlaskConical, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { DashboardData } from '../../lib/adminDashboardApi';

interface DashboardOverviewProps {
  data: DashboardData;
}

const cleanupColors: Record<string, string> = {
  deleted: '#16a34a',
  failed: '#dc2626',
  scheduled: '#f97316',
  pending: '#64748b',
};

function formatIst(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SummaryCard({ title, value, detail, icon: Icon, tone }: {
  title: string;
  value: number | string;
  detail: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
          <div className={`rounded-xl p-3 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardOverview({ data }: DashboardOverviewProps) {
  const { summary } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Online now" value={summary.onlineNow} detail="Seen in the last 2 minutes" icon={Activity} tone="bg-green-50 text-green-700" />
        <SummaryCard title="Active labs" value={summary.activeSessions} detail="Sessions with time remaining" icon={FlaskConical} tone="bg-orange-50 text-orange-700" />
        <SummaryCard title="Active interns" value={summary.totalInterns} detail="Enabled identity profiles" icon={Users} tone="bg-blue-50 text-blue-700" />
        <SummaryCard title="Avg. completion" value={`${summary.averageCompletion}%`} detail="Across tracked interns" icon={BookOpenCheck} tone="bg-violet-50 text-violet-700" />
        <SummaryCard title="Cleanup failures" value={summary.cleanupFailures} detail="Sessions requiring attention" icon={AlertTriangle} tone={summary.cleanupFailures ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Lab sessions started</CardTitle>
            <CardDescription>Daily session launches during the last seven days.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sessionsByDay} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(value) => value.slice(5)} fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip labelFormatter={(value) => `Date: ${value}`} />
                  <Bar dataKey="sessions" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cleanup health</CardTitle>
            <CardDescription>Recent sessions grouped by cleanup state.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.cleanupBreakdown.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-slate-500">No cleanup records yet.</div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.cleanupBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {data.cleanupBreakdown.map((item) => (
                        <Cell key={item.name} fill={cleanupColors[item.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {data.cleanupBreakdown.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cleanupColors[item.name] || '#94a3b8' }} />
                  <span className="capitalize">{item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live platform activity</CardTitle>
          <CardDescription>Login presence and the latest page or lesson reported by each user.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.presence.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No users have reported presence yet.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.presence.slice(0, 12).map((item) => (
                <div key={item.appUserId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{item.name}</p>
                      <p className="truncate text-xs text-slate-500">{item.email}</p>
                    </div>
                    <Badge className={item.online ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-100'}>
                      {item.online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p><span className="font-medium">Page:</span> {item.currentPage}</p>
                    <p><span className="font-medium">Activity:</span> {item.currentLessonTitle || 'No lesson selected'}</p>
                    <p><span className="font-medium">Last seen:</span> {formatIst(item.lastSeenAt)} IST</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
