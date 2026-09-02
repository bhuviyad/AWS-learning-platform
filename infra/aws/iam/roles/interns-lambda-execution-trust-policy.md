# interns-lambda-execution-role trust policy

Use this trust policy for the shared Lambda execution role.

## Role name to update in AWS
- `interns-lambda-execution-role`

## Purpose
Allows the Lambda service to assume the execution role.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowLambdaServiceAssumeRole",
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```
