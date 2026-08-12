/**
 * @vitest-environment jsdom
 */
import type { ITheme } from "ghostty-web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhosttyRenderer } from "./terminalRenderer";

const ghosttyMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  input: vi.fn(),
  lineText: "https://example.com ",
  modes: new Set<number>(),
  mouseTracking: false,
  render: vi.fn(),
  setTheme: vi.fn(),
  terminals: [] as object[],
  wasmTerminal: {},
  wheelHandler: null as ((event: WheelEvent) => boolean) | null,
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
    canvas = document.createElement("canvas");
    renderer = {
      getCanvas: () => this.canvas,
      getMetrics: () => ({ height: 16, width: 9 }),
      render: ghosttyMocks.render,
      setTheme: ghosttyMocks.setTheme,
    };
    viewportY = 0;
    wasmTerm = ghosttyMocks.wasmTerminal;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.canvas.getBoundingClientRect = () =>
        ({
          bottom: 384,
          height: 384,
          left: 0,
          right: 720,
          top: 0,
          width: 720,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      ghosttyMocks.terminals.push(this);
    }

    attachCustomKeyEventHandler() {}
    attachCustomWheelEventHandler(handler: (event: WheelEvent) => boolean) {
      ghosttyMocks.wheelHandler = handler;
    }
    clearSelection() {}
    dispose() {}
    focus() {
      ghosttyMocks.focus();
    }
    getMode(modeNumber: number) {
      return ghosttyMocks.modes.has(modeNumber);
    }
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
    input(data: string, wasUserInput: boolean) {
      ghosttyMocks.input(data, wasUserInput);
    }
  },
}));

beforeEach(() => {
  ghosttyMocks.focus.mockClear();
  ghosttyMocks.input.mockClear();
  ghosttyMocks.lineText = "https://example.com ";
  ghosttyMocks.modes.clear();
  ghosttyMocks.mouseTracking = false;
  ghosttyMocks.render.mockClear();
  ghosttyMocks.setTheme.mockClear();
  ghosttyMocks.terminals.length = 0;
  ghosttyMocks.wheelHandler = null;
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

  it("reports button-motion only while a tracked mouse button is held", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1002);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const bareMove = new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 4,
      clientY: 8,
    });
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const drag = new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: 13,
      clientY: 8,
    });

    container.dispatchEvent(bareMove);
    container.dispatchEvent(press);
    window.dispatchEvent(drag);
    renderer.dispose();

    expect(ghosttyMocks.input.mock.calls).toStrictEqual([
      ["\x1b[<0;1;1M", true],
      ["\x1b[<32;2;1M", true],
    ]);
  });

  it("deduplicates any-motion reports within a terminal cell", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1003);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const firstMove = new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 4,
      clientY: 8,
    });
    const sameCellMove = new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 8,
      clientY: 9,
    });
    const nextCellMove = new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 13,
      clientY: 8,
    });

    container.dispatchEvent(firstMove);
    container.dispatchEvent(sameCellMove);
    container.dispatchEvent(nextCellMove);

    expect(ghosttyMocks.input.mock.calls).toStrictEqual([
      ["\x1b[<35;1;1M", true],
      ["\x1b[<35;2;1M", true],
    ]);
  });

  it("releases a tracked mouse button at the clamped edge outside the terminal", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1002);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const release = new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 10_000,
      clientY: 8,
    });

    container.dispatchEvent(press);
    window.dispatchEvent(release);

    expect({
      inputCalls: ghosttyMocks.input.mock.calls,
      pressDefaultPrevented: press.defaultPrevented,
      releaseDefaultPrevented: release.defaultPrevented,
    }).toStrictEqual({
      inputCalls: [
        ["\x1b[<0;1;1M", true],
        ["\x1b[<0;80;1m", true],
      ],
      pressDefaultPrevented: true,
      releaseDefaultPrevented: true,
    });
  });

  it("emits vertical wheel reports instead of scrolling during mouse tracking", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1000);
    ghosttyMocks.modes.add(1006);
    const renderer = new GhosttyRenderer();
    const onScroll = vi.fn();
    renderer.onScroll(onScroll);
    await renderer.mount(document.createElement("div"));

    const upHandled = ghosttyMocks.wheelHandler?.(
      new WheelEvent("wheel", { deltaY: -16 }),
    );
    const downHandled = ghosttyMocks.wheelHandler?.(
      new WheelEvent("wheel", { deltaY: 16 }),
    );

    expect({
      downHandled,
      inputCalls: ghosttyMocks.input.mock.calls,
      scrollCalls: onScroll.mock.calls,
      upHandled,
    }).toStrictEqual({
      downHandled: true,
      inputCalls: [
        ["\x1b[<64;1;1M", true],
        ["\x1b[<65;1;1M", true],
      ],
      scrollCalls: [],
      upHandled: true,
    });
  });

  it("uses local scrollback for Shift-wheel during mouse tracking", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1002);
    ghosttyMocks.modes.add(1006);
    const renderer = new GhosttyRenderer();
    const onScroll = vi.fn();
    renderer.onScroll(onScroll);
    await renderer.mount(document.createElement("div"));

    const handled = ghosttyMocks.wheelHandler?.(
      new WheelEvent("wheel", { deltaY: 16, shiftKey: true }),
    );

    expect({
      handled,
      inputCalls: ghosttyMocks.input.mock.calls,
      scrollCalls: onScroll.mock.calls,
    }).toStrictEqual({
      handled: true,
      inputCalls: [],
      scrollCalls: [[1]],
    });
  });

  it("uses local scrollback for wheel events under X10 tracking", async () => {
    ghosttyMocks.modes.add(9);
    const renderer = new GhosttyRenderer();
    const onScroll = vi.fn();
    renderer.onScroll(onScroll);
    await renderer.mount(document.createElement("div"));

    const handled = ghosttyMocks.wheelHandler?.(
      new WheelEvent("wheel", { deltaY: -16 }),
    );

    expect({
      handled,
      inputCalls: ghosttyMocks.input.mock.calls,
      scrollCalls: onScroll.mock.calls,
    }).toStrictEqual({
      handled: true,
      inputCalls: [],
      scrollCalls: [[-1]],
    });
  });
});
