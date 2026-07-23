import type {
  Page,
} from "@playwright/test";

/* =========================================================
   Types
========================================================= */

export type RuntimeErrorCollection =
  Readonly<{
    consoleErrors:
      string[];

    pageErrors:
      string[];
  }>;

/* =========================================================
   Known non-failing browser diagnostics
========================================================= */

const ignoredConsoleErrorPatterns =
  [
    /*
     * Browsers do not apply upgrade-insecure-requests
     * from a report-only CSP. This diagnostic does not
     * represent a failed resource or application crash.
     */
    /upgrade-insecure-requests.*ignored when delivered in a report-only policy/i,
  ] as const;

function shouldIgnoreConsoleError(
  message:
    string,
): boolean {
  return ignoredConsoleErrorPatterns.some(
    (
      pattern,
    ) =>
      pattern.test(
        message,
      ),
  );
}

/* =========================================================
   Error collection
========================================================= */

export function collectRuntimeErrors(
  page:
    Page,
): RuntimeErrorCollection {
  const consoleErrors:
    string[] =
    [];

  const pageErrors:
    string[] =
    [];

  page.on(
    "console",
    (
      message,
    ) => {
      if (
        message.type() !==
        "error"
      ) {
        return;
      }

      const text =
        message.text();

      if (
        shouldIgnoreConsoleError(
          text,
        )
      ) {
        return;
      }

      consoleErrors.push(
        text,
      );
    },
  );

  page.on(
    "pageerror",
    (
      error,
    ) => {
      pageErrors.push(
        `${error.name}: ${error.message}`,
      );
    },
  );

  return {
    consoleErrors,
    pageErrors,
  };
}