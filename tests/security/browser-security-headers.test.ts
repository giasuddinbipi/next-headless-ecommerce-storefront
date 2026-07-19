import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getBrowserSecurityHeaders,
} from "@/lib/browser-security-headers";

/* =========================================================
   Helpers
========================================================= */

function convertHeadersToRecord(
  headers:
    ReturnType<
      typeof getBrowserSecurityHeaders
    >,
): Record<
  string,
  string
> {
  return Object.fromEntries(
    headers.map(
      (
        header,
      ) => [
        header.key
          .toLowerCase(),

        header.value,
      ],
    ),
  );
}

/* =========================================================
   Development policy
========================================================= */

describe(
  "getBrowserSecurityHeaders development policy",
  () => {
    it(
      "returns the baseline security headers",
      () => {
        const headers =
          convertHeadersToRecord(
            getBrowserSecurityHeaders({
              isProduction:
                false,
            }),
          );

        expect(
          headers,
        ).toMatchObject({
          "x-content-type-options":
            "nosniff",

          "x-frame-options":
            "DENY",

          "referrer-policy":
            "strict-origin-when-cross-origin",

          "cross-origin-opener-policy":
            "same-origin-allow-popups",

          "x-dns-prefetch-control":
            "off",

          "x-permitted-cross-domain-policies":
            "none",
        });
      },
    );

    it(
      "returns the restrictive permissions policy",
      () => {
        const headers =
          convertHeadersToRecord(
            getBrowserSecurityHeaders({
              isProduction:
                false,
            }),
          );

        expect(
          headers[
            "permissions-policy"
          ],
        ).toBe(
          [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "usb=()",
            "browsing-topics=()",
          ].join(
            ", ",
          ),
        );
      },
    );

    it(
      "does not enable HSTS in an explicitly non-production policy",
      () => {
        const headers =
          convertHeadersToRecord(
            getBrowserSecurityHeaders({
              isProduction:
                false,
            }),
          );

        expect(
          headers[
            "strict-transport-security"
          ],
        ).toBeUndefined();
      },
    );
  },
);

/* =========================================================
   Production policy
========================================================= */

describe(
  "getBrowserSecurityHeaders production policy",
  () => {
    it(
      "adds the production HSTS policy",
      () => {
        const headers =
          convertHeadersToRecord(
            getBrowserSecurityHeaders({
              isProduction:
                true,
            }),
          );

        expect(
          headers[
            "strict-transport-security"
          ],
        ).toBe(
          "max-age=63072000; includeSubDomains; preload",
        );
      },
    );

    it(
      "does not contain duplicate header names",
      () => {
        const headers =
          getBrowserSecurityHeaders({
            isProduction:
              true,
          });

        const normalizedNames =
          headers.map(
            (
              header,
            ) =>
              header.key
                .toLowerCase(),
          );

        expect(
          new Set(
            normalizedNames,
          ).size,
        ).toBe(
          normalizedNames.length,
        );
      },
    );
  },
);

/* =========================================================
   Header integrity
========================================================= */

describe(
  "browser security header integrity",
  () => {
    it(
      "does not return empty names or values",
      () => {
        const headers =
          getBrowserSecurityHeaders({
            isProduction:
              true,
          });

        for (
          const header of
          headers
        ) {
          expect(
            header.key.trim(),
          ).not.toBe(
            "",
          );

          expect(
            header.value.trim(),
          ).not.toBe(
            "",
          );
        }
      },
    );

    it(
      "does not include response-header control characters",
      () => {
        const headers =
          getBrowserSecurityHeaders({
            isProduction:
              true,
          });

        for (
          const header of
          headers
        ) {
          expect(
            header.key,
          ).not.toMatch(
            /[\r\n]/,
          );

          expect(
            header.value,
          ).not.toMatch(
            /[\r\n]/,
          );
        }
      },
    );

    it(
      "returns independent header arrays and objects",
      () => {
        const first =
          getBrowserSecurityHeaders({
            isProduction:
              true,
          });

        const second =
          getBrowserSecurityHeaders({
            isProduction:
              true,
          });

        expect(
          first,
        ).not.toBe(
          second,
        );

        expect(
          first[0],
        ).not.toBe(
          second[0],
        );

        expect(
          first,
        ).toEqual(
          second,
        );
      },
    );
  },
);