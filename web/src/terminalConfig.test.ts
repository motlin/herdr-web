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

  it("keeps non-color settings when a color format is unsupported", () => {
    expect(
      terminalAppearanceFromGhosttySource(`
        font-family = Example Mono
        cursor-color = white
      `),
    ).toStrictEqual({
      fontFamily: "Example Mono, monospace",
    });
  });

  it("rejects a font-family stack that cannot be persisted", () => {
    const source = Array.from(
      { length: 100 },
      () => "font-family = Example Mono",
    ).join("\n");

    expect(() => terminalAppearanceFromGhosttySource(source)).toThrowError(
      new Error("Ghostty config contains a font-family stack that cannot be saved"),
    );
  });

  it("rejects color settings that cannot be persisted", () => {
    const source = [
      "background = #000000",
      ...Array.from({ length: 1000 }, () => "palette = 255=#000000"),
    ].join("\n");

    expect(() => terminalAppearanceFromGhosttySource(source)).toThrowError(
      new Error("Ghostty config contains color settings that cannot be saved"),
    );
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
