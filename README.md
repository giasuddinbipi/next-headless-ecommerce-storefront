Next.js Headless WooCommerce Storefront

Production-ready headless ecommerce storefront built with Next.js, WooCommerce, Auth.js, Redis-backed checkout protection, strict Content Security Policy, automated security testing, and Playwright end-to-end verification.

Production

Storefront: https://next-headless-ecommerce-storefront.vercel.app

Stable release: v1.0.1

Default branch: main

Core Features

Storefront

Product catalogue and product detail pages

Simple and variable product support

Variation selection

Cart quantity management

Wishlist

Recently viewed products

Product reviews

Responsive storefront navigation

Checkout

Server-side cart validation

Server-calculated checkout totals

Shipping-area handling

Coupon validation

Cash on delivery

Duplicate-order protection

Redis-backed idempotency

Order status recovery

Order confirmation email handling

Structured request/audit references

Customer Account

Registration and login

Authenticated account area

Customer profile

Address management

Order history

Order details

Invoice view

Order cancellation

Reorder flow

Security

Strict nonce-based Content Security Policy

strict-dynamic

HSTS

frame protection

content-type protection

restrictive Permissions Policy

request origin validation

checkout rate limiting

request correlation and audit logging

idempotent order creation

production dependency critical-vulnerability gate

Technology

Next.js 16

React

TypeScript

Tailwind CSS

WooCommerce

Auth.js / NextAuth

Redis / Upstash

Vitest

Playwright

GitHub Actions

Vercel

Repository Structure

src/
├─ app/
│  ├─ account/
│  ├─ api/
│  ├─ cart/
│  ├─ checkout/
│  ├─ products/
│  ├─ shop/
│  └─ wishlist/
├─ components/
├─ hooks/
├─ lib/
└─ store/

tests/
├─ e2e/
└─ security/

.github/
├─ workflows/
│  ├─ ci.yml
│  └─ production-monitor.yml
└─ dependabot.yml

Local Development

Requirements

Node.js 22

npm

WooCommerce backend

required environment variables configured in .env.local

Install dependencies:

npm ci

Start development:

npm run dev

Then open:

http://localhost:3000

Environment Configuration

Local secrets and deployment credentials belong in .env.local or the deployment platform's encrypted environment-variable configuration.

Do not commit:

WooCommerce credentials

Auth secrets

Redis credentials

monitoring secrets

Vercel bypass secrets

email-provider credentials

Use the existing application configuration as the source of truth for required environment-variable names.

Quality Gates

Lint

npm run lint

Target:

0 errors
0 warnings

Security Tests

npm run test:security

Current baseline:

28 test files
299 tests

Production Build

npm run build

Local E2E

set "E2E_BASE_URL="
set "STRICT_CSP_RUNTIME_MODE=disabled"
set "CSP_DEPLOYMENT_MODE=report-only"
npm run test:e2e

Current baseline:

11 passed

Critical Production Dependency Audit

npm audit --omit=dev --audit-level=critical

Then:

echo %ERRORLEVEL%

Expected:

0

Known upstream lower-severity findings may still be reported. Do not use npm audit fix --force without reviewing the dependency impact.

Production E2E

set "E2E_BASE_URL=https://next-headless-ecommerce-storefront.vercel.app"
set "STRICT_CSP_RUNTIME_MODE=enforce"
set "CSP_DEPLOYMENT_MODE=report-only"
npm run test:e2e

Clear the temporary variables afterward:

set "E2E_BASE_URL="
set "STRICT_CSP_RUNTIME_MODE="
set "CSP_DEPLOYMENT_MODE="

Health Checks

Liveness:

GET /api/health/live

Expected response includes:

{
  "status": "alive",
  "check": "liveness"
}

Checkout health is protected and should be accessed only through the configured monitoring workflow.

CI/CD

CI Quality Gate

Pull requests and supported pushes run:

dependency installation

critical production dependency audit

ESLint

security tests

production build

Playwright E2E

main is protected by repository rules and required checks.

Production Monitor

The scheduled production workflow verifies:

homepage availability

security headers

liveness endpoint

production Playwright E2E

Dependabot

Dependabot monitors:

npm dependencies

GitHub Actions dependencies

Minor and patch updates are grouped where configured.

Content Security Policy

Production uses enforced strict CSP with:

nonce
strict-dynamic
object-src 'none'
frame-ancestors 'none'

Verify headers:

curl.exe -sS -D - -o NUL "https://next-headless-ecommerce-storefront.vercel.app/" | findstr /I "content-security-policy strict-transport-security x-content-type-options referrer-policy permissions-policy x-frame-options cross-origin-opener-policy"

Do not weaken CSP to resolve a violation until the underlying source of the violation has been identified.

Release Process

Recommended flow:

feature/security branch
        ↓
pull request
        ↓
required CI checks
        ↓
merge to main
        ↓
Vercel Production deployment
        ↓
production health + E2E verification
        ↓
release tag

Current stable release:

v1.0.1

Rollback

Operational rollback and recovery procedures are documented in:

PRODUCTION_RUNBOOK.md

Emergency principle:

restore customer traffic using the last known good Vercel deployment

create a Git hotfix/rollback branch when repository rollback is required

pass CI

merge by pull request

verify Production again

Do not force-push rewritten history to main.

Security Notes

Browser prices and totals are never trusted as the final checkout source.

Cart and order data are validated server-side.

Idempotency protects order creation from duplicate submissions.

Rate limiting protects sensitive checkout operations.

Request IDs support incident investigation without exposing raw customer identifiers in audit events.

Strict CSP is enforced in Production.

Critical dependency vulnerabilities block the CI quality gate.

Operational Documentation

See:

PRODUCTION_RUNBOOK.md

for:

incident triage

Vercel checks

GitHub Actions checks

health verification

CSP verification

checkout/order incident handling

rollback

recovery checklist

License

Add the project's chosen license here before public distribution if a license has not already been selected.