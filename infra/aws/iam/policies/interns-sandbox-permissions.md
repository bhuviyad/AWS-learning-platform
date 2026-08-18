# interns-sandbox-role permissions

Apply `interns-sandbox-permissions.json` to the AWS role:

- **Role name:** `interns-sandbox-role`
- **Region:** `ap-south-1`
- **Account:** `483591406604`

## Enabled services

### Lambda
- Names must start with `learninglab-`.
- Creation requires the Learning Lab tags.
- Invoke/update/delete actions are allowed only when the resource tags match the current STS session.
- Interns may pass only `interns-lambda-execution-role`.

### EventBridge
- Rule and custom event-bus names must start with `learninglab-`.
- Creation requires the Learning Lab tags.
- Target/rule/bus updates and deletion are session-scoped.

### DynamoDB
- Table names must start with `learninglab-`.
- Creation requires the Learning Lab tags.
- Table and item operations are session-scoped.

### S3
S3 cannot atomically require bucket tags during `CreateBucket`, so the bucket name itself is session-scoped:

```text
learninglab-<current-session-id>-<unique-name>
```

The IAM policy uses `${aws:PrincipalTag/SessionId}` in the allowed bucket ARN. Interns can only create and operate on buckets with their own session prefix.

## Required exact resource tags

```text
Environment=LearningLab
SessionId=<exact current session id>
ExpirationTime=<exact value shown by the lab page>
```

For Lambda, EventBridge, and DynamoDB, IAM compares all three requested values with the STS principal tags. A wrong value is denied. Interns are not allowed to retag or untag these protected resources after creation.

S3 cannot attach tags atomically during `CreateBucket`, so its primary ownership control is the exact session id embedded in the required bucket-name prefix. The cleanup process also checks bucket tags when available.

## Exact AWS policy
Copy the JSON from:

```text
infra/aws/iam/policies/interns-sandbox-permissions.json
```

Replace `ACCOUNT_ID` and `REGION` if applying manually rather than using `apply-iam.ps1`.
