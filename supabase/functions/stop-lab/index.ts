import { cleanupTaggedSandboxResources, createSandboxCleanupClients } from '../_shared/lambdaCleanup.ts';

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

export default async function (req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const sessionId = String(body?.sessionId ?? '').trim();

    if (!sessionId) {
      return json({ error: 'sessionId is required' }, 400);
    }

    let clients;
    try {
      clients = createSandboxCleanupClients();
    } catch (error) {
      return json({
        success: true,
        skipped: true,
        sessionId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const cleanup = await cleanupTaggedSandboxResources({
      ...clients,
      sessionId,
      mode: 'manual',
    });

    return json({
      success: true,
      sessionId,
      cleanup,
    });
  } catch (err) {
    console.error('stop-lab error:', err);
    return json({ error: String(err) }, 500);
  }
}
