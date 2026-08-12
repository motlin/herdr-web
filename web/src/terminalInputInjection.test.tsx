/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useInjectedTerminalInput,
  useTerminalInputInjectionSource,
} from "./terminalInputInjection";

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.innerHTML = "";
});

function createTestRoot(): Root {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  return root;
}

async function render(root: Root, node: ReactNode): Promise<void> {
  await act(async () => {
    root.render(node);
  });
}

function TerminalStub({
  injectInput,
  enqueueTerminalInput,
}: {
  injectInput: { token: number; data: string } | null;
  enqueueTerminalInput: (parts: string[]) => void;
}) {
  useInjectedTerminalInput(injectInput, enqueueTerminalInput);
  return null;
}

function AppStub({
  selectedPaneId,
  terminalKey,
  enqueueTerminalInput,
  injectRef,
}: {
  selectedPaneId: string;
  terminalKey: string;
  enqueueTerminalInput: (parts: string[]) => void;
  injectRef: RefObject<((paneId: string, data: string) => void) | null>;
}) {
  const { injection, injectTerminalInput } = useTerminalInputInjectionSource();
  injectRef.current = injectTerminalInput;
  return (
    <TerminalStub
      key={terminalKey}
      injectInput={injection?.paneId === selectedPaneId ? injection : null}
      enqueueTerminalInput={enqueueTerminalInput}
    />
  );
}

describe("useInjectedTerminalInput", () => {
  it("injects the literal exactly once across a pane switch away and back", async () => {
    const enqueueTerminalInput = vi.fn();
    const injection = { token: 1, data: "`" };
    const root = createTestRoot();

    await render(
      root,
      <TerminalStub injectInput={injection} enqueueTerminalInput={enqueueTerminalInput} />,
    );
    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]]]);

    await render(
      root,
      <TerminalStub injectInput={null} enqueueTerminalInput={enqueueTerminalInput} />,
    );
    await render(
      root,
      <TerminalStub injectInput={injection} enqueueTerminalInput={enqueueTerminalInput} />,
    );

    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]]]);
  });

  it("does not re-inject when the enqueue callback identity changes", async () => {
    const firstEnqueue = vi.fn();
    const secondEnqueue = vi.fn();
    const injection = { token: 4, data: "`" };
    const root = createTestRoot();

    await render(
      root,
      <TerminalStub injectInput={injection} enqueueTerminalInput={firstEnqueue} />,
    );
    await render(
      root,
      <TerminalStub injectInput={injection} enqueueTerminalInput={secondEnqueue} />,
    );

    expect(firstEnqueue.mock.calls).toEqual([[["`"]]]);
    expect(secondEnqueue.mock.calls).toEqual([]);
  });

  it("injects again when a new token arrives", async () => {
    const enqueueTerminalInput = vi.fn();
    const root = createTestRoot();

    await render(
      root,
      <TerminalStub
        injectInput={{ token: 1, data: "`" }}
        enqueueTerminalInput={enqueueTerminalInput}
      />,
    );
    await render(
      root,
      <TerminalStub
        injectInput={{ token: 2, data: "`" }}
        enqueueTerminalInput={enqueueTerminalInput}
      />,
    );

    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]], [["`"]]]);
  });
});

describe("useTerminalInputInjectionSource", () => {
  it("injects the literal exactly once across a terminal remount and a pane switch", async () => {
    const enqueueTerminalInput = vi.fn();
    const injectRef: RefObject<((paneId: string, data: string) => void) | null> = {
      current: null,
    };
    const root = createTestRoot();

    await render(
      root,
      <AppStub
        selectedPaneId="%1"
        terminalKey="first"
        enqueueTerminalInput={enqueueTerminalInput}
        injectRef={injectRef}
      />,
    );
    await act(async () => {
      injectRef.current?.("%1", "`");
    });
    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]]]);

    await render(
      root,
      <AppStub
        selectedPaneId="%1"
        terminalKey="second"
        enqueueTerminalInput={enqueueTerminalInput}
        injectRef={injectRef}
      />,
    );
    await render(
      root,
      <AppStub
        selectedPaneId="%2"
        terminalKey="second"
        enqueueTerminalInput={enqueueTerminalInput}
        injectRef={injectRef}
      />,
    );
    await render(
      root,
      <AppStub
        selectedPaneId="%1"
        terminalKey="second"
        enqueueTerminalInput={enqueueTerminalInput}
        injectRef={injectRef}
      />,
    );

    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]]]);
  });

  it("injects each new literal after the previous one is consumed", async () => {
    const enqueueTerminalInput = vi.fn();
    const injectRef: RefObject<((paneId: string, data: string) => void) | null> = {
      current: null,
    };
    const root = createTestRoot();

    await render(
      root,
      <AppStub
        selectedPaneId="%1"
        terminalKey="first"
        enqueueTerminalInput={enqueueTerminalInput}
        injectRef={injectRef}
      />,
    );
    await act(async () => {
      injectRef.current?.("%1", "`");
    });
    await act(async () => {
      injectRef.current?.("%1", "`");
    });

    expect(enqueueTerminalInput.mock.calls).toEqual([[["`"]], [["`"]]]);
  });
});
