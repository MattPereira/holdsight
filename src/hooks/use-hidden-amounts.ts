"use client";

import { useCallback, useEffect, useState } from "react";

import { HIDDEN_AMOUNTS_CLASS, hiddenAmountsCookie } from "@/lib/hidden-amounts";

/**
 * Drives the Hidden Amounts toggle and its keyboard shortcut.
 *
 * `initialHidden` comes from the server so the menu label matches what the page
 * already rendered. The class is flipped on the document directly rather than
 * through a re-render or a server round-trip: this control gets reached when
 * someone is about to see the screen, so it has to take effect immediately and
 * it must not be able to fail.
 */
export function useHiddenAmounts(initialHidden: boolean) {
  const [hidden, setHidden] = useState(initialHidden);

  const apply = useCallback((next: boolean) => {
    document.documentElement.classList.toggle(HIDDEN_AMOUNTS_CLASS, next);
    document.cookie = hiddenAmountsCookie(next);
    setHidden(next);
  }, []);

  // Read the live class rather than state so the shortcut and the menu item can
  // never disagree about what is currently on screen.
  const toggle = useCallback(() => {
    apply(
      !document.documentElement.classList.contains(HIDDEN_AMOUNTS_CLASS),
    );
  }, [apply]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "h") return;
      event.preventDefault();
      toggle();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return { hidden, toggle };
}
