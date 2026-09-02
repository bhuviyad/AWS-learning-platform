# learning-platform-backend cleanup policy

Apply this permission policy to the **learning-platform-backend** IAM user.

## Purpose
It gives the backend only the discovery, tag-reading, and deletion permissions required to clean Learning Lab resources for:

- Lambda
- EventBridge
- DynamoDB
- S3

The application cleanup code filters resources by the Learning Lab tags and session id before calling delete APIs.

## AWS identity to update
- IAM user: `learning-platform-backend`

## Source JSON
Use `learning-platform-backend-cleanup-resources.json` as the exact AWS policy document. Replace `ACCOUNT_ID` and `REGION` before pasting manually.
