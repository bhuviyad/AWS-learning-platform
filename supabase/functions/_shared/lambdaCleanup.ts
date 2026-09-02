import {
  DeleteFunctionCommand,
  LambdaClient,
  ListFunctionsCommand,
  ListTagsCommand,
} from 'https://esm.sh/@aws-sdk/client-lambda@3.1075.0';
import {
  DeleteEventBusCommand,
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
} from 'https://esm.sh/@aws-sdk/client-eventbridge@3.1075.0';
import {
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  ListTagsOfResourceCommand,
} from 'https://esm.sh/@aws-sdk/client-dynamodb@3.1075.0';
import {
  AbortMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketTaggingCommand,
  ListBucketsCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from 'https://esm.sh/@aws-sdk/client-s3@3.1075.0';

export const LAB_ENVIRONMENT = 'LearningLab';

export type CleanupMode = 'manual' | 'scheduled';

export interface LambdaCleanupOptions {
  client?: LambdaClient;
  sessionId?: string;
  mode?: CleanupMode;
  now?: number;
}

export interface SandboxCleanupOptions {
  lambda?: LambdaClient;
  eventBridge?: EventBridgeClient;
  dynamodb?: DynamoDBClient;
  s3?: S3Client;
  sessionId?: string;
  mode?: CleanupMode;
  now?: number;
}

export interface CleanupStats {
  inspected: number;
  deleted: number;
  skipped: number;
  errors: string[];
}

export interface SandboxCleanupStats {
  lambda: CleanupStats;
  eventBridge: CleanupStats;
  dynamodb: CleanupStats;
  s3: CleanupStats;
  errors: string[];
}

function getEnv(name: string) {
  return Deno.env.get(name) ?? '';
}

function createClientCredentials() {
  const accessKeyId = getEnv('BACKEND_AWS_ACCESS_KEY_ID') || getEnv('AWS_ACCESS_KEY_ID') || getEnv('AWS_LAB_USER_ACCESS_KEY_ID');
  const secretAccessKey = getEnv('BACKEND_AWS_SECRET_ACCESS_KEY') || getEnv('AWS_SECRET_ACCESS_KEY') || getEnv('AWS_LAB_USER_SECRET_ACCESS_KEY');
  const sessionToken = getEnv('BACKEND_AWS_SESSION_TOKEN') || getEnv('AWS_SESSION_TOKEN') || getEnv('AWS_LAB_USER_SESSION_TOKEN');
  const region = getEnv('AWS_REGION') || 'ap-south-1';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Backend AWS credentials are not configured');
  }

  return {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  };
}

export function createLambdaCleanupClient() {
  return new LambdaClient(createClientCredentials());
}

export function createEventBridgeCleanupClient() {
  return new EventBridgeClient(createClientCredentials());
}

export function createDynamoDbCleanupClient() {
  return new DynamoDBClient(createClientCredentials());
}

export function createS3CleanupClient() {
  return new S3Client(createClientCredentials());
}

export function createSandboxCleanupClients() {
  return {
    lambda: createLambdaCleanupClient(),
    eventBridge: createEventBridgeCleanupClient(),
    dynamodb: createDynamoDbCleanupClient(),
    s3: createS3CleanupClient(),
  };
}

function parseTags(tags?: Record<string, string> | Array<{ Key?: string; Value?: string }>) {
  const tagMap = Array.isArray(tags)
    ? tags.reduce<Record<string, string>>((acc, tag) => {
        if (tag?.Key) acc[tag.Key] = tag.Value ?? '';
        return acc;
      }, {})
    : (tags ?? {});

  const environment = tagMap.Environment ?? '';
  const sessionId = tagMap.SessionId ?? '';
  const expirationRaw = tagMap.ExpirationTime ?? tagMap.ExpiresAt ?? '';
  const expirationTime = Number(expirationRaw);

  return {
    environment,
    sessionId,
    expirationRaw,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
  };
}

function shouldDeleteResource(tags: Record<string, string> | Array<{ Key?: string; Value?: string }> | undefined, options: Required<Pick<LambdaCleanupOptions, 'mode' | 'now'>> & Pick<LambdaCleanupOptions, 'sessionId'>) {
  const parsed = parseTags(tags);
  if (parsed.environment !== LAB_ENVIRONMENT) return false;
  if (options.sessionId && parsed.sessionId !== options.sessionId) return false;

  if (options.mode === 'manual') {
    return true;
  }

  return parsed.expirationTime !== null && parsed.expirationTime <= options.now;
}

