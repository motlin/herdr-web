import type { BridgeCapabilities } from "./bridge";
import type { BridgeHttpUrl } from "./bridgeApi";
import { apiErrorMessage } from "./bridgeApi";
import { fetchWithTimeout } from "./fetchWithTimeout";

export type HerdrKeyAction =
  | "new_tab"
  | "next_tab"
  | "previous_tab"
  | "switch_tab"
  | "close_tab"
  | "close_pane"
  | "focus_agent";

export type KeyModifiers = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

export type KeyChord = KeyModifiers & {
  key: string;
};

export type ChordBinding = {
  type: "chord";
  prefix: boolean;
  chord: KeyChord;
};

export type IndexedBinding = {
  type: "indexed";
  prefix: boolean;
  modifiers: KeyModifiers;
  first: number;
  last: number;
};

export type Binding = ChordBinding | IndexedBinding;

export type HerdrKeys = {
  prefix: KeyChord;
  bindings: Map<HerdrKeyAction, Binding>;
};

export type HerdrKeysResponse = {
  version: 1;
  source: string;
};

const DEFAULT_PREFIX_SOURCE = "ctrl+b";
const DEFAULT_BINDING_SOURCES: ReadonlyArray<
  readonly [HerdrKeyAction, string]
> = [
  ["new_tab", "prefix+c"],
  ["next_tab", "prefix+n"],
  ["previous_tab", "prefix+p"],
  ["switch_tab", "prefix+1..9"],
  ["close_tab", "prefix+shift+x"],
  ["close_pane", "prefix+x"],
];
const HERDR_KEY_ACTIONS = new Set<HerdrKeyAction>([
  "new_tab",
  "next_tab",
  "previous_tab",
  "switch_tab",
  "close_tab",
  "close_pane",
  "focus_agent",
]);
const CONFIG_LINE_PATTERN = /^([a-z_]+)\s*=\s*("(?:[^"\\]|\\.)*")$/u;

export function supportsHerdrKeysImport(
  capabilities: BridgeCapabilities | null | undefined,
) {
  return capabilities?.herdr_keys?.version === 1;
}

export async function fetchHerdrKeys(httpUrl: BridgeHttpUrl) {
  const response = await fetchWithTimeout(httpUrl("/api/herdr-keys"));
  if (!response.ok) {
    const message = await apiErrorMessage(response);
    throw new Error(message ?? `Herdr key import failed: ${response.status}`);
  }
  return parseHerdrKeysResponse(await response.json());
}

export function parseHerdrKeysResponse(value: unknown): HerdrKeysResponse {
  if (!isRecord(value) || value.version !== 1 || typeof value.source !== "string") {
    throw new Error("invalid Herdr keys response");
  }
  return { version: 1, source: value.source };
}

export function parseHerdrKeysSource(source: string): HerdrKeys {
  let prefixSource = DEFAULT_PREFIX_SOURCE;
  const bindings = new Map<HerdrKeyAction, Binding>(
    DEFAULT_BINDING_SOURCES.map(([action, bindingSource]) => [
      action,
      parseBinding(bindingSource),
    ]),
  );
  const configuredKeys = new Set<string>();

  for (const rawLine of source.split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = CONFIG_LINE_PATTERN.exec(line);
    if (!match) {
      throw new Error(`Invalid Herdr keys config line: ${line}`);
    }
    const [, key, quotedValue] = match;
    if (configuredKeys.has(key)) {
      throw new Error(`Duplicate Herdr key setting: ${key}`);
    }
    configuredKeys.add(key);
    const value = parseQuotedValue(quotedValue);
    if (key === "prefix") {
      prefixSource = value;
      continue;
    }
    if (!isHerdrKeyAction(key)) {
      throw new Error(`Unsupported Herdr key action: ${key}`);
    }
    bindings.set(key, parseBinding(value));
  }

  return {
    prefix: parseChord(prefixSource),
    bindings,
  };
}

function parseBinding(source: string): Binding {
  const tokens = keyTokens(source);
  const prefix = tokens[0] === "prefix";
  const bindingTokens = prefix ? tokens.slice(1) : tokens;
  if (bindingTokens.length === 0 || bindingTokens.includes("prefix")) {
    throw invalidBinding(source);
  }

  const keyToken = bindingTokens.at(-1);
  const modifierTokens = bindingTokens.slice(0, -1);
  if (!keyToken) {
    throw invalidBinding(source);
  }
  const modifiers = parseModifiers(modifierTokens, source);
  if (keyToken === "1..9") {
    return {
      type: "indexed",
      prefix,
      modifiers,
      first: 1,
      last: 9,
    };
  }
  return {
    type: "chord",
    prefix,
    chord: {
      key: parseKey(keyToken, source),
      ...modifiers,
    },
  };
}

function parseChord(source: string): KeyChord {
  const tokens = keyTokens(source);
  if (tokens.includes("prefix") || tokens.includes("1..9")) {
    throw invalidBinding(source);
  }
  const keyToken = tokens.at(-1);
  if (!keyToken) {
    throw invalidBinding(source);
  }
  return {
    key: parseKey(keyToken, source),
    ...parseModifiers(tokens.slice(0, -1), source),
  };
}

function keyTokens(source: string) {
  const tokens = source.split("+");
  if (tokens.some((token) => !token)) {
    throw invalidBinding(source);
  }
  return tokens;
}

function parseModifiers(tokens: string[], source: string): KeyModifiers {
  const modifiers: KeyModifiers = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };
  for (const token of tokens) {
    const modifier = modifierForToken(token);
    if (!modifier || modifiers[modifier]) {
      throw invalidBinding(source);
    }
    modifiers[modifier] = true;
  }
  return modifiers;
}

function modifierForToken(token: string): keyof KeyModifiers | null {
  switch (token) {
    case "ctrl":
      return "ctrl";
    case "shift":
      return "shift";
    case "alt":
      return "alt";
    case "cmd":
    case "super":
      return "meta";
    default:
      return null;
  }
}

function parseKey(token: string, source: string) {
  switch (token) {
    case "backtick":
      return "`";
    case "minus":
      return "-";
    case "tab":
      return "Tab";
    case "esc":
      return "Escape";
    default:
      if (/^[a-z0-9]$/u.test(token)) {
        return token;
      }
      throw invalidBinding(source);
  }
}

function parseQuotedValue(quotedValue: string) {
  const value: unknown = JSON.parse(quotedValue);
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Invalid Herdr key value: ${quotedValue}`);
}

function isHerdrKeyAction(value: string): value is HerdrKeyAction {
  return HERDR_KEY_ACTIONS.has(value as HerdrKeyAction);
}

function invalidBinding(source: string) {
  return new Error(`Invalid Herdr key binding "${source}"`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
