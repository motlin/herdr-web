import type { BridgeCapabilities } from "./bridge";
import type { BridgeHttpUrl } from "./bridgeApi";
import { apiErrorMessage } from "./bridgeApi";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { parseTerminalFontFamily, parseTerminalFontSizePx } from "./terminalPrefs";
import { terminalThemeFromGhosttySource } from "./terminalTheme";

export type TerminalAppearance = {
  fontFamily?: string;
  fontSizePx?: number;
  themeSource?: string;
};

type GhosttyConfigResponse = {
  version: 1;
  source: string;
};

const GHOSTTY_THEME_KEYS = new Set([
  "background",
  "foreground",
  "cursor-color",
  "cursor-text",
  "selection-background",
  "selection-foreground",
  "palette",
]);

export function supportsGhosttyConfigImport(
  capabilities: BridgeCapabilities | null | undefined,
) {
  return capabilities?.ghostty_config?.version === 1;
}

export async function fetchGhosttyConfig(httpUrl: BridgeHttpUrl) {
  const response = await fetchWithTimeout(httpUrl("/api/ghostty-config"));
  if (!response.ok) {
    const message = await apiErrorMessage(response);
    throw new Error(message ?? `Ghostty config import failed: ${response.status}`);
  }
  return parseGhosttyConfigResponse(await response.json());
}

export function parseGhosttyConfigResponse(value: unknown): GhosttyConfigResponse {
  if (!isRecord(value) || value.version !== 1 || typeof value.source !== "string") {
    throw new Error("invalid Ghostty config response");
  }
  return { version: 1, source: value.source };
}

export function terminalAppearanceFromGhosttySource(source: string): TerminalAppearance {
  const fontFamilies: string[] = [];
  const themeLines: string[] = [];
  let fontSizePx: number | undefined;

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
    if (key === "font-family") {
      fontFamilies.push(parseTerminalFontFamily(value));
    } else if (key === "font-size") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Ghostty config contains an invalid font-size");
      }
      fontSizePx = parseTerminalFontSizePx(parsed);
    } else if (GHOSTTY_THEME_KEYS.has(key)) {
      themeLines.push(line);
    }
  }

  const appearance: TerminalAppearance = {};
  if (fontFamilies.length > 0) {
    appearance.fontFamily = [...fontFamilies, "monospace"].join(", ");
  }
  if (fontSizePx !== undefined) {
    appearance.fontSizePx = fontSizePx;
  }
  if (themeLines.length > 0) {
    appearance.themeSource = themeLines.join("\n");
    terminalThemeFromGhosttySource(appearance.themeSource);
  }
  if (Object.keys(appearance).length === 0) {
    throw new Error("Ghostty config contains no supported terminal appearance settings");
  }
  return appearance;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
