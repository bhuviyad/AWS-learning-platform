export interface LabApiResponse {
  sessionId: string;
  accountName?: string;
  accountId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  awsIdentityCenterUsername?: string;
  awsIdentityCenterEmail?: string;
  permissionSetName?: string;
  awsAccountId?: string;
  lambdaExecutionRoleArn?: string;
  resourceExpirationTime?: string;
  internProfile?: unknown;
  expiresAt?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration?: string;
  };
  consoleUrl: string;
  loginUrl?: string;
}

export interface LabIdentityContext {
  id: string;
  name: string;
  email: string;
  awsIdentityCenterUsername?: string;
  awsIdentityCenterEmail?: string;
  permissionSetName?: string;
  awsAccountId?: string;
}

function toIdentityPayload(identity?: LabIdentityContext) {
  return {
    userId: identity?.id,
    userEmail: identity?.email,
    userName: identity?.name,
    awsIdentityCenterUsername: identity?.awsIdentityCenterUsername,
    awsIdentityCenterEmail: identity?.awsIdentityCenterEmail,
    permissionSetName: identity?.permissionSetName,
    awsAccountId: identity?.awsAccountId,
  };
}

export function hasLabBackendConfigured() {
  return true;
}

function getLocalLabUrls() {
  const start = (import.meta.env.VITE_LOCAL_START_LAB_URL as string) || '';
  const stop = (import.meta.env.VITE_LOCAL_STOP_LAB_URL as string) || '';
  return { start: start.trim(), stop: stop.trim() };
}

function shouldFallbackToLocalFunction(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const name = 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  const combined = `${name} ${message}`.toLowerCase();
  return combined.includes('failed to fetch') || combined.includes('fetch') || combined.includes('network') || combined.includes('resolve') || combined.includes('enotfound');
}

function formatLabFunctionError(action: 'start' | 'stop', error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';

  return new Error(
    `Failed to start the local lab service for ${action}ing the lab. ` +
    `Make sure the local mock is running if you configured it. Original error: ${message}`
  );
}

function getConsoleDestination() {
  return (import.meta.env.VITE_AWS_CONSOLE_DESTINATION as string) || '';
}

function getLambdaExecutionRoleArn() {
  return (import.meta.env.VITE_AWS_LAMBDA_EXECUTION_ROLE_ARN as string) || '';
}

export async function startLabSession(identity?: LabIdentityContext) {
  const local = getLocalLabUrls();
  const destination = getConsoleDestination();

  if (local.start) {
    try {
      const res = await fetch(local.start, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, ...toIdentityPayload(identity) }),
        credentials: 'omit',
      });

      if (!res.ok) throw new Error(`Local start-lab returned ${res.status}`);
      const data = await res.json();
      if (destination && !(data as LabApiResponse).consoleUrl) {
        (data as LabApiResponse).consoleUrl = destination;
      }
      return data as LabApiResponse;
    } catch (error) {
      if (!shouldFallbackToLocalFunction(error)) {
        throw formatLabFunctionError('start', error);
      }
    }
  }

  const sessionId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fakeExpirationTime = Date.now() + 2 * 60 * 1000;
  const fakeCredentials = {
    accessKeyId: `AKIA${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    secretAccessKey: Math.random().toString(36).slice(2, 32),
    sessionToken: Math.random().toString(36).slice(2, 64),
    expiration: new Date(fakeExpirationTime).toISOString(),
  };

  return {
    sessionId,
    ...toIdentityPayload(identity),
    credentials: {
      accessKeyId: fakeCredentials.accessKeyId,
      secretAccessKey: fakeCredentials.secretAccessKey,
      sessionToken: fakeCredentials.sessionToken,
      expiration: fakeCredentials.expiration,
    },
    consoleUrl: destination,
    lambdaExecutionRoleArn: getLambdaExecutionRoleArn() || undefined,
    resourceExpirationTime: String(fakeExpirationTime),
  } as LabApiResponse;
}

export async function stopLabSession(
  sessionId: string,
  options: { expirationTime?: string | null; reason?: 'manual' | 'expired' } = {},
) {
  if (sessionId.startsWith('local-')) {
    return { success: true };
  }

  const local = getLocalLabUrls();

  if (local.stop) {
    try {
      const res = await fetch(local.stop, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          expirationTime: options.expirationTime || undefined,
          reason: options.reason || 'manual',
        }),
        credentials: 'omit',
      });

      if (!res.ok) throw new Error(`Local stop-lab returned ${res.status}`);
      const data = await res.json();
      return data as { success?: boolean };
    } catch (error) {
      throw formatLabFunctionError('stop', error);
    }
  }

  return { success: true };
}
