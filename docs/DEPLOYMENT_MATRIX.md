# Deployment Matrix

This document separates what should go to GitHub, Supabase, and Render.

## Commit to GitHub
Push the source changes only:

### Backend / cleanup
- `supabase/functions/start-lab/index.ts`
- `supabase/functions/stop-lab/index.ts`
- `supabase/functions/cleanup-expired-labs/index.ts`
- `supabase/functions/_shared/lambdaCleanup.ts`
- `scripts/lambdaCleanup.cjs`
- `scripts/lambda-lifecycle-test.mjs`
- `scripts/cleanup-expired-labs.mjs`
- `scripts/local-lab-mock/server.cjs`
- `scripts/local-lab-mock/server.js`

### Frontend / config
- `src/app/lib/labApi.ts`
- `src/app/components/HandsOnLabPage.tsx`
- `.env.local.example`
- `package.json`
- `.gitignore`

### Docs
- `README.md`
- `docs/AWS_INTEGRATION.md`
- `docs/SUPABASE_SETUP.md`

### Do not commit
- `node_modules/`
- `dist/`
- `.env.local`
- any AWS secrets or keys

## Update in Supabase
Use Supabase for the AWS edge functions and their secrets.

### Deploy / update
- `start-lab`
- `stop-lab`
- `cleanup-expired-labs`

### Set secrets
- `AWS_REGION`
- `AWS_LAB_ROLE_ARN`
- `AWS_LAMBDA_EXECUTION_ROLE_ARN`
- `BACKEND_AWS_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID`
- `BACKEND_AWS_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY`
- optional session token if your backend user needs it

### Scheduler
If you want cleanup managed directly by Supabase, schedule:
- `cleanup-expired-labs`

## Update in Render
Use Render for the hosted backend / scheduler runner.

### If Render hosts the Express mock/backend
- redeploy the service so it picks up:
  - session tagging
  - `/cleanup-expired-labs`
  - the shared cleanup logic
  - the intern profile API backed by Supabase

### Add backend env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_LAMBDA_EXECUTION_ROLE_ARN`
- `LAB_ACCOUNT_ID`
- `LAB_ACCOUNT_NAME`
### Add a cron job
Create a Render cron job that runs every 5 minutes and calls:

```bash
node scripts/cleanup-expired-labs.mjs
```

### Set Render env vars
- `LAB_CLEANUP_URL` = the deployed Supabase cleanup endpoint or the Render cleanup endpoint
- `LAB_CLEANUP_METHOD=POST`

If Render is just acting as the scheduler, point `LAB_CLEANUP_URL` at the Supabase function:

```text
https://<your-project>.supabase.co/functions/v1/cleanup-expired-labs
```

## Recommended production setup
- **GitHub**: source control only
- **Supabase**: edge functions + AWS secrets
- **Render**: cron job that calls the cleanup endpoint every 5 minutes

This gives you automatic timeout cleanup even if the intern never clicks Stop Lab.
