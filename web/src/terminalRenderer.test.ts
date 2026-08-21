/**
 * @vitest-environment jsdom
 */
import type { ITheme } from "ghostty-web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhosttyRenderer } from "./terminalRenderer";

const ghosttyMocks = vi.hoisted(() => ({
  render: vi.fn(),
  setTheme: vi.fn(),
  terminals: [] as object[],
  wasmTerminal: {},
}));

vi.mock("ghostty-web", () => ({
  init: vi.fn(),
  FitAddon: class {
    fit() {}
    dispose() {}
  },
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    renderer = {
      getCanvas: () => document.createElement("canvas"),
      render: ghosttyMocks.render,
      setTheme: ghosttyMocks.setTheme,
    };
    viewportY = 0;
    wasmTerm = ghosttyMocks.wasmTerminal;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      ghosttyMocks.terminals.push(this);
    }

    attachCustomKeyEventHandler() {}
    attachCustomWheelEventHandler() {}
    clearSelection() {}
    dispose() {}
    hasMouseTracking() {
      return false;
    }
    loadAddon() {}
    open() {}
  },
}));

beforeEach(() => {
  ghosttyMocks.render.mockClear();
  ghosttyMocks.setTheme.mockClear();
  ghosttyMocks.terminals.length = 0;
});

describe("GhosttyRenderer", () => {
  it("applies theme changes to a mounted terminal and repaints it", async () => {
    const renderer = new GhosttyRenderer();
    await renderer.mount(document.createElement("div"));
    const theme: ITheme = {
      background: "#000000",
      foreground: "#ffffff",
    };

    renderer.setTheme(theme);

    expect({
      renderCalls: ghosttyMocks.render.mock.calls,
      setThemeCalls: ghosttyMocks.setTheme.mock.calls,
    }).toStrictEqual({
      renderCalls: [[ghosttyMocks.wasmTerminal, true, 0, ghosttyMocks.terminals[0]]],
      setThemeCalls: [[theme]],
    });
  });
});
