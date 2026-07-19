import "server-only";

import {
  createHash,
} from "node:crypto";

/* =========================================================
   Public types
========================================================= */

export type CspViolationCategory =
  | "script"
  | "style"
  | "image"
  | "connect"
  | "font"
  | "frame"
  | "media"
  | "worker"
  | "document"
  | "other";

export type CspBlockedResourceKind =
  | "self"
  | "same-origin-relative"
  | "inline"
  | "eval"
  | "data"
  | "blob"
  | "browser-extension"
  | "external"
  | "unknown";

export type CspViolationSeverity =
  | "low"
  | "medium"
  | "high";

export type CspViolationDisposition =
  | "report"
  | "enforce"
  | "unknown";

export type CspViolationAnalysisInput =
  Readonly<{
    documentOrigin:
      string | null;

    blockedOrigin:
      string | null;

    sourceOrigin:
      string | null;

    effectiveDirective:
      string | null;

    violatedDirective:
      string | null;

    disposition:
      string | null;

    statusCode:
      number | null;
  }>;

export type CspViolationAnalysis =
  Readonly<{
    fingerprint:
      string;

    category:
      CspViolationCategory;

    directive:
      string | null;

    blockedResourceKind:
      CspBlockedResourceKind;

    severity:
      CspViolationSeverity;

    actionable:
      boolean;

    reason:
      string;

    disposition:
      CspViolationDisposition;

    statusCode:
      number | null;
  }>;

/* =========================================================
   Constants
========================================================= */

const MAXIMUM_TEXT_LENGTH =
  160;

const FINGERPRINT_LENGTH =
  24;

const BROWSER_EXTENSION_PROTOCOLS =
  new Set([
    "chrome-extension:",
    "moz-extension:",
    "safari-extension:",
    "ms-browser-extension:",
  ]);

/* =========================================================
   Text normalization
========================================================= */

function normalizeText(
  value:
    string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .replace(
        /[\r\n\t]+/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim()
      .slice(
        0,
        MAXIMUM_TEXT_LENGTH,
      );

  return normalized || null;
}

function normalizeDirective(
  effectiveDirective:
    string | null,

  violatedDirective:
    string | null,
): string | null {
  const effective =
    normalizeText(
      effectiveDirective,
    );

  if (effective) {
    return effective
      .split(
        /\s+/,
      )[0]
      ?.toLowerCase() ??
      null;
  }

  const violated =
    normalizeText(
      violatedDirective,
    );

  return (
    violated
      ?.split(
        /\s+/,
      )[0]
      ?.toLowerCase() ??
    null
  );
}

/* =========================================================
   Directive classification
========================================================= */

function classifyDirective(
  directive:
    string | null,
): CspViolationCategory {
  if (!directive) {
    return "other";
  }

  if (
    directive.startsWith(
      "script-src",
    )
  ) {
    return "script";
  }

  if (
    directive.startsWith(
      "style-src",
    )
  ) {
    return "style";
  }

  if (
    directive.startsWith(
      "img-src",
    )
  ) {
    return "image";
  }

  if (
    directive.startsWith(
      "connect-src",
    )
  ) {
    return "connect";
  }

  if (
    directive.startsWith(
      "font-src",
    )
  ) {
    return "font";
  }

  if (
    directive.startsWith(
      "frame-src",
    ) ||
    directive.startsWith(
      "frame-ancestors",
    ) ||
    directive.startsWith(
      "child-src",
    )
  ) {
    return "frame";
  }

  if (
    directive.startsWith(
      "media-src",
    )
  ) {
    return "media";
  }

  if (
    directive.startsWith(
      "worker-src",
    )
  ) {
    return "worker";
  }

  if (
    directive.startsWith(
      "default-src",
    ) ||
    directive.startsWith(
      "base-uri",
    ) ||
    directive.startsWith(
      "form-action",
    ) ||
    directive.startsWith(
      "manifest-src",
    ) ||
    directive.startsWith(
      "object-src",
    )
  ) {
    return "document";
  }

  return "other";
}

/* =========================================================
   Blocked resource classification
========================================================= */

function normalizeOrigin(
  value:
    string | null,
): string | null {
  const normalized =
    normalizeText(
      value,
    );

  if (!normalized) {
    return null;
  }

  try {
    const url =
      new URL(
        normalized,
      );

    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }

    return url.origin
      .toLowerCase();
  } catch {
    return null;
  }
}

function classifyBlockedResource({
  blockedOrigin,
  documentOrigin,
}: {
  blockedOrigin:
    string | null;

  documentOrigin:
    string | null;
}): CspBlockedResourceKind {
  const normalizedBlocked =
    normalizeText(
      blockedOrigin,
    );

  if (!normalizedBlocked) {
    return "unknown";
  }

  const lowerBlocked =
    normalizedBlocked
      .toLowerCase();

  if (
    lowerBlocked ===
    "inline"
  ) {
    return "inline";
  }

  if (
    lowerBlocked ===
    "eval"
  ) {
    return "eval";
  }

  if (
    lowerBlocked ===
      "self" ||
    lowerBlocked ===
      "'self'"
  ) {
    return "self";
  }

  if (
    lowerBlocked ===
    "same-origin-relative"
  ) {
    return "same-origin-relative";
  }

  if (
    lowerBlocked ===
    "data:"
  ) {
    return "data";
  }

  if (
    lowerBlocked ===
    "blob:"
  ) {
    return "blob";
  }

  if (
    BROWSER_EXTENSION_PROTOCOLS.has(
      lowerBlocked,
    )
  ) {
    return "browser-extension";
  }

  const normalizedDocumentOrigin =
    normalizeOrigin(
      documentOrigin,
    );

  const normalizedBlockedOrigin =
    normalizeOrigin(
      normalizedBlocked,
    );

  if (
    normalizedDocumentOrigin &&
    normalizedBlockedOrigin &&
    normalizedDocumentOrigin ===
      normalizedBlockedOrigin
  ) {
    return "self";
  }

  if (
    normalizedBlockedOrigin
  ) {
    return "external";
  }

  return "unknown";
}

