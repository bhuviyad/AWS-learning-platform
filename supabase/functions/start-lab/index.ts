const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractXml(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`));
  return match ? match[1] : '';
}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

async function hash(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(msg));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildAssumeRoleBody(
  roleArn: string,
  sessionId: string,
  expirationTime: number,
  identity: {
    userId?: string;
    userEmail?: string;
    userName?: string;
    awsIdentityCenterUsername?: string;
    awsIdentityCenterEmail?: string;
    permissionSetName?: string;
    awsAccountId?: string;
  } = {},
) {
  const params = new URLSearchParams({
    Action: 'AssumeRole',
    RoleArn: roleArn,
    RoleSessionName: `lab-${sessionId.slice(0, 8)}`,
    DurationSeconds: '900',
    Version: '2011-06-15',
  });

  const tags: Array<{ key: string; value: string }> = [
    { key: 'Environment', value: 'LearningLab' },
    { key: 'SessionId', value: sessionId },
    { key: 'ExpirationTime', value: String(expirationTime) },
  ];

  if (identity.userId) tags.push({ key: 'UserId', value: identity.userId });
  if (identity.userEmail) tags.push({ key: 'UserEmail', value: identity.userEmail });
  if (identity.userName) tags.push({ key: 'UserName', value: identity.userName });
  if (identity.awsIdentityCenterUsername) tags.push({ key: 'IdentityCenterUsername', value: identity.awsIdentityCenterUsername });
  if (identity.awsIdentityCenterEmail) tags.push({ key: 'IdentityCenterEmail', value: identity.awsIdentityCenterEmail });
  if (identity.permissionSetName) tags.push({ key: 'PermissionSetName', value: identity.permissionSetName });
  if (identity.awsAccountId) tags.push({ key: 'AccountId', value: identity.awsAccountId });

  tags.forEach((tag, index) => {
    params.set(`Tags.member.${index + 1}.Key`, tag.key);
    params.set(`Tags.member.${index + 1}.Value`, tag.value);
  });

  return params.toString();
}

async function stsAssumeRole(
  accessKeyId: string,
  secretAccessKey: string,
  roleArn: string,
  sessionId: string,
  expirationTime: number,
  identity: {
    userId?: string;
    userEmail?: string;
    userName?: string;
    awsIdentityCenterUsername?: string;
    awsIdentityCenterEmail?: string;
    permissionSetName?: string;
    awsAccountId?: string;
  } = {},
) {
  const body = buildAssumeRoleBody(roleArn, sessionId, expirationTime, identity);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash = await hash(body);
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:sts.amazonaws.com\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const credentialScope = `${dateStamp}/us-east-1/sts/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await hash(canonicalRequest)].join('\n');

  let signingKey: ArrayBuffer = enc.encode(`AWS4${secretAccessKey}`).buffer as ArrayBuffer;
  signingKey = await hmac(signingKey, dateStamp);
  signingKey = await hmac(signingKey, 'us-east-1');
  signingKey = await hmac(signingKey, 'sts');
  signingKey = await hmac(signingKey, 'aws4_request');

  const signature = Array.from(new Uint8Array(await hmac(signingKey, stringToSign))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch('https://sts.amazonaws.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-amz-date': amzDate,
      Authorization: authHeader,
    },
    body,
  });

  const xml = await res.text();
  if (!res.ok) {
    throw new Error(`STS error: ${extractXml(xml, 'Message') || xml}`);
  }

  return {
    accessKeyId: extractXml(xml, 'AccessKeyId'),
    secretAccessKey: extractXml(xml, 'SecretAccessKey'),
    sessionToken: extractXml(xml, 'SessionToken'),
    expiration: extractXml(xml, 'Expiration'),
  };
}

export default async function (req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, string>));
    const destination = body?.destination || Deno.env.get('VITE_AWS_CONSOLE_DESTINATION') || 'https://console.aws.amazon.com/console/home';
    const identity = {
      userId: body?.userId || '',
      userEmail: body?.userEmail || '',
      userName: body?.userName || '',
      awsIdentityCenterUsername: body?.awsIdentityCenterUsername || '',
      awsIdentityCenterEmail: body?.awsIdentityCenterEmail || '',
      permissionSetName: body?.permissionSetName || '',
      awsAccountId: body?.awsAccountId || Deno.env.get('LAB_ACCOUNT_ID') || '',
    };

    const accessKeyId = Deno.env.get('BACKEND_AWS_ACCESS_KEY_ID') || Deno.env.get('AWS_ACCESS_KEY_ID') || Deno.env.get('AWS_LAB_USER_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('BACKEND_AWS_SECRET_ACCESS_KEY') || Deno.env.get('AWS_SECRET_ACCESS_KEY') || Deno.env.get('AWS_LAB_USER_SECRET_ACCESS_KEY');
    const roleArn = Deno.env.get('AWS_LAB_ROLE_ARN');
    const lambdaExecutionRoleArn = Deno.env.get('AWS_LAMBDA_EXECUTION_ROLE_ARN') || '';

    if (!accessKeyId || !secretAccessKey || !roleArn) {
      return json({ error: 'Backend AWS credentials not configured' }, 500);
    }

    const sessionId = crypto.randomUUID();
    const expirationTime = Date.now() + 15 * 60 * 1000;
    const credentials = await stsAssumeRole(accessKeyId, secretAccessKey, roleArn, sessionId, expirationTime, identity);

    const sessionJSON = JSON.stringify({ sessionId: credentials.accessKeyId, sessionKey: credentials.secretAccessKey, sessionToken: credentials.sessionToken });
    const tokenRes = await fetch(`https://signin.aws.amazon.com/federation?Action=getSigninToken&Session=${encodeURIComponent(sessionJSON)}`);
    const tokenData = tokenRes.ok ? await tokenRes.json() : null;
    const signinToken = tokenData?.SigninToken;
    const loginUrl = signinToken
      ? `https://signin.aws.amazon.com/federation?Action=login&Issuer=LearningLabPlatform&Destination=${encodeURIComponent(destination)}&SigninToken=${encodeURIComponent(signinToken)}`
      : null;

    return json({
      sessionId,
      ...identity,
      credentials,
      consoleUrl: destination,
      accountId: Deno.env.get('LAB_ACCOUNT_ID') || identity.awsAccountId || '',
      accountName: Deno.env.get('LAB_ACCOUNT_NAME') || '',
      lambdaExecutionRoleArn,
      resourceExpirationTime: String(expirationTime),
      expiresAt: new Date(expirationTime).toISOString(),
      ...(loginUrl ? { loginUrl } : {}),
    });
  } catch (err) {
    console.error('start-lab error:', err);
    return json({ error: String(err) }, 500);
  }
}
