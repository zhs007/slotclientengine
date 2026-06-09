import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(__dirname, "..");

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return listFiles(fullPath);
    }
    return [fullPath];
  });
}

describe("runtime boundary", () => {
  it("does not copy or import the editor project json at runtime", () => {
    const runtimeFiles = listFiles(path.join(appRoot, "src"));
    expect(runtimeFiles.some((file) => file.endsWith("project.json"))).toBe(
      false,
    );

    const source = runtimeFiles
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toContain("assets/editor2/bg/project.json");
    expect(source).not.toContain("project.json");
    expect(source).not.toContain("createAnimationEffect");
    expect(source).not.toContain("buildProjectTimeline");
    expect(source).not.toContain("CodeAnimationProject");
    expect(source).not.toContain("playProjectJson");
  });

  it("has no demo1-style runtime interpreter modules", () => {
    expect(() => statSync(path.join(appRoot, "src/runtime"))).toThrow();
  });
});
