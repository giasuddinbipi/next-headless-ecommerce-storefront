# Checkout Health Monitoring Runbook

## Purpose

This runbook describes the production health monitoring system for the
Next.js storefront and its checkout dependencies.

The monitoring system verifies:

- Next.js application availability
- Upstash Redis availability
- WooCommerce REST API availability
- Protected readiness authentication
- Health-probe rate limiting
- Request correlation
- GitHub deployment health gates
- Scheduled production monitoring
- Incident creation and recovery closure

---

## Production endpoints

### Public liveness

```text
GET /api/health/live