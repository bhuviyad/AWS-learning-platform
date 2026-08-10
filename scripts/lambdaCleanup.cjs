const {
  DeleteFunctionCommand,
  ListFunctionsCommand,
  ListTagsCommand,
} = require('@aws-sdk/client-lambda');
const {
  DeleteEventBusCommand,
  DeleteRuleCommand,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTagsForResourceCommand: ListEventBridgeTagsCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
} = require('@aws-sdk/client-eventbridge');
const {
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  ListTagsOfResourceCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  AbortMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketTaggingCommand,
  ListBucketsCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
} = require('@aws-sdk/client-s3');

const LAB_ENVIRONMENT = 'LearningLab';

function parseTags(tags) {
  const tagMap = Array.isArray(tags)
    ? tags.reduce((acc, tag) => {
        if (tag && tag.Key) acc[tag.Key] = tag.Value || '';
        return acc;
      }, {})
    : (tags || {});

  const environment = tagMap.Environment || '';
  const sessionId = tagMap.SessionId || '';
  const expirationRaw = tagMap.ExpirationTime || tagMap.ExpiresAt || '';
  const expirationTime = Number(expirationRaw);

  return {
    environment,
    sessionId,
    expirationRaw,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
  };
}

function shouldDeleteResource(tags, options) {
  const parsed = parseTags(tags);
  if (parsed.environment !== LAB_ENVIRONMENT) return false;
  if (options.sessionId && parsed.sessionId !== options.sessionId) return false;
  if (options.mode === 'manual') return true;
  return parsed.expirationTime !== null && parsed.expirationTime <= options.now;
}

function createEmptyStats() {
  return { inspected: 0, deleted: 0, skipped: 0, errors: [] };
}

