// @ts-nocheck
// Deno edge function - TypeScript errors expected when analyzed by Node.js tooling

// @ts-expect-error - Deno types not available in this context
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error - ESM imports not recognized
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseClient
      .from('lab_sessions')
      .update({ status: 'stopping', end_time: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    await supabaseClient.from('activity_logs').insert({
      session_id: sessionId,
      user_id: user.id,
      action: 'session_stopped',
      resource_type: 'lab_session',
      resource_id: sessionId,
    });

    await supabaseClient
      .from('lab_sessions')
      .update({ status: 'expired' })
      .eq('id', sessionId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});