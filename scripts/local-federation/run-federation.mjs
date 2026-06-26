import process from 'process';

async function main() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, DESTINATION } = process.env;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_SESSION_TOKEN) {
    console.error('Missing AWS environment variables. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN.');
    process.exit(2);
  }

  const destination = DESTINATION || 'https://d-9067e65f63.awsapps.com/start/#/?tab=accounts';

  const sessionJSON = JSON.stringify({
    sessionId: AWS_ACCESS_KEY_ID,
    sessionKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN,
  });

  const tokenUrl = `https://signin.aws.amazon.com/federation?Action=getSigninToken&Session=${encodeURIComponent(sessionJSON)}`;

  console.log('Requesting SigninToken from AWS federation endpoint...');

  const res = await fetch(tokenUrl);
  if (!res.ok) {
    console.error('Failed to get SigninToken:', res.status, await res.text());
    process.exit(3);
  }

  const data = await res.json();
  const signinToken = data.SigninToken;
  if (!signinToken) {
    console.error('SigninToken not found in response:', data);
    process.exit(4);
  }

  const loginUrl = `https://signin.aws.amazon.com/federation?Action=login&Issuer=LearningLabPlatform&Destination=${encodeURIComponent(destination)}&SigninToken=${encodeURIComponent(signinToken)}`;

  console.log('Federated URL:');
  console.log(loginUrl);

  // Attempt to open in default browser (works in PowerShell Start-Process)
  try {
    const { spawn } = await import('child_process');
    const ps = spawn('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath "${loginUrl}"`], { stdio: 'ignore', detached: true });
    ps.unref();
  } catch (e) {
    // ignore
  }
}

main().catch(err => { console.error(err); process.exit(1); });