async function cleanupTaggedLambdaFunctions(client, options = {}) {
  const mode = options.mode || 'scheduled';
  const now = options.now || Date.now();
  const stats = createEmptyStats();

  if (!client) return stats;

  let marker;
  do {
    const response = await client.send(new ListFunctionsCommand({ Marker: marker }));
    marker = response.NextMarker;

    for (const fn of response.Functions || []) {
      stats.inspected += 1;
      if (!fn.FunctionArn || !fn.FunctionName) {
        stats.skipped += 1;
        continue;
      }

      try {
        const tagsResponse = await client.send(new ListTagsCommand({ Resource: fn.FunctionArn }));
        const tags = tagsResponse.Tags || {};

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

async function cleanupTaggedEventBridgeRules(client, options = {}) {
  const mode = options.mode || 'scheduled';
  const now = options.now || Date.now();
  const stats = createEmptyStats();

  if (!client) return stats;

  let nextToken;
  do {
    const busesResponse = await client.send(new ListEventBusesCommand({ NextToken: nextToken }));
    nextToken = busesResponse.NextToken;

    for (const bus of busesResponse.EventBuses || []) {
      const busName = bus.Name || 'default';
      const busArn = bus.Arn;
      stats.inspected += 1;

      try {
        let ruleNextToken;
        do {
          const rulesResponse = await client.send(new ListRulesCommand({
            EventBusName: busName,
            NextToken: ruleNextToken,
          }));
          ruleNextToken = rulesResponse.NextToken;

          for (const rule of rulesResponse.Rules || []) {
            stats.inspected += 1;
            if (!rule.Name || !rule.Arn) {
              stats.skipped += 1;
              continue;
            }

            try {
              const tagsResponse = await client.send(new ListEventBridgeTagsCommand({ ResourceARN: rule.Arn }));
              const tags = tagsResponse.Tags || [];

              if (!shouldDeleteResource(tags, { mode, now, sessionId: options.sessionId })) {
                stats.skipped += 1;
                continue;
              }

              let targetNextToken;
              do {
                const targetsResponse = await client.send(new ListTargetsByRuleCommand({
                  Rule: rule.Name,
                  EventBusName: busName,
                  NextToken: targetNextToken,
                }));
                targetNextToken = targetsResponse.NextToken;

                const targetIds = (targetsResponse.Targets || []).map((target) => target.Id).filter(Boolean);
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
            const tagsResponse = await client.send(new ListEventBridgeTagsCommand({ ResourceARN: busArn }));
            const tags = tagsResponse.Tags || [];
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

async function cleanupTaggedDynamoDbTables(client, options = {}) {
  const mode = options.mode || 'scheduled';
  const now = options.now || Date.now();
  const stats = createEmptyStats();

  if (!client) return stats;

  let lastEvaluatedTableName;
  do {
    const response = await client.send(new ListTablesCommand({ ExclusiveStartTableName: lastEvaluatedTableName }));
    lastEvaluatedTableName = response.LastEvaluatedTableName;

    for (const tableName of response.TableNames || []) {
      stats.inspected += 1;

      try {
        const description = await client.send(new DescribeTableCommand({ TableName: tableName }));
        const tableArn = description.Table && description.Table.TableArn;
        if (!tableArn) {
          stats.skipped += 1;
          continue;
        }

        const tagsResponse = await client.send(new ListTagsOfResourceCommand({ ResourceArn: tableArn }));
        const tags = tagsResponse.Tags || [];

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

function matchesSessionBucketName(bucketName, sessionId) {
  if (!sessionId) return false;
  return bucketName.toLowerCase().startsWith(`learninglab-${String(sessionId).toLowerCase()}-`);
}

async function getS3BucketTags(client, bucketName) {
  try {
    const response = await client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
    return response.TagSet || [];
  } catch (error) {
    const code = error && (error.name || error.Code || error.code);
    if (code === 'NoSuchTagSet' || code === 'NoSuchTagSetError') return [];
    throw error;
  }
}

async function emptyS3Bucket(client, bucketName) {
  let keyMarker;
  let uploadIdMarker;
  do {
    const response = await client.send(new ListMultipartUploadsCommand({
      Bucket: bucketName,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
    }));

    for (const upload of response.Uploads || []) {
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

  let versionKeyMarker;
  let versionIdMarker;
  do {
    const response = await client.send(new ListObjectVersionsCommand({
      Bucket: bucketName,
      KeyMarker: versionKeyMarker,
      VersionIdMarker: versionIdMarker,
    }));

    const objects = [
      ...(response.Versions || []).map((item) => ({ Key: item.Key, VersionId: item.VersionId })),
      ...(response.DeleteMarkers || []).map((item) => ({ Key: item.Key, VersionId: item.VersionId })),
    ].filter((item) => item.Key);

    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects, Quiet: true },
      }));
    }

    versionKeyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
    versionIdMarker = response.IsTruncated ? response.NextVersionIdMarker : undefined;
  } while (versionKeyMarker || versionIdMarker);

  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    }));

    const objects = (response.Contents || []).map((item) => ({ Key: item.Key })).filter((item) => item.Key);
    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects, Quiet: true },
      }));
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function cleanupTaggedS3Buckets(client, options = {}) {
  const mode = options.mode || 'scheduled';
  const now = options.now || Date.now();
  const stats = createEmptyStats();

  if (!client) return stats;

  const response = await client.send(new ListBucketsCommand({}));
  for (const bucket of response.Buckets || []) {
    const bucketName = bucket.Name;
    if (!bucketName || !bucketName.startsWith('learninglab-')) continue;

    stats.inspected += 1;
    try {
      let tags = [];
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

async function runCleanupSafely(serviceName, cleanup) {
  try {
    return await cleanup();
  } catch (error) {
    return {
      ...createEmptyStats(),
      errors: [`${serviceName}: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function cleanupTaggedSandboxResources(clients, options = {}) {
  const lambda = await runCleanupSafely('Lambda', () => cleanupTaggedLambdaFunctions(clients.lambda, options));
  const eventBridge = await runCleanupSafely('EventBridge', () => cleanupTaggedEventBridgeRules(clients.eventBridge, options));
  const dynamodb = await runCleanupSafely('DynamoDB', () => cleanupTaggedDynamoDbTables(clients.dynamodb, options));
  const s3 = await runCleanupSafely('S3', () => cleanupTaggedS3Buckets(clients.s3, options));

  return {
    lambda,
    eventBridge,
    dynamodb,
    s3,
    errors: [...lambda.errors, ...eventBridge.errors, ...dynamodb.errors, ...s3.errors],
  };
}

module.exports = {
  LAB_ENVIRONMENT,
  cleanupTaggedLambdaFunctions,
  cleanupTaggedEventBridgeRules,
  cleanupTaggedDynamoDbTables,
  cleanupTaggedS3Buckets,
  cleanupTaggedSandboxResources,
};
