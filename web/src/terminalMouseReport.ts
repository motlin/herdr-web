import type { TerminalMouseMode } from "./terminalMouseMode";

export const LEGACY_MOUSE_COORDINATE_LIMIT = 223;
export const UTF8_MOUSE_COORDINATE_LIMIT = 2015;

export type TerminalMouseButton = "left" | "middle" | "right";
export type TerminalMouseWheel = "up" | "down" | "left" | "right";

export type TerminalMouseEvent = {
  kind: "press" | "release" | "drag" | "move" | "wheel";
  button: TerminalMouseButton | null;
  wheel: TerminalMouseWheel | null;
  col: number;
  row: number;
  pixelX: number;
  pixelY: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
};

const buttonBits: Record<TerminalMouseButton, number> = {
  left: 0,
  middle: 1,
  right: 2,
};

const wheelBits: Record<TerminalMouseWheel, number> = {
  up: 0,
  down: 1,
  left: 2,
  right: 3,
};

function trackingAllows(
  kind: TerminalMouseEvent["kind"],
  tracking: TerminalMouseMode["tracking"],
): boolean {
  if (tracking === "off") {
    return false;
  }
  if (tracking === "x10") {
    return kind === "press";
  }
  if (tracking === "normal") {
    return kind === "press" || kind === "release" || kind === "wheel";
  }
  if (tracking === "button") {
    return kind !== "move";
  }
  return true;
}

function descriptorBits(
  event: TerminalMouseEvent,
  encoding: TerminalMouseMode["encoding"],
): number | null {
  if (event.kind === "wheel") {
    return event.button === null && event.wheel !== null
      ? 64 + wheelBits[event.wheel]
      : null;
  }

  if (event.wheel !== null) {
    return null;
  }

  if (event.kind === "move") {
    return event.button === null ? 35 : null;
  }

  if (event.button === null) {
    return null;
  }

  if (
    event.kind === "release" &&
    encoding !== "sgr" &&
    encoding !== "sgr-pixels"
  ) {
    return 3;
  }

  const bits = buttonBits[event.button];
  return event.kind === "drag" ? bits + 32 : bits;
}

function modifierBits(event: TerminalMouseEvent): number {
  return (event.shift ? 4 : 0) + (event.alt ? 8 : 0) + (event.ctrl ? 16 : 0);
}

export function encodeTerminalMouseReport(
  event: TerminalMouseEvent,
  mode: TerminalMouseMode,
): string | null {
  if (!trackingAllows(event.kind, mode.tracking)) {
    return null;
  }

  const reportBits = descriptorBits(event, mode.encoding);
  if (reportBits === null) {
    return null;
  }

  const bits = reportBits + (mode.tracking === "x10" ? 0 : modifierBits(event));

  if (mode.encoding === "legacy") {
    if (
      event.col >= LEGACY_MOUSE_COORDINATE_LIMIT ||
      event.row >= LEGACY_MOUSE_COORDINATE_LIMIT
    ) {
      return null;
    }
    return `\x1b[M${String.fromCharCode(
      32 + bits,
      32 + event.col + 1,
      32 + event.row + 1,
    )}`;
  }

  if (mode.encoding === "utf8") {
    if (
      event.col > UTF8_MOUSE_COORDINATE_LIMIT ||
      event.row > UTF8_MOUSE_COORDINATE_LIMIT
    ) {
      return null;
    }
    return `\x1b[M${String.fromCharCode(
      32 + bits,
      32 + event.col + 1,
      32 + event.row + 1,
    )}`;
  }

  if (mode.encoding === "urxvt") {
    return `\x1b[${32 + bits};${event.col + 1};${event.row + 1}M`;
  }

  const column = mode.encoding === "sgr-pixels" ? event.pixelX + 1 : event.col + 1;
  const row = mode.encoding === "sgr-pixels" ? event.pixelY + 1 : event.row + 1;
  const finalCharacter = event.kind === "release" ? "m" : "M";
  return `\x1b[<${bits};${column};${row}${finalCharacter}`;
}

export function terminalMouseButtonFromDomButton(
  button: number,
): TerminalMouseButton | null {
  if (button === 0) {
    return "left";
  }
  if (button === 1) {
    return "middle";
  }
  if (button === 2) {
    return "right";
  }
  return null;
}

export function terminalMouseWheelFromDelta(
  deltaX: number,
  deltaY: number,
): TerminalMouseWheel | null {
  if (deltaX === 0 && deltaY === 0) {
    return null;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX < 0 ? "left" : "right";
  }
  return deltaY < 0 ? "up" : "down";
}
