/* =========================================================
   Constants
========================================================= */

const MAXIMUM_BYPASS_SECRET_LENGTH =
  2_048;

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
    /[\r\n]/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Vercel protection bypass secret contains invalid control characters.",
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

  return {
    "x-vercel-protection-bypass":
      normalizedSecret,

    /*
     * Lets Vercel establish the bypass cookie when the
     * deployment flow requires subsequent navigation.
     */
    "x-vercel-set-bypass-cookie":
      "true",
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