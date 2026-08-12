import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSidebarConfig,
  parseSidebarConfigResponse,
  supportsSidebarConfig,
} from "./sidebarConfig";
import { DEFAULT_SIDEBAR_CONFIG } from "./sidebarTokens";

const bridgeHttpUrl = (path: string) => `https://bridge.example.com${path}`;

describe("sidebar config bridge helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strictly checks the bridge sidebar config capability", () => {
    expect(supportsSidebarConfig({ commands: [], sidebar_config: { version: 1 } })).toBe(true);
    expect(supportsSidebarConfig({ commands: [] })).toBe(false);
    expect(
      supportsSidebarConfig({
        commands: [],
        sidebar_config: { version: 2 },
      }),
    ).toBe(false);
    expect(supportsSidebarConfig(null)).toBe(false);
  });

  it("parses a sidebar config response", () => {
    expect(
      parseSidebarConfigResponse({
        version: 1,
        source: "config",
        path: "/test/config.toml",
        theme: "one-dark",
        diagnostics: [],
        sidebar: {
          spaces: {
            rows: [[{ token: "workspace", fg: "#aabbcc", bold: true }]],
            row_gap: 2,
          },
          agents: {
            rows: [[{ token: "agent", dim: true }]],
            rows_by_agent: {},
            row_gap: 3,
          },
        },
      }),
    ).toStrictEqual({
      config: {
        spaces: {
          rows: [
            [
              {
                kind: "builtin",
                name: "workspace",
                style: { fg: "#aabbcc", bold: true },
              },
            ],
          ],
          rowGap: 2,
        },
        agents: {
          rows: [
            [
              {
                kind: "builtin",
                name: "agent",
                style: { dim: true },
              },
            ],
          ],
          rowsByAgent: {},
          rowGap: 3,
        },
      },
      source: "config",
      theme: "one-dark",
    });
  });

  it("fetches the bridge sidebar config", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 1,
          source: "defaults",
          sidebar: {
            spaces: { rows: [[{ token: "state_text" }]], row_gap: 0 },
            agents: {
              rows: [[{ token: "state_text" }]],
              rows_by_agent: {},
              row_gap: 0,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSidebarConfig(bridgeHttpUrl)).resolves.toStrictEqual({
      config: {
        spaces: {
          rows: [[{ kind: "builtin", name: "state_text", style: {} }]],
          rowGap: 0,
        },
        agents: {
          rows: [[{ kind: "builtin", name: "state_text", style: {} }]],
          rowsByAgent: {},
          rowGap: 0,
        },
      },
      source: "defaults",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/api/sidebar-config",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("uses defaults when an older bridge returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    await expect(fetchSidebarConfig(bridgeHttpUrl)).resolves.toStrictEqual({
      config: DEFAULT_SIDEBAR_CONFIG,
      source: "defaults",
    });
  });

  it("throws when the bridge returns a server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "sidebar unavailable" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchSidebarConfig(bridgeHttpUrl)).rejects.toThrow("sidebar unavailable");
  });

  it("uses defaults when a successful response body is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchSidebarConfig(bridgeHttpUrl)).resolves.toStrictEqual({
      config: DEFAULT_SIDEBAR_CONFIG,
      source: "defaults",
    });
  });
});
