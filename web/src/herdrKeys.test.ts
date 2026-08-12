import { describe, expect, it } from "vitest";
import {
  parseHerdrKeysSource,
  supportsHerdrKeysImport,
} from "./herdrKeys";

describe("Herdr key config import", () => {
  it("detects bridge support", () => {
    expect(
      supportsHerdrKeysImport({ commands: [], herdr_keys: { version: 1 } }),
    ).toBe(true);
    expect(supportsHerdrKeysImport({ commands: [] })).toBe(false);
  });

  it("parses a backtick prefix and indexed alt binding", () => {
    const parsed = parseHerdrKeysSource(`
      prefix = "backtick"
      focus_agent = "prefix+alt+1..9"
    `);

    expect({
      prefix: parsed.prefix,
      focusAgent: parsed.bindings.get("focus_agent"),
    }).toStrictEqual({
      prefix: {
        key: "`",
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      },
      focusAgent: {
        type: "indexed",
        prefix: true,
        modifiers: {
          ctrl: false,
          shift: false,
          alt: true,
          meta: false,
        },
        first: 1,
        last: 9,
      },
    });
  });

  it("fills unset actions with Herdr defaults", () => {
    expect(parseHerdrKeysSource('prefix = "backtick"')).toStrictEqual({
      prefix: {
        key: "`",
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      },
      bindings: new Map([
        [
          "new_tab",
          {
            type: "chord",
            prefix: true,
            chord: {
              key: "c",
              ctrl: false,
              shift: false,
              alt: false,
              meta: false,
            },
          },
        ],
        [
          "next_tab",
          {
            type: "chord",
            prefix: true,
            chord: {
              key: "n",
              ctrl: false,
              shift: false,
              alt: false,
              meta: false,
            },
          },
        ],
        [
          "previous_tab",
          {
            type: "chord",
            prefix: true,
            chord: {
              key: "p",
              ctrl: false,
              shift: false,
              alt: false,
              meta: false,
            },
          },
        ],
        [
          "switch_tab",
          {
            type: "indexed",
            prefix: true,
            modifiers: {
              ctrl: false,
              shift: false,
              alt: false,
              meta: false,
            },
            first: 1,
            last: 9,
          },
        ],
        [
          "close_tab",
          {
            type: "chord",
            prefix: true,
            chord: {
              key: "x",
              ctrl: false,
              shift: true,
              alt: false,
              meta: false,
            },
          },
        ],
        [
          "close_pane",
          {
            type: "chord",
            prefix: true,
            chord: {
              key: "x",
              ctrl: false,
              shift: false,
              alt: false,
              meta: false,
            },
          },
        ],
        [
          "focus_agent",
          {
            type: "indexed",
            prefix: true,
            modifiers: {
              ctrl: false,
              shift: false,
              alt: true,
              meta: false,
            },
            first: 1,
            last: 9,
          },
        ],
      ]),
    });
  });

  it("parses supported modifiers and named keys", () => {
    const parsed = parseHerdrKeysSource(`
      prefix = "super+backtick"
      new_tab = "prefix+cmd+minus"
      next_tab = "prefix+ctrl+tab"
      previous_tab = "prefix+shift+esc"
    `);

    expect({
      prefix: parsed.prefix,
      newTab: parsed.bindings.get("new_tab"),
      nextTab: parsed.bindings.get("next_tab"),
      previousTab: parsed.bindings.get("previous_tab"),
    }).toStrictEqual({
      prefix: {
        key: "`",
        ctrl: false,
        shift: false,
        alt: false,
        meta: true,
      },
      newTab: {
        type: "chord",
        prefix: true,
        chord: {
          key: "-",
          ctrl: false,
          shift: false,
          alt: false,
          meta: true,
        },
      },
      nextTab: {
        type: "chord",
        prefix: true,
        chord: {
          key: "Tab",
          ctrl: true,
          shift: false,
          alt: false,
          meta: false,
        },
      },
      previousTab: {
        type: "chord",
        prefix: true,
        chord: {
          key: "Escape",
          ctrl: false,
          shift: true,
          alt: false,
          meta: false,
        },
      },
    });
  });

  it("rejects unknown key syntax instead of dropping it", () => {
    expect(() =>
      parseHerdrKeysSource('new_tab = "prefix+hyper+c"'),
    ).toThrowError(new Error('Invalid Herdr key binding "prefix+hyper+c"'));
  });
});
