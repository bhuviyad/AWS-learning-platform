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

Use a session-scoped policy like this on the sandbox role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaSessionScoped",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:ListFunctions",
        "lambda:ListTags",
        "lambda:TagResource",
        "lambda:UntagResource"
      ],
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:learninglab-*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": "LearningLab",
          "aws:ResourceTag/SessionId": "${aws:PrincipalTag/SessionId}"
        }
      }
    },
    {
      "Sid": "LambdaCreateWithRequiredTags",
      "Effect": "Allow",
      "Action": "lambda:CreateFunction",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Environment": "LearningLab",
          "aws:RequestTag/SessionId": "${aws:PrincipalTag/SessionId}"
        },
        "ForAllValues:StringEquals": {
          "aws:TagKeys": ["Environment", "SessionId", "ExpirationTime"]
        }
      }
    },
    {
      "Sid": "PassLambdaExecutionRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/LearningLabLambdaExecutionRole",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

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

- `supabase/functions/stop-lab/index.ts` for manual cleanup
- `supabase/functions/cleanup-expired-labs/index.ts` for scheduled cleanup
- `scripts/local-lab-mock/server.cjs` for local testing

The cleanup logic only deletes Lambda functions that:

- have `Environment=LearningLab`
- match the current `SessionId` for manual cleanup, or are expired for scheduled cleanup

## Scheduling

Trigger `supabase/functions/cleanup-expired-labs/index.ts` every few minutes using your scheduler of choice:

- Supabase scheduled job
- AWS EventBridge
- cron

This ensures expired lab resources are removed even if the user closes the browser tab.
