import { describe, expect, it } from "vitest";
import {
  GAME002_CRAVE_RESOURCE_ID_PREFIX,
  GAME002_RUNTIME_MODULE_RESOURCE_ID,
  createGame002LoadingResources,
  deduplicateGame002LoadingResourceUrls,
  readGame002RuntimeModule,
} from "../src/loading-resources.js";

describe("game002 package loading resources", () => {
  it("loads only the mapped Crave package", () => {
    const resources = createGame002LoadingResources();
    const ids = resources.map((resource) => resource.id);
    const urls = resources
      .map((resource) => resource.url)
      .filter((url): url is string => typeof url === "string");

    expect(ids.at(-1)).toBe(GAME002_RUNTIME_MODULE_RESOURCE_ID);
    expect(resources.at(-1)?.load).toBeTypeOf("function");
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(
      ids.filter((id) => id.startsWith(GAME002_CRAVE_RESOURCE_ID_PREFIX))
        .length,
    ).toBeGreaterThan(120);
    expect(ids.some((id) => id.startsWith("game002-reel-effect"))).toBe(false);
    expect(JSON.stringify(resources)).not.toMatch(
      /token|cookie|serverUrl|gameserv/i,
    );
  });

  it("validates the runtime module exports", () => {
    const runtime = {
      finalizeGame002At99: async () => ({ readiness: { destroy() {} } }),
      enterGame002: async () => ({ async destroy() {} }),
    };
    expect(
      readGame002RuntimeModule(
        new Map([[GAME002_RUNTIME_MODULE_RESOURCE_ID, runtime]]),
      ),
    ).toBe(runtime);
    expect(() => readGame002RuntimeModule(new Map())).toThrow(/not loaded/);
    expect(() =>
      readGame002RuntimeModule(
        new Map([[GAME002_RUNTIME_MODULE_RESOURCE_ID, {}]]),
      ),
    ).toThrow(/required exports/);
  });

  it("deduplicates URLs and rejects duplicate ids or missing URLs", () => {
    expect(
      deduplicateGame002LoadingResourceUrls([
        { id: "first", url: "/assets/shared.png" },
        { id: "second", url: "/assets/shared.png" },
      ]),
    ).toEqual([{ id: "first", url: "/assets/shared.png" }]);
    expect(() =>
      deduplicateGame002LoadingResourceUrls([
        { id: "duplicate", url: "/first.png" },
        { id: "duplicate", url: "/second.png" },
      ]),
    ).toThrow('Duplicate game002 loading resource id "duplicate".');
    expect(() =>
      deduplicateGame002LoadingResourceUrls([{ id: "missing" }]),
    ).toThrow('Missing game002 loading resource URL for "missing".');
  });
});
