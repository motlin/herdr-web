/**
 * @vitest-environment jsdom
 */
import type { ITheme } from "ghostty-web";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhosttyRenderer } from "./terminalRenderer";

const ghosttyMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  getModeError: null as Error | null,
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
      if (ghosttyMocks.getModeError) {
        throw ghosttyMocks.getModeError;
      }
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
  vi.restoreAllMocks();
  ghosttyMocks.focus.mockClear();
  ghosttyMocks.getModeError = null;
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
    renderer.dispose();

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

  it("forwards Ctrl-click off a URL and suppresses its context menu", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1000);
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
    renderer.dispose();

    expect({
      contextMenuDefaultPrevented: contextMenu.defaultPrevented,
      inputCalls: ghosttyMocks.input.mock.calls,
      pressDefaultPrevented: press.defaultPrevented,
    }).toStrictEqual({
      contextMenuDefaultPrevented: true,
      inputCalls: [["\x1b[<16;1;1M", true]],
      pressDefaultPrevented: true,
    });
  });

  it("opens a Meta-clicked URL without forwarding terminal mouse reports", async () => {
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1000);
    ghosttyMocks.modes.add(1006);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
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
      clientX: 4,
      clientY: 8,
      metaKey: true,
    });
    const click = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
      metaKey: true,
    });

    container.dispatchEvent(press);
    container.dispatchEvent(release);
    container.dispatchEvent(click);
    renderer.dispose();

    expect({
      clickDefaultPrevented: click.defaultPrevented,
      inputCalls: ghosttyMocks.input.mock.calls,
      openCalls: open.mock.calls,
    }).toStrictEqual({
      clickDefaultPrevented: true,
      inputCalls: [],
      openCalls: [["https://example.com/", "_blank", "noopener,noreferrer"]],
    });
  });

  it("suppresses an auxiliary click consumed by a forwarded press", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1000);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 1,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const release = new MouseEvent("mouseup", {
      bubbles: true,
      button: 1,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const auxiliaryClick = new MouseEvent("auxclick", {
      bubbles: true,
      button: 1,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });

    container.dispatchEvent(press);
    window.dispatchEvent(release);
    container.dispatchEvent(auxiliaryClick);
    renderer.dispose();

    expect({
      auxiliaryClickDefaultPrevented: auxiliaryClick.defaultPrevented,
      inputCalls: ghosttyMocks.input.mock.calls,
    }).toStrictEqual({
      auxiliaryClickDefaultPrevented: true,
      inputCalls: [
        ["\x1b[<1;1;1M", true],
        ["\x1b[<1;1;1m", true],
      ],
    });
  });

  it("removes window mouse listeners when disposed during a drag", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1002);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 4,
        clientY: 8,
      }),
    );
    ghosttyMocks.input.mockClear();

    renderer.dispose();
    const dispatchAfterDispose = () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 13, clientY: 8 }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 13, clientY: 8 }),
      );
    };

    expect(dispatchAfterDispose).not.toThrow();
    expect(ghosttyMocks.input.mock.calls).toStrictEqual([]);
  });

  it("ignores a mouse press when reading terminal modes throws after disposal", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    ghosttyMocks.getModeError = new Error("Terminal has been disposed");
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });

    expect(() => container.dispatchEvent(press)).not.toThrow();
    expect({
      inputCalls: ghosttyMocks.input.mock.calls,
      pressDefaultPrevented: press.defaultPrevented,
    }).toStrictEqual({
      inputCalls: [],
      pressDefaultPrevented: false,
    });
  });

  it("forwards only a legacy press as raw bytes under X10 tracking", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    ghosttyMocks.modes.add(9);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    await renderer.mount(container);
    const inputBytes = vi.fn();
    renderer.onInputBytes(inputBytes);
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
      clientX: 4,
      clientY: 8,
    });

    container.dispatchEvent(press);
    window.dispatchEvent(release);
    renderer.dispose();

    expect({
      inputByteCalls: inputBytes.mock.calls,
      inputCalls: ghosttyMocks.input.mock.calls,
      mouseTracking: ghosttyMocks.mouseTracking,
      pressDefaultPrevented: press.defaultPrevented,
      releaseDefaultPrevented: release.defaultPrevented,
    }).toStrictEqual({
      inputByteCalls: [[new Uint8Array([27, 91, 77, 32, 33, 33])]],
      inputCalls: [],
      mouseTracking: false,
      pressDefaultPrevented: true,
      releaseDefaultPrevented: true,
    });
  });

  it("suppresses compatibility mouse input after touch only when tracking is off", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    renderer.setMobileTouchSelection("copy", null, 5000);
    await renderer.mount(container);
    const touch = { clientX: 4, clientY: 8 } as Touch;
    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", { value: [touch] });
    const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(touchEnd, "changedTouches", { value: [touch] });
    const syntheticPress = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });

    container.dispatchEvent(touchStart);
    container.dispatchEvent(touchEnd);
    container.dispatchEvent(syntheticPress);
    renderer.dispose();

    expect({
      focusCalls: ghosttyMocks.focus.mock.calls,
      inputCalls: ghosttyMocks.input.mock.calls,
      syntheticPressDefaultPrevented: syntheticPress.defaultPrevented,
    }).toStrictEqual({
      focusCalls: [],
      inputCalls: [],
      syntheticPressDefaultPrevented: true,
    });
  });

  it("forwards a plain tap as a press and release while tracking", async () => {
    ghosttyMocks.lineText = " ".repeat(80);
    ghosttyMocks.mouseTracking = true;
    ghosttyMocks.modes.add(1000);
    ghosttyMocks.modes.add(1006);
    const container = document.createElement("div");
    const renderer = new GhosttyRenderer();
    renderer.setMobileTouchSelection("copy", null, 5000);
    await renderer.mount(container);
    const touch = { clientX: 4, clientY: 8 } as Touch;
    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", { value: [touch] });
    const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(touchEnd, "changedTouches", { value: [touch] });
    const syntheticPress = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const syntheticRelease = new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const syntheticClick = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 4,
      clientY: 8,
    });
    const applicationEvents: string[] = [];
    container.addEventListener("click", () => applicationEvents.push("click"));

    container.dispatchEvent(touchStart);
    container.dispatchEvent(touchEnd);
    container.dispatchEvent(syntheticPress);
    window.dispatchEvent(syntheticRelease);
    container.dispatchEvent(syntheticClick);
    renderer.dispose();

    expect({
      applicationEvents,
      clickDefaultPrevented: syntheticClick.defaultPrevented,
      inputCalls: ghosttyMocks.input.mock.calls,
      pressDefaultPrevented: syntheticPress.defaultPrevented,
      releaseDefaultPrevented: syntheticRelease.defaultPrevented,
    }).toStrictEqual({
      applicationEvents: [],
      clickDefaultPrevented: true,
      inputCalls: [
        ["\x1b[<0;1;1M", true],
        ["\x1b[<0;1;1m", true],
      ],
      pressDefaultPrevented: true,
      releaseDefaultPrevented: true,
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