function emptyStats(): CleanupStats {
  return { inspected: 0, deleted: 0, skipped: 0, errors: [] };
}

export async function cleanupLabLambdaFunctions(options: LambdaCleanupOptions = {}): Promise<CleanupStats> {
  const client = options.client ?? createLambdaCleanupClient();
  const mode = options.mode ?? 'scheduled';
  const now = options.now ?? Date.now();
  const stats = emptyStats();

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

        if (!shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId })) {
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

export async function cleanupLabEventBridgeRules(options: SandboxCleanupOptions = {}): Promise<CleanupStats> {
  const client = options.eventBridge ?? createEventBridgeCleanupClient();
  const mode = options.mode ?? 'scheduled';
  const now = options.now ?? Date.now();
  const stats = emptyStats();

  let nextToken: string | undefined;
  do {
    const busesResponse = await client.send(new ListEventBusesCommand({ NextToken: nextToken }));
    nextToken = busesResponse.NextToken;

    for (const bus of busesResponse.EventBuses ?? []) {
      const busName = bus.Name || 'default';
      const busArn = bus.Arn;
      stats.inspected += 1;

      try {
        let ruleNextToken: string | undefined;
        do {
          const rulesResponse = await client.send(new ListRulesCommand({
            EventBusName: busName,
            NextToken: ruleNextToken,
          }));
          ruleNextToken = rulesResponse.NextToken;

          for (const rule of rulesResponse.Rules ?? []) {
            stats.inspected += 1;
            if (!rule.Name || !rule.Arn) {
              stats.skipped += 1;
              continue;
            }

            try {
              const tagsResponse = await client.send(new ListTagsForResourceCommand({ ResourceARN: rule.Arn }));
              const tags = tagsResponse.Tags ?? [];

              if (!shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId })) {
                stats.skipped += 1;
                continue;
              }

              let targetNextToken: string | undefined;
              do {
                const targetsResponse = await client.send(new ListTargetsByRuleCommand({
                  Rule: rule.Name,
                  EventBusName: busName,
                  NextToken: targetNextToken,
                }));
                targetNextToken = targetsResponse.NextToken;

                const targetIds = (targetsResponse.Targets ?? []).map((target) => target.Id).filter((id): id is string => Boolean(id));
                if (targetIds.length > 0) {
                  await client.send(new RemoveTargetsCommand({
                    Rule: rule.Name,
                    EventBusName: busName,
                    Ids: targetIds,
                  }));
                }
              } while (targetNextToken);

              await client.send(new DeleteRuleCommand({
                Name: rule.Name,
                EventBusName: busName,
              }));
              stats.deleted += 1;
            } catch (error) {
              stats.errors.push(`${rule.Name}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        } while (ruleNextToken);

        if (busName !== 'default' && busArn) {
          try {
            const tagsResponse = await client.send(new ListTagsForResourceCommand({ ResourceARN: busArn }));
            const tags = tagsResponse.Tags ?? [];
            if (shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId })) {
              await client.send(new DeleteEventBusCommand({ Name: busName }));
              stats.deleted += 1;
            } else {
              stats.skipped += 1;
            }
          } catch (error) {
            stats.errors.push(`${busName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        stats.errors.push(`${busName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } while (nextToken);

  return stats;
}

export async function cleanupLabDynamoDbTables(options: SandboxCleanupOptions = {}): Promise<CleanupStats> {
  const client = options.dynamodb ?? createDynamoDbCleanupClient();
  const mode = options.mode ?? 'scheduled';
  const now = options.now ?? Date.now();
  const stats = emptyStats();

  let lastEvaluatedTableName: string | undefined;
  do {
    const response = await client.send(new ListTablesCommand({ ExclusiveStartTableName: lastEvaluatedTableName }));
    lastEvaluatedTableName = response.LastEvaluatedTableName;

    for (const tableName of response.TableNames ?? []) {
      stats.inspected += 1;

      try {
        const description = await client.send(new DescribeTableCommand({ TableName: tableName }));
        const tableArn = description.Table?.TableArn;
        if (!tableArn) {
          stats.skipped += 1;
          continue;
        }

        const tagsResponse = await client.send(new ListTagsOfResourceCommand({ ResourceArn: tableArn }));
        const tags = tagsResponse.Tags ?? [];

        if (!shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId })) {
          stats.skipped += 1;
          continue;
        }

        await client.send(new DeleteTableCommand({ TableName: tableName }));
        stats.deleted += 1;
      } catch (error) {
        stats.errors.push(`${tableName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } while (lastEvaluatedTableName);

  return stats;
}

function matchesSessionBucketName(bucketName: string, sessionId?: string) {
  if (!sessionId) return false;
  return bucketName.toLowerCase().startsWith(`learninglab-${sessionId.toLowerCase()}-`);
}

async function getS3BucketTags(client: S3Client, bucketName: string) {
  try {
    const response = await client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
    return response.TagSet ?? [];
  } catch (error) {
    const code = (error as { name?: string; Code?: string; code?: string })?.name
      || (error as { Code?: string })?.Code
      || (error as { code?: string })?.code;
    if (code === 'NoSuchTagSet' || code === 'NoSuchTagSetError') return [];
    throw error;
  }
}

async function emptyS3Bucket(client: S3Client, bucketName: string) {
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  do {
    const response = await client.send(new ListMultipartUploadsCommand({
      Bucket: bucketName,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
    }));

    for (const upload of response.Uploads ?? []) {
      if (!upload.Key || !upload.UploadId) continue;
      await client.send(new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: upload.Key,
        UploadId: upload.UploadId,
      }));
    }

    keyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
    uploadIdMarker = response.IsTruncated ? response.NextUploadIdMarker : undefined;
  } while (keyMarker || uploadIdMarker);

  let versionKeyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const response = await client.send(new ListObjectVersionsCommand({
      Bucket: bucketName,
      KeyMarker: versionKeyMarker,
      VersionIdMarker: versionIdMarker,
    }));

    const objects = [
      ...(response.Versions ?? []).map((item) => ({ Key: item.Key, VersionId: item.VersionId })),
      ...(response.DeleteMarkers ?? []).map((item) => ({ Key: item.Key, VersionId: item.VersionId })),
    ].filter((item): item is { Key: string; VersionId?: string } => Boolean(item.Key));

    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects, Quiet: true },
      }));
    }

    versionKeyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
    versionIdMarker = response.IsTruncated ? response.NextVersionIdMarker : undefined;
  } while (versionKeyMarker || versionIdMarker);

  let continuationToken: string | undefined;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    }));

    const objects = (response.Contents ?? [])
      .map((item) => ({ Key: item.Key }))
      .filter((item): item is { Key: string } => Boolean(item.Key));

    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects, Quiet: true },
      }));
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function cleanupLabS3Buckets(options: SandboxCleanupOptions = {}): Promise<CleanupStats> {
  const client = options.s3 ?? createS3CleanupClient();
  const mode = options.mode ?? 'scheduled';
  const now = options.now ?? Date.now();
  const stats = emptyStats();

  const response = await client.send(new ListBucketsCommand({}));
  for (const bucket of response.Buckets ?? []) {
    const bucketName = bucket.Name;
    if (!bucketName || !bucketName.startsWith('learninglab-')) continue;

    stats.inspected += 1;
    try {
      let tags: Array<{ Key?: string; Value?: string }> = [];
      try {
        tags = await getS3BucketTags(client, bucketName);
      } catch (error) {
        if (!matchesSessionBucketName(bucketName, options.sessionId)) throw error;
      }

      const tagMatch = shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId });
      const nameMatch = matchesSessionBucketName(bucketName, options.sessionId);
      if (!tagMatch && !nameMatch) {
        stats.skipped += 1;
        continue;
      }

      await emptyS3Bucket(client, bucketName);
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      stats.deleted += 1;
    } catch (error) {
      stats.errors.push(`${bucketName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return stats;
}

async function runCleanupSafely(serviceName: string, cleanup: () => Promise<CleanupStats>): Promise<CleanupStats> {
  try {
    return await cleanup();
  } catch (error) {
    return {
      ...emptyStats(),
      errors: [`${serviceName}: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export async function cleanupTaggedSandboxResources(options: SandboxCleanupOptions = {}): Promise<SandboxCleanupStats> {
  const lambda = await runCleanupSafely('Lambda', () => cleanupLabLambdaFunctions({
    client: options.lambda,
    sessionId: options.sessionId,
    mode: options.mode,
    now: options.now,
  }));
  const eventBridge = await runCleanupSafely('EventBridge', () => cleanupLabEventBridgeRules(options));
  const dynamodb = await runCleanupSafely('DynamoDB', () => cleanupLabDynamoDbTables(options));
  const s3 = await runCleanupSafely('S3', () => cleanupLabS3Buckets(options));

  return {
    lambda,
    eventBridge,
    dynamodb,
    s3,
    errors: [...lambda.errors, ...eventBridge.errors, ...dynamodb.errors, ...s3.errors],
  };
}
