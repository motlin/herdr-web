import type { Binding, KeyChord, KeyModifiers } from "./herdrKeys";

export type PrefixModeState = "idle" | "pending";

export type PrefixModeInput = {
  chord: KeyChord;
  data: string;
};

export type PrefixModeEmission<Action extends string> =
  | { type: "literal"; data: string }
  | { type: "action"; action: Action; index?: number };

export type PrefixModeTransition<Action extends string> = {
  state: PrefixModeState;
  swallow: boolean;
  emission: PrefixModeEmission<Action> | null;
};

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Alt",
  "Control",
  "Meta",
  "AltGraph",
  "CapsLock",
]);

const SECONDARY_PREFIX: KeyChord = {
  key: "b",
  ctrl: true,
  shift: false,
  alt: false,
  meta: false,
};

export function transitionPrefixMode<Action extends string>(
  state: PrefixModeState,
  input: PrefixModeInput,
  configuredPrefix: KeyChord,
  bindings: ReadonlyMap<Action, Binding>,
): PrefixModeTransition<Action> {
  const prefix = chordsMatch(input.chord, configuredPrefix)
    || chordsMatch(input.chord, SECONDARY_PREFIX);

  if (state === "idle") {
    return prefix
      ? { state: "pending", swallow: true, emission: null }
      : { state: "idle", swallow: false, emission: null };
  }

  if (prefix) {
    return {
      state: "idle",
      swallow: true,
      emission: { type: "literal", data: input.data },
    };
  }

  if (MODIFIER_KEYS.has(input.chord.key)) {
    return { state: "pending", swallow: true, emission: null };
  }

  if (input.chord.key === "Escape") {
    return { state: "idle", swallow: true, emission: null };
  }

  for (const [action, binding] of bindings) {
    const index = matchingIndex(input.chord, binding);
    if (index !== null) {
      return {
        state: "idle",
        swallow: true,
        emission: index === undefined
          ? { type: "action", action }
          : { type: "action", action, index },
      };
    }
  }

  return { state: "idle", swallow: true, emission: null };
}

function matchingIndex(chord: KeyChord, binding: Binding): number | undefined | null {
  if (!binding.prefix) {
    return null;
  }
  if (binding.type === "chord") {
    return chordsMatch(chord, binding.chord) ? undefined : null;
  }
  if (!modifiersMatch(chord, binding.modifiers) || !/^\d$/u.test(chord.key)) {
    return null;
  }
  const index = Number(chord.key);
  return index >= binding.first && index <= binding.last ? index : null;
}

function chordsMatch(left: KeyChord, right: KeyChord) {
  return left.key === right.key && modifiersMatch(left, right);
}

function modifiersMatch(left: KeyModifiers, right: KeyModifiers) {
  return left.ctrl === right.ctrl
    && left.shift === right.shift
    && left.alt === right.alt
    && left.meta === right.meta;
}
