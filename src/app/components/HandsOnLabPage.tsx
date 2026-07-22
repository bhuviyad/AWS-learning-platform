import { useState, useEffect, useRef } from 'react';
import { Play, Square, ExternalLink, Clock, Server, Database, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { hasLabBackendConfigured, startLabSession, stopLabSession, type LabIdentityContext } from '../lib/labApi';
import { findInternProfileForUser, resolveLabIdentity, type AppUserIdentity } from '../lib/internProfiles';

const LAB_SESSION_DURATION_MS = 15 * 60 * 1000;

interface LabSession {
  id: string;
  status: 'inactive' | 'starting' | 'active' | 'stopping' | 'expired';
  startTime: number | null;
  endTime: number | null;
  accountName: string | null;
  accountId: string | null;
  lambdaExecutionRoleArn: string | null;
  expiresAt: string | null;
  awsConsoleUrl: string | null;
  loginUrl: string | null;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  } | null;
}

interface HandsOnLabPageProps {
  currentUser: AppUserIdentity;
}

export default function HandsOnLabPage({ currentUser }: HandsOnLabPageProps) {
  const autoStartAttempted = useRef(false);
  const [session, setSession] = useState<LabSession>({
    id: '',
    status: 'inactive',
    startTime: null,
    endTime: null,
    accountName: null,
    accountId: null,
    lambdaExecutionRoleArn: null,
    expiresAt: null,
    awsConsoleUrl: null,
    credentials: null,
  });

  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastConsoleUrl, setLastConsoleUrl] = useState<string | null>(null);
  const [labIdentity, setLabIdentity] = useState<LabIdentityContext | null>(null);

  const assignedProfile = findInternProfileForUser(currentUser.id, currentUser.email) || null;

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      try {
        const resolved = await resolveLabIdentity(currentUser);
        if (!cancelled) {
          setLabIdentity(resolved);
        }
      } catch {
        if (!cancelled) {
          setLabIdentity({
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            awsAccountId: '483591406604',
          });
        }
      }
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Timer countdown
  useEffect(() => {
    if (session.status !== 'active' || !session.endTime) return;

    const interval = setInterval(() => {
      const remaining = session.endTime! - Date.now();
      if (remaining <= 0) {
        setTimeRemaining(0);
        handleExpireSession();
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (autoStartAttempted.current) {
      return;
    }

    if (session.status !== 'inactive' || !labIdentity) {
      return;
    }

    autoStartAttempted.current = true;
    void handleStartLab(labIdentity);
  }, [labIdentity, session.status]);

  const handleStartLab = async (identityOverride?: LabIdentityContext) => {
    setErrorMessage('');
    setSession({ ...session, status: 'starting' });

    const identity = identityOverride || labIdentity || {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      awsAccountId: '483591406604',
    };

    if (hasLabBackendConfigured()) {
      try {
        const response = await startLabSession(identity);
        console.log('[lab] startLabSession response:', response);
        setLastConsoleUrl(response.loginUrl || response.consoleUrl || null);
        const startTime = Date.now();
        const endTime = startTime + LAB_SESSION_DURATION_MS;

        setSession({
          id: response.sessionId,
          status: 'active',
          startTime,
          endTime,
          accountName: response.accountName || null,
          accountId: response.accountId || null,
          lambdaExecutionRoleArn: response.lambdaExecutionRoleArn || null,
          expiresAt: response.expiresAt || response.credentials.expiration || null,
          awsConsoleUrl: response.consoleUrl,
          loginUrl: (response as any).loginUrl || null,
          credentials: {
            accessKeyId: response.credentials.accessKeyId,
            secretAccessKey: response.credentials.secretAccessKey,
            sessionToken: response.credentials.sessionToken,
          },
        });
        setTimeRemaining(LAB_SESSION_DURATION_MS);
        return;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start lab session.');
        setSession({
          id: '',
          status: 'inactive',
          startTime: null,
          endTime: null,
          accountName: null,
          accountId: null,
          lambdaExecutionRoleArn: null,
          expiresAt: null,
          awsConsoleUrl: null,
          credentials: null,
        });
        return;
      }
    }

    setErrorMessage('AWS Lab credentials will be available once the backend AWS credentials and role information are configured.');
    setSession({
      id: '',
      status: 'inactive',
      startTime: null,
      endTime: null,
      accountName: null,
      accountId: null,
      lambdaExecutionRoleArn: null,
      awsConsoleUrl: null,
      credentials: null,
    });
  };

  const handleStopLab = async () => {
    setSession({ ...session, status: 'stopping' });

    if (hasLabBackendConfigured() && session.id) {
      try {
        await stopLabSession(session.id);
      } catch {
        // Fall through to local cleanup below so the UI still resets.
      }
    }

    setTimeout(() => {
      setSession({
        id: '',
        status: 'inactive',
        startTime: null,
        endTime: null,
        accountName: null,
        accountId: null,
        lambdaExecutionRoleArn: null,
        awsConsoleUrl: null,
        credentials: null,
      });
      setTimeRemaining(0);
    }, 1500);
  };

  const handleExpireSession = () => {
    const sessionId = session.id;
    setSession({ ...session, status: 'expired' });
    if (sessionId) {
      stopLabSession(sessionId).catch(() => {});
    }
    setTimeout(() => {
      setSession({
        id: '',
        status: 'inactive',
        startTime: null,
        endTime: null,
        accountName: null,
        accountId: null,
        lambdaExecutionRoleArn: null,
        awsConsoleUrl: null,
        credentials: null,
      });
    }, 5000);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatIstDateTime = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: true,
    }).format(date) + ' IST';
  };

  const timeProgress = session.endTime && session.startTime
    ? ((Date.now() - session.startTime) / (session.endTime - session.startTime)) * 100
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Status Alert */}
      {session.status === 'expired' && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Your lab session has expired. All resources have been automatically cleaned up.
          </AlertDescription>
        </Alert>
      )}

      {errorMessage && session.status === 'inactive' && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{errorMessage}</AlertDescription>
        </Alert>
      )}

      {session.status === 'active' && !session.credentials && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Lab session started, but real AWS credentials are unavailable in local demo mode.
          </AlertDescription>
        </Alert>
      )}

      {session.status === 'active' && timeRemaining < 5 * 60 * 1000 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Warning: Your session will expire soon. Save your work!
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>AWS Identity assignment</CardTitle>
          <CardDescription>
            The intern profile below is the identity used for session tracking in the shared sandbox account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-2 text-slate-600">
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">Platform user</span><span>{currentUser.name}</span></div>
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">Email</span><span>{currentUser.email}</span></div>
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">AWS username</span><span>{assignedProfile?.awsIdentityCenterUsername || labIdentity.awsIdentityCenterUsername || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">AWS email</span><span>{assignedProfile?.awsIdentityCenterEmail || labIdentity.awsIdentityCenterEmail || '—'}</span></div>
          </div>
          <div className="space-y-2 text-slate-600">
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">Permission set</span><span>{assignedProfile?.permissionSetName || labIdentity.permissionSetName || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">Sandbox account</span><span>{assignedProfile?.awsAccountId || labIdentity.awsAccountId || '483591406604'}</span></div>
            <div className="flex justify-between gap-3"><span className="font-medium text-slate-900">Session profile</span><span>{assignedProfile ? 'Assigned' : 'Auto-created'}</span></div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline">Session scoped</Badge>
              <Badge variant="outline">Auto cleanup</Badge>
              <Badge variant="outline">Shared account</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">AWS Hands-on Lab Environment</h1>
          <p className="text-slate-600">
            Launch a temporary AWS sandbox for Lambda practice. Interns create Lambda in the AWS Console, but the app shows the required role and tags so cleanup works automatically.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Signed in as {currentUser.name} ({currentUser.email})
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-sm font-medium text-slate-600">Status:</span>
          {session.status === 'inactive' && (
            <Badge variant="outline" className="text-slate-600">
              <Clock className="w-3 h-3 mr-1" />
              Not Started
            </Badge>
          )}
          {session.status === 'starting' && (
            <Badge className="bg-blue-100 text-orange-600 hover:bg-blue-100">
              <Clock className="w-3 h-3 mr-1 animate-spin" />
              Starting...
            </Badge>
          )}
          {session.status === 'active' && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Active
            </Badge>
          )}
          {session.status === 'stopping' && (
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
              <Square className="w-3 h-3 mr-1 animate-pulse" />
              Stopping...
            </Badge>
          )}
          {session.status === 'expired' && (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
              <AlertCircle className="w-3 h-3 mr-1" />
              Expired
            </Badge>
          )}
        </div>

        {session.status === 'active' && (
          <div className="max-w-md mx-auto mb-6 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Session Time Remaining</span>
              <span className="font-medium">{formatTime(timeRemaining)}</span>
            </div>
            <Progress value={timeProgress} className="h-2" />
          </div>
        )}

        <div className="flex justify-center gap-4 mb-6">
          {session.status === 'inactive' || session.status === 'expired' ? (
            <Button onClick={handleStartLab} className="bg-orange-600 hover:bg-orange-700">
              <Play className="w-4 h-4 mr-2" />
              Start Lab
            </Button>
          ) : (
            <Button onClick={handleStopLab} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">
              <Square className="w-4 h-4 mr-2" />
              Stop Lab
            </Button>
          )}
        </div>

        {session.status === 'active' && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">AWS Console Access</h3>
                <p className="text-sm text-slate-600">Your temporary credentials are ready</p>
              </div>
              {lastConsoleUrl && (
                <a
                  href={lastConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:text-orange-700"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <div className="grid gap-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Account:</span>
                <span className="font-medium">{session.accountName || 'AWS Sandbox'}</span>
              </div>
              <div className="flex justify-between">
                <span>Account ID:</span>
                <span className="font-medium">{session.accountId || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Session ID:</span>
                <span className="font-medium break-all text-right">{session.id || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Lambda role:</span>
                <span className="font-medium text-right break-all">{session.lambdaExecutionRoleArn || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Expires at (IST):</span>
                <span className="font-medium text-right break-all">{formatIstDateTime(session.expiresAt)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-medium">Before creating a Lambda in AWS Console:</p>
              <p>1. Name it with <span className="font-mono">learninglab-*</span></p>
              <p>2. Choose the existing role shown above</p>
              <p>3. Add tags with the exact values shown above.</p>
              <p className="font-mono">Environment=LearningLab</p>
              <p className="font-mono">SessionId={session.id || '&lt;this session&gt;'}</p>
              <p className="font-mono">ExpirationTime={session.endTime || '&lt;timestamp&gt;'}</p>
              <p className="text-[11px] text-amber-800">The expiry display above is in IST; the tag value is the session end timestamp number.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <Shield className="w-5 h-5 text-orange-600 mb-2" />
          <h4 className="font-semibold text-slate-900 mb-1">Secure & Temporary</h4>
          <p className="text-sm text-slate-600">Your lab session automatically expires after 15 minutes.</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <Database className="w-5 h-5 text-orange-600 mb-2" />
          <h4 className="font-semibold text-slate-900 mb-1">Real AWS Services</h4>
          <p className="text-sm text-slate-600">Practice with actual AWS Lambda resources in a safe sandbox.</p>
        </div>
      </div>
    </div>
  );
}
