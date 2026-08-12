# Bundled fonts

`MesloLGSNerdFontMono-{Regular,Bold,Italic,BoldItalic}.woff2`

Converted from the TTFs shipped by [Nerd Fonts](https://github.com/ryanoasis/nerd-fonts)
with `fonttools ttLib.woff2 compress`. Declared in `web/src/styles.css` and named as the
first entry of `DEFAULT_TERMINAL_FONT_FAMILY` in `web/src/terminalPrefs.ts`.

They exist so the powerline separators and icons herdr draws into the terminal resolve on
devices that cannot install fonts — iPadOS in particular, where an imported ghostty
`font-family` would otherwise fall back to a system mono with nothing in the Private Use
Area, rendering tofu.

Each face is ~1.2 MB and Vite fingerprints it into `dist/assets/`. Browsers fetch a face
only when text actually uses that weight and style, so a typical session pulls Regular and
Bold. If the total ever matters, `pyftsubset` over Latin plus the Nerd Font PUA ranges cuts
it by roughly 80%.

## Licensing

Meslo LG is a Menlo derivative distributed under the Apache License 2.0; the Nerd Fonts
patching toolchain is MIT. Both permit redistribution with attribution.

**Confirm the current upstream license text before distributing this app publicly** — the
license files are not vendored here, and neither claim above was verified against upstream
when these files were added.
