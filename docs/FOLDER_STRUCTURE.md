# Folder Structure

Complete folder structure for the AWS Learning Lab Platform.

## Overview

```
aws-learning-lab/
├── src/                           # Source code
│   ├── app/                       # Application code
│   │   ├── App.tsx               # Main app component with routing
│   │   └── components/           # React components
│   │       ├── LoginPage.tsx     # Authentication page
│   │       ├── LearningPage.tsx  # Video lessons & progress
│   │       ├── HandsOnLabPage.tsx # Lab environment control
│   │       ├── figma/            # Figma integration components
│   │       └── ui/               # Reusable UI components
│   │           ├── button.tsx
│   │           ├── input.tsx
│   │           ├── badge.tsx
│   │           ├── progress.tsx
│   │           ├── alert.tsx
│   │           └── ... (other UI components)
│   ├── styles/                   # Global styles
│   │   ├── theme.css            # Design tokens & variables
│   │   └── fonts.css            # Font imports
│   ├── utils/                    # Utility functions
│   │   ├── supabase/            # Supabase client
│   │   │   └── client.ts        # Supabase client instance
│   │   └── aws/                 # AWS utilities (optional)
│   │       └── console-url.ts   # AWS console URL generator
│   └── types/                    # TypeScript type definitions
│       ├── session.ts           # Lab session types
│       ├── user.ts              # User types
│       └── activity.ts          # Activity log types
│
├── supabase/                     # Supabase backend
│   ├── functions/               # Edge Functions
│   │   ├── start-lab/          # Start lab session
│   │   │   └── index.ts
│   │   ├── stop-lab/           # Stop lab session
│   │   │   └── index.ts
│   │   ├── get-session-status/ # Get session status
│   │   │   └── index.ts
│   │   └── server/             # Shared server utilities
│   │       ├── index.tsx       # Entry point
│   │       └── kv_store.tsx    # Supabase client
│   ├── migrations/             # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_indexes.sql
│   │   └── 003_add_rls_policies.sql
│   └── config.toml             # Supabase configuration
│
├── lambda/                      # AWS Lambda functions
│   ├── cleanup/                # Resource cleanup
│   │   ├── index.js           # Lambda handler
│   │   ├── package.json       # Dependencies
│   │   └── README.md          # Deployment instructions
│   └── monitoring/             # Monitoring & metrics
│       ├── index.js
│       └── package.json
│
├── docs/                        # Documentation
│   ├── AWS_INTEGRATION.md      # AWS setup & integration guide
│   ├── SUPABASE_SETUP.md       # Supabase setup guide
│   ├── FOLDER_STRUCTURE.md     # This file
│   ├── API_REFERENCE.md        # API documentation
│   └── DEPLOYMENT.md           # Deployment guide
│
├── public/                      # Static assets
│   ├── favicon.ico
│   └── images/
│       ├── logo.png
│       └── aws-logo.png
│
├── .env.example                 # Environment variables template
├── .gitignore                  # Git ignore rules
├── package.json                # NPM dependencies & scripts
├── pnpm-lock.yaml             # Lock file
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite configuration
└── README.md                   # Main documentation

```

## Component Architecture

### Frontend Components

```
App.tsx (Main Router)
├── LoginPage.tsx (Authentication)
│   ├── Input (email, password)
│   ├── Button (submit)
│   └── Form validation
│
├── LearningPage.tsx (Learning Module)
│   ├── VideoPlayer (iframe embed)
│   ├── LessonList (sidebar)
│   │   └── LessonItem
│   ├── ProgressCard
│   └── Progress tracker
│
└── HandsOnLabPage.tsx (Lab Environment)
    ├── SessionStatus (badge)
    ├── Timer (countdown)
    ├── ControlButtons
    │   ├── StartLabButton
    │   ├── StopLabButton
    │   └── OpenConsoleButton
    ├── CredentialsCard
    └── PermissionsInfo
```

### Backend Structure

```
Supabase Edge Functions
├── start-lab
│   ├── Authenticate user
│   ├── Check existing sessions
│   ├── Call AWS STS AssumeRole
│   ├── Create session in DB
│   └── Return credentials
│
├── stop-lab
│   ├── Authenticate user
│   ├── Update session status
│   ├── Log activity
│   └── Trigger cleanup
│
└── get-session-status
    ├── Authenticate user
    ├── Query active sessions
    └── Return status & time remaining

AWS Lambda Functions
├── cleanup
│   ├── Scan for expired resources
│   ├── Terminate EC2 instances
│   ├── Delete S3 buckets
│   └── Log cleanup actions
│
└── monitoring
    ├── Collect metrics
    ├── Send to CloudWatch
    └── Alert on anomalies
```

## Database Schema

