import {
  expect,
  test,
} from "@playwright/test";

import {
  collectRuntimeErrors,
} from "./helpers/runtime-errors";

/* =========================================================
   Routes
========================================================= */

const publicRoutes = [
  "/",
  "/shop",
  "/cart",
  "/checkout",
  "/login",
  "/account",
  "/wishlist",
] as const;

/* =========================================================
   Tests
========================================================= */

test.describe(
  "public storefront route smoke tests",
  () => {
    for (
      const route of
      publicRoutes
    ) {
      test(
        `${route} renders without a browser runtime failure`,
        async ({
          page,
        }) => {
          const runtimeErrors =
            collectRuntimeErrors(
              page,
            );

          const response =
            await page.goto(
              route,
              {
                waitUntil:
                  "domcontentloaded",
              },
            );

          expect(
            response,
            `${route} did not return a navigation response.`,
          ).not.toBeNull();

          if (
            !response
          ) {
            return;
          }

          expect(
            response.status(),
            `${route} returned HTTP ${response.status()}.`,
          ).toBeLessThan(
            400,
          );

          await expect(
            page.locator(
              "body",
            ),
          ).toBeVisible();

          const renderedTextLength =
            await page
              .locator(
                "body",
              )
              .innerText()
              .then(
                (
                  bodyText,
                ) =>
                  bodyText
                    .trim()
                    .length,
              );

          expect(
            renderedTextLength,
            `${route} rendered an empty body.`,
          ).toBeGreaterThan(
            0,
          );

          /*
           * Common Next.js fatal error UI indicators must
           * not be present in a successfully rendered page.
           */
          await expect(
            page.locator(
              "nextjs-portal",
            ),
          ).toHaveCount(
            0,
          );

          await expect(
            page.getByText(
              "Application error: a client-side exception has occurred",
              {
                exact:
                  false,
              },
            ),
          ).toHaveCount(
            0,
          );

          await page
            .waitForLoadState(
              "networkidle",
              {
                timeout:
                  8_000,
              },
            )
            .catch(
              () => {
                /*
                 * Some pages may keep background requests
                 * active. DOM rendering is still validated.
                 */
              },
            );

          expect(
            runtimeErrors.pageErrors,
            `${route} produced uncaught page errors:\n${runtimeErrors.pageErrors.join("\n")}`,
          ).toEqual(
            [],
          );

          expect(
            runtimeErrors.consoleErrors,
            `${route} produced console errors:\n${runtimeErrors.consoleErrors.join("\n")}`,
          ).toEqual(
            [],
          );
        },
      );
    }
  },
);