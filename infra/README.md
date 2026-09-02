# AWS Infra as Code

This directory stores the AWS IAM configuration for the Learning Lab sandbox.

## What lives here
- IAM trust policies
- IAM permission policies
- PowerShell scripts that apply the roles/policies with AWS CLI

## Directory layout

```text
infra/
  aws/
    iam/
      policies/
      roles/
    scripts/
```

## Current AWS objects
- `learning-platform-backend` IAM user: assumes the sandbox role and tags sessions
- `interns-sandbox-role`: temporary role interns assume for the lab
- `interns-lambda-execution-role`: Lambda execution role used by interns when creating functions in the console

## How to apply
1. Configure AWS CLI credentials for the admin account.
2. Run the PowerShell apply script in `infra/aws/scripts/`.
3. Verify the roles and policies in AWS IAM.

## Notes
- Do not store AWS secrets here.
- The JSON files use placeholders like `ACCOUNT_ID` and `REGION`; the apply script fills them in.
- Keep policy changes in this directory so they are reviewable and repeatable.
