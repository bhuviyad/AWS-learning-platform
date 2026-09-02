const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');
const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const { cleanupTaggedSandboxResources } = require('../lambdaCleanup.cjs');

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
  const expirationTime = Date.now() + 900 * 1000;
  return {
    accessKeyId: `ASIA${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    secretAccessKey: Math.random().toString(36).slice(2, 40),
    sessionToken: Math.random().toString(36).repeat(4).slice(0, 200),
    expiration: new Date(expirationTime).toISOString(),
    resourceExpirationTime: String(expirationTime),
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

function createEventBridgeClientFromBackend() {
  const backend = getBackendCredentials();
  if (!backend) return null;

  return new EventBridgeClient({
    region: backend.region,
    credentials: {
      accessKeyId: backend.accessKeyId,
      secretAccessKey: backend.secretAccessKey,
      ...(backend.sessionToken ? { sessionToken: backend.sessionToken } : {}),
    },
  });
}

function createDynamoDbClientFromBackend() {
  const backend = getBackendCredentials();
  if (!backend) return null;

  return new DynamoDBClient({
    region: backend.region,
    credentials: {
      accessKeyId: backend.accessKeyId,
      secretAccessKey: backend.secretAccessKey,
      ...(backend.sessionToken ? { sessionToken: backend.sessionToken } : {}),
    },
  });
}

function createS3ClientFromBackend() {
  const backend = getBackendCredentials();
  if (!backend) return null;

  return new S3Client({
    region: backend.region,
    credentials: {
      accessKeyId: backend.accessKeyId,
      secretAccessKey: backend.secretAccessKey,
      ...(backend.sessionToken ? { sessionToken: backend.sessionToken } : {}),
    },
  });
}

function createCleanupClientsFromBackend() {
  return {
    lambda: createLambdaClientFromBackend(),
    eventBridge: createEventBridgeClientFromBackend(),
    dynamodb: createDynamoDbClientFromBackend(),
    s3: createS3ClientFromBackend(),
  };
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

async function upsertUserPresence(input) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');

  const now = new Date().toISOString();
  const { data: existing, error: readError } = await client
    .from('user_presence')
    .select('first_login_at,last_login_at,current_lesson_id,current_lesson_title')
    .eq('app_user_id', input.userId)
    .maybeSingle();
  if (readError) throw readError;

  const payload = {
    app_user_id: input.userId,
    app_user_email: input.userEmail,
    app_user_name: input.userName,
    first_login_at: existing?.first_login_at || now,
    last_login_at: input.login ? now : (existing?.last_login_at || now),
    last_seen_at: now,
    current_page: input.currentPage || 'learning',
    current_lesson_id: input.currentLessonId === undefined ? (existing?.current_lesson_id || null) : input.currentLessonId,
    current_lesson_title: input.currentLessonTitle === undefined ? (existing?.current_lesson_title || null) : input.currentLessonTitle,
    signed_out_at: null,
  };

  const { error } = await client
    .from('user_presence')
    .upsert(payload, { onConflict: 'app_user_id' });
  if (error) throw error;
}

async function signOutUserPresence(userId) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');
  const now = new Date().toISOString();
  const { error } = await client
    .from('user_presence')
    .update({ signed_out_at: now, last_seen_at: now })
    .eq('app_user_id', userId);
  if (error) throw error;
}

function assertAdminRequest(req) {
  const configuredAdmin = String(process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
  const requestAdmin = String(req.get('x-admin-email') || '').trim().toLowerCase();
  if (!configuredAdmin) {
    const error = new Error('ADMIN_EMAIL is not configured on the backend');
    error.statusCode = 503;
    throw error;
  }
  if (!requestAdmin || requestAdmin !== configuredAdmin) {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
}

function isPresenceOnline(row, nowMs) {
  const lastSeen = Date.parse(row.last_seen_at || '');
  if (!Number.isFinite(lastSeen) || nowMs - lastSeen > 2 * 60 * 1000) return false;
  const signedOut = Date.parse(row.signed_out_at || '');
  return !Number.isFinite(signedOut) || signedOut < lastSeen;
}

async function buildAdminDashboard() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');

  const [profilesResult, sessionsResult, progressResult, presenceResult] = await Promise.all([
    client.from('intern_profiles').select('*').order('display_name', { ascending: true }),
    client.from('lab_sessions').select('*').order('start_time', { ascending: false }).limit(250),
    client.from('learning_progress').select('*').order('completed_at', { ascending: false }),
    client.from('user_presence').select('*').order('last_seen_at', { ascending: false }),
  ]);

  for (const result of [profilesResult, sessionsResult, progressResult, presenceResult]) {
    if (result.error) throw result.error;
  }

  const profiles = profilesResult.data || [];
  const rawSessions = sessionsResult.data || [];
  const rawProgress = progressResult.data || [];
  const rawPresence = presenceResult.data || [];
  const nowMs = Date.now();
  const presenceByUser = new Map(rawPresence.map((row) => [row.app_user_id, row]));
  const presenceByEmail = new Map(rawPresence.map((row) => [String(row.app_user_email || '').toLowerCase(), row]));
  const profileByEmail = new Map(profiles.map((row) => [String(row.app_user_email || '').toLowerCase(), row]));

  const presence = rawPresence.map((row) => ({
    appUserId: row.app_user_id,
    email: row.app_user_email,
    name: row.app_user_name,
    currentPage: row.current_page || 'unknown',
    currentLessonId: row.current_lesson_id || null,
    currentLessonTitle: row.current_lesson_title || null,
    firstLoginAt: row.first_login_at,
    lastLoginAt: row.last_login_at,
    lastSeenAt: row.last_seen_at,
    signedOutAt: row.signed_out_at || null,
    online: isPresenceOnline(row, nowMs),
  }));

  const sessions = rawSessions.map((row) => {
    const presenceRow = presenceByUser.get(row.app_user_id) || presenceByEmail.get(String(row.intern_email || '').toLowerCase());
    const profile = profileByEmail.get(String(row.intern_email || '').toLowerCase());
    const endTimeMs = Date.parse(row.end_time || '');
    return {
      id: row.id,
      sessionId: row.session_tag || '',
      appUserId: row.app_user_id || '',
      name: row.intern_name || profile?.display_name || presenceRow?.app_user_name || 'Unknown intern',
      email: row.intern_email || profile?.app_user_email || presenceRow?.app_user_email || '',
      status: row.status,
      cleanupState: row.cleanup_state || 'pending',
      revocationState: row.revocation_state || 'not_requested',
      revocationError: row.revocation_error || null,
      revokedAt: row.revoked_at || null,
      startTime: row.start_time,
      endTime: row.end_time,
      remainingMs: Number.isFinite(endTimeMs) ? Math.max(0, endTimeMs - nowMs) : 0,
      accountId: row.aws_account_id || '',
      awsUsername: row.aws_identity_center_username || profile?.aws_identity_center_username || '',
      online: presenceRow ? isPresenceOnline(presenceRow, nowMs) : false,
    };
  });

  const progressByUser = new Map();
  for (const row of rawProgress) {
    if (!row.completed) continue;
    const current = progressByUser.get(row.app_user_id) || { count: 0, lastCompletedAt: null, name: row.app_user_name, email: row.app_user_email };
    current.count += 1;
    if (!current.lastCompletedAt || Date.parse(row.completed_at || '') > Date.parse(current.lastCompletedAt || '')) {
      current.lastCompletedAt = row.completed_at || null;
    }
    progressByUser.set(row.app_user_id, current);
  }

  const userIds = new Set([...profiles.map((row) => row.app_user_id).filter(Boolean), ...rawPresence.map((row) => row.app_user_id), ...progressByUser.keys()]);
  const progress = [...userIds].map((userId) => {
    const presenceRow = presenceByUser.get(userId);
    const profile = profiles.find((row) => row.app_user_id === userId)
      || profileByEmail.get(String(presenceRow?.app_user_email || '').toLowerCase());
    const completion = progressByUser.get(userId) || { count: 0, lastCompletedAt: null };
    const completedLessons = Math.min(6, completion.count);
    return {
      appUserId: userId,
      name: profile?.display_name || presenceRow?.app_user_name || completion.name || 'Unknown intern',
      email: profile?.app_user_email || presenceRow?.app_user_email || completion.email || '',
      profileStatus: profile?.status || 'unassigned',
      completedLessons,
      totalLessons: 6,
      completionPercent: Math.round((completedLessons / 6) * 100),
      lastCompletedAt: completion.lastCompletedAt,
      currentPage: presenceRow?.current_page || 'offline',
      currentLessonTitle: presenceRow?.current_lesson_title || null,
      online: presenceRow ? isPresenceOnline(presenceRow, nowMs) : false,
    };
  }).sort((a, b) => b.completionPercent - a.completionPercent);

  const sessionsByDay = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(nowMs - offset * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    sessionsByDay.push({
      day: key,
      sessions: rawSessions.filter((row) => String(row.start_time || '').slice(0, 10) === key).length,
    });
  }

  const cleanupCounts = new Map();
  for (const row of rawSessions) {
    const key = row.cleanup_state || 'pending';
    cleanupCounts.set(key, (cleanupCounts.get(key) || 0) + 1);
  }
  const cleanupBreakdown = [...cleanupCounts.entries()].map(([name, value]) => ({ name, value }));
  const averageCompletion = progress.length
    ? Math.round(progress.reduce((total, row) => total + row.completionPercent, 0) / progress.length)
    : 0;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    summary: {
      onlineNow: presence.filter((row) => row.online).length,
      activeSessions: sessions.filter((row) => row.status === 'active' && row.remainingMs > 0).length,
      totalInterns: profiles.filter((row) => row.status === 'active').length,
      averageCompletion,
      cleanupFailures: sessions.filter((row) => row.cleanupState === 'failed').length,
    },
    presence,
    sessions,
    progress,
    sessionsByDay,
    cleanupBreakdown,
  };
}

async function saveLabSessionToDb(sessionId, identity, startTime, endTime) {
  const client = getSupabaseAdminClient();
  if (!client) return;

  const payload = {
    session_tag: sessionId,
    app_user_id: identity.userId || '',
    status: 'active',
    start_time: new Date(startTime).toISOString(),
    end_time: new Date(endTime).toISOString(),
    expiration_time: new Date(endTime).toISOString(),
    cleanup_state: 'scheduled',
    intern_email: identity.userEmail || '',
    intern_name: identity.userName || '',
    aws_identity_center_username: identity.awsIdentityCenterUsername || '',
    aws_identity_center_email: identity.awsIdentityCenterEmail || '',
    aws_account_id: identity.awsAccountId || process.env.LAB_ACCOUNT_ID || '',
  };

  const { error } = await client
    .from('lab_sessions')
    .upsert(payload, { onConflict: 'session_tag' });

  if (error) throw error;
}

async function updateLabSessionCleanupState(sessionId, status, cleanupState) {
  const client = getSupabaseAdminClient();
  if (!client) return;

  const { error } = await client
    .from('lab_sessions')
    .update({ status, cleanup_state: cleanupState })
    .eq('session_tag', sessionId);

  if (error) throw error;
}

async function updateLabSessionRevocationState(sessionId, revocationState, revocationError = null) {
  const client = getSupabaseAdminClient();
  if (!client) return;

  const { error } = await client
    .from('lab_sessions')
    .update({
      revocation_state: revocationState,
      revocation_error: revocationError,
      revoked_at: revocationState === 'revoked' ? new Date().toISOString() : null,
    })
    .eq('session_tag', sessionId);

  if (error) throw error;
}

async function revokeLabSession(sessionId, expirationTime) {
  const functionName = String(process.env.AWS_SESSION_REVOKER_FUNCTION_NAME || '').trim();
  if (!functionName) throw new Error('AWS_SESSION_REVOKER_FUNCTION_NAME is not configured');

  const numericExpiration = Number(expirationTime);
  if (!Number.isFinite(numericExpiration)) throw new Error('Valid expirationTime is required for session revocation');

  const lambda = createLambdaClientFromBackend();
  if (!lambda) throw new Error('Backend AWS credentials are not configured');

  const response = await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ sessionId, expirationTime: numericExpiration })),
  }));

  const payloadText = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '{}';
  let payload;
  try {
    payload = JSON.parse(payloadText || '{}');
  } catch {
    payload = { raw: payloadText };
  }

  if (response.FunctionError) {
    const message = payload?.errorMessage || payload?.error || response.FunctionError;
    throw new Error(`Session revoker failed: ${message}`);
  }

  return payload;
}

async function listExpiredLabSessionIds() {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  const { data, error } = await client
    .from('lab_sessions')
    .select('session_tag')
    .lte('end_time', new Date().toISOString())
    .neq('cleanup_state', 'deleted')
    .not('session_tag', 'is', null);

  if (error) throw error;
  return (data || []).map((row) => row.session_tag).filter(Boolean);
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
    RoleSessionName: `lab-${sessionId.replace(/[^A-Za-z0-9+=,.@_-]/g, '-').slice(-48)}`,
    DurationSeconds: 900,
    Tags: tags,
  }));

  const creds = response.Credentials;
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration ? creds.Expiration.toISOString() : new Date(expiration).toISOString(),
    resourceExpirationTime: String(expiration),
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
  const clients = createCleanupClientsFromBackend();
  if (!clients.lambda && !clients.eventBridge && !clients.dynamodb && !clients.s3) {
    return { errors: ['Backend AWS credentials are not configured'] };
  }

  return cleanupTaggedSandboxResources(clients, { sessionId, mode });
}

async function cleanupExpiredResources() {
  const clients = createCleanupClientsFromBackend();
  if (!clients.lambda && !clients.eventBridge && !clients.dynamodb && !clients.s3) {
    return { errors: ['Backend AWS credentials are not configured'] };
  }

  let expiredSessionIds = [];
  try {
    expiredSessionIds = await listExpiredLabSessionIds();
  } catch (error) {
    console.warn('[cleanup] unable to load expired sessions ->', error.message);
  }

  const sessions = {};
  for (const sessionId of expiredSessionIds) {
    try {
      const cleanup = await cleanupTaggedSandboxResources(clients, { sessionId, mode: 'manual' });
      sessions[sessionId] = cleanup;
      const cleanupState = cleanup.errors.length > 0 ? 'failed' : 'deleted';
      await updateLabSessionCleanupState(sessionId, 'expired', cleanupState).catch((error) => {
        console.warn(`[cleanup] unable to update session ${sessionId} ->`, error.message);
      });
    } catch (error) {
      sessions[sessionId] = { errors: [error.message] };
      await updateLabSessionCleanupState(sessionId, 'expired', 'failed').catch(() => {});
    }
  }

  const taggedFallback = await cleanupTaggedSandboxResources(clients, { mode: 'scheduled' });
  return { sessions, taggedFallback, errors: taggedFallback.errors };
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

    const startTime = Date.now();
    const credentialEndTime = credentials.expiration ? Date.parse(credentials.expiration) : Number.NaN;
    const endTime = Number.isFinite(credentialEndTime) ? credentialEndTime : startTime + 15 * 60 * 1000;
    const expiresAt = new Date(endTime).toISOString();

    await saveLabSessionToDb(sessionId, identity, startTime, endTime).catch((error) => {
      console.warn('[lab] unable to persist session ->', error.message);
    });

    res.json({
      sessionId,
      ...identity,
      credentials,
      ...(accountName ? { accountName } : {}),
      ...(accountId ? { accountId } : {}),
      ...(destination ? { consoleUrl: destination } : {}),
      ...(lambdaExecutionRoleArn ? { lambdaExecutionRoleArn } : {}),
      resourceExpirationTime: credentials.resourceExpirationTime,
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
  const { sessionId, expirationTime, reason = 'manual' } = req.body || {};
  const cleanedSessionId = String(sessionId || '').trim();
  const cleanedReason = reason === 'expired' ? 'expired' : 'manual';

  if (!cleanedSessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  console.log('[lab] stop-lab cleanup ->', cleanedSessionId, cleanedReason);
  await updateLabSessionCleanupState(cleanedSessionId, 'stopping', 'scheduled').catch(() => {});

  let revocation = { skipped: true, reason: 'credentials naturally expired' };
  let revocationError = null;
  if (cleanedReason === 'manual') {
    await updateLabSessionRevocationState(cleanedSessionId, 'pending').catch(() => {});
    try {
      revocation = await revokeLabSession(cleanedSessionId, expirationTime);
      await updateLabSessionRevocationState(cleanedSessionId, 'revoked').catch(() => {});
    } catch (error) {
      revocationError = error.message;
      await updateLabSessionRevocationState(cleanedSessionId, 'failed', revocationError).catch(() => {});
    }
  } else {
    await updateLabSessionRevocationState(cleanedSessionId, 'expired').catch(() => {});
  }

  try {
    const cleanup = await cleanupSessionResources(cleanedSessionId, 'manual');
    const cleanupState = cleanup.errors.length > 0 ? 'failed' : 'deleted';
    await updateLabSessionCleanupState(cleanedSessionId, 'expired', cleanupState).catch((error) => {
      console.warn('[cleanup] unable to update session state ->', error.message);
    });

    if (revocationError) {
      return res.status(500).json({
        success: false,
        sessionId: cleanedSessionId,
        error: revocationError,
        revocation: { success: false, error: revocationError },
        cleanup,
      });
    }

    res.json({ success: cleanup.errors.length === 0, sessionId: cleanedSessionId, revocation, cleanup });
  } catch (error) {
    await updateLabSessionCleanupState(cleanedSessionId, 'expired', 'failed').catch(() => {});
    console.error('[cleanup] failed ->', error.message);
    res.status(500).json({ success: false, error: error.message, revocation });
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

app.post('/presence', async (req, res) => {
  const body = req.body || {};
  const input = {
    userId: String(body.userId || '').trim(),
    userEmail: String(body.userEmail || '').trim().toLowerCase(),
    userName: String(body.userName || '').trim(),
    currentPage: String(body.currentPage || 'learning').trim(),
    currentLessonId: Object.prototype.hasOwnProperty.call(body, 'currentLessonId')
      ? (body.currentLessonId ? String(body.currentLessonId).trim() : null)
      : undefined,
    currentLessonTitle: Object.prototype.hasOwnProperty.call(body, 'currentLessonTitle')
      ? (body.currentLessonTitle ? String(body.currentLessonTitle).trim() : null)
      : undefined,
    login: Boolean(body.login),
  };

  if (!input.userId || !input.userEmail || !input.userName) {
    return res.status(400).json({ error: 'userId, userEmail, and userName are required' });
  }

  try {
    await upsertUserPresence(input);
    res.json({ success: true });
  } catch (error) {
    console.error('[presence] update error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/presence/logout', async (req, res) => {
  const userId = String((req.body || {}).userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    await signOutUserPresence(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[presence] logout error ->', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin-dashboard', async (req, res) => {
  try {
    assertAdminRequest(req);
    const dashboard = await buildAdminDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('[admin-dashboard] error ->', error.message);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[lab] Server running on http://localhost:${port}`));
