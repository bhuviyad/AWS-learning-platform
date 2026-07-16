# AWS Integration Guide

This guide describes the Lambda-based lab flow used by the Learning Lab Platform.

## Overview

1. The platform calls `supabase/functions/start-lab/index.ts`.
2. The backend assumes the sandbox role with session tags:
   - `Environment=LearningLab`
   - `SessionId=<uuid>`
   - `ExpirationTime=<unix-ms>`
3. The intern session can create a tagged Lambda function.
4. A scheduled cleanup endpoint deletes only expired, lab-tagged Lambda resources.

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

- `LearningLabLambdaExecutionRole`

It should trust `lambda.amazonaws.com`.

The intern role must be able to pass this role to Lambda with `iam:PassRole`.

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

For the test harness we added `scripts/lambda-lifecycle-test.mjs`:

1. Assumes the sandbox role with session tags.
2. Creates a tiny Node.js Lambda function.
3. Tags the function with the session metadata.
4. Calls the shared cleanup helper with a simulated expired timestamp.
5. Verifies the function is deleted.

Run it with:

```bash
node scripts/lambda-lifecycle-test.mjs
```

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
