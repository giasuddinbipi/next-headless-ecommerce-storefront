import {
  describe,
  expect,
  it,
} from "vitest";

import nextConfig
  from "../../next.config";

/* =========================================================
   Helpers
========================================================= */

type ConfiguredHeader = {
  key:
    string;

  value:
    string;
};

type ConfiguredHeaderRule = {
  source:
    string;

  headers:
    ConfiguredHeader[];
};

function convertHeadersToRecord(
  headers:
    ConfiguredHeader[],
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

async function getConfiguredHeaderRules():
  Promise<
    ConfiguredHeaderRule[]
  > {
  if (
    typeof nextConfig.headers !==
    "function"
  ) {
    throw new Error(
      "next.config does not define a headers function.",
    );
  }

  const rules =
    await nextConfig.headers();

  return rules as
    ConfiguredHeaderRule[];
}

async function getGlobalHeaders():
  Promise<
    Record<string, string>
  > {
  const rules =
    await getConfiguredHeaderRules();

  const globalRule =
    rules.find(
      (
        rule,
      ) =>
        rule.source ===
        "/:path*",
    );

  if (!globalRule) {
    throw new Error(
      "Global browser security header rule was not found.",
    );
  }

  return convertHeadersToRecord(
    globalRule.headers,
  );
}

/* =========================================================
   Framework disclosure
========================================================= */

describe(
  "Next.js browser security configuration",
  () => {
    it(
      "disables the X-Powered-By header",
      () => {
        expect(
          nextConfig
            .poweredByHeader,
        ).toBe(
          false,
        );
      },
    );

    it(
      "defines a global header rule",
      async () => {
        const rules =
          await getConfiguredHeaderRules();

        expect(
          rules,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source:
                "/:path*",
            }),
          ]),
        );
      },
    );
  },
);

/* =========================================================
   Global browser headers
========================================================= */

describe(
  "Next.js global browser security headers",
  () => {
    it(
      "applies MIME-sniffing and framing protection",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers,
        ).toMatchObject({
          "x-content-type-options":
            "nosniff",

          "x-frame-options":
            "DENY",
        });
      },
    );

    it(
      "applies referrer and opener policies",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers,
        ).toMatchObject({
          "referrer-policy":
            "strict-origin-when-cross-origin",

          "cross-origin-opener-policy":
            "same-origin-allow-popups",
        });
      },
    );

    it(
      "applies the restrictive permissions policy",
      async () => {
        const headers =
          await getGlobalHeaders();

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
      "does not contain duplicate global header names",
      async () => {
        const rules =
          await getConfiguredHeaderRules();

        const globalRule =
          rules.find(
            (
              rule,
            ) =>
              rule.source ===
              "/:path*",
          );

        expect(
          globalRule,
        ).toBeDefined();

        const names =
          globalRule
            ?.headers
            .map(
              (
                header,
              ) =>
                header.key
                  .toLowerCase(),
            ) ??
          [];

        expect(
          new Set(
            names,
          ).size,
        ).toBe(
          names.length,
        );
      },
    );
  },
);