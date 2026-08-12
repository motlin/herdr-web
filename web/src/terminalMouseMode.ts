export type TerminalMouseMode = {
  tracking: "off" | "x10" | "normal" | "button" | "any";
  encoding: "legacy" | "utf8" | "urxvt" | "sgr" | "sgr-pixels";
};

export function terminalMouseMode(
  getMode: (modeNumber: number) => boolean,
): TerminalMouseMode {
  const tracksX10 = getMode(9);
  const tracksNormally = getMode(1000);
  const tracksButtons = getMode(1002);
  const tracksAnyMotion = getMode(1003);
  const encodesUtf8 = getMode(1005);
  const encodesSgr = getMode(1006);
  const encodesUrxvt = getMode(1015);
  const encodesSgrPixels = getMode(1016);

  let tracking: TerminalMouseMode["tracking"] = "off";
  if (tracksAnyMotion) {
    tracking = "any";
  } else if (tracksButtons) {
    tracking = "button";
  } else if (tracksNormally) {
    tracking = "normal";
  } else if (tracksX10) {
    tracking = "x10";
  }

  let encoding: TerminalMouseMode["encoding"] = "legacy";
  if (encodesSgrPixels) {
    encoding = "sgr-pixels";
  } else if (encodesSgr) {
    encoding = "sgr";
  } else if (encodesUrxvt) {
    encoding = "urxvt";
  } else if (encodesUtf8) {
    encoding = "utf8";
  }

  return { tracking, encoding };
}
