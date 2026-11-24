"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export const OVERLAY_ID = "m-overlay";
const noop = () => () => {};

/**
 * Renders children into the phone-screen overlay layer (`#m-overlay`, a non-scrolling sibling of the
 * merchant scroller) so sheets and docks stay pinned while content scrolls. Falls back to <body>.
 */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const host = useSyncExternalStore(
    noop,
    () => document.getElementById(OVERLAY_ID) ?? document.body,
    () => null,
  );
  if (!host) return null;
  return createPortal(children, host);
}
