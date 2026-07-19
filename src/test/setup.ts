import {
  afterEach,
  vi,
} from "vitest";

/*
 * প্রতিটি test-এর পরে timer state reset হবে।
 *
 * clearMocks, mockReset, restoreMocks,
 * unstubEnvs এবং unstubGlobals configuration
 * থেকেও automatically চলবে।
 */
afterEach(() => {
  vi.useRealTimers();
});