import "@testing-library/jest-dom/vitest";

import {
  cleanup,
} from "@testing-library/react";

import {
  afterEach,
  vi,
} from "vitest";

afterEach(() => {
  /*
   * globals:false থাকায় explicit cleanup
   * component tests-এর মধ্যে DOM leakage আটকায়।
   */
  cleanup();

  vi.useRealTimers();
});