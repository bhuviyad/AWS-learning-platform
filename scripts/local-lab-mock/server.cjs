const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const { createClient } = require('@supabase/supabase-js');
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

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function mapInternProfileRow(row) {
  return {
    id: row.id,
    appUserId: row.app_user_id || row.appUserId || row.app_user_email || '',
    appUserName: row.display_name || row.appUserName || 'Intern',
    appUserEmail: row.app_user_email || row.appUserEmail || '',
    awsIdentityCenterUsername: row.aws_identity_center_username || row.awsIdentityCenterUsername || '',
    awsIdentityCenterEmail: row.aws_identity_center_email || row.awsIdentityCenterEmail || '',
    awsAccountId: row.aws_account_id || row.awsAccountId || process.env.LAB_ACCOUNT_ID || '',
    permissionSetName: row.permission_set_name || row.permissionSetName || 'LearningLabSandbox',
    status: row.status || 'active',
    notes: row.notes || '',
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
  };
}

function mapInternProfilePayload(profile) {
  return {
    app_user_id: profile.appUserId || '',
    app_user_email: profile.appUserEmail,
    display_name: profile.appUserName,
    aws_identity_center_username: profile.awsIdentityCenterUsername || '',
    aws_identity_center_email: profile.awsIdentityCenterEmail || '',
    aws_account_id: profile.awsAccountId || process.env.LAB_ACCOUNT_ID || '',
    permission_set_name: profile.permissionSetName || 'LearningLabSandbox',
    status: profile.status || 'active',
    notes: profile.notes || '',
  };
}

function isSupabaseConfigured() {
  return Boolean(getSupabaseAdminClient());
}

async function listInternProfilesFromDb() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await client
    .from('intern_profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapInternProfileRow);
}

async function saveInternProfileToDb(profile) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const payload = mapInternProfilePayload(profile);
  const { data, error } = await client
    .from('intern_profiles')
    .upsert(payload, { onConflict: 'app_user_email' })
    .select('*')
    .single();

  if (error) throw error;
  return mapInternProfileRow(data);
}

async function deleteInternProfileFromDb(profileId) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await client
    .from('intern_profiles')
    .delete()
    .eq('id', profileId);

  if (error) throw error;
}

function mapLearningProgressRow(row) {
  return {
    id: row.id,
    appUserId: row.app_user_id || row.appUserId || '',
    appUserEmail: row.app_user_email || row.appUserEmail || '',
    appUserName: row.app_user_name || row.appUserName || '',
    lessonId: row.lesson_id || row.lessonId || '',
    lessonTitle: row.lesson_title || row.lessonTitle || '',
    completed: Boolean(row.completed),
    completedAt: row.completed_at || row.completedAt || null,
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
  };
}

function mapLearningProgressPayload(input) {
  const completed = input.completed !== false;
  return {
    app_user_id: input.userId,
    app_user_email: input.userEmail || '',
    app_user_name: input.userName || '',
    lesson_id: input.lessonId,
    lesson_title: input.lessonTitle || '',
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  };
}

async function listLearningProgressFromDb(userId) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await client
    .from('learning_progress')
    .select('*')
    .eq('app_user_id', userId)
    .order('lesson_id', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapLearningProgressRow);
}

async function saveLearningProgressToDb(input) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const payload = mapLearningProgressPayload(input);
  const { data, error } = await client
    .from('learning_progress')
    .upsert(payload, { onConflict: 'app_user_id,lesson_id' })
    .select('*')
    .single();

  if (error) throw error;
  return mapLearningProgressRow(data);
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

app.get('/intern-profiles', async (_req, res) => {
  try {
    const profiles = await listInternProfilesFromDb();
    res.json({ profiles });
  } catch (error) {
    console.error('[intern-profiles] list error ->', error.message);
    res.status(503).json({ error: error.message });
  }
});

app.post('/intern-profiles', async (req, res) => {
  const incoming = req.body && req.body.profile ? req.body.profile : req.body || {};

  try {
    const profile = {
      id: incoming.id || '',
      appUserId: incoming.appUserId || '',
      appUserName: incoming.appUserName || incoming.display_name || 'Intern',
      appUserEmail: incoming.appUserEmail || incoming.app_user_email || '',
      awsIdentityCenterUsername: incoming.awsIdentityCenterUsername || incoming.aws_identity_center_username || '',
      awsIdentityCenterEmail: incoming.awsIdentityCenterEmail || incoming.aws_identity_center_email || '',
      awsAccountId: incoming.awsAccountId || incoming.aws_account_id || process.env.LAB_ACCOUNT_ID || '',
      permissionSetName: incoming.permissionSetName || incoming.permission_set_name || 'LearningLabSandbox',
      status: incoming.status || 'active',
      notes: incoming.notes || '',
    };

    if (!profile.appUserEmail) {
      return res.status(400).json({ error: 'appUserEmail is required' });
    }

    const saved = await saveInternProfileToDb(profile);
    res.json({ profile: saved });
  } catch (error) {
    console.error('[intern-profiles] save error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/intern-profiles/:id', async (req, res) => {
  const profileId = String(req.params.id || '').trim();
  if (!profileId) {
    return res.status(400).json({ error: 'profile id is required' });
  }

  try {
    await deleteInternProfileFromDb(profileId);
    res.json({ success: true, profileId });
  } catch (error) {
    console.error('[intern-profiles] delete error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/learning-progress', async (req, res) => {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const progress = await listLearningProgressFromDb(userId);
    res.json({ progress });
  } catch (error) {
    console.error('[learning-progress] list error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/learning-progress', async (req, res) => {
  const body = req.body || {};
  const input = {
    userId: String(body.userId || '').trim(),
    userEmail: String(body.userEmail || '').trim(),
    userName: String(body.userName || '').trim(),
    lessonId: String(body.lessonId || '').trim(),
    lessonTitle: String(body.lessonTitle || '').trim(),
    completed: body.completed !== false,
  };

  if (!input.userId || !input.lessonId) {
    return res.status(400).json({ error: 'userId and lessonId are required' });
  }

  try {
    const progress = await saveLearningProgressToDb(input);
    res.json({ progress });
  } catch (error) {
    console.error('[learning-progress] save error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[lab] Server running on http://localhost:${port}`));
