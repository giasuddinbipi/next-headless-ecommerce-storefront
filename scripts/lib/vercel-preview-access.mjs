/* =========================================================
   Constants
========================================================= */

const MAXIMUM_BYPASS_SECRET_LENGTH =
  2_048;

const HEADER_SAFE_ASCII_PATTERN =
  /^[\x21-\x7E]+$/;

/* =========================================================
   Secret normalization
========================================================= */

function normalizeBypassSecret(
  value,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length >
    MAXIMUM_BYPASS_SECRET_LENGTH
  ) {
    throw new Error(
      "Vercel protection bypass secret is too long.",
    );
  }

  if (
    !HEADER_SAFE_ASCII_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Vercel protection bypass secret contains characters that are unsafe for an HTTP header.",
    );
  }

  return normalized;
}

/* =========================================================
   Public header builder
========================================================= */

export function createVercelPreviewAccessHeaders(
  bypassSecret,
) {
  const normalizedSecret =
    normalizeBypassSecret(
      bypassSecret,
    );

  if (!normalizedSecret) {
    return {};
  }

  /*
   * The automation verifier sends the bypass secret on
   * every request, so it does not need a persistent bypass
   * cookie or a cookie-establishing redirect flow.
   */
  return {
    "x-vercel-protection-bypass":
      normalizedSecret,
  };
}

export function hasVercelPreviewAccessSecret(
  bypassSecret,
) {
  return Boolean(
    normalizeBypassSecret(
      bypassSecret,
    ),
  );
}