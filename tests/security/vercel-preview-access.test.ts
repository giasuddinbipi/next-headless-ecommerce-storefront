import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createVercelPreviewAccessHeaders,
  hasVercelPreviewAccessSecret,
} from "../../scripts/lib/vercel-preview-access.mjs";

/* =========================================================
   Empty configuration
========================================================= */

describe(
  "Vercel Preview access without a secret",
  () => {
    it(
      "returns no bypass headers when the secret is missing",
      () => {
        expect(
          createVercelPreviewAccessHeaders(
            undefined,
          ),
        ).toEqual(
          {},
        );

        expect(
          createVercelPreviewAccessHeaders(
            "",
          ),
        ).toEqual(
          {},
        );

        expect(
          hasVercelPreviewAccessSecret(
            "",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Valid configuration
========================================================= */

describe(
  "Vercel Preview access with a valid secret",
  () => {
    it(
      "returns the required protection bypass headers",
      () => {
        const secret =
          "preview-bypass-secret-value";

        expect(
          createVercelPreviewAccessHeaders(
            secret,
          ),
        ).toEqual({
          "x-vercel-protection-bypass":
            secret,

          "x-vercel-set-bypass-cookie":
            "true",
        });

        expect(
          hasVercelPreviewAccessSecret(
            secret,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "trims surrounding whitespace",
      () => {
        expect(
          createVercelPreviewAccessHeaders(
            "  preview-secret  ",
          ),
        ).toEqual({
          "x-vercel-protection-bypass":
            "preview-secret",

          "x-vercel-set-bypass-cookie":
            "true",
        });
      },
    );
  },
);

/* =========================================================
   Unsafe configuration
========================================================= */

describe(
  "Vercel Preview access validation",
  () => {
    it(
      "rejects CRLF control characters",
      () => {
        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "secret\r\nInjected: value",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains invalid control characters.",
        );
      },
    );

    it(
      "rejects excessively long values",
      () => {
        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "a".repeat(
                2_049,
              ),
            ),
        ).toThrow(
          "Vercel protection bypass secret is too long.",
        );
      },
    );
  },
);