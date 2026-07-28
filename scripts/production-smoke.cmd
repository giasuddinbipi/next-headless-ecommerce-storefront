@echo off
setlocal

set "BASE_URL=https://next-headless-ecommerce-storefront.vercel.app"

echo.
echo ========================================
echo Production Smoke Test
echo ========================================

echo.
echo [1/4] Homepage...
curl.exe -f -sS -o NUL "%BASE_URL%/"
if errorlevel 1 goto :fail

echo PASS

echo.
echo [2/4] Liveness...
curl.exe -f -sS "%BASE_URL%/api/health/live"
if errorlevel 1 goto :fail

echo.
echo PASS

echo.
echo [3/4] Security Headers...
curl.exe -sS -D - -o NUL "%BASE_URL%/" ^
  | findstr /I "content-security-policy strict-transport-security x-content-type-options x-frame-options"

if errorlevel 1 goto :fail

echo PASS

echo.
echo [4/4] Production E2E...

set "E2E_BASE_URL=%BASE_URL%"
set "STRICT_CSP_RUNTIME_MODE=enforce"
set "CSP_DEPLOYMENT_MODE=report-only"

call npm run test:e2e

if errorlevel 1 goto :fail

echo.
echo ========================================
echo PRODUCTION SMOKE TEST PASSED
echo ========================================

exit /b 0

:fail

echo.
echo ========================================
echo PRODUCTION SMOKE TEST FAILED
echo ========================================

exit /b 1