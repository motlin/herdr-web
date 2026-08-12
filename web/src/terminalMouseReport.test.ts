import { describe, expect, it } from "vitest";
import type { TerminalMouseMode } from "./terminalMouseMode";
import {
  encodeTerminalMouseReport,
  LEGACY_MOUSE_COORDINATE_LIMIT,
  terminalMouseButtonFromDomButton,
  terminalMouseWheelFromDelta,
  UTF8_MOUSE_COORDINATE_LIMIT,
} from "./terminalMouseReport";
import type { TerminalMouseEvent } from "./terminalMouseReport";

const baseEvent: TerminalMouseEvent = {
  kind: "press",
  button: "left",
  wheel: null,
  col: 1,
  row: 2,
  pixelX: 10,
  pixelY: 20,
  shift: false,
  alt: false,
  ctrl: false,
};

function encode(
  event: Partial<TerminalMouseEvent>,
  mode: Partial<TerminalMouseMode> = {},
): string | null {
  return encodeTerminalMouseReport(
    { ...baseEvent, ...event },
    { tracking: "any", encoding: "sgr", ...mode },
  );
}

describe("terminal mouse report", () => {
  it("encodes SGR press, release, drag, move, and wheel reports", () => {
    expect({
      press: encode({ kind: "press", button: "middle" }),
      release: encode({ kind: "release", button: "right" }),
      drag: encode({ kind: "drag", button: "right" }),
      move: encode({ kind: "move", button: null }),
      wheelUp: encode({ kind: "wheel", button: null, wheel: "up" }),
      wheelDown: encode({ kind: "wheel", button: null, wheel: "down" }),
      wheelLeft: encode({ kind: "wheel", button: null, wheel: "left" }),
      wheelRight: encode({ kind: "wheel", button: null, wheel: "right" }),
    }).toStrictEqual({
      press: "\x1b[<1;2;3M",
      release: "\x1b[<2;2;3m",
      drag: "\x1b[<34;2;3M",
      move: "\x1b[<35;2;3M",
      wheelUp: "\x1b[<64;2;3M",
      wheelDown: "\x1b[<65;2;3M",
      wheelLeft: "\x1b[<66;2;3M",
      wheelRight: "\x1b[<67;2;3M",
    });
  });

  it("adds all modifier bits to an SGR left press", () => {
    expect(encode({ shift: true, alt: true, ctrl: true })).toBe(
      "\x1b[<28;2;3M",
    );
  });

  it("encodes legacy press and collapsed release reports", () => {
    expect({
      press: encode(
        { col: 0, row: 0 },
        { tracking: "normal", encoding: "legacy" },
      ),
      release: encode(
        { kind: "release", col: 0, row: 0 },
        { tracking: "normal", encoding: "legacy" },
      ),
    }).toStrictEqual({
      press: "\x1b[M\x20\x21\x21",
      release: "\x1b[M\x23\x21\x21",
    });
  });

  it("encodes legacy coordinates through their protocol limit", () => {
    expect({
      limit: LEGACY_MOUSE_COORDINATE_LIMIT,
      lastEncodable: encode(
        { col: 222, row: 222 },
        { encoding: "legacy" },
      ),
      firstSuppressed: encode(
        { col: 223, row: 222 },
        { encoding: "legacy" },
      ),
      rowSuppressed: encode(
        { col: 222, row: 223 },
        { encoding: "legacy" },
      ),
    }).toStrictEqual({
      limit: 223,
      lastEncodable: "\x1b[M\x20\xff\xff",
      firstSuppressed: null,
      rowSuppressed: null,
    });
  });

  it("encodes UTF-8 coordinates through their protocol limit", () => {
    const col200 = encode({ col: 200 }, { encoding: "utf8" });
    const col2015 = encode({ col: 2015 }, { encoding: "utf8" });

    expect({
      limit: UTF8_MOUSE_COORDINATE_LIMIT,
      col200,
      col200CoordinateCodePoint: col200?.codePointAt(4),
      col2015,
      col2015CoordinateCodePoint: col2015?.codePointAt(4),
      col2016: encode({ col: 2016 }, { encoding: "utf8" }),
    }).toStrictEqual({
      limit: 2015,
      col200: "\x1b[M \u00e9#",
      col200CoordinateCodePoint: 233,
      col2015: "\x1b[M \u0800#",
      col2015CoordinateCodePoint: 2048,
      col2016: null,
    });
  });

  it("encodes urxvt drag reports", () => {
    expect(
      encode(
        { kind: "drag", button: "middle", alt: true },
        { encoding: "urxvt" },
      ),
    ).toBe("\x1b[73;2;3M");
  });

  it("uses pixel coordinates for SGR pixel reports", () => {
    expect(encode({}, { encoding: "sgr-pixels" })).toBe(
      "\x1b[<0;11;21M",
    );
  });

  it("drops modifier bits under X10 tracking", () => {
    expect(
      encode(
        { shift: true, alt: true, ctrl: true },
        { tracking: "x10" },
      ),
    ).toBe("\x1b[<0;2;3M");
  });

  const events = {
    press: { kind: "press", button: "left" },
    release: { kind: "release", button: "left" },
    drag: { kind: "drag", button: "left" },
    move: { kind: "move", button: null },
    wheel: { kind: "wheel", button: null, wheel: "down" },
  } satisfies Record<string, Partial<TerminalMouseEvent>>;

  it("gates all reports when tracking is off", () => {
    expect({
      press: encode(events.press, { tracking: "off" }),
      release: encode(events.release, { tracking: "off" }),
      drag: encode(events.drag, { tracking: "off" }),
      move: encode(events.move, { tracking: "off" }),
      wheel: encode(events.wheel, { tracking: "off" }),
    }).toStrictEqual({
      press: null,
      release: null,
      drag: null,
      move: null,
      wheel: null,
    });
  });

  it("gates X10 reports to presses", () => {
    expect({
      press: encode(events.press, { tracking: "x10" }),
      release: encode(events.release, { tracking: "x10" }),
      drag: encode(events.drag, { tracking: "x10" }),
      move: encode(events.move, { tracking: "x10" }),
      wheel: encode(events.wheel, { tracking: "x10" }),
    }).toStrictEqual({
      press: "\x1b[<0;2;3M",
      release: null,
      drag: null,
      move: null,
      wheel: null,
    });
  });

  it("gates normal reports to presses, releases, and wheels", () => {
    expect({
      press: encode(events.press, { tracking: "normal" }),
      release: encode(events.release, { tracking: "normal" }),
      drag: encode(events.drag, { tracking: "normal" }),
      move: encode(events.move, { tracking: "normal" }),
      wheel: encode(events.wheel, { tracking: "normal" }),
    }).toStrictEqual({
      press: "\x1b[<0;2;3M",
      release: "\x1b[<0;2;3m",
      drag: null,
      move: null,
      wheel: "\x1b[<65;2;3M",
    });
  });

  it("adds drag reports under button tracking", () => {
    expect({
      press: encode(events.press, { tracking: "button" }),
      release: encode(events.release, { tracking: "button" }),
      drag: encode(events.drag, { tracking: "button" }),
      move: encode(events.move, { tracking: "button" }),
      wheel: encode(events.wheel, { tracking: "button" }),
    }).toStrictEqual({
      press: "\x1b[<0;2;3M",
      release: "\x1b[<0;2;3m",
      drag: "\x1b[<32;2;3M",
      move: null,
      wheel: "\x1b[<65;2;3M",
    });
  });

  it("adds bare motion reports under any tracking", () => {
    expect({
      press: encode(events.press, { tracking: "any" }),
      release: encode(events.release, { tracking: "any" }),
      drag: encode(events.drag, { tracking: "any" }),
      move: encode(events.move, { tracking: "any" }),
      wheel: encode(events.wheel, { tracking: "any" }),
    }).toStrictEqual({
      press: "\x1b[<0;2;3M",
      release: "\x1b[<0;2;3m",
      drag: "\x1b[<32;2;3M",
      move: "\x1b[<35;2;3M",
      wheel: "\x1b[<65;2;3M",
    });
  });

  it("rejects descriptors that do not match their report kind", () => {
    expect({
      pressWithoutButton: encode({ kind: "press", button: null }),
      releaseWithoutButton: encode({ kind: "release", button: null }),
      dragWithoutButton: encode({ kind: "drag", button: null }),
      moveWithButton: encode({ kind: "move", button: "left" }),
      wheelWithoutDirection: encode({
        kind: "wheel",
        button: null,
        wheel: null,
      }),
    }).toStrictEqual({
      pressWithoutButton: null,
      releaseWithoutButton: null,
      dragWithoutButton: null,
      moveWithButton: null,
      wheelWithoutDirection: null,
    });
  });
});

describe("terminal mouse DOM helpers", () => {
  it("maps DOM buttons to terminal buttons", () => {
    expect([0, 1, 2, 3, 4].map(terminalMouseButtonFromDomButton)).toStrictEqual([
      "left",
      "middle",
      "right",
      null,
      null,
    ]);
  });

  it("maps the dominant wheel delta axis to a terminal direction", () => {
    expect({
      up: terminalMouseWheelFromDelta(1, -10),
      down: terminalMouseWheelFromDelta(-1, 10),
      left: terminalMouseWheelFromDelta(-10, 1),
      right: terminalMouseWheelFromDelta(10, -1),
      verticalTie: terminalMouseWheelFromDelta(10, -10),
      still: terminalMouseWheelFromDelta(0, 0),
    }).toStrictEqual({
      up: "up",
      down: "down",
      left: "left",
      right: "right",
      verticalTie: "up",
      still: null,
    });
  });
});
