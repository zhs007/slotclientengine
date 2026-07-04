import { afterEach, beforeEach, vi } from "vitest";

let objectUrlCounter = 0;

beforeEach(() => {
  objectUrlCounter = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    objectUrlCounter += 1;
    return `blob:vitest-uploaded-vni/${objectUrlCounter}`;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});
