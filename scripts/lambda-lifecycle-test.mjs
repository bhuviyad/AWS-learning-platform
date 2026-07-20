import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CreateFunctionCommand, DeleteFunctionCommand, GetFunctionCommand, LambdaClient, ListTagsCommand } from '@aws-sdk/client-lambda';

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
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env.local.example'));

const require = createRequire(import.meta.url);
const { cleanupTaggedLambdaFunctions } = require('./lambdaCleanup.cjs');

function env(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function createStoredZip(fileName, source) {
  const fileBytes = Buffer.from(source, 'utf8');
  const nameBytes = Buffer.from(fileName, 'utf8');
  const crc = crc32(fileBytes);
  const localHeader = Buffer.alloc(30 + nameBytes.length);
  const centralHeader = Buffer.alloc(46 + nameBytes.length);
  const endHeader = Buffer.alloc(22);

  // Local file header
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(fileBytes.length, 18);
  localHeader.writeUInt32LE(fileBytes.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBytes.copy(localHeader, 30);

  // Central directory header
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(fileBytes.length, 20);
  centralHeader.writeUInt32LE(fileBytes.length, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);
  nameBytes.copy(centralHeader, 46);

  const centralDirectoryOffset = localHeader.length + fileBytes.length;

  // End of central directory
  endHeader.writeUInt32LE(0x06054b50, 0);
  endHeader.writeUInt16LE(0, 4);
  endHeader.writeUInt16LE(0, 6);
  endHeader.writeUInt16LE(1, 8);
  endHeader.writeUInt16LE(1, 10);
  endHeader.writeUInt32LE(centralHeader.length, 12);
  endHeader.writeUInt32LE(centralDirectoryOffset, 16);
  endHeader.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, fileBytes, centralHeader, endHeader]);
}

async function assumeTaggedSession({ sessionId, expirationTime }) {
  const region = env('AWS_REGION', 'ap-south-1');
  const accessKeyId = env('BACKEND_AWS_ACCESS_KEY_ID') || env('AWS_ACCESS_KEY_ID') || env('AWS_LAB_USER_ACCESS_KEY_ID');
  const secretAccessKey = env('BACKEND_AWS_SECRET_ACCESS_KEY') || env('AWS_SECRET_ACCESS_KEY') || env('AWS_LAB_USER_SECRET_ACCESS_KEY');
  const sessionToken = env('BACKEND_AWS_SESSION_TOKEN') || env('AWS_SESSION_TOKEN') || env('AWS_LAB_USER_SESSION_TOKEN');
  const roleArn = env('AWS_LAB_ROLE_ARN');

  if (!accessKeyId || !secretAccessKey || !roleArn) {
    throw new Error('Backend AWS credentials and AWS_LAB_ROLE_ARN are required');
  }

  const sts = new STSClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });

  const response = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `labtest-${sessionId.slice(0, 8)}`,
    DurationSeconds: 900,
    Tags: [
      { Key: 'Environment', Value: 'LearningLab' },
      { Key: 'SessionId', Value: sessionId },
      { Key: 'ExpirationTime', Value: String(expirationTime) },
    ],
  }));

  if (!response.Credentials) {
    throw new Error('AssumeRole returned no credentials');
  }

  return {
    region,
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration ? response.Credentials.Expiration.toISOString() : new Date(expirationTime).toISOString(),
  };
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(`${message}\n`, () => { rl.close(); resolve(); }));
}

async function main() {
  const sessionId = `test-${crypto.randomUUID()}`;
  const expirationTime = Date.now() + 3 * 60 * 1000;
  const executionRoleArn = env('AWS_LAMBDA_EXECUTION_ROLE_ARN', 'arn:aws:iam::483591406604:role/interns-lambda-execution-role');
  const backendRoleArn = env('AWS_LAB_ROLE_ARN', 'arn:aws:iam::483591406604:role/interns-sandbox-role');
  const pauseBeforeCleanup = process.argv.includes('--pause') || process.argv.includes('--hold');
  if (!process.env.AWS_LAB_ROLE_ARN) {
    process.env.AWS_LAB_ROLE_ARN = backendRoleArn;
  }
  if (!process.env.AWS_LAMBDA_EXECUTION_ROLE_ARN) {
    process.env.AWS_LAMBDA_EXECUTION_ROLE_ARN = executionRoleArn;
  }

  if (!executionRoleArn) {
    throw new Error('AWS_LAMBDA_EXECUTION_ROLE_ARN is required to create the Lambda test function');
  }

  const session = await assumeTaggedSession({ sessionId, expirationTime });
  const lambda = new LambdaClient({
    region: session.region,
    credentials: {
      accessKeyId: session.accessKeyId,
      secretAccessKey: session.secretAccessKey,
      sessionToken: session.sessionToken,
    },
  });

  const functionName = `learninglab-${sessionId.slice(0, 12).replace(/[^a-zA-Z0-9-]/g, '')}`;
  const zip = createStoredZip(
    'index.js',
    "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ ok: true }) });\n"
  );

  console.log(`[test] creating Lambda ${functionName}`);
  const createResult = await lambda.send(new CreateFunctionCommand({
    FunctionName: functionName,
    Runtime: 'nodejs20.x',
    Handler: 'index.handler',
    Role: executionRoleArn,
    Timeout: 3,
    Publish: true,
    Code: { ZipFile: zip },
    Tags: {
      Environment: 'LearningLab',
      SessionId: sessionId,
      ExpirationTime: String(expirationTime),
    },
  }));

  const functionArn = createResult.FunctionArn;
  if (!functionArn) {
    throw new Error('Lambda creation did not return a function ARN');
  }

  const tags = await lambda.send(new ListTagsCommand({ Resource: functionArn }));
  console.log('[test] tags after create:', JSON.stringify(tags.Tags || {}, null, 2));

  if (pauseBeforeCleanup) {
    console.log(`[test] pause mode enabled. Inspect the Lambda in AWS now: ${functionName}`);
    await waitForEnter('[test] Press Enter to continue to cleanup...');
  }

  console.log('[test] simulating timeout cleanup using the shared cleanup helper');
  const cleanup = await cleanupTaggedLambdaFunctions(lambda, {
    sessionId,
    mode: 'scheduled',
    now: expirationTime + 1000,
  });
  console.log('[test] cleanup result:', JSON.stringify(cleanup, null, 2));

  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    throw new Error('Lambda still exists after cleanup');
  } catch (error) {
    console.log('[test] confirmed Lambda was deleted');
    if (error && typeof error === 'object' && 'name' in error && String(error.name) !== 'ResourceNotFoundException') {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('[test] lambda lifecycle test failed:', error);
  process.exitCode = 1;
});
