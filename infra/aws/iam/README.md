# AWS IAM Files

Use these files to manage the AWS IAM setup for the Learning Lab sandbox.

## If AWS CLI is available
Run:

```powershell
.\infra\aws\scripts\apply-iam.ps1
```

## If you want to paste into the AWS Console manually
Use these files as the source of truth:

### Markdown docs for reading
- `policies/interns-sandbox-permissions.md`
- `policies/interns-sandbox-permissions-full-lambda.md`
- `policies/learning-platform-backend-assume-sandbox-role.md`
- `policies/learning-platform-backend-cleanup-resources.md`
- `roles/interns-sandbox-trust-policy.md`
- `roles/interns-lambda-execution-trust-policy.md`

### JSON files for AWS
- `policies/interns-sandbox-permissions.json`
- `policies/learning-platform-backend-assume-sandbox-role.json`
- `policies/learning-platform-backend-cleanup-resources.json`
- `roles/interns-sandbox-trust-policy.json`
- `roles/interns-lambda-execution-trust-policy.json`

The `interns-sandbox-permissions-full-lambda.json` file is a broad troubleshooting policy only. Do not use it for normal intern access.

### Recommended manual console flow
1. Update the `interns-sandbox-role` trust policy.
2. Attach `interns-sandbox-permissions.json` to `interns-sandbox-role`.
3. Attach both backend policies to the `learning-platform-backend` IAM user.
4. Create or confirm `interns-lambda-execution-role`.
5. Attach `AWSLambdaBasicExecutionRole` to the Lambda execution role.

## Service lifecycle
- Lambda, EventBridge, and DynamoDB resources use `learninglab-*` names and mandatory session tags.
- S3 bucket names must use `learninglab-<session-id>-<unique-name>` because S3 cannot require bucket tags in the same create request.
- Stop Lab and timeout cleanup remove matching Lambda functions, EventBridge rules/buses, DynamoDB tables, and S3 buckets including object versions and multipart uploads.

## Notes
- Keep secrets out of git.
- Replace `ACCOUNT_ID` and `REGION` placeholders before pasting manually.
- Use the strict sandbox policy for real interns.