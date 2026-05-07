# AWS Learning Lab Platform

A full-stack web application that provides an interactive learning platform for AWS services with hands-on lab environments.

## Features

### 1. Learning Platform
- **Video Lessons**: Embedded YouTube videos covering AWS fundamentals
- **Progress Tracking**: Track completion of lessons and overall course progress
- **Module Organization**: Structured learning path from basics to advanced topics

### 2. Hands-on Lab Environment
- **Temporary AWS Access**: Generate 1-hour temporary AWS credentials
- **Session Management**: Automatic session tracking and expiration
- **Resource Cleanup**: Automatic deletion of all resources after session ends
- **Limited Permissions**: Scoped IAM permissions (EC2, S3 basic access only)

### 3. Security Features
- **No Permanent Credentials**: All AWS access uses temporary STS credentials
- **Auto-expiration**: Sessions automatically expire after 1 hour
- **Least Privilege**: Users only get minimal required permissions
- **Resource Isolation**: Each session is isolated from others

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
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=your_aws_account_id
AWS_LAB_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/LabEnvironmentRole
AWS_SESSION_DURATION=3600

# Optional: AWS credentials for backend (use IAM role in production)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## AWS Setup Guide

### 1. Create IAM Role for Lab Sessions

Create an IAM role named `LabEnvironmentRole` with the following trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "learning-lab-platform"
        }
      }
    }
  ]
}
```

### 2. Attach Permission Policy

Create and attach this policy to the role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2BasicAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:StopInstances",
        "ec2:StartInstances",
        "ec2:DescribeImages",
        "ec2:DescribeKeyPairs",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateTags"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Environment": "LearningLab"
        }
      }
    },
    {
      "Sid": "S3BasicAccess",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteBucket"
      ],
      "Resource": [
        "arn:aws:s3:::learninglab-*",
        "arn:aws:s3:::learninglab-*/*"
      ]
    },
    {
      "Sid": "VPCReadOnly",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeRouteTables"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchReadOnly",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. Create Lambda Function for Resource Cleanup

Deploy a Lambda function that runs periodically to clean up expired lab resources:

```javascript
// Lambda function code (Node.js)
const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();
const s3 = new AWS.S3();

exports.handler = async (event) => {
    const expirationTag = 'LearningLabExpiration';
    const now = Date.now();
    
    // Clean up EC2 instances
    const instances = await ec2.describeInstances({
        Filters: [
            { Name: 'tag-key', Values: [expirationTag] },
            { Name: 'instance-state-name', Values: ['running', 'stopped'] }
        ]
    }).promise();
    
    for (const reservation of instances.Reservations) {
        for (const instance of reservation.Instances) {
            const expirationTime = instance.Tags.find(t => t.Key === expirationTag)?.Value;
            if (expirationTime && parseInt(expirationTime) < now) {
                await ec2.terminateInstances({ InstanceIds: [instance.InstanceId] }).promise();
                console.log(`Terminated instance: ${instance.InstanceId}`);
            }
        }
    }
    
    // Clean up S3 buckets
    const buckets = await s3.listBuckets().promise();
    for (const bucket of buckets.Buckets) {
        if (bucket.Name.startsWith('learninglab-')) {
            const tags = await s3.getBucketTagging({ Bucket: bucket.Name }).promise().catch(() => null);
            const expirationTime = tags?.TagSet.find(t => t.Key === expirationTag)?.Value;
            
            if (expirationTime && parseInt(expirationTime) < now) {
                // Delete all objects first
                const objects = await s3.listObjectsV2({ Bucket: bucket.Name }).promise();
                if (objects.Contents.length > 0) {
                    await s3.deleteObjects({
                        Bucket: bucket.Name,
                        Delete: {
                            Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
                        }
                    }).promise();
                }
                // Delete bucket
                await s3.deleteBucket({ Bucket: bucket.Name }).promise();
                console.log(`Deleted bucket: ${bucket.Name}`);
            }
        }
    }
    
    return { statusCode: 200, body: 'Cleanup completed' };
};
```

### 4. Set Up CloudWatch Event Rule

Create a CloudWatch Event rule to trigger the cleanup Lambda every 5 minutes:

```bash
aws events put-rule \
  --name learning-lab-cleanup \
  --schedule-expression "rate(5 minutes)"

aws lambda add-permission \
  --function-name LabResourceCleanup \
  --statement-id learning-lab-cleanup \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:REGION:ACCOUNT_ID:rule/learning-lab-cleanup

aws events put-targets \
  --rule learning-lab-cleanup \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT_ID:function:LabResourceCleanup"
```

## Supabase Setup

### 1. Database Schema

Create the following tables in your Supabase project:

```sql
-- User sessions table
CREATE TABLE lab_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
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
    session_id UUID REFERENCES lab_sessions(id) NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lab_sessions_user_id ON lab_sessions(user_id);
CREATE INDEX idx_lab_sessions_status ON lab_sessions(status);
CREATE INDEX idx_activity_logs_session_id ON activity_logs(session_id);

-- Enable Row Level Security
ALTER TABLE lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
    ON lab_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity logs"
    ON activity_logs FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM lab_sessions WHERE user_id = auth.uid()
        )
    );
```

### 2. Edge Functions

The platform uses Supabase Edge Functions for AWS integration. Key endpoints:

- `POST /api/lab/start` - Start a new lab session
- `POST /api/lab/stop` - Stop active session
- `GET /api/lab/status` - Get session status
- `POST /api/lab/assume-role` - Generate temporary AWS credentials

## Usage

### For Students

1. **Sign In**: Log in with your credentials
2. **Learn**: Watch video lessons and track your progress
3. **Practice**: Start a hands-on lab session
4. **Experiment**: Use the AWS Console with temporary credentials
5. **Complete**: Stop the lab when finished (or let it auto-expire)

### For Administrators

1. Monitor active sessions in Supabase dashboard
2. Review activity logs for security auditing
3. Adjust IAM policies to modify lab permissions
4. Configure CloudWatch alarms for cost monitoring

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
supabase functions deploy

# Run migrations
supabase db push
```

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
