import { afterEach } from "vitest";

let objectUrlId = 0;
URL.createObjectURL = () => `blob:test-${objectUrlId++}`;
URL.revokeObjectURL = () => undefined;

afterEach(() => {
  document.body.replaceChildren();
});
