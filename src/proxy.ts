import {
  NextResponse,
} from "next/server";

import type {
  NextRequest,
} from "next/server";

import {
  DEFAULT_CSP_REPORT_TO_GROUP,
  DEFAULT_CSP_REPORT_URI,
  getReportingEndpointsHeader,
} from "./lib/content-security-policy";

import {
  createStrictCspRequestState,
  shouldApplyStrictCspRequest,
} from "./lib/strict-csp-request";

/* =========================================================
   Strict CSP Proxy
========================================================= */

export function proxy(
  request:
    NextRequest,
) {
  const shouldApply =
    shouldApplyStrictCspRequest({
      pathname:
        request.nextUrl.pathname,

      headers:
        request.headers,
    });

  if (
    !shouldApply
  ) {
    return NextResponse.next();
  }

  const state =
    createStrictCspRequestState({
      requestHeaders:
        request.headers,

      mode:
        process.env
          .STRICT_CSP_RUNTIME_MODE,

      isProduction:
        process.env.NODE_ENV ===
        "production",

      reportUri:
        DEFAULT_CSP_REPORT_URI,

      reportTo:
        DEFAULT_CSP_REPORT_TO_GROUP,
    });

  /*
   * Safe default:
   * no request or response behavior changes while disabled.
   */
  if (
    !state.enabled
  ) {
    return NextResponse.next();
  }

  const response =
    NextResponse.next({
      request: {
        headers:
          state.requestHeaders,
      },
    });

  response.headers.set(
    state.responseHeader.key,
    state.responseHeader.value,
  );

  const reportingEndpointsHeader =
    getReportingEndpointsHeader({
      group:
        DEFAULT_CSP_REPORT_TO_GROUP,

      endpoint:
        DEFAULT_CSP_REPORT_URI,
    });

  response.headers.set(
    reportingEndpointsHeader.key,
    reportingEndpointsHeader.value,
  );

  return response;
}

/* =========================================================
   Proxy matcher
========================================================= */

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",

      missing: [
        {
          type:
            "header",

          key:
            "next-router-prefetch",
        },

        {
          type:
            "header",

          key:
            "purpose",

          value:
            "prefetch",
        },
      ],
    },
  ],
};