import type { ITheme } from "ghostty-web";

export const DEFAULT_TERMINAL_THEME_SOURCE = `background = #11111b
foreground = #cdd6f4
cursor-color = #f5e0dc
selection-background = #45475a
palette = 0=#45475a
palette = 1=#f38ba8
palette = 2=#a6e3a1
palette = 3=#f9e2af
palette = 4=#89b4fa
palette = 5=#f5c2e7
palette = 6=#94e2d5
palette = 7=#bac2de
palette = 8=#585b70
palette = 9=#f38ba8
palette = 10=#a6e3a1
palette = 11=#f9e2af
palette = 12=#89b4fa
palette = 13=#f5c2e7
palette = 14=#94e2d5
palette = 15=#a6adc8`;

const MAX_TERMINAL_THEME_SOURCE_LENGTH = 8192;
const HEX_COLOR_PATTERN = /^#?[0-9a-f]{6}$/iu;
const PALETTE_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export const DEFAULT_TERMINAL_THEME = terminalThemeFromGhosttySource(
  DEFAULT_TERMINAL_THEME_SOURCE,
);

export function parseTerminalThemeSource(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_TERMINAL_THEME_SOURCE;
  }
  const source = value.trim();
  if (!source || source.length > MAX_TERMINAL_THEME_SOURCE_LENGTH) {
    return DEFAULT_TERMINAL_THEME_SOURCE;
  }
  try {
    if (Object.keys(terminalThemeFromGhosttySource(source)).length === 0) {
      return DEFAULT_TERMINAL_THEME_SOURCE;
    }
    return source;
  } catch {
    return DEFAULT_TERMINAL_THEME_SOURCE;
  }
}

export function terminalThemeFromGhosttySource(source: string): ITheme {
  const theme: ITheme = {};
  for (const rawLine of source.split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = unquote(line.slice(separatorIndex + 1).trim());
    if (key === "palette") {
      applyPalette(theme, value);
      continue;
    }
    const themeKey = themeKeyForGhosttyKey(key);
    if (!themeKey) {
      continue;
    }
    applyColor(theme, themeKey, value);
  }
  return theme;
}

function applyPalette(theme: ITheme, value: string) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex < 1) {
    throw new Error("Ghostty palette entry is missing its color");
  }
  const index = Number(value.slice(0, separatorIndex).trim());
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    throw new Error("Ghostty palette index must be between 0 and 255");
  }
  if (index >= PALETTE_KEYS.length) {
    return false;
  }
  return applyColor(theme, PALETTE_KEYS[index], value.slice(separatorIndex + 1).trim());
}

function themeKeyForGhosttyKey(key: string): keyof ITheme | null {
  if (key === "background") return "background";
  if (key === "foreground") return "foreground";
  if (key === "cursor-color") return "cursor";
  if (key === "cursor-text") return "cursorAccent";
  if (key === "selection-background") return "selectionBackground";
  if (key === "selection-foreground") return "selectionForeground";
  return null;
}

function applyColor(theme: ITheme, key: keyof ITheme, value: string) {
  if (!HEX_COLOR_PATTERN.test(value)) {
    return false;
  }
  theme[key] = normalizeHexColor(value);
  return true;
}

function normalizeHexColor(value: string) {
  return `#${value.replace(/^#/u, "").toLowerCase()}`;
}

function unquote(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
