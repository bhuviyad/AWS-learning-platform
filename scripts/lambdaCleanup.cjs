const {
  DeleteFunctionCommand,
  ListFunctionsCommand,
  ListTagsCommand,
} = require('@aws-sdk/client-lambda');

const LAB_ENVIRONMENT = 'LearningLab';

function parseTags(tags) {
  const environment = (tags && tags.Environment) || '';
  const sessionId = (tags && tags.SessionId) || '';
  const expirationRaw = (tags && (tags.ExpirationTime || tags.ExpiresAt)) || '';
  const expirationTime = Number(expirationRaw);

  return {
    environment,
    sessionId,
    expirationRaw,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
  };
}

function shouldDeleteFunction(tags, options) {
  const parsed = parseTags(tags);
  if (parsed.environment !== LAB_ENVIRONMENT) return false;
  if (options.sessionId && parsed.sessionId !== options.sessionId) return false;
  if (options.mode === 'manual') return true;
  return parsed.expirationTime !== null && parsed.expirationTime <= options.now;
}

async function cleanupTaggedLambdaFunctions(client, options = {}) {
  const mode = options.mode || 'scheduled';
  const now = options.now || Date.now();
  const stats = { inspected: 0, deleted: 0, skipped: 0, errors: [] };

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

module.exports = {
  LAB_ENVIRONMENT,
  cleanupTaggedLambdaFunctions,
};
