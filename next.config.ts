import type {
  NextConfig,
} from "next";

import {
  getBrowserSecurityHeaders,
} from "./src/lib/browser-security-headers";

import {
  DEFAULT_CSP_REPORT_TO_GROUP,
  DEFAULT_CSP_REPORT_URI,
  getContentSecurityPolicyReportOnlyHeader,
  getReportingEndpointsHeader,
} from "./src/lib/content-security-policy";

const nextConfig:
  NextConfig = {
  poweredByHeader:
    false,

  images: {
    remotePatterns: [
      {
        protocol:
          "https",

        hostname:
          "cms.globalizedhost.com",

        port:
          "",

        pathname:
          "/wp-content/uploads/**",
      },
    ],
  },

  async headers() {
    const isProduction =
      process.env.NODE_ENV ===
      "production";

    return [
      {
        source:
          "/:path*",

        headers: [
          ...getBrowserSecurityHeaders({
            isProduction,
          }),

          getContentSecurityPolicyReportOnlyHeader({
            isProduction,

            reportUri:
              DEFAULT_CSP_REPORT_URI,

            reportTo:
              DEFAULT_CSP_REPORT_TO_GROUP,
          }),

          getReportingEndpointsHeader({
            group:
              DEFAULT_CSP_REPORT_TO_GROUP,

            endpoint:
              DEFAULT_CSP_REPORT_URI,
          }),
        ],
      },
    ];
  },
};

export default nextConfig;