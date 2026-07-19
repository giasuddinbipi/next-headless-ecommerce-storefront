import type {
  NextConfig,
} from "next";

import {
  getBrowserSecurityHeaders,
} from "./src/lib/browser-security-headers";

import {
  getCspDeploymentHeaders,
} from "./src/lib/csp-deployment";

const nextConfig:
  NextConfig = {
  /*
   * Prevent framework disclosure through:
   * X-Powered-By: Next.js
   */
  poweredByHeader:
    false,

  /*
   * Allow WooCommerce media hosted by the CMS.
   */
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

  /*
   * Apply browser security headers and the selected CSP
   * deployment mode to all storefront and API routes.
   */
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

          ...getCspDeploymentHeaders({
            mode:
              process.env
                .CSP_DEPLOYMENT_MODE,

            isProduction,
          }),
        ],
      },
    ];
  },
};

export default nextConfig;