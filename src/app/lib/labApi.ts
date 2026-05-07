import { hasSupabaseConfig, supabase } from './supabaseClient';

export interface LabApiResponse {
  sessionId: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration?: string;
  };
  consoleUrl: string;
}

export function hasLabBackendConfigured() {
  return hasSupabaseConfig && supabase !== null;
}

function formatLabFunctionError(action: 'start' | 'stop', error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';

  return new Error(
    `Failed to call the Supabase edge function for ${action}ing the lab. ` +
    `Make sure the SQL migration has been applied, the ${action}-lab function is deployed, ` +
    `and the AWS secrets are configured in Supabase. Original error: ${message}`
  );
}

export async function startLabSession() {
  if (!hasLabBackendConfigured() || !supabase) {
    throw new Error('Supabase backend is not configured.');
  }

  try {
    const { data, error } = await supabase.functions.invoke('start-lab', {
      body: {},
    });

    if (error) {
      throw error;
    }

    return data as LabApiResponse;
  } catch (error) {
    throw formatLabFunctionError('start', error);
  }
}

export async function stopLabSession(sessionId: string) {
  if (!hasLabBackendConfigured() || !supabase) {
    throw new Error('Supabase backend is not configured.');
  }

  try {
    const { data, error } = await supabase.functions.invoke('stop-lab', {
      body: { sessionId },
    });

    if (error) {
      throw error;
    }

    return data as { success?: boolean };
  } catch (error) {
    throw formatLabFunctionError('stop', error);
  }
}