import { describe, expect, it, vi } from "vitest";
import { ObjectUrlRegistry } from "../src/io/object-url-registry.js";

describe("ObjectUrlRegistry", () => {
  it("revokes individual and remaining owned URLs exactly once", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const registry = new ObjectUrlRegistry();
    const first = registry.create(new Blob(["a"]));
    registry.create(new Blob(["b"]));
    expect(registry.size).toBe(2);
    registry.revoke(first);
    registry.revoke(first);
    expect(registry.size).toBe(1);
    registry.destroy();
    registry.destroy();
    expect(registry.size).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(() => registry.create(new Blob())).toThrow(/已销毁/);
    revoke.mockRestore();
  });
});
