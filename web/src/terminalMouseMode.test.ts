import { describe, expect, it, vi } from "vitest";
import { terminalMouseMode } from "./terminalMouseMode";

function getModeFor(...enabledModes: number[]): (modeNumber: number) => boolean {
  const modes = new Set(enabledModes);
  return (modeNumber) => modes.has(modeNumber);
}

describe("terminal mouse mode", () => {
  it("returns off with legacy encoding when all modes are disabled", () => {
    expect(terminalMouseMode(getModeFor())).toStrictEqual({
      tracking: "off",
      encoding: "legacy",
    });
  });

  it.each([
    [9, "x10"],
    [1000, "normal"],
    [1002, "button"],
    [1003, "any"],
  ] as const)("maps tracking mode %i to %s", (modeNumber, tracking) => {
    expect(terminalMouseMode(getModeFor(modeNumber))).toStrictEqual({
      tracking,
      encoding: "legacy",
    });
  });

  it("uses the highest active tracking mode", () => {
    expect(terminalMouseMode(getModeFor(9, 1000, 1002, 1003))).toStrictEqual({
      tracking: "any",
      encoding: "legacy",
    });
  });

  it.each([
    [[1006], "sgr"],
    [[1006, 1016], "sgr-pixels"],
    [[1006, 1015], "sgr"],
    [[1015], "urxvt"],
    [[1005], "utf8"],
  ] as const)("uses encoding precedence for %j", (enabledModes, encoding) => {
    expect(terminalMouseMode(getModeFor(...enabledModes))).toStrictEqual({
      tracking: "off",
      encoding,
    });
  });

  it("queries the exact ghostty mode contract", () => {
    const getMode = vi.fn(() => false);

    terminalMouseMode(getMode);

    expect(getMode.mock.calls).toStrictEqual([
      [9],
      [1000],
      [1002],
      [1003],
      [1005],
      [1006],
      [1015],
      [1016],
    ]);
  });
});
