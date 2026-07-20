# Intern Identity Model

This project now uses a **single shared AWS sandbox account** with **separate intern identities** assigned from the app.

## Why this model
- keeps cost lower than one AWS account per intern
- gives each intern their own login identity
- keeps resources isolated by automatic session tags
- supports automatic cleanup on timeout

## Main concepts

### 1) App user
This is the user who logs into the learning platform.

Stored in the frontend local auth today, and later can be backed by Supabase Auth.

### 2) Intern profile
The database record that maps an app user to an AWS identity.

Example fields:
- app email
- display name
- AWS Identity Center username/email
- sandbox AWS account id
- permission set name
- status

### 3) Lab session
A time-bounded active lab window.

Each session gets:
- session id
- user id
- intern profile id
- start time
- end time
- session tags

### 4) Lab resource
Anything created in AWS during the session.

Each resource should carry:
- `Environment=LearningLab`
- `SessionId=<session id>`
- `UserId=<user id or email>`
- `ExpirationTime=<timestamp>`

## How it works

1. The intern signs into the learning platform.
2. The app loads the intern profile.
3. The lab session starts and the platform applies the session metadata automatically.
4. The intern creates AWS resources in the shared account.
5. Cleanup deletes only resources that belong to the active session or have expired.

## What is automated
- session creation
- session expiry tracking
- resource cleanup
- AWS session tagging
- backend cleanup retry logic

## What the intern still does manually
- create their own AWS resources in the console
- select the permitted execution role when creating Lambda
- save work before the session expires

## What the platform handles automatically
- session tags
- resource cleanup
- cleanup retries
- visibility boundaries in the shared sandbox account
- expiration tracking

## Important limitation
A shared AWS account cannot guarantee perfect invisibility between users in every AWS console view. The practical protection is:
- session-scoped permissions
- tag enforcement
- cleanup automation
- restricted service permissions

## Database tables
- `intern_profiles`
- `lab_sessions`
- `lab_resources`
- `activity_logs`

## Recommended setup order
1. Create the intern profile table
2. Assign each app user to an intern profile
3. Start sessions with identity metadata
4. Keep tag-based cleanup enabled
5. Use budgets and service restrictions for cost control
