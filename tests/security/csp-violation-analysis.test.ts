import {
  describe,
  expect,
  it,
} from "vitest";

import {
  analyzeCspViolation,
} from "@/lib/csp-violation-analysis";

/* =========================================================
   Helpers
========================================================= */

function createBaseReport() {
  return {
    documentOrigin:
      "https://store.example",

    blockedOrigin:
      "https://cdn.example",

    sourceOrigin:
      "https://store.example",

    effectiveDirective:
      "script-src-elem",

    violatedDirective:
      "script-src 'self'",

    disposition:
      "report",

    statusCode:
      200,
  };
}

/* =========================================================
   Script violations
========================================================= */

describe(
  "CSP script violation analysis",
  () => {
    it(
      "classifies an inline script violation as high severity",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "inline",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "script",

          blockedResourceKind:
            "inline",

          severity:
            "high",

          actionable:
            true,

          reason:
            "inline_script_violation",
        });
      },
    );

    it(
      "classifies eval usage as high severity",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "eval",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "script",

          blockedResourceKind:
            "eval",

          severity:
            "high",

          actionable:
            true,

          reason:
            "eval_script_violation",
        });
      },
    );

    it(
      "classifies an external script as high severity",
      () => {
        const result =
          analyzeCspViolation(
            createBaseReport(),
          );

        expect(
          result,
        ).toMatchObject({
          category:
            "script",

          blockedResourceKind:
            "external",

          severity:
            "high",

          reason:
            "external_script_violation",
        });
      },
    );
  },
);

/* =========================================================
   Noise and incomplete reports
========================================================= */

describe(
  "CSP report noise analysis",
  () => {
    it(
      "marks browser-extension reports as non-actionable noise",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "chrome-extension:",
          });

        expect(
          result,
        ).toMatchObject({
          blockedResourceKind:
            "browser-extension",

          severity:
            "low",

          actionable:
            false,

          reason:
            "browser_extension_noise",
        });
      },
    );

    it(
      "marks reports without a usable blocked resource as incomplete",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              null,
          });

        expect(
          result,
        ).toMatchObject({
          blockedResourceKind:
            "unknown",

          severity:
            "low",

          actionable:
            false,

          reason:
            "incomplete_violation_report",
        });
      },
    );
  },
);

/* =========================================================
   Origin and directive behavior
========================================================= */

describe(
  "CSP origin and directive analysis",
  () => {
    it(
      "recognizes matching document and blocked origins as self",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "https://store.example",

            effectiveDirective:
              "img-src",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "image",

          blockedResourceKind:
            "self",

          severity:
            "medium",

          reason:
            "same_origin_policy_mismatch",
        });
      },
    );

    it(
      "classifies same-origin relative resources",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "same-origin-relative",

            effectiveDirective:
              "style-src-elem",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "style",

          blockedResourceKind:
            "same-origin-relative",

          actionable:
            true,

          reason:
            "same_origin_policy_mismatch",
        });
      },
    );

    it(
      "classifies external connection violations as high severity",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            effectiveDirective:
              "connect-src",

            blockedOrigin:
              "https://tracking.example",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "connect",

          blockedResourceKind:
            "external",

          severity:
            "high",

          reason:
            "external_connection_violation",
        });
      },
    );

    it(
      "classifies frame violations as high severity",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            effectiveDirective:
              "frame-src",

            blockedOrigin:
              "https://payments.example",
          });

        expect(
          result,
        ).toMatchObject({
          category:
            "frame",

          severity:
            "high",

          actionable:
            true,

          reason:
            "frame_policy_violation",
        });
      },
    );
  },
);

/* =========================================================
   Fingerprinting
========================================================= */

describe(
  "CSP violation fingerprinting",
  () => {
    it(
      "creates a stable privacy-safe fingerprint",
      () => {
        const first =
          analyzeCspViolation(
            createBaseReport(),
          );

        const second =
          analyzeCspViolation(
            createBaseReport(),
          );

        expect(
          first.fingerprint,
        ).toBe(
          second.fingerprint,
        );

        expect(
          first.fingerprint,
        ).toMatch(
          /^[a-f0-9]{24}$/,
        );
      },
    );

    it(
      "creates different fingerprints for different violations",
      () => {
        const first =
          analyzeCspViolation(
            createBaseReport(),
          );

        const second =
          analyzeCspViolation({
            ...createBaseReport(),

            blockedOrigin:
              "https://other.example",
          });

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "normalizes control characters in directives",
      () => {
        const result =
          analyzeCspViolation({
            ...createBaseReport(),

            effectiveDirective:
              "script-src-elem\r\nInjected: value",
          });

        expect(
          result.directive,
        ).toBe(
          "script-src-elem",
        );

        expect(
          result.directive,
        ).not.toMatch(
          /[\r\n]/,
        );
      },
    );
  },
);