# AWS Learning Lab Platform

A full-stack web application that provides an interactive learning platform for AWS services with hands-on lab environments using a shared sandbox account and per-intern identities.

## Features

### 1. Learning Platform
- **Video Lessons**: Embedded YouTube videos covering AWS fundamentals
- **Progress Tracking**: Track completion of lessons and overall course progress
- **Module Organization**: Structured learning path from basics to advanced topics

### 2. Hands-on Lab Environment
- **Temporary AWS Access**: Generate 1-hour temporary AWS credentials
- **Per-intern Identities**: Each intern is mapped to their own AWS identity in the shared sandbox account
- **Session Management**: Automatic session tracking and expiration
- **Resource Cleanup**: Automatic deletion of expired session resources
- **Limited Permissions**: Scoped IAM permissions with tag-based isolation

### 3. Shared Sandbox Model
- **One AWS Account**: Lower cost than separate accounts per intern
- **Session Isolation**: Intern resources are tagged and cleaned up by session
- **Automation**: Cleanup jobs run on a schedule
- **Guardrails**: IAM and budgets keep usage controlled

### 4. Security Features
- **No Permanent Credentials**: All AWS access uses temporary STS credentials
- **Auto-expiration**: Sessions automatically expire after 1 hour
- **Least Privilege**: Users only get minimal required permissions
- **Resource Isolation**: Each session is isolated from others
- **Identity Mapping**: Intern identity is stored and tracked in Supabase


## Technology Stack

### Frontend
- **React 18.3.1**: UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Lucide React**: Icons
- **Radix UI**: Accessible UI components

### Backend (Supabase)
- **Supabase**: Backend as a Service
- **PostgreSQL**: Database for session tracking
- **Edge Functions**: Serverless functions for AWS integration
- **Supabase Auth**: User authentication

### AWS Services
- **AWS STS**: Temporary credential generation
- **AWS IAM**: Role-based access control
- **AWS Lambda**: Resource cleanup automation
- **Amazon DynamoDB**: Activity logging (alternative)
- **AWS CloudWatch**: Monitoring and logging

## Project Structure

```
/
├── src/
│   ├── app/
│   │   ├── App.tsx                    # Main application component
│   │   └── components/
│   │       ├── LoginPage.tsx          # Authentication page
│   │       ├── LearningPage.tsx       # Video lessons and progress
│   │       ├── HandsOnLabPage.tsx     # Lab environment control
│   │       └── ui/                    # Reusable UI components
│   ├── styles/
│   │   ├── theme.css                  # Design tokens
│   │   └── fonts.css                  # Font imports
│   └── utils/
│       └── supabase/                  # Supabase client utilities
├── supabase/
│   ├── functions/
│   │   └── server/
│   │       ├── index.tsx              # Edge function entry point
│   │       └── kv_store.tsx           # Supabase client
│   └── migrations/                    # Database migrations
└── docs/
    ├── SETUP.md                       # Detailed setup guide
    └── AWS_INTEGRATION.md             # AWS integration guide
```

## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Supabase account
- AWS account with appropriate permissions
- AWS CLI configured

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd aws-learning-lab
   pnpm install
   ```

2. **Set up Supabase**
   - Create a new Supabase project at https://supabase.com
   - Copy your project URL and anon key
   - Connect Supabase through the Make interface

3. **Configure AWS credentials**
   - Set up AWS IAM role for temporary credential generation
   - Configure environment variables (see Environment Variables section)

4. **Run the development server**
   ```bash
   pnpm dev
   ```

## Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration (frontend)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Admin access
VITE_ADMIN_EMAIL=admin@your-domain.com
ADMIN_EMAIL=admin@your-domain.com

# Supabase Configuration (backend service role)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCOUNT_ID=483591406604
AWS_LAB_ROLE_ARN=arn:aws:iam::483591406604:role/interns-sandbox-role
AWS_LAMBDA_EXECUTION_ROLE_ARN=arn:aws:iam::483591406604:role/interns-lambda-execution-role
AWS_SESSION_DURATION=900

# Optional: AWS credentials for backend (use IAM role in production)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

See [`docs/INTERN_IDENTITY_MODEL.md`](docs/INTERN_IDENTITY_MODEL.md) for the per-intern identity approach.

Each intern is assigned an identity profile in Supabase and the platform uses automatic session tags plus database-backed intern profiles to isolate resources inside the shared sandbox account.

## AWS Setup Guide

For the current shared-account approach, see:

- [`docs/INTERN_IDENTITY_MODEL.md`](docs/INTERN_IDENTITY_MODEL.md)
- [`docs/AWS_INTEGRATION.md`](docs/AWS_INTEGRATION.md)
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`infra/README.md`](infra/README.md)

### Infra as code
The AWS IAM setup now lives under `infra/aws/` and can be applied with the PowerShell script:

```powershell
.\infra\aws\scripts\apply-iam.ps1
```

If AWS CLI access is blocked, use the JSON files in `infra/aws/iam/` and paste them into IAM manually.

This repo includes both:
- the stricter sandbox policy used for normal operation
- a broader Lambda policy file you can paste during testing if you want fewer permission checks

The script applies the sandbox role, Lambda execution role, and the backend user's assume-role policy from JSON files in the repo.

### Admin-only access
The Interns page is visible only to the admin email set in `VITE_ADMIN_EMAIL`.

### Learning progress
Each intern’s lesson completion is stored separately in Supabase in `learning_progress`.

### Timeout cleanup
Any session-scoped AWS resource created in the sandbox should be tagged with:
- `Environment=LearningLab`
- `SessionId=<current session>`
- `ExpirationTime=<timestamp>`

That same timeout/cleanup flow now applies to:
- Lambda
- EventBridge
- DynamoDB

If you add new services later, keep them session-scoped and include them in the cleanup helper.
### What to configure in AWS
- Shared sandbox account: `483591406604`
- Intern sandbox role: `interns-sandbox-role`
- Lambda execution role: `interns-lambda-execution-role`
- Per-intern identities mapped in Supabase
- Database-backed intern profiles
- Learning progress tracking in Supabase
- Session-tagged cleanup for expired resources

### Learning progress storage
- `learning_progress` keeps each intern's completed lessons separate
- progress is keyed by app user + lesson id
- the Learning page restores each user's completion state on reload
- the admin can still manage intern identities on the Interns page


### What interns do
1. Sign into the learning platform
2. Open the AWS sandbox
3. Create resources in the shared account
4. Use the shared Lambda execution role shown in the lab session
5. Save intern profile details in the Interns tab
6. Let the automatic cleanup remove expired resources when the session ends

### What the platform does
- tracks each intern profile
- starts/stops a lab session
- tags sessions for isolation
- schedules cleanup
- enforces budgets and guardrails

## Supabase Setup

See the Supabase docs and migration for the current schema:

- `supabase/migrations/004_per_intern_identity_center.sql`
- `supabase/migrations/005_intern_profiles_shared_fields.sql`
- `supabase/migrations/006_learning_progress.sql`
- `supabase/migrations/007_lab_session_cleanup_tracking.sql`
- `supabase/migrations/008_local_user_lab_sessions.sql`
- `supabase/migrations/009_admin_operations_dashboard.sql`
- `intern_profiles`
- `lab_sessions`
- `lab_resources`
- `learning_progress`
- `activity_logs`

## Usage

### For Students

1. **Sign In**: Log in with your credentials
2. **Learn**: Watch video lessons and track your progress
3. **Practice**: Start a hands-on lab session
4. **Experiment**: Use the AWS Console with the shared sandbox account
5. **Complete**: Stop the lab when finished (or let it auto-expire)

### For Administrators

1. Monitor active sessions in Supabase dashboard
2. Review activity logs and intern profiles
3. Adjust IAM policies and permission sets
4. Review budgets and cleanup logs

### Cleanup

Automatic cleanup runs on a schedule and deletes only resources matching the expired session tags.

Use the local test harness if you need to verify the cleanup flow manually:

```bash
node scripts/lambda-lifecycle-test.mjs --pause
```

## Monitoring & Logging

- **CloudWatch**: Monitor Lambda execution and AWS API calls
- **Supabase Logs**: Track edge function execution
- **Activity Logs**: Review all user actions in the database
- **Cost Explorer**: Monitor AWS usage and costs
- **Budget Alerts**: Keep sandbox spend controlled

## Security Considerations

⚠️ **Important Security Notes:**

1. **No Permanent Credentials**: Never expose permanent AWS credentials in the frontend
2. **Use IAM Roles**: Always use IAM roles with STS for temporary credentials
3. **Session Tokens**: Session tokens should be transmitted over HTTPS only
4. **Resource Tagging**: All resources must be tagged for automated cleanup
5. **Cost Monitoring**: Set up AWS Budget alerts to prevent unexpected charges
6. **Rate Limiting**: Implement rate limiting on lab creation to prevent abuse
7. **Audit Logging**: Enable CloudTrail for complete AWS API activity logging

## Deployment

See also: [`docs/DEPLOYMENT_MATRIX.md`](docs/DEPLOYMENT_MATRIX.md)

### Frontend Deployment (AWS Amplify)

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting

# Deploy
amplify publish
```

### Backend Deployment (Supabase)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Deploy edge functions
supabase functions deploy start-lab
supabase functions deploy stop-lab
supabase functions deploy cleanup-expired-labs

# Run migrations
supabase db push
```

### Cleanup Scheduler

Run the cleanup every few minutes so expired lab resources are deleted even if the user closes the tab.

If you are using Render as the scheduler runner, set `LAB_CLEANUP_URL` to the deployed cleanup endpoint and run:

```bash
node scripts/cleanup-expired-labs.mjs
```

If you want Supabase to own the scheduler instead, create a Supabase scheduled job for `cleanup-expired-labs`.


## Monitoring & Logging

- **CloudWatch**: Monitor Lambda execution and AWS API calls
- **Supabase Logs**: Track edge function execution
- **Activity Logs**: Review all user actions in the database
- **Cost Explorer**: Monitor AWS usage and costs

## Troubleshooting

### Session Won't Start
- Check AWS credentials in environment variables
- Verify IAM role trust relationship
- Check Supabase edge function logs

### Resources Not Cleaning Up
- Verify Lambda function has correct permissions
- Check CloudWatch Event rule is enabled
- Review Lambda execution logs

### Authentication Issues
- Clear browser cache and cookies
- Check Supabase project settings
- Verify RLS policies are correctly configured

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Create an issue]
- Documentation: See `/docs` folder
- AWS Documentation: https://docs.aws.amazon.com

## Roadmap

- [ ] Multi-region support
- [ ] Advanced AWS service access (RDS, Lambda, etc.)
- [ ] Real-time collaboration features
- [ ] Progress certificates
- [ ] Integration with Learning Management Systems (LMS)
- [ ] Mobile app support

## Acknowledgments

- AWS for cloud infrastructure
- Supabase for backend services
- React and Tailwind CSS communities
