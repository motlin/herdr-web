import { describe, expect, it } from "vitest";
import {
  parseGhosttyConfigResponse,
  supportsGhosttyConfigImport,
  terminalAppearanceFromGhosttySource,
} from "./terminalConfig";

describe("Ghostty config import", () => {
  it("detects bridge support", () => {
    expect(supportsGhosttyConfigImport({ commands: [], ghostty_config: { version: 1 } })).toBe(
      true,
    );
    expect(supportsGhosttyConfigImport({ commands: [] })).toBe(false);
  });

  it("parses a strict bridge response", () => {
    expect(
      parseGhosttyConfigResponse({
        version: 1,
        source: "font-family = Example Mono",
      }),
    ).toStrictEqual({
      version: 1,
      source: "font-family = Example Mono",
    });
    expect(() => parseGhosttyConfigResponse({ version: 1, source: 100 })).toThrow(
      "invalid Ghostty config response",
    );
  });

  it("extracts appearance settings from a complete Ghostty config", () => {
    expect(
      terminalAppearanceFromGhosttySource(`
        font-family = Example Mono
        font-size = 16
        background = #000000
        selection-background = #b5d5ff
        palette = 0=#010203
        shell-integration-features = no-title
        keybind = shift+enter=text:\\n
      `),
    ).toStrictEqual({
      fontFamily: "Example Mono, monospace",
      fontSizePx: 16,
      themeSource:
        "background = #000000\nselection-background = #b5d5ff\npalette = 0=#010203",
    });
  });

  it("rejects invalid or unsupported appearance input", () => {
    expect(() => terminalAppearanceFromGhosttySource("font-size = large")).toThrow(
      "Ghostty config contains an invalid font-size",
    );
    expect(() =>
      terminalAppearanceFromGhosttySource("shell-integration-features = no-title"),
    ).toThrow("Ghostty config contains no supported terminal appearance settings");
  });
});
