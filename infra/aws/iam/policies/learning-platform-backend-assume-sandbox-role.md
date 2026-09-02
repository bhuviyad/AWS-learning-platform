# learning-platform-backend assume-role policy

Use this policy for the backend IAM user that starts lab sessions.

## Role / user to update in AWS
- `learning-platform-backend` user

## Purpose
Allows the backend user to assume the sandbox role and tag the STS session.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeSandboxRole",
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ],
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/interns-sandbox-role"
    }
  ]
}
```
