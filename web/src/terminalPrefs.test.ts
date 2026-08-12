import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE_PX,
  MAX_TERMINAL_FONT_SIZE_PX,
  MIN_TERMINAL_FONT_SIZE_PX,
  parseTerminalFontFamily,
  parseTerminalFontSizePx,
  withBundledNerdFont,
} from "./terminalPrefs";

describe("terminal preferences", () => {
  it("parses a CSS terminal font family stack", () => {
    expect(parseTerminalFontFamily('  "JetBrainsMono Nerd Font", monospace  ')).toBe(
      '"JetBrainsMono Nerd Font", monospace',
    );
    expect(parseTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(parseTerminalFontFamily("   ")).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(parseTerminalFontFamily("a".repeat(513))).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });

  it("leads the default stack with the bundled Nerd Font so glyphs render without a local install", () => {
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toMatch(/^"MesloLGS Nerd Font Mono",/);
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toMatch(/monospace$/);
  });

  it("appends the bundled Nerd Font to an imported stack that omits it", () => {
    expect(withBundledNerdFont('"MesloLGS Nerd Font Mono", monospace')).toBe(
      '"MesloLGS Nerd Font Mono", monospace',
    );
    expect(withBundledNerdFont("MesloLGS Nerd Font Mono")).toBe("MesloLGS Nerd Font Mono");
    expect(withBundledNerdFont('"Fira Code", monospace')).toBe(
      '"Fira Code", monospace, "MesloLGS Nerd Font Mono"',
    );
  });

  it("parses and clamps the terminal font size", () => {
    expect(parseTerminalFontSizePx(13)).toBe(13);
    expect(parseTerminalFontSizePx(16.7)).toBe(17);
    expect(parseTerminalFontSizePx(4)).toBe(MIN_TERMINAL_FONT_SIZE_PX);
    expect(parseTerminalFontSizePx(999)).toBe(MAX_TERMINAL_FONT_SIZE_PX);
  });

  it("falls back for invalid terminal font sizes", () => {
    expect(parseTerminalFontSizePx(null)).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
    expect(parseTerminalFontSizePx("13")).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
    expect(parseTerminalFontSizePx(Number.NaN)).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
  });
});
