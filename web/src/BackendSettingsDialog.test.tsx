/**
 * @vitest-environment jsdom
 */
import { act, type ComponentProps, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendSettingsDialog } from "./BackendSettingsDialog";
import { DEFAULT_TERMINAL_FONT_FAMILY } from "./terminalPrefs";
import { DEFAULT_TERMINAL_THEME_SOURCE } from "./terminalTheme";

const bridgeManager = vi.hoisted(() => ({
  store: {
    version: 2 as const,
    enabledBridgeIds: ["same-origin"],
    lastSelectedBridgeId: "same-origin",
    backends: [],
  },
  storeLoaded: true,
  sameOriginAvailable: true,
  availableRuntimes: [],
  enabledRuntimes: [],
  enabledBridgeIds: ["same-origin"],
  lastSelectedBridgeId: "same-origin",
  getRuntime: vi.fn(),
  setBridgeEnabled: vi.fn(),
  setLastSelectedBridgeId: vi.fn(),
  markBridgeUsed: vi.fn(),
  retryBridgeProbe: vi.fn(),
  addBackend: vi.fn(),
  updateBackend: vi.fn(),
  deleteBackend: vi.fn(),
  probeBackend: vi.fn(),
}));

vi.mock("./bridge", async (importOriginal) => {
  const original = await importOriginal<typeof import("./bridge")>();
  return {
    ...original,
    useBridge: () => bridgeManager,
  };
});

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("BackendSettingsDialog", () => {
  it("exposes a persisted-style screen-reader text control in the Terminal area", async () => {
    const onChange = vi.fn();
    const { container } = await render(<ScreenReaderSettingsHarness onChange={onChange} />);
    await openTerminalSettings(container);
    const group = requiredElement<HTMLElement>(
      container,
      '[role="group"][aria-label="Terminal screen-reader text"]',
    );
    const off = requiredElement<HTMLButtonElement>(group, "button:first-of-type");
    const on = requiredElement<HTMLButtonElement>(group, "button:last-of-type");

    await act(async () => on.click());

    expect({
      changeCalls: onChange.mock.calls,
      pressed: [off.getAttribute("aria-pressed"), on.getAttribute("aria-pressed")],
    }).toStrictEqual({
      changeCalls: [[true]],
      pressed: ["false", "true"],
    });
  });

  it("shows the detected Herdr prefix and imports keybindings from a supported bridge", async () => {
    const onImportHerdrKeys = vi.fn().mockResolvedValue(undefined);
    const { container } = await renderDialog({
      herdrKeysImportAvailable: true,
      herdrKeysPrefixLabel: "`",
      onImportHerdrKeys,
    });
    await openTerminalSettings(container);

    expect(
      requiredElement<HTMLElement>(container, '[aria-label="Detected Herdr prefix"]')
        .textContent,
    ).toBe("Detected prefix: `");
    const importButton = requiredElement<HTMLButtonElement>(
      container,
      'button[aria-label="Import Herdr keybindings from bridge"]',
    );
    await act(async () => {
      importButton.click();
    });

    expect(onImportHerdrKeys.mock.calls).toStrictEqual([[]]);
  });

  it("toggles Herdr keybindings and explains when bridge import is unavailable", async () => {
    const onPrefixModeEnabled = vi.fn();
    const { container } = await renderDialog({ onPrefixModeEnabled });
    await openTerminalSettings(container);

    const toggle = requiredElement<HTMLElement>(
      container,
      '[role="group"][aria-label="Herdr keybindings"]',
    );
    const offButton = Array.from(toggle.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Off",
    );
    if (!offButton) {
      throw new Error("missing Herdr keybindings Off button");
    }
    await act(async () => {
      offButton.click();
    });

    expect({
      toggleCalls: onPrefixModeEnabled.mock.calls,
      importDisabled: requiredElement<HTMLButtonElement>(
        container,
        'button[aria-label="Import Herdr keybindings from bridge"]',
      ).disabled,
      hintPresent: container.textContent?.includes(
        "The selected bridge does not support Herdr keybindings import.",
      ),
    }).toStrictEqual({ toggleCalls: [[false]], importDisabled: true, hintPresent: true });
  });

  it("keeps settings open when Escape discards a font family draft", async () => {
    const { container, onClose } = await renderDialog();
    await openTerminalSettings(container);
    const input = requiredElement<HTMLInputElement>(
      container,
      'input[aria-label="Terminal font family"]',
    );

    await changeText(input, "Alice Mono, monospace");
    await pressEscape(input);

    expect({ closeCalls: onClose.mock.calls, value: input.value }).toStrictEqual({
      closeCalls: [],
      value: DEFAULT_TERMINAL_FONT_FAMILY,
    });
  });

  it("keeps settings open when Escape discards a Ghostty palette draft", async () => {
    const { container, onClose } = await renderDialog();
    await openTerminalSettings(container);
    const textarea = requiredElement<HTMLTextAreaElement>(
      container,
      'textarea[aria-label="Ghostty terminal config or palette"]',
    );

    await changeText(textarea, "palette = 0=#000000");
    await pressEscape(textarea);

    expect({ closeCalls: onClose.mock.calls, value: textarea.value }).toStrictEqual({
      closeCalls: [],
      value: DEFAULT_TERMINAL_THEME_SOURCE,
    });
  });
});

