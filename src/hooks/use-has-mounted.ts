"use client";

import {
  useSyncExternalStore,
} from "react";

/*
 * Hydration-safe client detection.
 *
 * Server rendering returns false.
 * Browser rendering returns true.
 *
 * This avoids setting state synchronously inside an effect.
 */
function subscribe(): () => void {
  return () => {};
}

function getClientSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}