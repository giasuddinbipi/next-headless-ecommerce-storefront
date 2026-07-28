# Production Deployment Checklist

## 1. Before Merge

- [ ] Feature/security branch is up to date with `main`
- [ ] Pull request created
- [ ] No secrets or `.env.local` files are included
- [ ] Required GitHub checks are green
- [ ] `quality` passed
- [ ] `e2e` passed
- [ ] Review conversations are resolved

## 2. Local Validation

```cmd
npm ci
npm run lint
npm run test:security
npm run build