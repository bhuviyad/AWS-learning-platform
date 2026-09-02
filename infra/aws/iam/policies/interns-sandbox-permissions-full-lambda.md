# Broad sandbox policy — testing only

Apply this policy only for short-lived troubleshooting. It grants broad access to:

- Lambda
- EventBridge
- DynamoDB
- S3

It is **not** the recommended production sandbox policy because it does not enforce resource names or session ownership.

## Recommended policy
Use this instead for the real intern sandbox:

```text
interns-sandbox-permissions.json
```

## AWS role
- `interns-sandbox-role`

## Exact testing policy
The exact JSON is stored in:

```text
infra/aws/iam/policies/interns-sandbox-permissions-full-lambda.json
```
