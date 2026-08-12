import { describe, expect, it } from "vitest";
import type { Binding, KeyChord } from "./herdrKeys";
import { transitionPrefixMode } from "./prefixMode";

const configuredPrefix: KeyChord = {
  key: "`",
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
};

const bindings = new Map<string, Binding>([
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
    "detach",
    {
      type: "chord",
      prefix: true,
      chord: {
        key: "q",
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      },
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
]);

function input(chord: KeyChord, data = chord.key) {
  return { chord, data };
}

describe("prefix mode", () => {
  it("enters pending mode and swallows the configured prefix", () => {
    expect(
      transitionPrefixMode(
        "idle",
        input(configuredPrefix),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "pending", swallow: true, emission: null });
  });

  it("also enters pending mode for the secondary ctrl+b prefix", () => {
    expect(
      transitionPrefixMode(
        "idle",
        input(
          {
            key: "b",
            ctrl: true,
            shift: false,
            alt: false,
            meta: false,
          },
          "\u0002",
        ),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "pending", swallow: true, emission: null });
  });

  it("leaves unrelated keys untouched while idle", () => {
    expect(
      transitionPrefixMode(
        "idle",
        input({
          key: "a",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "idle", swallow: false, emission: null });
  });

  it("emits the raw key and returns to idle for a double prefix", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input(configuredPrefix),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "literal", data: "`" },
    });
  });

  it("cancels pending mode and swallows Escape", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "Escape",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "idle", swallow: true, emission: null });
  });

  it("emits a bound chord action and returns to idle", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "n",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "action", action: "next_tab" },
    });
  });

  it("emits an indexed action with its one-based index", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "3",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "action", action: "switch_tab", index: 3 },
    });
  });

  it("swallows an unbound key and returns to idle", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "z",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "idle", swallow: true, emission: null });
  });

  it("dispatches q when bound instead of treating it as cancel", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "q",
          ctrl: false,
          shift: false,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "action", action: "detach" },
    });
  });

  it("stays pending for a bare Shift keydown and then emits shift+x", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "Shift",
          ctrl: false,
          shift: true,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "pending", swallow: true, emission: null });
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "x",
          ctrl: false,
          shift: true,
          alt: false,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "action", action: "close_tab" },
    });
  });

  it("stays pending for a bare Alt keydown and then emits alt+1", () => {
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "Alt",
          ctrl: false,
          shift: false,
          alt: true,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({ state: "pending", swallow: true, emission: null });
    expect(
      transitionPrefixMode(
        "pending",
        input({
          key: "1",
          ctrl: false,
          shift: false,
          alt: true,
          meta: false,
        }),
        configuredPrefix,
        bindings,
      ),
    ).toStrictEqual({
      state: "idle",
      swallow: true,
      emission: { type: "action", action: "focus_agent", index: 1 },
    });
  });

  it.each([
    { key: "Control", ctrl: true, shift: false, alt: false, meta: false },
    { key: "Meta", ctrl: false, shift: false, alt: false, meta: true },
    { key: "AltGraph", ctrl: false, shift: false, alt: true, meta: false },
    { key: "CapsLock", ctrl: false, shift: false, alt: false, meta: false },
  ] satisfies KeyChord[])("stays pending for a bare $key keydown", (chord) => {
    expect(
      transitionPrefixMode("pending", input(chord), configuredPrefix, bindings),
    ).toStrictEqual({ state: "pending", swallow: true, emission: null });
  });
});
