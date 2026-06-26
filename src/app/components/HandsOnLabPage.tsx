import { useState, useEffect, useRef } from 'react';
import { Play, Square, ExternalLink, Clock, Server, Database, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { hasLabBackendConfigured, startLabSession, stopLabSession } from '../lib/labApi';

const LAB_SESSION_DURATION_MS = 15 * 60 * 1000;

interface LabSession {
  id: string;
  status: 'inactive' | 'starting' | 'active' | 'stopping' | 'expired';
  startTime: number | null;
  endTime: number | null;
  accountName: string | null;
  accountId: string | null;
  awsConsoleUrl: string | null;
  loginUrl: string | null;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  } | null;
}

export default function HandsOnLabPage() {
  const autoStartAttempted = useRef(false);
  const [session, setSession] = useState<LabSession>({
    id: '',
    status: 'inactive',
    startTime: null,
    endTime: null,
    accountName: null,
    accountId: null,
    awsConsoleUrl: null,
    credentials: null,
  });

  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastConsoleUrl, setLastConsoleUrl] = useState<string | null>(null);

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

    if (session.status !== 'inactive') {
      return;
    }

    autoStartAttempted.current = true;
    void handleStartLab();
  }, []);

  const handleStartLab = async () => {
    setErrorMessage('');
    setSession({ ...session, status: 'starting' });

      if (hasLabBackendConfigured()) {
      try {
        const response = await startLabSession();
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
          awsConsoleUrl: null,
          credentials: null,
        });
        return;
      }
    }

    setErrorMessage('AWS Lab credentials will be available once your AWS admin configures the backend with IAM credentials and role information.');
    setSession({
      id: '',
      status: 'inactive',
      startTime: null,
      endTime: null,
      accountName: null,
      accountId: null,
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

    // Simulate API call to stop lab and cleanup resources
    setTimeout(() => {
      setSession({
        id: '',
        status: 'inactive',
        startTime: null,
        endTime: null,
        accountName: null,
        accountId: null,
        awsConsoleUrl: null,
        credentials: null,
      });
      setTimeRemaining(0);
    }, 1500);
  };

  const handleExpireSession = () => {
    setSession({ ...session, status: 'expired' });
    setTimeout(() => {
      setSession({
        id: '',
        status: 'inactive',
        startTime: null,
        endTime: null,
        accountName: null,
        accountId: null,
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

      {/* Main Lab Control */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">AWS Hands-on Lab Environment</h1>
          <p className="text-slate-600">
            Launch a temporary AWS environment with EC2 and S3 access
          </p>
        </div>

        {/* Session Status */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-sm font-medium text-slate-600">Status:</span>
          {session.status === 'inactive' && (
            <Badge variant="outline" className="text-slate-600">
              <Circle className="w-3 h-3 mr-1" />
              Not Started
            </Badge>
          )}
          {session.status === 'starting' && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
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
              <Clock className="w-3 h-3 mr-1 animate-spin" />
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

        {/* Timer Display */}
        {session.status === 'active' && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-slate-600" />
              <span className="text-3xl font-mono font-bold text-slate-900">
                {formatTime(timeRemaining)}
              </span>
            </div>
            <Progress value={timeProgress} className="h-2 mb-2" />
            <p className="text-center text-sm text-slate-600">
              Session will automatically end and cleanup resources
            </p>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-3 justify-center mb-8">
          {session.status === 'inactive' && (
            <Button
              onClick={handleStartLab}
              size="lg"
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Play className="w-5 h-5 mr-2" />
              Start Lab
            </Button>
          )}

          {session.status === 'starting' && (
            <Button size="lg" disabled className="bg-blue-600">
              <Clock className="w-5 h-5 mr-2 animate-spin" />
              Initializing Lab Environment...
            </Button>
          )}

          {session.status === 'active' && (
            <>
              <Button
                onClick={() => {
                  const login = session.loginUrl;
                  const preferred = (import.meta.env.VITE_AWS_CONSOLE_DESTINATION as string) || session.awsConsoleUrl || '';
                  if (login) {
                    window.open(login, '_blank');
                    return;
                  }
                  if (preferred) window.open(preferred, '_blank');
                }}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Open AWS Console
              </Button>
              <Button
                onClick={handleStopLab}
                size="lg"
                variant="destructive"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Lab
              </Button>
            </>
          )}

          {session.status === 'stopping' && (
            <Button size="lg" disabled variant="destructive">
              <Clock className="w-5 h-5 mr-2 animate-spin" />
              Cleaning Up Resources...
            </Button>
          )}
        </div>

        {lastConsoleUrl && (
          <div className="text-center text-xs text-slate-500 mt-2">
            Returned AWS URL: <a className="text-blue-600 underline break-all" href={lastConsoleUrl} target="_blank" rel="noreferrer">{lastConsoleUrl}</a>
          </div>
        )}

        {/* Permissions Info */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-600" />
            Lab Permissions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-slate-700">EC2 instance launch and management</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-slate-700">S3 bucket creation and object upload</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-slate-700">Read-only access to VPC resources</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-slate-700">CloudWatch logs viewing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Credentials Card - Only shown when active */}
      {session.status === 'active' && session.credentials && (
        <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-600" />
            Temporary AWS Credentials
          </h3>
          {(session.accountName || session.accountId) && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">AWS Account:</span> {session.accountName || 'Unknown'}{session.accountId ? ` (${session.accountId})` : ''}
            </div>
          )}
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-600 mb-1">Access Key ID</p>
              <code className="text-sm text-slate-900 break-all">{session.credentials.accessKeyId}</code>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-600 mb-1">Secret Access Key</p>
              <code className="text-sm text-slate-900 break-all">{session.credentials.secretAccessKey}</code>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-600 mb-1">Session Token</p>
              <code className="text-sm text-slate-900 break-all">{session.credentials.sessionToken}</code>
            </div>
          </div>
          <Alert className="mt-4 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800 text-sm">
              These credentials are temporary and will expire when the session ends. Do not share them.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Resource Cleanup Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Automatic Resource Cleanup</h3>
        <p className="text-sm text-blue-800">
          When your session expires or you stop the lab, all AWS resources (EC2 instances, S3 buckets, etc.)
          will be automatically deleted within 5 minutes. This ensures no unexpected charges and maintains
          a clean environment for the next session.
        </p>
      </div>
    </div>
  );
}

function Circle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
