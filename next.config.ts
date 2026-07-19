import type {
  NextConfig,
} from "next";

import {
  getBrowserSecurityHeaders,
} from "./src/lib/browser-security-headers";

const nextConfig:
  NextConfig = {
  /*
   * Remove the default:
   * X-Powered-By: Next.js
   */
  poweredByHeader:
    false,

  /*
   * Allow WooCommerce media hosted on the CMS domain.
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
   * Apply the browser security-header policy
   * to every storefront and API route.
   */
  async headers() {
    return [
      {
        source:
          "/:path*",

        headers:
          getBrowserSecurityHeaders({
            isProduction:
              process.env.NODE_ENV ===
              "production",
          }),
      },
    ];
  },
};

export default nextConfig;