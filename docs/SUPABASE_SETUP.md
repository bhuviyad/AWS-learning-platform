# Supabase Setup Guide

Complete guide for setting up Supabase backend for the AWS Learning Lab Platform.

## Prerequisites

- Supabase account (sign up at https://supabase.com)
- Supabase CLI installed (`npm install -g supabase`)
- AWS account credentials

## Step 1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in project details:
   - Name: `aws-learning-lab`
   - Database Password: (generate strong password)
   - Region: Choose closest to your users
   - Pricing Plan: Select appropriate plan

4. Wait for project to be created (~2 minutes)

## Step 2: Database Schema Setup

### Run Migration SQL

Go to SQL Editor in Supabase Dashboard and run:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
-- No need to create, using built-in auth.users

-- Lab sessions table
CREATE TABLE lab_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('starting', 'active', 'stopping', 'expired')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ NOT NULL,
    aws_access_key_id TEXT,
    aws_session_token TEXT,
    aws_region TEXT DEFAULT 'us-east-1',
    session_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity logs table
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES lab_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_arn TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User progress table
CREATE TABLE user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    lesson_id TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    completion_date TIMESTAMPTZ,
    watch_time_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

-- Create indexes
CREATE INDEX idx_lab_sessions_user_id ON lab_sessions(user_id);
CREATE INDEX idx_lab_sessions_status ON lab_sessions(status);
CREATE INDEX idx_lab_sessions_end_time ON lab_sessions(end_time);
CREATE INDEX idx_activity_logs_session_id ON activity_logs(session_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers
CREATE TRIGGER update_lab_sessions_updated_at BEFORE UPDATE ON lab_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lab_sessions
CREATE POLICY "Users can view their own sessions"
    ON lab_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
    ON lab_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
    ON lab_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for activity_logs
CREATE POLICY "Users can view their own activity logs"
    ON activity_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity logs"
    ON activity_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_progress
CREATE POLICY "Users can view their own progress"
    ON user_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own progress"
    ON user_progress FOR ALL
    USING (auth.uid() = user_id);

-- Create function to expire old sessions
CREATE OR REPLACE FUNCTION expire_old_sessions()
RETURNS void AS $$
BEGIN
    UPDATE lab_sessions
    SET status = 'expired'
    WHERE status = 'active'
    AND end_time < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get active session count
CREATE OR REPLACE FUNCTION get_active_session_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM lab_sessions WHERE status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Step 3: Configure Authentication

### Enable Email Authentication

1. Go to Authentication → Settings
2. Enable "Email" provider
3. Configure email templates (optional)
4. Set site URL to your frontend URL

### Email Templates (Optional)

Customize confirmation and reset password emails:

**Confirm Email:**
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email</a></p>
```

**Reset Password:**
```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

## Step 4: Set Up Edge Functions

### Initialize Supabase Locally

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Pull remote changes
supabase db pull
```

### Create Edge Functions

Create the following edge function files:

**1. Start Lab Session** (`supabase/functions/start-lab/index.ts`)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { STS } from 'https://esm.sh/aws-sdk@2.1450.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for active sessions
    const { data: activeSessions } = await supabaseClient
      .from('lab_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (activeSessions && activeSessions.length > 0) {
      return new Response(
        JSON.stringify({ error: 'You already have an active session' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate AWS temporary credentials
    const sts = new STS({
      region: Deno.env.get('AWS_REGION'),
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const sessionId = crypto.randomUUID();
    const expirationTime = Date.now() + (60 * 60 * 1000); // 1 hour

    const assumeRoleParams = {
      RoleArn: Deno.env.get('AWS_LAB_ROLE_ARN')!,
      RoleSessionName: `lab-session-${sessionId}`,
      DurationSeconds: 3600,
      ExternalId: 'learning-lab-platform',
      Tags: [
        { Key: 'Environment', Value: 'LearningLab' },
        { Key: 'SessionId', Value: sessionId },
        { Key: 'UserId', Value: user.id },
        { Key: 'ExpirationTime', Value: expirationTime.toString() },
      ],
    };

    const stsResponse = await sts.assumeRole(assumeRoleParams).promise();

    // Create session in database
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

    // Log activity
    await supabaseClient.from('activity_logs').insert({
      session_id: session.id,
      user_id: user.id,
      action: 'session_started',
      resource_type: 'lab_session',
      resource_id: session.id,
    });

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        credentials: {
          accessKeyId: stsResponse.Credentials!.AccessKeyId,
          secretAccessKey: stsResponse.Credentials!.SecretAccessKey,
          sessionToken: stsResponse.Credentials!.SessionToken,
          expiration: stsResponse.Credentials!.Expiration,
        },
        consoleUrl: `https://console.aws.amazon.com/`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**2. Stop Lab Session** (`supabase/functions/stop-lab/index.ts`)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update session status
    const { error: updateError } = await supabaseClient
      .from('lab_sessions')
      .update({ status: 'stopping', end_time: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    // Log activity
    await supabaseClient.from('activity_logs').insert({
      session_id: sessionId,
      user_id: user.id,
      action: 'session_stopped',
      resource_type: 'lab_session',
      resource_id: sessionId,
    });

    // Mark as stopped
    await supabaseClient
      .from('lab_sessions')
      .update({ status: 'expired' })
      .eq('id', sessionId);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Deploy Edge Functions

```bash
# Set environment variables (secrets)
supabase secrets set AWS_REGION=us-east-1
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_key
supabase secrets set AWS_LAB_ROLE_ARN=arn:aws:iam::ACCOUNT:role/LabEnvironmentRole

# Deploy functions
supabase functions deploy start-lab
supabase functions deploy stop-lab
```

## Step 5: Configure Storage (Optional)

If you want to store user-generated content:

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('lab-resources', 'lab-resources', false);

-- RLS policy for bucket
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lab-resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'lab-resources' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## Step 6: Set Up Realtime (Optional)

Enable realtime for session status updates:

```sql
-- Enable realtime for lab_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE lab_sessions;
```

## Step 7: Configure Webhooks (Optional)

Set up webhooks for external integrations:

1. Go to Database → Webhooks
2. Create webhook for session events
3. Configure endpoint URL
4. Select tables: `lab_sessions`, `activity_logs`
5. Select events: `INSERT`, `UPDATE`

## Environment Variables

Add to your frontend `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Testing

### Test Authentication

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'test-password-123',
});
```

### Test Edge Function

```bash
curl -X POST https://your-project.supabase.co/functions/v1/start-lab \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Monitoring

### View Logs

```bash
# Function logs
supabase functions logs start-lab

# Database logs
# View in Supabase Dashboard → Database → Logs
```

### Metrics to Track

- Active sessions count
- Session start/stop events
- Failed authentication attempts
- Edge function errors
- Database query performance

## Backup and Recovery

### Enable Point-in-Time Recovery

1. Go to Settings → Database
2. Enable Point-in-Time Recovery (PITR)
3. Configure retention period

### Manual Backup

```bash
# Dump database
supabase db dump -f backup.sql

# Restore database
supabase db reset
```

## Security Checklist

- [x] RLS enabled on all tables
- [x] RLS policies tested
- [x] Secrets stored in Supabase Vault
- [x] Email confirmation enabled
- [x] Rate limiting configured
- [x] CORS configured correctly
- [x] Service role key secured (server-side only)
- [x] Anonymous key only in frontend

## Troubleshooting

### Issue: Edge function returns 401

**Solution:** Check authorization header is passed correctly

### Issue: RLS policies blocking queries

**Solution:** Test policies in SQL editor with different `auth.uid()` values

### Issue: Secrets not loading in edge functions

**Solution:** Redeploy functions after setting secrets

## Next Steps

1. Set up AWS resources (see AWS_INTEGRATION.md)
2. Deploy frontend
3. Configure monitoring and alerts
4. Test end-to-end workflow
5. Set up CI/CD pipeline

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
