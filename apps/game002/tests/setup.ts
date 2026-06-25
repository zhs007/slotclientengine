import { afterEach } from "vitest";

afterEach(() => {
  globalThis.document?.body?.replaceChildren();
});
