import { afterEach, vi } from "vitest";

let objectUrlId = 0;
if (typeof URL.createObjectURL !== "function")
  URL.createObjectURL = () => `blob:test-${objectUrlId++}`;
if (typeof URL.revokeObjectURL !== "function")
  URL.revokeObjectURL = () => undefined;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
