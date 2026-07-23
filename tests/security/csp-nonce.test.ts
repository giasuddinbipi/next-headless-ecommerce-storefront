import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CSP_NONCE_HEX_LENGTH,
  assertValidCspNonce,
  createCspNonce,
  createCspNonceSource,
  createQuotedCspNonceSource,
  isValidCspNonce,
} from "../../src/lib/csp-nonce";

/* =========================================================
   Nonce generation
========================================================= */

describe(
  "createCspNonce",
  () => {
    it(
      "creates a normalized nonce from a secure UUID",
      () => {
        const nonce =
          createCspNonce(
            () =>
              "123e4567-e89b-42d3-a456-426614174000",
          );

        expect(
          nonce,
        ).toBe(
          "123e4567e89b42d3a456426614174000",
        );

        expect(
          nonce,
        ).toHaveLength(
          CSP_NONCE_HEX_LENGTH,
        );
      },
    );

    it(
      "normalizes uppercase UUID characters",
      () => {
        const nonce =
          createCspNonce(
            () =>
              "123E4567-E89B-42D3-A456-426614174000",
          );

        expect(
          nonce,
        ).toBe(
          "123e4567e89b42d3a456426614174000",
        );
      },
    );

    it(
      "creates a valid nonce using the platform crypto API",
      () => {
        const nonce =
          createCspNonce();

        expect(
          isValidCspNonce(
            nonce,
          ),
        ).toBe(
          true,
        );

        expect(
          nonce,
        ).toHaveLength(
          CSP_NONCE_HEX_LENGTH,
        );
      },
    );

    it(
      "rejects malformed UUID values",
      () => {
        expect(
          () =>
            createCspNonce(
              () =>
                "not-a-valid-uuid",
            ),
        ).toThrow(
          "CSP nonce source must return a valid UUID.",
        );

        expect(
          () =>
            createCspNonce(
              () =>
                "123e4567-e89b-12d3-a456-426614174000",
            ),
        ).toThrow(
          "CSP nonce source must return a valid UUID.",
        );
      },
    );
  },
);

/* =========================================================
   Nonce validation
========================================================= */

describe(
  "isValidCspNonce",
  () => {
    it(
      "accepts safe nonce values",
      () => {
        expect(
          isValidCspNonce(
            "123e4567e89b42d3a456426614174000",
          ),
        ).toBe(
          true,
        );

        expect(
          isValidCspNonce(
            "abcDEF123_-xyzABC456_-value",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects missing, short, and unsafe values",
      () => {
        expect(
          isValidCspNonce(
            undefined,
          ),
        ).toBe(
          false,
        );

        expect(
          isValidCspNonce(
            "",
          ),
        ).toBe(
          false,
        );

        expect(
          isValidCspNonce(
            "too-short",
          ),
        ).toBe(
          false,
        );

        expect(
          isValidCspNonce(
            " nonce-value-with-surrounding-space ",
          ),
        ).toBe(
          false,
        );

        expect(
          isValidCspNonce(
            "nonce-value<script>alert(1)</script>",
          ),
        ).toBe(
          false,
        );

        expect(
          isValidCspNonce(
            "nonce-value\r\nInjected-Header",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Assertion
========================================================= */

describe(
  "assertValidCspNonce",
  () => {
    it(
      "does not throw for a valid nonce",
      () => {
        expect(
          () =>
            assertValidCspNonce(
              "123e4567e89b42d3a456426614174000",
            ),
        ).not.toThrow();
      },
    );

    it(
      "throws for an invalid nonce",
      () => {
        expect(
          () =>
            assertValidCspNonce(
              "invalid nonce",
            ),
        ).toThrow(
          "CSP nonce contains an invalid value.",
        );
      },
    );
  },
);

/* =========================================================
   CSP source formatting
========================================================= */

describe(
  "CSP nonce source creation",
  () => {
    const nonce =
      "123e4567e89b42d3a456426614174000";

    it(
      "creates an unquoted nonce source",
      () => {
        expect(
          createCspNonceSource(
            nonce,
          ),
        ).toBe(
          "nonce-123e4567e89b42d3a456426614174000",
        );
      },
    );

    it(
      "creates a quoted CSP nonce source",
      () => {
        expect(
          createQuotedCspNonceSource(
            nonce,
          ),
        ).toBe(
          "'nonce-123e4567e89b42d3a456426614174000'",
        );
      },
    );

    it(
      "rejects unsafe nonce sources",
      () => {
        expect(
          () =>
            createQuotedCspNonceSource(
              "invalid'; script-src *",
            ),
        ).toThrow(
          "CSP nonce contains an invalid value.",
        );
      },
    );
  },
);