import { afterEach, vi } from "vitest";

let objectUrlId = 0;
if (typeof URL.createObjectURL !== "function")
  URL.createObjectURL = () => `blob:test-${objectUrlId++}`;
if (typeof URL.revokeObjectURL !== "function")
  URL.revokeObjectURL = () => undefined;
if (typeof CSS.escape !== "function")
  CSS.escape = (value: string) => value.replace(/[^A-Za-z0-9_-]/gu, "\\$&");

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
