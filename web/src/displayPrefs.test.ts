import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTENT_INSET_BOTTOM_PX,
  DEFAULT_CONTENT_INSET_TOP_PX,
  DEFAULT_MOBILE_CONTROLS_SCALE_PERCENT,
  DEFAULT_AGENT_FEATURES_IN_TABS,
  DEFAULT_MULTI_HOST_SPACE_SELECTION,
  DEFAULT_PREFIX_MODE_ENABLED,
  MAX_CONTENT_INSET_BOTTOM_PX,
  MAX_CONTENT_INSET_TOP_PX,
  MAX_MOBILE_CONTROLS_SCALE_PERCENT,
  MIN_MOBILE_CONTROLS_SCALE_PERCENT,
  parseContentInsetBottomPx,
  parseContentInsetTopPx,
  parseMobileControlsScalePercent,
  parseAgentFeaturesInTabs,
  parseMultiHostSpaceSelection,
  parsePrefixModeEnabled,
  DEFAULT_HERDR_KEYS_SOURCE,
  MAX_HERDR_KEYS_SOURCE_LENGTH,
  parseHerdrKeysSourcePref,
} from "./displayPrefs";
import { parseHerdrKeysSource } from "./herdrKeys";

describe("display preferences", () => {
  it("parses and clamps content inset values", () => {
    expect(parseContentInsetTopPx(16)).toBe(16);
    expect(parseContentInsetTopPx(16.7)).toBe(17);
    expect(parseContentInsetTopPx(-4)).toBe(DEFAULT_CONTENT_INSET_TOP_PX);
    expect(parseContentInsetTopPx(999)).toBe(MAX_CONTENT_INSET_TOP_PX);

    expect(parseContentInsetBottomPx(24)).toBe(24);
    expect(parseContentInsetBottomPx(24.4)).toBe(24);
    expect(parseContentInsetBottomPx(-1)).toBe(DEFAULT_CONTENT_INSET_BOTTOM_PX);
    expect(parseContentInsetBottomPx(999)).toBe(MAX_CONTENT_INSET_BOTTOM_PX);
  });

  it("falls back for invalid content inset values", () => {
    expect(parseContentInsetTopPx("16")).toBe(DEFAULT_CONTENT_INSET_TOP_PX);
    expect(parseContentInsetBottomPx(Number.NaN)).toBe(DEFAULT_CONTENT_INSET_BOTTOM_PX);
  });

  it("parses and clamps the mobile controls scale", () => {
    expect(parseMobileControlsScalePercent(125)).toBe(125);
    expect(parseMobileControlsScalePercent(124.6)).toBe(125);
    expect(parseMobileControlsScalePercent(50)).toBe(MIN_MOBILE_CONTROLS_SCALE_PERCENT);
    expect(parseMobileControlsScalePercent(200)).toBe(MAX_MOBILE_CONTROLS_SCALE_PERCENT);
  });

  it("falls back for invalid mobile controls scale values", () => {
    expect(parseMobileControlsScalePercent(null)).toBe(DEFAULT_MOBILE_CONTROLS_SCALE_PERCENT);
    expect(parseMobileControlsScalePercent("100")).toBe(DEFAULT_MOBILE_CONTROLS_SCALE_PERCENT);
  });

  it("parses the Tabs agent features preference and defaults it on", () => {
    expect(parseAgentFeaturesInTabs(true)).toBe(true);
    expect(parseAgentFeaturesInTabs(false)).toBe(false);
    expect(parseAgentFeaturesInTabs(undefined)).toBe(DEFAULT_AGENT_FEATURES_IN_TABS);
    expect(parseAgentFeaturesInTabs("false")).toBe(DEFAULT_AGENT_FEATURES_IN_TABS);
    expect(parseAgentFeaturesInTabs(undefined, false)).toBe(false);
  });

  it("parses multi-host Space selection and defaults it on", () => {
    expect(parseMultiHostSpaceSelection(true)).toBe(true);
    expect(parseMultiHostSpaceSelection(false)).toBe(false);
    expect(parseMultiHostSpaceSelection(undefined)).toBe(DEFAULT_MULTI_HOST_SPACE_SELECTION);
    expect(parseMultiHostSpaceSelection("false")).toBe(DEFAULT_MULTI_HOST_SPACE_SELECTION);
    expect(parseMultiHostSpaceSelection(undefined, false)).toBe(false);
  });

  it("keeps a persisted Herdr keys source across reloads", () => {
    const source = 'prefix = "backtick"\nfocus_agent = "prefix+alt+1..9"\n';
    const reloaded = JSON.parse(JSON.stringify({ herdrKeysSource: source })) as {
      herdrKeysSource: unknown;
    };

    expect(parseHerdrKeysSourcePref(reloaded.herdrKeysSource)).toBe(source);
    expect(
      parseHerdrKeysSource(parseHerdrKeysSourcePref(reloaded.herdrKeysSource)).prefix,
    ).toStrictEqual({
      key: "`",
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    });
  });

  it("falls back for unusable Herdr keys sources", () => {
    expect(parseHerdrKeysSourcePref(undefined)).toBe(DEFAULT_HERDR_KEYS_SOURCE);
    expect(parseHerdrKeysSourcePref(42)).toBe(DEFAULT_HERDR_KEYS_SOURCE);
    expect(parseHerdrKeysSourcePref('prefix = "hyper+q"')).toBe(DEFAULT_HERDR_KEYS_SOURCE);
    expect(
      parseHerdrKeysSourcePref('prefix = "backtick"'.padEnd(MAX_HERDR_KEYS_SOURCE_LENGTH + 1, "\n")),
    ).toBe(DEFAULT_HERDR_KEYS_SOURCE);
  });

  it("parses prefix mode enablement and defaults it on", () => {
    expect(parsePrefixModeEnabled(true)).toBe(true);
    expect(parsePrefixModeEnabled(false)).toBe(false);
    expect(parsePrefixModeEnabled(undefined)).toBe(DEFAULT_PREFIX_MODE_ENABLED);
    expect(parsePrefixModeEnabled("false")).toBe(DEFAULT_PREFIX_MODE_ENABLED);
    expect(parsePrefixModeEnabled(undefined, false)).toBe(false);
  });
});
