"use client";

import { useSyncExternalStore } from "react";

/**
 * Which of the two registers this reader sees.
 *
 * WHO CALLS THIS: `BoardView`'s top bar, and the nav on `/faq` and `/stats`.
 * The three of them are every page this product has.
 *
 * ## Three states, not two
 *
 * `light` and `dark` are choices. `system` is the absence of one, and it is the
 * default — a reader who has not decided follows `prefers-color-scheme`, which
 * is the decision their operating system already made for every other
 * application they use. The toggle cycles through all three rather than
 * flipping between two, because a reader who chose light on a dark machine
 * needs a way back to "whatever the machine says" and a two-way switch does not
 * have one.
 *
 * ## Why `useSyncExternalStore` and not an effect
 *
 * The choice lives on `<html>`, which is outside React and is written before
 * React exists by the boot script below. That is the exact shape
 * `useSyncExternalStore` is for: a value the server cannot know, read from an
 * external system, with a server snapshot for the render that has no browser.
 * The obvious alternative — `useState("system")` corrected by an effect — is a
 * setState in an effect body, which is a cascading render the linter is right
 * to refuse and which would render one frame with the wrong word on the button.
 *
 * ## Why the stored value is read before React runs
 *
 * `THEME_BOOT` in `layout.tsx` is a blocking inline script that stamps
 * `data-theme` on `<html>` before the first paint. Without it there is a flash
 * of the wrong register on every load for anybody whose choice disagrees with
 * their system — the page would paint from `prefers-color-scheme`, hydrate, and
 * then swap. This component only has to agree with what that script already
 * did, which is why it reads the attribute rather than storage.
 */

export type ThemeChoice = "light" | "dark" | "system";

/** The key the boot script writes and this reads. One name, two readers. */
export const THEME_KEY = "mdp-theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

const LABEL: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * What each choice is called out loud, which is not what it is called on the
 * button: the button says the current state and a screen reader needs to be
 * told what pressing it does.
 */
const NEXT_LABEL: Record<ThemeChoice, string> = {
  system: "Switch to the light register",
  light: "Switch to the dark register",
  dark: "Follow the system setting",
};

/*
  The listeners `useSyncExternalStore` subscribes with. A module-level set,
  because the thing being watched is a single attribute on a single element and
  a store any bigger than this would be pretending otherwise.
*/
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentChoice(): ThemeChoice {
  const stamped = document.documentElement.getAttribute("data-theme");
  return stamped === "light" || stamped === "dark" ? stamped : "system";
}

/** The server has no reader and therefore no choice. */
function serverChoice(): ThemeChoice {
  return "system";
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A browser refusing storage is a browser that does not remember the
    // choice, which is a smaller problem than a page that throws over it.
  }

  for (const listener of listeners) listener();
}

export default function ThemeToggle() {
  /*
    `system` on the server and on the first client render, whatever the reader
    actually chose — the server cannot know it. What differs after hydration is
    the WORD on a button, never the colour of the page: the boot script stamped
    the attribute before the first paint, so the register is already right.
  */
  const choice = useSyncExternalStore(subscribe, currentChoice, serverChoice);

  return (
    <button
      type="button"
      className="btn-quiet theme-toggle shrink-0 px-2.5 py-1.5 text-[12.5px]"
      aria-label={NEXT_LABEL[choice]}
      title={NEXT_LABEL[choice]}
      onClick={() => {
        const at = ORDER.indexOf(choice);
        apply(ORDER[(at + 1) % ORDER.length]);
      }}
    >
      {LABEL[choice]}
    </button>
  );
}
