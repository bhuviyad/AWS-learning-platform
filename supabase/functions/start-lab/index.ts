// @ts-nocheck
// Deno edge function - TypeScript errors expected when analyzed by Node.js tooling

// @ts-expect-error - Deno types not available in this context
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error - ESM imports not recognized
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error - ESM imports not recognized
import { STS } from 'https://esm.sh/aws-sdk@2.1450.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const { data: activeSessions } = await supabaseClient
      .from('lab_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (activeSessions && activeSessions.length > 0) {
      return new Response(JSON.stringify({ error: 'You already have an active session' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sts = new STS({
      region: Deno.env.get('AWS_REGION'),
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const sessionId = crypto.randomUUID();
    const expirationTime = Date.now() + 2 * 60 * 1000;

    const assumeRoleParams = {
      RoleArn: Deno.env.get('AWS_LAB_ROLE_ARN')!,
      RoleSessionName: `lab-session-${sessionId}`,
      DurationSeconds: 120,
      ExternalId: 'learning-lab-platform',
      Tags: [
        { Key: 'Environment', Value: 'LearningLab' },
        { Key: 'SessionId', Value: sessionId },
        { Key: 'UserId', Value: user.id },
        { Key: 'ExpirationTime', Value: expirationTime.toString() },
      ],
    };

    const stsResponse = await sts.assumeRole(assumeRoleParams).promise();

    const { data: session, error: sessionError } = await supabaseClient
      .from('lab_sessions')
      .insert({
        user_id: user.id,
        status: 'active',
        start_time: new Date().toISOString(),
        end_time: new Date(expirationTime).toISOString(),
        aws_access_key_id: stsResponse.Credentials!.AccessKeyId,
        aws_session_token: stsResponse.Credentials!.SessionToken,
        aws_region: Deno.env.get('AWS_REGION'),
      })
      .select()
      .single();

    if (sessionError) {
      throw sessionError;
    }

    await supabaseClient.from('activity_logs').insert({
      session_id: session.id,
      user_id: user.id,
      action: 'session_started',
      resource_type: 'lab_session',
      resource_id: session.id,
    });

    return new Response(JSON.stringify({
      sessionId: session.id,
      credentials: {
        accessKeyId: stsResponse.Credentials!.AccessKeyId,
        secretAccessKey: stsResponse.Credentials!.SecretAccessKey,
        sessionToken: stsResponse.Credentials!.SessionToken,
        expiration: stsResponse.Credentials!.Expiration,
      },
      consoleUrl: `https://ap-south-1.console.aws.amazon.com/console/home?region=ap-south-1#`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});