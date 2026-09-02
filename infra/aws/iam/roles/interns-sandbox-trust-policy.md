# interns-sandbox-role trust policy

Use this trust policy for the **interns-sandbox-role**.

## Role name to update in AWS
- `interns-sandbox-role`

## Purpose
Allows the backend IAM user to assume the sandbox role and tag the session.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBackendUserAssumeRole",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:user/learning-platform-backend"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
```
