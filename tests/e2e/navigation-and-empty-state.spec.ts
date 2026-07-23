import {
  expect,
  test,
  type Page,
} from "@playwright/test";

import {
  collectRuntimeErrors,
  type RuntimeErrorCollection,
} from "./helpers/runtime-errors";

/* =========================================================
   Assertions
========================================================= */

function expectNoRuntimeErrors(
  errors:
    RuntimeErrorCollection,
  pageName:
    string,
): void {
  expect(
    errors.pageErrors,
    `${pageName} produced uncaught page errors:\n${errors.pageErrors.join(
      "\n",
    )}`,
  ).toEqual(
    [],
  );

  expect(
    errors.consoleErrors,
    `${pageName} produced console errors:\n${errors.consoleErrors.join(
      "\n",
    )}`,
  ).toEqual(
    [],
  );
}

async function expectRenderedBody(
  page:
    Page,
): Promise<void> {
  await expect(
    page.locator(
      "body",
    ),
  ).toBeVisible();

  const bodyText =
    await page
      .locator(
        "body",
      )
      .innerText();

  expect(
    bodyText.trim().length,
  ).toBeGreaterThan(
    0,
  );
}

/* =========================================================
   Navigation tests
========================================================= */

test.describe(
  "storefront navigation and anonymous states",
  () => {
    test(
      "the main Shop link opens the shop page",
      async ({
        page,
      }) => {
        const runtimeErrors =
          collectRuntimeErrors(
            page,
          );

        const response =
          await page.goto(
            "/",
            {
              waitUntil:
                "domcontentloaded",
            },
          );

        expect(
          response,
        ).not.toBeNull();

        if (
          response
        ) {
          expect(
            response.status(),
          ).toBeLessThan(
            400,
          );
        }

        const shopLink =
          page
            .getByRole(
              "link",
              {
                name:
                  "Shop",

                exact:
                  true,
              },
            )
            .first();

        await expect(
          shopLink,
        ).toBeVisible();

        await shopLink.click();

        await expect(
          page,
        ).toHaveURL(
          /\/shop(?:\?.*)?$/,
        );

        await expectRenderedBody(
          page,
        );

        expectNoRuntimeErrors(
          runtimeErrors,
          "Home to shop navigation",
        );
      },
    );

    test(
      "an empty cart displays its empty state and returns to the shop",
      async ({
        page,
      }) => {
        const runtimeErrors =
          collectRuntimeErrors(
            page,
          );

        const response =
          await page.goto(
            "/cart",
            {
              waitUntil:
                "domcontentloaded",
            },
          );

        expect(
          response,
        ).not.toBeNull();

        if (
          response
        ) {
          expect(
            response.status(),
          ).toBeLessThan(
            400,
          );
        }

        await expect(
          page.getByRole(
            "heading",
            {
              name:
                "Your cart is empty",

              exact:
                true,
            },
          ),
        ).toBeVisible();

        const continueShoppingLink =
          page.getByRole(
            "link",
            {
              name:
                "Continue shopping",

              exact:
                true,
            },
          );

        await expect(
          continueShoppingLink,
        ).toHaveAttribute(
          "href",
          "/shop",
        );

        await continueShoppingLink.click();

        await expect(
          page,
        ).toHaveURL(
          /\/shop(?:\?.*)?$/,
        );

        expectNoRuntimeErrors(
          runtimeErrors,
          "Empty cart navigation",
        );
      },
    );

    test(
      "checkout prevents an empty cart from opening the order form",
      async ({
        page,
      }) => {
        const runtimeErrors =
          collectRuntimeErrors(
            page,
          );

        const response =
          await page.goto(
            "/checkout",
            {
              waitUntil:
                "domcontentloaded",
            },
          );

        expect(
          response,
        ).not.toBeNull();

        if (
          response
        ) {
          expect(
            response.status(),
          ).toBeLessThan(
            400,
          );
        }

        await expect(
          page.getByRole(
            "heading",
            {
              name:
                "Your cart is empty",

              exact:
                true,
            },
          ),
        ).toBeVisible();

        await expect(
          page.getByText(
            "Add products before opening checkout.",
            {
              exact:
                true,
            },
          ),
        ).toBeVisible();

        const visitShopLink =
          page.getByRole(
            "link",
            {
              name:
                "Visit shop",

              exact:
                true,
            },
          );

        await expect(
          visitShopLink,
        ).toHaveAttribute(
          "href",
          "/shop",
        );

        await visitShopLink.click();

        await expect(
          page,
        ).toHaveURL(
          /\/shop(?:\?.*)?$/,
        );

        expectNoRuntimeErrors(
          runtimeErrors,
          "Empty checkout navigation",
        );
      },
    );

    test(
      "an anonymous account request redirects to login with its callback",
      async ({
        page,
      }) => {
        const runtimeErrors =
          collectRuntimeErrors(
            page,
          );

        const response =
          await page.goto(
            "/account",
            {
              waitUntil:
                "domcontentloaded",
            },
          );

        expect(
          response,
        ).not.toBeNull();

        if (
          response
        ) {
          expect(
            response.status(),
          ).toBeLessThan(
            400,
          );
        }

        await expectRenderedBody(
          page,
        );

        const redirectedUrl =
          new URL(
            page.url(),
          );

        expect(
          redirectedUrl.pathname,
        ).toBe(
          "/login",
        );

        const callbackUrl =
          redirectedUrl.searchParams.get(
            "callbackUrl",
          );

        expect(
          callbackUrl,
          "The login redirect did not preserve the requested account route.",
        ).not.toBeNull();

        expect(
          callbackUrl ===
            "/account" ||
            callbackUrl?.endsWith(
              "/account",
            ),
        ).toBe(
          true,
        );

        expectNoRuntimeErrors(
          runtimeErrors,
          "Anonymous account redirect",
        );
      },
    );
  },
);