import fs from 'fs';
import path from 'path';

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

const cleanupUrl = (process.env.LAB_CLEANUP_URL || process.env.VITE_LAB_CLEANUP_URL || '').trim();
const cleanupMethod = (process.env.LAB_CLEANUP_METHOD || 'POST').trim().toUpperCase();

if (!cleanupUrl) {
  console.error('[cleanup] LAB_CLEANUP_URL is not configured');
  process.exit(1);
}

async function main() {
  console.log(`[cleanup] calling ${cleanupMethod} ${cleanupUrl}`);
  const response = await fetch(cleanupUrl, {
    method: cleanupMethod,
    headers: { 'Content-Type': 'application/json' },
    body: cleanupMethod === 'GET' ? undefined : '{}',
  });

  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }

  if (!response.ok) {
    console.error('[cleanup] request failed:', response.status, body);
    process.exit(1);
  }

  console.log('[cleanup] success:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error('[cleanup] failed:', error);
  process.exit(1);
});
