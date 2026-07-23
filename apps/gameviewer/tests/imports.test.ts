import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectSceneLayoutPackageInput, parseServerGameAuthoringSummary } =
  vi.hoisted(() => ({
    inspectSceneLayoutPackageInput: vi.fn(),
    parseServerGameAuthoringSummary: vi.fn(),
  }));

vi.mock(
  "@slotclientengine/gameframeworks/scene-layout-template",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@slotclientengine/gameframeworks/scene-layout-template")
    >()),
    inspectSceneLayoutPackageInput,
    parseServerGameAuthoringSummary,
  }),
);

import {
  importLayoutFile,
  importServerAuthoringFile,
} from "../src/io/imports.js";

describe("gameviewer file imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectSceneLayoutPackageInput.mockResolvedValue({
      sha256: "a".repeat(64),
      id: "layout",
      entryCount: 1,
      totalBytes: 3,
      modes: [],
      symbolPackages: [],
      popups: [],
    });
    parseServerGameAuthoringSummary.mockReturnValue({
      gameName: "sample",
      gamecode: "code",
      parameters: [],
      betMethods: [],
    });
  });

  it("accepts only ZIP layout files and delegates strict inspection", async () => {
    await expect(
      importLayoutFile(new File(["bad"], "layout.json")),
    ).rejects.toThrow(/\.zip/);
    const imported = await importLayoutFile(
      new File([new Uint8Array([1, 2, 3])], "layout.ZIP"),
    );
    expect(imported.summary.id).toBe("layout");
    expect(imported.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(inspectSceneLayoutPackageInput).toHaveBeenCalledOnce();
  });

  it("parses UTF-8 JSON and reports extension and syntax failures", async () => {
    await expect(
      importServerAuthoringFile(new File(["{}"], "server.txt")),
    ).rejects.toThrow(/\.json/);
    await expect(
      importServerAuthoringFile(new File(["{"], "server.json")),
    ).rejects.toThrow(/JSON 无效/);

    const imported = await importServerAuthoringFile(
      new File(['{"game":"sample"}'], "server.JSON"),
    );
    expect(imported.summary.gamecode).toBe("code");
    expect(imported.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(parseServerGameAuthoringSummary).toHaveBeenCalledWith({
      game: "sample",
    });
  });
});
