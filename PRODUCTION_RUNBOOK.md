Production Incident Runbook

Project: Next.js Headless WooCommerce StorefrontProduction: https://next-headless-ecommerce-storefront.vercel.app

1. Incident priorities

Restore customer access.

Protect checkout and order integrity.

Preserve evidence and logs.

Roll back or patch safely.

Verify recovery before closing the incident.

2. Initial checks

Run:

curl.exe -I "https://next-headless-ecommerce-storefront.vercel.app/"

Expected:

HTTP 200

Content-Security-Policy

Strict-Transport-Security

X-Content-Type-Options

X-Frame-Options

Check liveness:

curl.exe -sS "https://next-headless-ecommerce-storefront.vercel.app/api/health/live"

Expected:

{
  "status": "alive",
  "check": "liveness"
}

3. GitHub Actions checks

Open:

Repository → Actions

Review:

CI Quality Gate

Production Monitor

Verify:

quality

e2e

Production health

Production E2E

Do not merge a failing change into main.

4. Vercel checks

Open:

Vercel → Project → Deployments

Verify:

latest Production deployment status

deployed branch is main

deployed commit matches the expected Git commit

deployment logs contain no unexpected runtime failures

5. Production E2E verification

In CMD:

set "E2E_BASE_URL=https://next-headless-ecommerce-storefront.vercel.app"
set "STRICT_CSP_RUNTIME_MODE=enforce"
set "CSP_DEPLOYMENT_MODE=report-only"
npm run test:e2e

Expected:

11 passed

Clear variables afterward:

set "E2E_BASE_URL="
set "STRICT_CSP_RUNTIME_MODE="
set "CSP_DEPLOYMENT_MODE="

6. Security verification

Run:

npm audit --omit=dev --audit-level=critical

Then:

echo %ERRORLEVEL%

Expected:

0

Known upstream high-severity findings may still be reported. Do not use:

npm audit fix --force

without reviewing dependency impact first.

7. Emergency rollback

Current stable rollback release:

v1.0.1

First restore service through Vercel by promoting the last known good Production deployment.

Then create a Git rollback branch only if current main differs from the stable tag:

git switch main
git pull origin main
git switch -c hotfix/rollback-to-v1.0.1
git restore --source=v1.0.1 --staged --worktree .
git status --short

If there are no changes, no Git rollback commit is required.

If there are changes, validate:

npm ci
npm run lint
npm run test:security
npm run build
set "E2E_BASE_URL="
set "STRICT_CSP_RUNTIME_MODE=disabled"
set "CSP_DEPLOYMENT_MODE=report-only"
npm run test:e2e

Then commit and open a pull request:

git add .
git commit -m "hotfix: restore production to v1.0.1"
git push -u origin hotfix/rollback-to-v1.0.1

Never rewrite protected production history using force push.

8. Order and checkout incidents

For duplicate orders, failed checkout, or uncertain order creation:

capture the request/support reference shown to the customer

inspect structured request audit logs

check idempotency status before retrying order creation

verify the WooCommerce order before manually recreating anything

avoid repeatedly submitting checkout while an idempotency request is in progress

9. CSP incidents

Check Production headers:

curl.exe -sS -D - -o NUL "https://next-headless-ecommerce-storefront.vercel.app/" | findstr /I "content-security-policy content-security-policy-report-only"

The enforced policy should contain:

a nonce

strict-dynamic

object-src 'none'

frame-ancestors 'none'

Review CSP reports for unexpected violations before relaxing policy.

10. Incident record

Record:

incident start time

affected feature

user-visible symptoms

deployed commit

Vercel deployment

failed CI or monitoring checks

relevant request IDs

mitigation

rollback or fix commit

verification results

incident end time

follow-up actions

11. Recovery checklist

An incident is resolved only after:

Production homepage is available

liveness endpoint is healthy

checkout protection is working

authentication redirects work

strict CSP is enforced

Production E2E passes

GitHub Actions are green

main is clean and protected

the deployed commit is known