const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const { cleanupTaggedLambdaFunctions } = require('../lambdaCleanup.cjs');

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
    accessKeyId: `ASIA${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    secretAccessKey: Math.random().toString(36).slice(2, 40),
    sessionToken: Math.random().toString(36).repeat(4).slice(0, 200),
    expiration: new Date(Date.now() + 900 * 1000).toISOString(),
  };
}

function getBackendCredentials() {
  const accessKeyId = process.env.BACKEND_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_LAB_USER_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKEND_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_LAB_USER_SECRET_ACCESS_KEY;
  const sessionToken = process.env.BACKEND_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN || process.env.AWS_LAB_USER_SESSION_TOKEN;
  const region = process.env.AWS_REGION || 'ap-south-1';

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return { accessKeyId, secretAccessKey, sessionToken, region };
}

function createLambdaClientFromBackend() {
  const backend = getBackendCredentials();
  if (!backend) return null;

  return new LambdaClient({
    region: backend.region,
    credentials: {
      accessKeyId: backend.accessKeyId,
      secretAccessKey: backend.secretAccessKey,
      ...(backend.sessionToken ? { sessionToken: backend.sessionToken } : {}),
    },
  });
}

async function assumeSandboxRole(sessionId, identity) {
  const backend = getBackendCredentials();
  if (!backend || !process.env.AWS_LAB_ROLE_ARN) {
    console.warn('[lab] Missing backend credentials — using fake credentials');
    return makeFakeCredentials();
  }

  const sts = new STSClient({
    region: backend.region,
    credentials: {
      accessKeyId: backend.accessKeyId,
      secretAccessKey: backend.secretAccessKey,
      ...(backend.sessionToken ? { sessionToken: backend.sessionToken } : {}),
    },
  });

  const expiration = Date.now() + 900 * 1000;
  const tags = [
    { Key: 'Environment', Value: 'LearningLab' },
    { Key: 'SessionId', Value: sessionId },
    { Key: 'ExpirationTime', Value: String(expiration) },
  ];
  if (identity.userId) tags.push({ Key: 'UserId', Value: identity.userId });
  if (identity.userEmail) tags.push({ Key: 'UserEmail', Value: identity.userEmail });
  if (identity.userName) tags.push({ Key: 'UserName', Value: identity.userName });
  if (identity.awsIdentityCenterUsername) tags.push({ Key: 'IdentityCenterUsername', Value: identity.awsIdentityCenterUsername });
  if (identity.awsIdentityCenterEmail) tags.push({ Key: 'IdentityCenterEmail', Value: identity.awsIdentityCenterEmail });
  if (identity.permissionSetName) tags.push({ Key: 'PermissionSetName', Value: identity.permissionSetName });
  if (identity.awsAccountId) tags.push({ Key: 'AccountId', Value: identity.awsAccountId });

  const response = await sts.send(new AssumeRoleCommand({
    RoleArn: process.env.AWS_LAB_ROLE_ARN,
    RoleSessionName: `lab-${sessionId.slice(0, 8)}`,
    DurationSeconds: 900,
    Tags: tags,
  }));

  const creds = response.Credentials;
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration ? creds.Expiration.toISOString() : new Date(expiration).toISOString(),
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

async function cleanupSessionResources(sessionId, mode = 'manual') {
  const client = createLambdaClientFromBackend();
  if (!client) {
    return { inspected: 0, deleted: 0, skipped: 0, errors: ['Backend AWS credentials are not configured'] };
  }

  return cleanupTaggedLambdaFunctions(client, { sessionId, mode });
}

async function cleanupExpiredResources() {
  const client = createLambdaClientFromBackend();
  if (!client) {
    return { inspected: 0, deleted: 0, skipped: 0, errors: ['Backend AWS credentials are not configured'] };
  }

  return cleanupTaggedLambdaFunctions(client, { mode: 'scheduled' });
}

app.post('/start-lab', async (req, res) => {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const destination = (req.body && req.body.destination) || process.env.VITE_AWS_CONSOLE_DESTINATION || '';
  const identity = {
    userId: (req.body && req.body.userId) || '',
    userEmail: (req.body && req.body.userEmail) || '',
    userName: (req.body && req.body.userName) || '',
    awsIdentityCenterUsername: (req.body && req.body.awsIdentityCenterUsername) || '',
    awsIdentityCenterEmail: (req.body && req.body.awsIdentityCenterEmail) || '',
    permissionSetName: (req.body && req.body.permissionSetName) || '',
    awsAccountId: (req.body && req.body.awsAccountId) || process.env.LAB_ACCOUNT_ID || '',
  };
  const accountId = process.env.LAB_ACCOUNT_ID || '';
  const accountName = process.env.LAB_ACCOUNT_NAME || '';
  const lambdaExecutionRoleArn = process.env.AWS_LAMBDA_EXECUTION_ROLE_ARN || '';

  console.log('[lab] start-lab ->', sessionId, identity.userEmail || identity.userId || identity.userName || 'anonymous');

  try {
    const credentials = await assumeSandboxRole(sessionId, identity);
    const loginUrl = destination ? await buildLoginUrl(credentials, destination) : null;

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    res.json({
      sessionId,
      ...identity,
      credentials,
      ...(accountName ? { accountName } : {}),
      ...(accountId ? { accountId } : {}),
      ...(destination ? { consoleUrl: destination } : {}),
      ...(lambdaExecutionRoleArn ? { lambdaExecutionRoleArn } : {}),
      expiresAt,
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
  const cleanedSessionId = String(sessionId || '').trim();

  if (!cleanedSessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  console.log('[lab] stop-lab cleanup ->', cleanedSessionId);

  try {
    const cleanup = await cleanupSessionResources(cleanedSessionId, 'manual');
    res.json({ success: true, sessionId: cleanedSessionId, cleanup });
  } catch (error) {
    console.error('[cleanup] failed ->', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/cleanup-expired-labs', async (_req, res) => {
  try {
    const cleanup = await cleanupExpiredResources();
    res.json({ success: true, cleanup });
  } catch (error) {
    console.error('[cleanup] failed ->', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[lab] Server running on http://localhost:${port}`));
