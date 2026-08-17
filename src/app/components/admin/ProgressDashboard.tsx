import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { DashboardProgress } from '../../lib/adminDashboardApi';

interface ProgressDashboardProps {
  rows: DashboardProgress[];
}

function formatIst(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ProgressDashboard({ rows }: ProgressDashboardProps) {
  const chartRows = rows.slice(0, 12).map((row) => ({
    name: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
    completion: row.completionPercent,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Course completion by intern</CardTitle>
          <CardDescription>Percentage of the six tracked AWS learning modules completed.</CardDescription>
        </CardHeader>
        <CardContent>
          {chartRows.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">No progress records yet.</div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" margin={{ left: 28, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="name" width={120} fontSize={12} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Completion']} />
                  <Bar dataKey="completion" fill="#f97316" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intern learning progress</CardTitle>
          <CardDescription>Completion and current platform activity for each tracked intern.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No intern progress records yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Intern</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Current activity</TableHead>
                  <TableHead>Last completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.appUserId}>
                    <TableCell>
                      <div className="max-w-56">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${row.online ? 'bg-green-500' : 'bg-slate-300'}`} />
                          <span className="truncate font-medium text-slate-900">{row.name}</span>
                        </div>
                        <p className="truncate text-xs text-slate-500">{row.email || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{row.profileStatus}</Badge></TableCell>
                    <TableCell>
                      <div className="w-44 space-y-1">
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>{row.completedLessons}/{row.totalLessons} modules</span>
                          <span className="font-medium">{row.completionPercent}%</span>
                        </div>
                        <Progress value={row.completionPercent} className="h-2" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm capitalize text-slate-700">{row.currentPage}</p>
                      <p className="max-w-56 truncate text-xs text-slate-500">{row.currentLessonTitle || 'No lesson selected'}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{formatIst(row.lastCompletedAt)} IST</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
