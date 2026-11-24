"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { applyMockFlagFromUrl } from "@/lib/config";
import { invalidate } from "@/lib/query";
import { syncClock } from "@/lib/clock";

const MOCK_KEY_PREFIX = "mohalla.mock.";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyMockFlagFromUrl();
    // Mock mode: other tabs (ops, distributor, merchant) mutate the shared demo world — refetch instantly.
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(MOCK_KEY_PREFIX)) {
        void invalidate();
        void syncClock();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
