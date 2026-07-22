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
   Missing and empty configuration
========================================================= */

describe(
  "Vercel Preview access without a secret",
  () => {
    it(
      "returns no bypass headers when the secret is missing or empty",
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
          createVercelPreviewAccessHeaders(
            "   ",
          ),
        ).toEqual(
          {},
        );

        expect(
          hasVercelPreviewAccessSecret(
            undefined,
          ),
        ).toBe(
          false,
        );

        expect(
          hasVercelPreviewAccessSecret(
            "",
          ),
        ).toBe(
          false,
        );

        expect(
          hasVercelPreviewAccessSecret(
            "   ",
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
      "returns only the required automation bypass header",
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
      "trims surrounding whitespace before creating the header",
      () => {
        expect(
          createVercelPreviewAccessHeaders(
            "  preview-secret  ",
          ),
        ).toEqual({
          "x-vercel-protection-bypass":
            "preview-secret",
        });

        expect(
          hasVercelPreviewAccessSecret(
            "  preview-secret  ",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "accepts a header-safe generated secret",
      () => {
        const generatedSecret =
          "M7k4Pq9vL2s8N5dR1xC6aB3fT0uE4wZx";

        const headers =
          createVercelPreviewAccessHeaders(
            generatedSecret,
          );

        expect(
          headers,
        ).toEqual({
          "x-vercel-protection-bypass":
            generatedSecret,
        });

        expect(
          Object.keys(
            headers,
          ),
        ).toEqual([
          "x-vercel-protection-bypass",
        ]);
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
      "rejects CRLF and other HTTP header control characters",
      () => {
        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "secret\r\nInjected: value",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );

        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "secret\tvalue",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );

        expect(
          () =>
            hasVercelPreviewAccessSecret(
              "secret\nvalue",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );
      },
    );

    it(
      "rejects non-ASCII, smart-quote, and hidden characters",
      () => {
        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "secret\u200Bvalue",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );

        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "“secret-value”",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );

        expect(
          () =>
            createVercelPreviewAccessHeaders(
              "secret–value",
            ),
        ).toThrow(
          "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
        );
      },
    );

    it(
      "rejects excessively long bypass secrets",
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

        expect(
          () =>
            hasVercelPreviewAccessSecret(
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