import {
  getCspDeploymentHeaders,
  resolveCspDeploymentMode,
  type CspDeploymentMode,
} from "./csp-deployment";

import {
  resolveStrictCspRuntimeMode,
  type StrictCspRuntimeMode,
} from "./strict-csp-request";

/* =========================================================
   Types
========================================================= */

export type CspHeaderOwner =
  | "next-config"
  | "proxy";

export type CoordinatedCspHeader =
  Readonly<{
    key: string;
    value: string;
  }>;

export type CspRuntimeCoordinationOptions =
  Readonly<{
    strictMode?:
      string | null;

    compatibilityMode?:
      string | null;

    isProduction?:
      boolean;
  }>;

export type CspRuntimePlan =
  Readonly<{
    strictMode:
      StrictCspRuntimeMode;

    compatibilityMode:
      CspDeploymentMode;

    headerOwner:
      CspHeaderOwner;

    strictCspEnabled:
      boolean;

    compatibilityCspEnabled:
      boolean;

    staticHeaders:
      readonly CoordinatedCspHeader[];
  }>;

/* =========================================================
   Runtime coordination
========================================================= */

export function createCspRuntimePlan(
  options:
    CspRuntimeCoordinationOptions = {},
): CspRuntimePlan {
  /*
   * Validate both variables even when only one CSP system
   * currently owns the response. This prevents a broken
   * rollback configuration from remaining unnoticed.
   */
  const strictMode =
    resolveStrictCspRuntimeMode(
      options.strictMode,
    );

  const compatibilityMode =
    resolveCspDeploymentMode(
      options.compatibilityMode,
    );

  const strictCspEnabled =
    strictMode !==
    "disabled";

  if (
    strictCspEnabled
  ) {
    return {
      strictMode,

      compatibilityMode,

      headerOwner:
        "proxy",

      strictCspEnabled:
        true,

      compatibilityCspEnabled:
        false,

      staticHeaders:
        [],
    };
  }

  return {
    strictMode,

    compatibilityMode,

    headerOwner:
      "next-config",

    strictCspEnabled:
      false,

    compatibilityCspEnabled:
      true,

    staticHeaders:
      getCspDeploymentHeaders({
        mode:
          compatibilityMode,

        isProduction:
          options.isProduction,
      }),
  };
}