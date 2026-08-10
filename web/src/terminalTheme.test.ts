import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_THEME_SOURCE,
  parseTerminalThemeSource,
  terminalThemeFromGhosttySource,
} from "./terminalTheme";

describe("terminal theme preferences", () => {
  it("imports Ghostty colors and the first sixteen palette entries", () => {
    expect(
      terminalThemeFromGhosttySource(`
        font-family = Example Mono
        background = 010203
        foreground = "#f1f2f3"
        cursor-color = #111213
        cursor-text = #212223
        selection-background = #313233
        selection-foreground = #414243
        palette = 0=#515253
        palette = 8=616263
        palette = 16=#717273
      `),
    ).toStrictEqual({
      background: "#010203",
      foreground: "#f1f2f3",
      cursor: "#111213",
      cursorAccent: "#212223",
      selectionBackground: "#313233",
      selectionForeground: "#414243",
      black: "#515253",
      brightBlack: "#616263",
    });
  });

  it("falls back when stored theme text has no supported valid colors", () => {
    expect(parseTerminalThemeSource(null)).toBe(DEFAULT_TERMINAL_THEME_SOURCE);
    expect(parseTerminalThemeSource("theme = Example")).toBe(DEFAULT_TERMINAL_THEME_SOURCE);
    expect(parseTerminalThemeSource("background = invalid")).toBe(
      DEFAULT_TERMINAL_THEME_SOURCE,
    );
  });
});
