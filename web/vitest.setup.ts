import { JSDOM } from "jsdom";

// Node 26 defines `localStorage` and `sessionStorage` as own globals that stay
// undefined unless the runtime is started with --localstorage-file. Those own
// properties shadow the Storage objects jsdom installs, so DOM tests see
// `undefined` instead of working storage. Install jsdom's own implementation
// over the shadowing globals.
function restoreStorage(name: "localStorage" | "sessionStorage"): void {
  if (typeof window === "undefined") {
    return;
  }

  const existing = Reflect.get(globalThis, name) as Storage | undefined;
  if (existing) {
    return;
  }

  const storage = new JSDOM("", { url: "http://localhost:3000/" }).window[name];
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
}

restoreStorage("localStorage");
restoreStorage("sessionStorage");
