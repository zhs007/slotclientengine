import { describe, expect, it } from "vitest";
import {
  GAME003_MINECART2_RESOURCE_ID_PREFIX,
  GAME003_RUNTIME_MODULE_RESOURCE_ID,
  createGame003LoadingResources,
  readGame003Minecart2PackageFiles,
  readGame003RuntimeModule,
} from "../src/loading-resources.js";
import { craveSceneLayoutPhysicalResourceUrls as minecart2ResourceUrls } from "../src/generated/minecart2-layout-resources.generated.js";

describe("game003 loading resources", () => {
  it("loads only the mapped minecart2 package and runtime module", () => {
    const resources = createGame003LoadingResources("2");
    const packageResources = resources.slice(0, -1);

    expect(resources.at(-1)?.id).toBe(GAME003_RUNTIME_MODULE_RESOURCE_ID);
    expect(resources.at(-1)?.load).toBeTypeOf("function");
    expect(packageResources).toHaveLength(
      Object.keys(minecart2ResourceUrls).length,
    );
    expect(
      packageResources.every(
        (resource) =>
          resource.id.startsWith(GAME003_MINECART2_RESOURCE_ID_PREFIX) &&
          resource.kind === "binary",
      ),
    ).toBe(true);
    expect(() => createGame003LoadingResources("1" as never)).toThrow(
      /only supports skin "2"/,
    );
  });

  it("reconstructs every physical package file and fails on gaps", () => {
    const packageResources = createGame003LoadingResources().slice(0, -1);
    const loaded = new Map<string, unknown>(
      packageResources.map((resource) => [
        resource.id,
        new Uint8Array([1, 2, 3]).buffer,
      ]),
    );

    expect([...readGame003Minecart2PackageFiles(loaded).keys()].sort()).toEqual(
      Object.keys(minecart2ResourceUrls).sort(),
    );
    expect(() => readGame003Minecart2PackageFiles(new Map())).toThrow(
      /was not loaded/,
    );
  });

  it("validates the dynamically loaded runtime module", () => {
    const runtime = {
      prepareGame003At99: async () => ({ liveSession: { disconnect() {} } }),
      enterGame003: async () => ({ destroy() {} }),
    };
    expect(
      readGame003RuntimeModule(
        new Map([[GAME003_RUNTIME_MODULE_RESOURCE_ID, runtime]]),
      ),
    ).toBe(runtime);
    expect(() => readGame003RuntimeModule(new Map())).toThrow(/not loaded/);
    expect(() =>
      readGame003RuntimeModule(
        new Map([[GAME003_RUNTIME_MODULE_RESOURCE_ID, {}]]),
      ),
    ).toThrow(/required exports/);
  });

  it("does not expose live credentials in resource URLs", () => {
    const serialized = JSON.stringify(createGame003LoadingResources());
    expect(serialized).not.toMatch(/token|cookie|serverUrl|gameserv/i);
  });
});
