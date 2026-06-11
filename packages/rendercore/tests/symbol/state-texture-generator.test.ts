import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

interface GeneratorModule {
  readonly generateSymbolStateTextures: (options: {
    readonly inputDir: string;
    readonly outputDir: string;
    readonly symbols: readonly string[];
    readonly composites?: string;
  }) => Promise<{
    readonly symbols: readonly string[];
    readonly manifestPath: string;
    readonly files: readonly string[];
  }>;
}

async function loadGeneratorModule(): Promise<GeneratorModule> {
  const moduleUrl = new URL("../../scripts/generate-symbol-state-textures.mjs", import.meta.url).href;
  return (await import(moduleUrl)) as GeneratorModule;
}

describe("generate-symbol-state-textures script", () => {
  it("generates single and composite symbol state textures with layered manifest normals", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(join(tmpdir(), "rendercore-symbol-generator-"));
    try {
      await writePng(join(tempDir, "S00.png"), 4, 4, "#ff0000");
      await writePng(join(tempDir, "SC.png"), 4, 4, "#000000");
      await writePng(join(tempDir, "SC-0.png"), 4, 4, "#111111");
      await writePng(join(tempDir, "SC-1.png"), 4, 4, "#222222");
      await writePng(join(tempDir, "SC-2.png"), 4, 4, "#333333");
      const compositesPath = join(tempDir, "symbol-composites.json");
      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"]
            }
          }
        }),
        "utf8"
      );

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["S00", "SC"],
        composites: compositesPath
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(result.symbols).toEqual(["S00", "SC"]);
      expect(manifest.symbols.S00.normal).toBe("./S00.png");
      expect(manifest.symbols.SC.normal).toEqual({
        kind: "layered",
        layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"]
      });
      await expect(stat(join(tempDir, "SC.spinBlur.png"))).resolves.toMatchObject({ size: expect.any(Number) });
      await expect(stat(join(tempDir, "SC.disabled.png"))).resolves.toMatchObject({ size: expect.any(Number) });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when composite layer dimensions differ", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(join(tmpdir(), "rendercore-symbol-generator-"));
    try {
      await writePng(join(tempDir, "SC-0.png"), 4, 4, "#111111");
      await writePng(join(tempDir, "SC-1.png"), 5, 4, "#222222");
      const compositesPath = join(tempDir, "symbol-composites.json");
      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: ["./SC-0.png", "./SC-1.png"]
            }
          }
        }),
        "utf8"
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["SC"],
          composites: compositesPath
        })
      ).rejects.toThrow(/identical dimensions/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function writePng(filePath: string, width: number, height: number, color: string): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color
    }
  })
    .png()
    .toFile(filePath);
}
