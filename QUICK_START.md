# Quick Start Guide

Get the AWS Learning Lab Platform running in 15 minutes.

## Prerequisites

- ✅ Node.js 18+ and pnpm installed
- ✅ Supabase account (free tier works)
- ✅ AWS account
- ✅ Basic knowledge of AWS IAM

## Step 1: Install Dependencies (2 min)

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local
```

## Step 2: Set Up Supabase (5 min)

### A. Create Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Name it `aws-learning-lab`
4. Copy your Project URL and Anon Key

### B. Update .env.local

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### C. Run Database Migration

Go to Supabase Dashboard → SQL Editor and run this:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Lab sessions table
CREATE TABLE lab_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('starting', 'active', 'stopping', 'expired')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ NOT NULL,
    aws_access_key_id TEXT,
    aws_session_token TEXT,
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
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
    ON lab_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity logs"
    ON activity_logs FOR SELECT
    USING (auth.uid() = user_id);
```

## Step 3: Run the App (1 min)

```bash
pnpm dev
```

The app will open at the URL shown in the terminal.

## Step 4: Test the Frontend (2 min)

1. **Login**: Enter any email/password (demo mode)
2. **Learning Page**: Watch AWS tutorial videos
3. **Hands-on Lab**: Click "Start Lab" (currently uses mock data)

✅ Frontend is now working!

## Step 5: Connect AWS (Optional - 5 min)

To enable real AWS integration:

### A. Create IAM Role

```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "learning-lab-platform"}
    }
  }]
}
EOF

# Create role
aws iam create-role \
  --role-name LabEnvironmentRole \
  --assume-role-policy-document file://trust-policy.json
```

### B. Attach Permission Policy

Create `lab-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "s3:ListBucket",
        "s3:CreateBucket",
        "s3:DeleteBucket"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {"ec2:ResourceTag/Environment": "LearningLab"}
      }
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name LabEnvironmentRole \
  --policy-name LabPermissions \
  --policy-document file://lab-policy.json
```

### C. Deploy Supabase Edge Function

See `docs/SUPABASE_SETUP.md` for detailed instructions.

## What You Have Now

✅ **Working Frontend**
- User authentication
- Learning page with video lessons
- Hands-on lab interface with timer

✅ **Database Backend**
- Supabase PostgreSQL
- Session tracking tables
- Row-level security

⏳ **Pending (Optional)**
- AWS STS integration for real credentials
- Automated resource cleanup
- CloudWatch monitoring

## Next Steps

### For Testing Only
Continue using the mock credentials. The app fully works in demo mode.

### For Production
1. Follow `docs/AWS_INTEGRATION.md` for complete AWS setup
2. Follow `docs/SUPABASE_SETUP.md` for edge functions
3. Deploy Lambda cleanup function
4. Set up monitoring and alerts

## Common Issues

### "Supabase connection error"
- Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in `.env.local`
- Verify Supabase project is active

### "Cannot read properties of undefined"
- Make sure all dependencies are installed: `pnpm install`
- Clear cache: `rm -rf node_modules && pnpm install`

### "AWS credentials invalid"
- This is expected in demo mode
- Real AWS integration requires edge functions

## Resources

- 📖 [Full README](./README.md)
- 🔧 [AWS Integration Guide](./docs/AWS_INTEGRATION.md)
- 🗄️ [Supabase Setup](./docs/SUPABASE_SETUP.md)
- 📁 [Folder Structure](./docs/FOLDER_STRUCTURE.md)

## Need Help?

- Check the [docs/](./docs) folder for detailed guides
- Review code comments in source files
- Open an issue on GitHub

---

**Enjoy building your AWS Learning Lab! 🚀**
