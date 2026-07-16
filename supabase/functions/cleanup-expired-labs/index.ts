import { cleanupLabLambdaFunctions, createLambdaCleanupClient } from '../_shared/lambdaCleanup.ts';

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
    const client = createLambdaCleanupClient();
    const cleanup = await cleanupLabLambdaFunctions({
      client,
      mode: 'scheduled',
    });

    return json({
      success: true,
      cleanup,
    });
  } catch (err) {
    console.error('cleanup-expired-labs error:', err);
    return json({ error: String(err) }, 500);
  }
}