```
PostgreSQL Tables
├── auth.users (Supabase built-in)
│   ├── id (UUID, PK)
│   ├── email
│   ├── created_at
│   └── ...
│
├── lab_sessions
│   ├── id (UUID, PK)
│   ├── user_id (UUID, FK → auth.users)
│   ├── status (TEXT)
│   ├── start_time (TIMESTAMPTZ)
│   ├── end_time (TIMESTAMPTZ)
│   ├── aws_access_key_id (TEXT)
│   ├── aws_session_token (TEXT)
│   ├── aws_region (TEXT)
│   ├── session_metadata (JSONB)
│   ├── created_at (TIMESTAMPTZ)
│   └── updated_at (TIMESTAMPTZ)
│
├── activity_logs
│   ├── id (UUID, PK)
│   ├── session_id (UUID, FK → lab_sessions)
│   ├── user_id (UUID, FK → auth.users)
│   ├── action (TEXT)
│   ├── resource_type (TEXT)
│   ├── resource_id (TEXT)
│   ├── resource_arn (TEXT)
│   ├── details (JSONB)
│   └── created_at (TIMESTAMPTZ)
│
└── user_progress
    ├── id (UUID, PK)
    ├── user_id (UUID, FK → auth.users)
    ├── lesson_id (TEXT)
    ├── completed (BOOLEAN)
    ├── completion_date (TIMESTAMPTZ)
    ├── watch_time_seconds (INTEGER)
    ├── created_at (TIMESTAMPTZ)
    └── updated_at (TIMESTAMPTZ)
```

## AWS Resources

```
IAM Roles & Policies
├── LabEnvironmentRole
│   ├── Trust Policy (STS AssumeRole)
│   └── Permission Policy (EC2, S3, CloudWatch)
│
└── LambdaCleanupRole
    ├── Trust Policy (Lambda service)
    └── Permission Policy (EC2, S3, CloudWatch)

Lambda Functions
├── LabResourceCleanup
│   ├── Runtime: Node.js 18.x
│   ├── Trigger: CloudWatch Events (5 min)
│   └── Environment: Production
│
└── MetricsCollector (optional)
    ├── Runtime: Node.js 18.x
    └── Trigger: CloudWatch Events (hourly)

CloudWatch Resources
├── Event Rules
│   └── learning-lab-cleanup (rate: 5 minutes)
│
├── Alarms
│   ├── learning-lab-high-instance-count
│   ├── learning-lab-cleanup-failures
│   └── learning-lab-high-costs
│
└── Log Groups
    ├── /aws/lambda/LabResourceCleanup
    └── /learning-lab/sessions
```

## Data Flow

### 1. User Authentication Flow

```
Browser → Supabase Auth → PostgreSQL → Browser
   │                                      │
   └──────────── JWT Token ───────────────┘
```

### 2. Lab Session Start Flow

```
Browser → Edge Function → AWS STS → Edge Function → PostgreSQL
   │           │             │           │              │
   │           └──── AssumeRole ────────┘              │
   │                                                    │
   └──────────────── Credentials + Session ────────────┘
```

### 3. Resource Cleanup Flow

```
CloudWatch Event → Lambda → EC2/S3 API
        │            │         │
        5 min      Check     Delete
      interval   expired   resources
                 resources
```

## Key Files Explained

### Frontend

- **`App.tsx`**: Main application component with navigation state
- **`LoginPage.tsx`**: Handles user authentication UI
- **`LearningPage.tsx`**: Video lessons with embedded YouTube player
- **`HandsOnLabPage.tsx`**: Lab session management and AWS console access
- **`ui/`**: Reusable UI components (buttons, inputs, alerts, etc.)

### Backend

- **`supabase/functions/start-lab/`**: Creates AWS temporary credentials
- **`supabase/functions/stop-lab/`**: Terminates session and triggers cleanup
- **`lambda/cleanup/`**: Scans and deletes expired AWS resources

### Configuration

- **`.env.example`**: Template for environment variables
- **`package.json`**: Dependencies and build scripts
- **`tsconfig.json`**: TypeScript compiler options
- **`vite.config.ts`**: Vite bundler configuration

### Documentation

- **`README.md`**: Main project documentation
- **`docs/AWS_INTEGRATION.md`**: AWS setup instructions
- **`docs/SUPABASE_SETUP.md`**: Supabase configuration guide
- **`docs/FOLDER_STRUCTURE.md`**: This file

## Development Workflow

1. **Local Development**
   ```bash
   pnpm install
   pnpm dev
   ```

2. **Database Changes**
   ```bash
   supabase db diff -f new_migration
   supabase db push
   ```

3. **Deploy Edge Functions**
   ```bash
   supabase functions deploy start-lab
   ```

4. **Deploy Lambda**
   ```bash
   cd lambda/cleanup
   zip -r function.zip .
   aws lambda update-function-code --function-name LabResourceCleanup --zip-file fileb://function.zip
   ```

## Best Practices

### File Organization

- Keep components in `src/app/components/`
- Reusable UI components in `src/app/components/ui/`
- Types in separate files under `src/types/`
- Utilities in `src/utils/`

### Naming Conventions

- Components: PascalCase (e.g., `HandsOnLabPage.tsx`)
- Utilities: camelCase (e.g., `generateCredentials.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_SESSION_DURATION`)
- Types: PascalCase with `T` prefix (e.g., `TLabSession`)

### Code Organization

- One component per file
- Export default for main component
- Named exports for utilities/types
- Keep files under 300 lines

## Next Steps

1. Review the README.md for quick start guide
2. Follow AWS_INTEGRATION.md to set up AWS resources
3. Follow SUPABASE_SETUP.md to configure backend
4. Deploy and test end-to-end workflow
