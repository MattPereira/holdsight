"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Warns before the user navigates away (in-app link click or a real page
 * unload) while `shouldWarn` is true. Independent of the autosave engine —
 * it only knows a boolean and a confirmation message.
 *
 * Returns `confirmLeave`, so callers can reuse the same confirmation for
 * their own imperative navigation (e.g. before a programmatic route change
 * or closing a sheet) instead of duplicating the `window.confirm` call.
 */
export function useUnsavedChangesGuard(shouldWarn: boolean, message: string) {
  const shouldWarnRef = useRef(shouldWarn);
  const messageRef = useRef(message);
  useEffect(() => {
    shouldWarnRef.current = shouldWarn;
    messageRef.current = message;
  }, [shouldWarn, message]);

  const confirmLeave = useCallback((): boolean => {
    return !shouldWarnRef.current || window.confirm(messageRef.current);
  }, []);

  useEffect(() => {
    if (!shouldWarn) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [confirmLeave, shouldWarn]);

  return { confirmLeave };
}
