# AWS Integration Guide

This guide describes the shared-account Lambda lab flow used by the Learning Lab Platform.

## Overview

1. The platform calls `supabase/functions/start-lab/index.ts`.
2. The backend assumes the sandbox role with session tags:
   - `Environment=LearningLab`
   - `SessionId=<uuid>`
   - `ExpirationTime=<unix-ms>`
3. The intern session can create a Lambda function using the pre-approved execution role.
4. The cleanup endpoint deletes only the Lambda resources that belong to that session or are expired.

### Shared-account + per-intern identity model
- One AWS sandbox account is shared by all interns.
- Each intern gets a distinct identity profile in Supabase.
- Sessions are tagged with `SessionId`, `UserId`, and `ExpirationTime`.
- Cleanup only deletes resources that match the active or expired session tags.
- Interns do not create IAM roles; they use the shared Lambda execution role provided by the platform.
- The platform applies the session tags automatically so interns do not have to manage tagging by hand.

See [`docs/INTERN_IDENTITY_MODEL.md`](./INTERN_IDENTITY_MODEL.md) for the higher-level model.

## Required AWS Primitives

### 1) Sandbox role for interns
The intern session role should allow:

- `lambda:CreateFunction`
- `lambda:DeleteFunction`
- `lambda:GetFunction`
- `lambda:ListFunctions`
- `lambda:ListTags`
- `lambda:TagResource`
- `lambda:UntagResource`
- `iam:PassRole` for the Lambda execution role

### 2) Lambda execution role
Create a dedicated execution role, for example:

- `interns-lambda-execution-role`

It should trust `lambda.amazonaws.com`.

The intern role must be able to pass this role to Lambda with `iam:PassRole`.
The platform exposes this role ARN in the lab session so interns can select it in the console.

### 3) Session tagging
Every lab session and every lab resource should carry the same tag set:

```js
{
  Environment: 'LearningLab',
  SessionId: sessionId,
  ExpirationTime: String(expirationTimestamp),
  ManagedBy: 'LearningLabPlatform'
}
```

## IAM Policy Example

The actual policy JSON now lives in:

- `infra/aws/iam/policies/interns-sandbox-permissions.json`
- `infra/aws/iam/policies/interns-sandbox-permissions-full-lambda.json`
- `infra/aws/iam/policies/learning-platform-backend-assume-sandbox-role.json`
- `infra/aws/iam/roles/interns-sandbox-trust-policy.json`
- `infra/aws/iam/roles/interns-lambda-execution-trust-policy.json`

Use the PowerShell apply script to push them to AWS:

```powershell
.\infra\aws\scripts\apply-iam.ps1
```

If AWS CLI access is blocked, paste the JSON files directly into the IAM console. The broader Lambda policy is there specifically as a manual fallback for easier testing.

## Lambda Test Resource Flow

For the current end-to-end test:

1. Start a lab session and open the AWS Console.
2. Create a Lambda function using the shared execution role shown in the lab session.
3. Leave the session tags in place so cleanup can identify the function.
4. Click **Stop Lab**.
5. Start a new session and verify the old Lambda no longer exists.

This is the same flow interns will use in practice, so it validates both creation and cleanup.

## Cleanup

The cleanup path is shared by:

The cleanup path is shared by:

- `supabase/functions/stop-lab/index.ts` for manual cleanup
- `supabase/functions/cleanup-expired-labs/index.ts` for scheduled cleanup
- `scripts/local-lab-mock/server.cjs` for local testing

The cleanup logic deletes any session-scoped resources that were created with the Learning Lab tags:

- `Environment=LearningLab`
- `SessionId=<current session>`
- `ExpirationTime=<timestamp>`

## Additional sandbox services
The sandbox role also includes EventBridge and DynamoDB permissions for lab exercises.
If you want to use them in a stricter way, narrow the actions in `infra/aws/iam/policies/interns-sandbox-permissions.json`.

## Scheduling

Trigger `supabase/functions/cleanup-expired-labs/index.ts` every few minutes using your scheduler of choice:

- Supabase scheduled job
- AWS EventBridge
- cron

This ensures expired lab resources are removed even if the user closes the browser tab.

## Notes
- EventBridge and DynamoDB are enabled for sandbox lab exercises.
- Narrow the actions in the infra policy files if you want stricter service limits later.
- Cleanup is session-scoped, so the same timeout flow applies to Lambda, EventBridge, and DynamoDB.
