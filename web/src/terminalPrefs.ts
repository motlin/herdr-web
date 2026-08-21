export const DEFAULT_TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';
export const DEFAULT_TERMINAL_FONT_SIZE_PX = 13;
export const MIN_TERMINAL_FONT_SIZE_PX = 10;
export const MAX_TERMINAL_FONT_SIZE_PX = 24;
export const MAX_TERMINAL_FONT_FAMILY_LENGTH = 512;

export function parseTerminalFontFamily(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_TERMINAL_FONT_FAMILY;
  }
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TERMINAL_FONT_FAMILY_LENGTH
    ? trimmed
    : DEFAULT_TERMINAL_FONT_FAMILY;
}

export function parseTerminalFontSizePx(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_SIZE_PX;
  }
  return Math.min(
    MAX_TERMINAL_FONT_SIZE_PX,
    Math.max(MIN_TERMINAL_FONT_SIZE_PX, Math.round(value)),
  );
}
