/* =========================================================
   Types
========================================================= */

export type CspNonceFactory =
  () => string;

/* =========================================================
   Constants
========================================================= */

export const CSP_NONCE_HEX_LENGTH =
  32;

/*
 * crypto.randomUUID() generates a version 4 UUID.
 *
 * Expected format:
 * xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * Allows hexadecimal, Base64, and Base64URL-compatible
 * nonce values without spaces or control characters.
 */
const CSP_NONCE_PATTERN =
  /^[A-Za-z0-9_-]{22,128}$/;

/* =========================================================
   Default secure UUID generator
========================================================= */

function getDefaultRandomUuid():
  string {
  const cryptoApi =
    globalThis.crypto;

  if (
    !cryptoApi ||
    typeof cryptoApi.randomUUID !==
      "function"
  ) {
    throw new Error(
      "Secure random UUID generation is unavailable.",
    );
  }

  return cryptoApi.randomUUID();
}

/* =========================================================
   UUID normalization
========================================================= */

function normalizeUuid(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !UUID_V4_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "CSP nonce source must return a valid UUID.",
    );
  }

  return normalized;
}

/* =========================================================
   Public nonce generation
========================================================= */

export function createCspNonce(
  randomUuid:
    CspNonceFactory =
      getDefaultRandomUuid,
): string {
  const uuid =
    normalizeUuid(
      randomUuid(),
    );

  const nonce =
    uuid.replace(
      /-/g,
      "",
    );

  if (
    nonce.length !==
    CSP_NONCE_HEX_LENGTH
  ) {
    throw new Error(
      "Generated CSP nonce has an invalid length.",
    );
  }

  return nonce;
}

/* =========================================================
   Nonce validation
========================================================= */

export function isValidCspNonce(
  value: unknown,
): value is string {
  if (
    typeof value !==
    "string"
  ) {
    return false;
  }

  if (
    value !==
    value.trim()
  ) {
    return false;
  }

  return CSP_NONCE_PATTERN.test(
    value,
  );
}

export function assertValidCspNonce(
  value: unknown,
): asserts value is string {
  if (
    !isValidCspNonce(
      value,
    )
  ) {
    throw new Error(
      "CSP nonce contains an invalid value.",
    );
  }
}

/* =========================================================
   CSP nonce source formatting
========================================================= */

export function createCspNonceSource(
  nonce: string,
): `nonce-${string}` {
  assertValidCspNonce(
    nonce,
  );

  return `nonce-${nonce}`;
}

export function createQuotedCspNonceSource(
  nonce: string,
): `'nonce-${string}'` {
  assertValidCspNonce(
    nonce,
  );

  return `'nonce-${nonce}'`;
}