function ScreenReaderSettingsHarness({ onChange }: { onChange: (enabled: boolean) => void }) {
  const [terminalScreenReaderText, setTerminalScreenReaderText] = useState(false);
  const callback = vi.fn();
  return (
    <BackendSettingsDialog
      {...settingsProps(vi.fn(), callback)}
      terminalScreenReaderText={terminalScreenReaderText}
      onTerminalScreenReaderText={(enabled) => {
        onChange(enabled);
        setTerminalScreenReaderText(enabled);
      }}
    />
  );
}

async function renderDialog(
  overrides: Partial<ComponentProps<typeof BackendSettingsDialog>> = {},
) {
  const onClose = vi.fn();
  const callback = vi.fn();
  const { container } = await render(
    <BackendSettingsDialog {...settingsProps(onClose, callback, overrides)} />,
  );

  return { container, onClose };
}

function settingsProps(
  onClose: () => void,
  callback: () => void,
  overrides: Partial<ComponentProps<typeof BackendSettingsDialog>> = {},
) {
  return {
    showMobileTerminalSettings: false,
    notesEnabled: true,
    onNotesEnabled: callback,
    navigationSyncMode: "shared",
    onNavigationSyncMode: callback,
    agentFeaturesInTabs: true,
    onAgentFeaturesInTabs: callback,
    combineMatchingWorkspaceNames: false,
    onCombineMatchingWorkspaceNames: callback,
    multiHostSpaceSelection: true,
    onMultiHostSpaceSelection: callback,
    terminalFontSizePx: 13,
    onTerminalFontSizePx: callback,
    terminalScreenReaderText: false,
    onTerminalScreenReaderText: callback,
    terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
    onTerminalFontFamily: callback,
    terminalThemeSource: DEFAULT_TERMINAL_THEME_SOURCE,
    onTerminalThemeSource: callback,
    ghosttyConfigImportAvailable: false,
    onImportGhosttyConfig: vi.fn(),
    prefixModeEnabled: true,
    onPrefixModeEnabled: callback,
    herdrKeysImportAvailable: false,
    herdrKeysPrefixLabel: "Ctrl+B",
    onImportHerdrKeys: vi.fn(),
    terminalInputTransport: "json",
    onTerminalInputTransport: callback,
    terminalInputBatchDelayMs: 0,
    onTerminalInputBatchDelayMs: callback,
    terminalOutputCoalesceMs: 0,
    onTerminalOutputCoalesceMs: callback,
    contentInsetTopPx: 0,
    onContentInsetTopPx: callback,
    contentInsetBottomPx: 0,
    onContentInsetBottomPx: callback,
    mobileControlsScalePercent: 100,
    onMobileControlsScalePercent: callback,
    mobileTerminalTapTarget: "command-input",
    onMobileTerminalTapTarget: callback,
    mobileLongPressBehavior: "off",
    onMobileLongPressBehavior: callback,
    mobileTouchSelectionEndpointTimeoutMs: 1500,
    onMobileTouchSelectionEndpointTimeoutMs: callback,
    mobileCommandExpandingInput: true,
    onMobileCommandExpandingInput: callback,
    mobileCommandEnterNewline: false,
    onMobileCommandEnterNewline: callback,
    showMobileKeyboardHideRefit: false,
    mobileKeyboardHideRefit: true,
    onMobileKeyboardHideRefit: callback,
    onClose,
    ...overrides,
  } satisfies ComponentProps<typeof BackendSettingsDialog>;
}

async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });

  return { container };
}

async function openTerminalSettings(container: HTMLElement) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent === "Terminal",
  );
  if (!tab) {
    throw new Error("missing Terminal settings tab");
  }
  await act(async () => {
    tab.click();
  });
}

async function changeText(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLInputElement
    ? window.HTMLInputElement.prototype
    : window.HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("missing text control value setter");
  }
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEscape(input: HTMLInputElement | HTMLTextAreaElement) {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

function requiredElement<ElementType extends Element>(container: HTMLElement, selector: string) {
  const element = container.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}
