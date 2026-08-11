/**
 * @vitest-environment jsdom
 */
import type { ITheme } from "ghostty-web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhosttyRenderer } from "./terminalRenderer";

const ghosttyMocks = vi.hoisted(() => ({
  lineText: "https://example.com ",
  mouseTracking: false,
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
    buffer = {
      active: {
        getLine: () => ({
          length: 80,
          getCell: (column: number) => ({
            getCodepoint: () => (ghosttyMocks.lineText[column] ?? " ").codePointAt(0) ?? 32,
            getHyperlinkId: () => 0,
            getWidth: () => 1,
          }),
        }),
      },
    };
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    renderer = {
      getCanvas: () => document.createElement("canvas"),
      getMetrics: () => ({ height: 16, width: 9 }),
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
      return ghosttyMocks.mouseTracking;
    }
    getScrollbackLength() {
      return 0;
    }
    getViewportY() {
      return 0;
    }
    loadAddon() {}
    open() {}
  },
}));

beforeEach(() => {
  ghosttyMocks.lineText = "https://example.com ";
  ghosttyMocks.mouseTracking = false;
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

  it("suppresses the release matching a modifier URL press outside the URL", async () => {
    ghosttyMocks.mouseTracking = true;
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const applicationEvents: string[] = [];
    container.addEventListener("mousedown", () => applicationEvents.push("mousedown"));
    container.addEventListener("mouseup", () => applicationEvents.push("mouseup"));
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
      metaKey: true,
    });
    const release = new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 175,
      clientY: 8,
      metaKey: true,
    });

    container.dispatchEvent(press);
    container.dispatchEvent(release);

    expect({
      applicationEvents,
      pressDefaultPrevented: press.defaultPrevented,
      releaseDefaultPrevented: release.defaultPrevented,
    }).toStrictEqual({
      applicationEvents: [],
      pressDefaultPrevented: true,
      releaseDefaultPrevented: true,
    });
  });

  it("opens a Ctrl-clicked URL from the context menu path without a click event", async () => {
    ghosttyMocks.mouseTracking = true;
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const applicationEvents: string[] = [];
    container.addEventListener("mousedown", () => applicationEvents.push("mousedown"));
    container.addEventListener("contextmenu", () => applicationEvents.push("contextmenu"));
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
      ctrlKey: true,
    });
    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 4,
      clientY: 8,
      ctrlKey: true,
    });

    container.dispatchEvent(press);
    container.dispatchEvent(contextMenu);

    expect({
      applicationEvents,
      contextMenuDefaultPrevented: contextMenu.defaultPrevented,
      openCalls: open.mock.calls,
      pressDefaultPrevented: press.defaultPrevented,
    }).toStrictEqual({
      applicationEvents: [],
      contextMenuDefaultPrevented: true,
      openCalls: [["https://example.com/", "_blank", "noopener,noreferrer"]],
      pressDefaultPrevented: true,
    });
  });
});
