import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { DashboardSession } from '../../lib/adminDashboardApi';

interface SessionsTableProps {
  sessions: DashboardSession[];
}

function formatIst(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Expired';
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function cleanupClass(state: string) {
  if (state === 'deleted') return 'bg-green-100 text-green-700 hover:bg-green-100';
  if (state === 'failed') return 'bg-red-100 text-red-700 hover:bg-red-100';
  if (state === 'scheduled') return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
  return 'bg-slate-100 text-slate-600 hover:bg-slate-100';
}

export default function SessionsTable({ sessions }: SessionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab sessions</CardTitle>
        <CardDescription>Active and recent AWS lab sessions, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No lab sessions recorded yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Intern</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Cleanup</TableHead>
                <TableHead>AWS identity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <div className="max-w-52">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${session.online ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className="truncate font-medium text-slate-900">{session.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{session.email || '—'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-44 truncate font-mono text-xs" title={session.sessionId}>{session.sessionId || '—'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{session.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{formatIst(session.startTime)} IST</TableCell>
                  <TableCell>
                    <p className="text-xs text-slate-600">{formatIst(session.endTime)} IST</p>
                    <p className={`text-xs font-medium ${session.remainingMs > 0 ? 'text-orange-600' : 'text-slate-500'}`}>{formatRemaining(session.remainingMs)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={`capitalize ${cleanupClass(session.cleanupState)}`}>{session.cleanupState}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="max-w-40 truncate text-xs text-slate-700">{session.awsUsername || '—'}</p>
                    <p className="text-xs text-slate-500">{session.accountId || '—'}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
