import type {
  NextConfig,
} from "next";

import {
  getBrowserSecurityHeaders,
} from "./src/lib/browser-security-headers";

import {
  createCspRuntimePlan,
} from "./src/lib/csp-runtime-coordination";

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

    const cspRuntimePlan =
      createCspRuntimePlan({
        strictMode:
          process.env
            .STRICT_CSP_RUNTIME_MODE,

        compatibilityMode:
          process.env
            .CSP_DEPLOYMENT_MODE,

        isProduction,
      });

    return [
      {
        source:
          "/:path*",

        headers: [
          ...getBrowserSecurityHeaders({
            isProduction,
          }),

          ...cspRuntimePlan
            .staticHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;