const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { LambdaClient, ListFunctionsCommand, DeleteFunctionCommand } = require('@aws-sdk/client-lambda');
const { S3Client, ListBucketsCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key) {
      process.env[key] = value;
      const normalizedKey = key.toUpperCase();
      if (normalizedKey !== key) process.env[normalizedKey] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));

function makeFakeCredentials() {
  return {
    accessKeyId: `ASIA${Math.random().toString(36).slice(2,12).toUpperCase()}`,
    secretAccessKey: Math.random().toString(36).slice(2,40),
    sessionToken: Math.random().toString(36).repeat(4).slice(0,200),
    expiration: new Date(Date.now() + 900 * 1000).toISOString(),
  };
}

async function assumeSandboxRole(sessionName) {
  const { BACKEND_AWS_ACCESS_KEY_ID, BACKEND_AWS_SECRET_ACCESS_KEY, AWS_LAB_ROLE_ARN } = process.env;

  if (!BACKEND_AWS_ACCESS_KEY_ID || !BACKEND_AWS_SECRET_ACCESS_KEY || !AWS_LAB_ROLE_ARN) {
    console.warn('[lab] Missing backend credentials — using fake credentials');
    return makeFakeCredentials();
  }

  const sts = new STSClient({
    region: 'ap-south-1',
    credentials: { accessKeyId: BACKEND_AWS_ACCESS_KEY_ID, secretAccessKey: BACKEND_AWS_SECRET_ACCESS_KEY },
  });

  const response = await sts.send(new AssumeRoleCommand({
    RoleArn: AWS_LAB_ROLE_ARN,
    RoleSessionName: sessionName,
    DurationSeconds: 900,
  }));

  const creds = response.Credentials;
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration ? creds.Expiration.toISOString() : new Date(Date.now() + 900 * 1000).toISOString(),
  };
}

async function buildLoginUrl(credentials, destination) {
  const sessionJSON = JSON.stringify({
    sessionId: credentials.accessKeyId,
    sessionKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  });

  const tokenUrl = `https://signin.aws.amazon.com/federation?Action=getSigninToken&Session=${encodeURIComponent(sessionJSON)}`;
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) return null;

  const tokenData = await tokenRes.json();
  const signinToken = tokenData && tokenData.SigninToken;
  if (!signinToken) return null;

  return `https://signin.aws.amazon.com/federation?Action=login&Issuer=LearningLabPlatform&Destination=${encodeURIComponent(destination)}&SigninToken=${encodeURIComponent(signinToken)}`;
}

// Destroy ALL resources in the sandbox account — no tag filtering
async function cleanupSessionResources(sessionId) {
  const { BACKEND_AWS_ACCESS_KEY_ID, BACKEND_AWS_SECRET_ACCESS_KEY } = process.env;
  if (!BACKEND_AWS_ACCESS_KEY_ID || !BACKEND_AWS_SECRET_ACCESS_KEY) return;

  const clientConfig = {
    region: 'ap-south-1',
    credentials: { accessKeyId: BACKEND_AWS_ACCESS_KEY_ID, secretAccessKey: BACKEND_AWS_SECRET_ACCESS_KEY },
  };

  const results = { lambda: 0, s3Buckets: 0, errors: [] };

  // Delete ALL Lambda functions
  try {
    const lambda = new LambdaClient(clientConfig);
    let marker;
    do {
      const { Functions = [], NextMarker } = await lambda.send(new ListFunctionsCommand({ Marker: marker }));
      marker = NextMarker;
      for (const fn of Functions) {
        try {
          await lambda.send(new DeleteFunctionCommand({ FunctionName: fn.FunctionName }));
          results.lambda++;
          console.log(`[cleanup] Deleted Lambda: ${fn.FunctionName}`);
        } catch (e) {
          results.errors.push(`Lambda ${fn.FunctionName}: ${e.message}`);
        }
      }
    } while (marker);
  } catch (e) {
    results.errors.push(`Lambda list: ${e.message}`);
  }

  // Delete ALL S3 buckets (empty each one first)
  try {
    const s3 = new S3Client(clientConfig);
    const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));

    for (const bucket of Buckets) {
      try {
        // Drain all object versions + delete markers (works for versioned buckets too)
        let continuationToken;
        do {
          const { Contents = [], NextContinuationToken } = await s3.send(
            new ListObjectsV2Command({ Bucket: bucket.Name, ContinuationToken: continuationToken })
          );
          continuationToken = NextContinuationToken;
          if (Contents.length > 0) {
            await s3.send(new DeleteObjectsCommand({
              Bucket: bucket.Name,
              Delete: { Objects: Contents.map(o => ({ Key: o.Key })) },
            }));
          }
        } while (continuationToken);

        await s3.send(new DeleteBucketCommand({ Bucket: bucket.Name }));
        results.s3Buckets++;
        console.log(`[cleanup] Deleted S3 bucket: ${bucket.Name}`);
      } catch (e) {
        results.errors.push(`S3 ${bucket.Name}: ${e.message}`);
      }
    }
  } catch (e) {
    results.errors.push(`S3 list: ${e.message}`);
  }

  console.log(`[cleanup] Session ${sessionId} done — Lambda: ${results.lambda}, S3: ${results.s3Buckets}`);
  if (results.errors.length) console.warn('[cleanup] Errors:', results.errors);
  return results;
}

app.post('/start-lab', async (req, res) => {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const destination = (req.body && req.body.destination) || process.env.VITE_AWS_CONSOLE_DESTINATION || '';
  const accountId = process.env.LAB_ACCOUNT_ID || '';
  const accountName = process.env.LAB_ACCOUNT_NAME || '';

  console.log('[lab] start-lab ->', sessionId);

  try {
    const credentials = await assumeSandboxRole(sessionId);

    let loginUrl = null;
    if (destination) {
      try { loginUrl = await buildLoginUrl(credentials, destination); }
      catch (e) { console.error('[lab] federation URL failed ->', e.message); }
    }

    res.json({
      sessionId,
      credentials,
      ...(accountName ? { accountName } : {}),
      ...(accountId ? { accountId } : {}),
      ...(destination ? { consoleUrl: destination } : {}),
      ...(loginUrl ? { loginUrl } : {}),
    });

    console.log('[lab] credentials issued ->', sessionId);
  } catch (error) {
    console.error('[lab] start-lab error ->', error.message);
    res.status(500).json({ error: 'Failed to generate lab credentials', details: error.message });
  }
});

app.post('/stop-lab', async (req, res) => {
  const { sessionId } = req.body || {};
  console.log('[lab] stop-lab — nuking all sandbox resources (session:', sessionId, ')');

  // Fire cleanup in background — don't block the response
  cleanupSessionResources(sessionId).catch(e => console.error('[cleanup] failed ->', e.message));

  res.json({ success: true });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[lab] Server running on http://localhost:${port}`));
