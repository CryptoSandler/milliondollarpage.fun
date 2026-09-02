"use client";

import { useSyncExternalStore } from "react";

/**
 * Which of the two registers this reader sees.
 *
 * WHO CALLS THIS: `BoardView`'s top bar, and the nav on `/faq` and `/stats`.
 * The three of them are every page this product has.
 *
 * ## TWO STATES, AND "SYSTEM" IS GONE
 *
 * It cycled through three — light, dark, and the absence of a choice, which
 * followed `prefers-color-scheme`. The owner retired the third. What survives
 * of it is the part that mattered: **a stored choice still rules**, and a
 * reader who has never chosen gets **dark**, which is this design's own
 * register rather than whatever their machine decided for their mail client.
 *
 * The cost is stated rather than hidden: somebody who has chosen light here and
 * runs a dark system no longer has a control that says "go back to following
 * the machine". They have a switch with two positions and one of them is the
 * machine's. A three-position control existed to answer a question nobody was
 * asking, and it cost the page a text button where a switch belongs.
 *
 * ## Why a switch and not a button with a word on it
 *
 * A button labelled `Dark` is ambiguous in the way every theme toggle is
 * ambiguous: it is either telling you where you are or where pressing it takes
 * you, and no label fixes that. A switch is not ambiguous — `role="switch"`
 * with `aria-checked` says *dark is on* or *dark is off*, which is a state, and
 * the knob is where the state is. It is the one control on this page that
 * animates, and it animates for 220ms.
 *
 * ## Why `useSyncExternalStore` and not an effect
 *
 * The choice lives on `<html>`, which is outside React and is written before
 * React exists by the boot script in `layout.tsx`. That is the exact shape
 * `useSyncExternalStore` is for: a value the server cannot know, read from an
 * external system, with a server snapshot for the render that has no browser.
 * The obvious alternative — `useState` corrected by an effect — is a setState
 * in an effect body, which the linter is right to refuse and which would render
 * one frame with the knob on the wrong side.
 */

export type ThemeChoice = "light" | "dark";

/** The key the boot script writes and this reads. One name, two readers. */
export const THEME_KEY = "mdp-theme";

/**
 * WHAT A READER WHO HAS NEVER CHOSEN GETS. Dark, because that is the register
 * this design is, and because "follow the machine" stopped being one of the
 * answers. `THEME_BOOT` in `layout.tsx` stamps the same default before the
 * first paint, so nobody sees a frame of the other one.
 */
export const DEFAULT_THEME: ThemeChoice = "dark";

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
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** The server has no reader, and the default is what it renders. */
function serverChoice(): ThemeChoice {
  return DEFAULT_THEME;
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  /*
    THE ATTRIBUTE IS ALWAYS PRESENT NOW. It used to be removed for "system",
    which is what let `prefers-color-scheme` through; with two states there is
    nothing to fall through to and an absent attribute would mean the same as a
    dark one, which is a second way to say one thing.
  */
  root.setAttribute("data-theme", choice);

  /*
    THE CROSSFADE IS OPT-IN, PER SWITCH, and it is a class rather than a
    standing transition. A page whose every surface transitions its colour is a
    page that fades on first paint and on every hover that touches a background;
    this turns the fade on for exactly as long as it lasts and then takes it off
    again. `prefers-reduced-motion` removes it in the stylesheet.
  */
  root.classList.add("theme-turning");
  window.setTimeout(() => root.classList.remove("theme-turning"), THEME_FADE_MS);

  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A browser refusing storage is a browser that does not remember the
    // choice, which is a smaller problem than a page that throws over it.
  }

  for (const listener of listeners) listener();
}

/** How long the ground takes to change, and the knob to cross. */
export const THEME_FADE_MS = 220;

export default function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, currentChoice, serverChoice);
  const dark = choice === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="theme-switch"
      aria-label="Dark register"
      title={dark ? "Switch to the light register" : "Switch to the dark register"}
      onClick={() => apply(dark ? "light" : "dark")}
    >
      {/* The track and the knob are the whole control. Both are aria-hidden:
          the switch's state is `aria-checked`, and a screen reader being told
          about a circle would be told the same thing twice, once uselessly. */}
      <span aria-hidden className="theme-switch__track">
        {/*
          A SUN OR A MOON IN THE KNOB, so the switch says what it switches. A
          track with a plain disc is a toggle for something; this is a toggle for
          the light. Both are aria-hidden — `aria-checked` on the button is the
          state, and a screen reader being told about a glyph would meet the
          same fact twice, once uselessly.
        */}
        <span className="theme-switch__knob">{dark ? "☾" : "☀"}</span>
      </span>
    </button>
  );
}
