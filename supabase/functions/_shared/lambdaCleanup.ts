import {
  DeleteFunctionCommand,
  LambdaClient,
  ListFunctionsCommand,
  ListTagsCommand,
} from 'https://esm.sh/@aws-sdk/client-lambda@3.1075.0';

export const LAB_ENVIRONMENT = 'LearningLab';

export type CleanupMode = 'manual' | 'scheduled';

export interface LambdaCleanupOptions {
  client?: LambdaClient;
  sessionId?: string;
  mode?: CleanupMode;
  now?: number;
}

export interface LambdaCleanupStats {
  inspected: number;
  deleted: number;
  skipped: number;
  errors: string[];
}

function getEnv(name: string) {
  return Deno.env.get(name) ?? '';
}

export function createLambdaCleanupClient() {
  const accessKeyId = getEnv('BACKEND_AWS_ACCESS_KEY_ID') || getEnv('AWS_ACCESS_KEY_ID') || getEnv('AWS_LAB_USER_ACCESS_KEY_ID');
  const secretAccessKey = getEnv('BACKEND_AWS_SECRET_ACCESS_KEY') || getEnv('AWS_SECRET_ACCESS_KEY') || getEnv('AWS_LAB_USER_SECRET_ACCESS_KEY');
  const sessionToken = getEnv('BACKEND_AWS_SESSION_TOKEN') || getEnv('AWS_SESSION_TOKEN') || getEnv('AWS_LAB_USER_SESSION_TOKEN');
  const region = getEnv('AWS_REGION') || 'ap-south-1';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Backend AWS credentials are not configured');
  }

  return new LambdaClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
}

function parseTags(tags?: Record<string, string>) {
  const environment = tags?.Environment ?? '';
  const sessionId = tags?.SessionId ?? '';
  const expirationRaw = tags?.ExpirationTime ?? tags?.ExpiresAt ?? '';
  const expirationTime = Number(expirationRaw);

  return {
    environment,
    sessionId,
    expirationRaw,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
  };
}

function shouldDeleteFunction(tags: Record<string, string> | undefined, options: Required<Pick<LambdaCleanupOptions, 'mode' | 'now'>> & Pick<LambdaCleanupOptions, 'sessionId'>) {
  const parsed = parseTags(tags);
  if (parsed.environment !== LAB_ENVIRONMENT) return false;
  if (options.sessionId && parsed.sessionId !== options.sessionId) return false;

  if (options.mode === 'manual') {
    return true;
  }

  return parsed.expirationTime !== null && parsed.expirationTime <= options.now;
}

export async function cleanupLabLambdaFunctions(options: LambdaCleanupOptions = {}): Promise<LambdaCleanupStats> {
  const client = options.client ?? createLambdaCleanupClient();
  const mode = options.mode ?? 'scheduled';
  const now = options.now ?? Date.now();
  const stats: LambdaCleanupStats = { inspected: 0, deleted: 0, skipped: 0, errors: [] };

  let marker: string | undefined;
  do {
    const response = await client.send(new ListFunctionsCommand({ Marker: marker }));
    marker = response.NextMarker;

    for (const fn of response.Functions ?? []) {
      stats.inspected += 1;

      if (!fn.FunctionArn || !fn.FunctionName) {
        stats.skipped += 1;
        continue;
      }

      try {
        const tagsResponse = await client.send(new ListTagsCommand({ Resource: fn.FunctionArn }));
        const tags = tagsResponse.Tags ?? {};

        if (!shouldDeleteFunction(tags, { mode, now, sessionId: options.sessionId })) {
          stats.skipped += 1;
          continue;
        }

        await client.send(new DeleteFunctionCommand({ FunctionName: fn.FunctionName }));
        stats.deleted += 1;
      } catch (error) {
        stats.errors.push(`${fn.FunctionName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } while (marker);

  return stats;
}
