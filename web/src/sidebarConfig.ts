import type { BridgeCapabilities } from "./bridge";
import { apiErrorMessage } from "./bridgeApi";
import type { BridgeHttpUrl } from "./bridgeApi";
import { fetchWithTimeout } from "./fetchWithTimeout";
import {
  DEFAULT_SIDEBAR_CONFIG,
  parseSidebarConfig,
} from "./sidebarTokens";
import type { SidebarConfig } from "./sidebarTokens";

export type SidebarConfigResponse = {
  config: SidebarConfig;
  source: "config" | "defaults";
  theme?: string;
};

const DEFAULT_SIDEBAR_CONFIG_RESPONSE: SidebarConfigResponse = {
  config: DEFAULT_SIDEBAR_CONFIG,
  source: "defaults",
};

export function supportsSidebarConfig(
  capabilities: BridgeCapabilities | null | undefined,
) {
  return capabilities?.sidebar_config?.version === 1;
}

export async function fetchSidebarConfig(
  httpUrl: BridgeHttpUrl,
): Promise<SidebarConfigResponse> {
  const response = await fetchWithTimeout(httpUrl("/api/sidebar-config"));
  if (response.status === 404) {
    return DEFAULT_SIDEBAR_CONFIG_RESPONSE;
  }
  if (!response.ok) {
    const message = await apiErrorMessage(response);
    throw new Error(message ?? `sidebar config failed: ${response.status}`);
  }

  try {
    return parseSidebarConfigResponse(await response.json());
  } catch {
    return DEFAULT_SIDEBAR_CONFIG_RESPONSE;
  }
}

export function parseSidebarConfigResponse(value: unknown): SidebarConfigResponse {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.source !== "config" && value.source !== "defaults") ||
    !isRecord(value.sidebar)
  ) {
    return DEFAULT_SIDEBAR_CONFIG_RESPONSE;
  }

  return {
    config: parseSidebarConfig(value),
    source: value.source,
    ...(typeof value.theme === "string" ? { theme: value.theme } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