/* =========================================================
   Disposition normalization
========================================================= */

function normalizeDisposition(
  value:
    string | null,
): CspViolationDisposition {
  const normalized =
    normalizeText(
      value,
    )?.toLowerCase();

  if (
    normalized ===
    "report"
  ) {
    return "report";
  }

  if (
    normalized ===
    "enforce"
  ) {
    return "enforce";
  }

  return "unknown";
}

/* =========================================================
   Severity and actionability
========================================================= */

function determineViolationDecision({
  category,
  blockedResourceKind,
}: {
  category:
    CspViolationCategory;

  blockedResourceKind:
    CspBlockedResourceKind;
}): {
  severity:
    CspViolationSeverity;

  actionable:
    boolean;

  reason:
    string;
} {
  if (
    blockedResourceKind ===
    "browser-extension"
  ) {
    return {
      severity:
        "low",

      actionable:
        false,

      reason:
        "browser_extension_noise",
    };
  }

  if (
    blockedResourceKind ===
    "unknown"
  ) {
    return {
      severity:
        "low",

      actionable:
        false,

      reason:
        "incomplete_violation_report",
    };
  }

  if (
    category ===
      "script" &&
    blockedResourceKind ===
      "inline"
  ) {
    return {
      severity:
        "high",

      actionable:
        true,

      reason:
        "inline_script_violation",
    };
  }

  if (
    category ===
      "script" &&
    blockedResourceKind ===
      "eval"
  ) {
    return {
      severity:
        "high",

      actionable:
        true,

      reason:
        "eval_script_violation",
    };
  }

  if (
    category ===
      "script" &&
    blockedResourceKind ===
      "external"
  ) {
    return {
      severity:
        "high",

      actionable:
        true,

      reason:
        "external_script_violation",
    };
  }

  if (
    category ===
      "connect" &&
    blockedResourceKind ===
      "external"
  ) {
    return {
      severity:
        "high",

      actionable:
        true,

      reason:
        "external_connection_violation",
    };
  }

  if (
    category ===
    "frame"
  ) {
    return {
      severity:
        "high",

      actionable:
        true,

      reason:
        "frame_policy_violation",
    };
  }

  if (
    blockedResourceKind ===
      "self" ||
    blockedResourceKind ===
      "same-origin-relative"
  ) {
    return {
      severity:
        "medium",

      actionable:
        true,

      reason:
        "same_origin_policy_mismatch",
    };
  }

  if (
    blockedResourceKind ===
    "external"
  ) {
    return {
      severity:
        "medium",

      actionable:
        true,

      reason:
        "external_resource_violation",
    };
  }

  return {
    severity:
      "medium",

    actionable:
      true,

    reason:
      "content_security_policy_violation",
  };
}

/* =========================================================
   Fingerprinting
========================================================= */

function createViolationFingerprint({
  documentOrigin,
  blockedOrigin,
  sourceOrigin,
  directive,
  category,
  blockedResourceKind,
}: {
  documentOrigin:
    string | null;

  blockedOrigin:
    string | null;

  sourceOrigin:
    string | null;

  directive:
    string | null;

  category:
    CspViolationCategory;

  blockedResourceKind:
    CspBlockedResourceKind;
}): string {
  const fingerprintInput =
    JSON.stringify({
      documentOrigin:
        normalizeText(
          documentOrigin,
        ),

      blockedOrigin:
        normalizeText(
          blockedOrigin,
        ),

      sourceOrigin:
        normalizeText(
          sourceOrigin,
        ),

      directive,
      category,
      blockedResourceKind,
    });

  return createHash(
    "sha256",
  )
    .update(
      fingerprintInput,
      "utf8",
    )
    .digest(
      "hex",
    )
    .slice(
      0,
      FINGERPRINT_LENGTH,
    );
}

/* =========================================================
   Public analyzer
========================================================= */

export function analyzeCspViolation(
  input:
    CspViolationAnalysisInput,
): CspViolationAnalysis {
  const directive =
    normalizeDirective(
      input.effectiveDirective,
      input.violatedDirective,
    );

  const category =
    classifyDirective(
      directive,
    );

  const blockedResourceKind =
    classifyBlockedResource({
      blockedOrigin:
        input.blockedOrigin,

      documentOrigin:
        input.documentOrigin,
    });

  const decision =
    determineViolationDecision({
      category,
      blockedResourceKind,
    });

  const disposition =
    normalizeDisposition(
      input.disposition,
    );

  const statusCode =
    typeof input.statusCode ===
        "number" &&
      Number.isFinite(
        input.statusCode,
      )
      ? Math.max(
          0,
          Math.trunc(
            input.statusCode,
          ),
        )
      : null;

  return {
    fingerprint:
      createViolationFingerprint({
        documentOrigin:
          input.documentOrigin,

        blockedOrigin:
          input.blockedOrigin,

        sourceOrigin:
          input.sourceOrigin,

        directive,
        category,
        blockedResourceKind,
      }),

    category,
    directive,
    blockedResourceKind,

    severity:
      decision.severity,

    actionable:
      decision.actionable,

    reason:
      decision.reason,

    disposition,
    statusCode,
  };
}