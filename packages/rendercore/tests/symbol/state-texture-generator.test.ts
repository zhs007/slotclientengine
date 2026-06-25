import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

interface GeneratorModule {
  readonly parseGenerateSymbolStateTextureArgs: (argv: readonly string[]) => {
    readonly inputDir?: string;
    readonly outputDir?: string;
    readonly symbols?: readonly string[];
    readonly composites?: string;
  };
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
  const moduleUrl = new URL(
    "../../scripts/generate-symbol-state-textures.mjs",
    import.meta.url,
  ).href;
  return (await import(moduleUrl)) as GeneratorModule;
}

describe("generate-symbol-state-textures script", () => {
  it("generates single and composite symbol state textures with layered manifest normals", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
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
              layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"],
            },
          },
        }),
        "utf8",
      );

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["S00", "SC"],
        composites: compositesPath,
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(result.symbols).toEqual(["S00", "SC"]);
      expect(manifest.symbols.S00.normal).toBe("./S00.png");
      expect(manifest.symbols.SC.normal).toEqual({
        kind: "layered",
        layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"],
      });
      await expect(
        stat(join(tempDir, "SC.spinBlur.png")),
      ).resolves.toMatchObject({ size: expect.any(Number) });
      await expect(
        stat(join(tempDir, "SC.disabled.png")),
      ).resolves.toMatchObject({ size: expect.any(Number) });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("defaults composite lookup to the current input directory", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "SC.png"), 4, 4, "#ff0000");

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["SC"],
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(manifest.symbols.SC.normal).toBe("./SC.png");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when an explicit composites file is missing", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "S00.png"), 4, 4, "#ff0000");

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["S00"],
          composites: join(tempDir, "missing-composites.json"),
        }),
      ).rejects.toThrow(/missing-composites/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("generates a single-image manifest from input-dir style arguments", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "WL.png"), 4, 4, "#ff0000");
      await writePng(join(tempDir, "H1.png"), 4, 4, "#00ff00");

      const args = generator.parseGenerateSymbolStateTextureArgs([
        "--input-dir",
        tempDir,
        "--output-dir",
        tempDir,
        "--symbols",
        "WL,H1",
      ]);
      if (!args.inputDir || !args.outputDir || !args.symbols) {
        throw new Error(
          "Expected input-dir style arguments to parse completely.",
        );
      }
      const result = await generator.generateSymbolStateTextures({
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        symbols: args.symbols,
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(result.symbols).toEqual(["WL", "H1"]);
      expect(manifest.symbols.WL.normal).toBe("./WL.png");
      expect(manifest.symbols.H1.normal).toBe("./H1.png");
      expect(manifest.symbols.WL.spinBlur).toBe("./WL.spinBlur.png");
      expect(manifest.symbols.H1.disabled).toBe("./H1.disabled.png");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves explicit composite layer keyframes in the generated manifest", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "SC-0.png"), 4, 4, "#111111");
      await writePng(join(tempDir, "SC-1-0.png"), 4, 4, "#222222");
      await writePng(join(tempDir, "SC-1-1.png"), 4, 4, "#333333");
      await writePng(join(tempDir, "SC-1-2.png"), 4, 4, "#444444");
      await writePng(join(tempDir, "SC-1-3.png"), 4, 4, "#555555");
      await writePng(join(tempDir, "SC-1-4.png"), 4, 4, "#666666");
      await writePng(join(tempDir, "SC-2.png"), 4, 4, "#777777");
      const compositesPath = join(tempDir, "symbol-composites.json");
      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: [
                "./SC-0.png",
                {
                  index: 1,
                  texture: "./SC-1-0.png",
                  keyframes: [
                    "./SC-1-0.png",
                    "./SC-1-1.png",
                    "./SC-1-2.png",
                    "./SC-1-3.png",
                    "./SC-1-4.png",
                  ],
                },
                "./SC-2.png",
              ],
            },
          },
        }),
        "utf8",
      );

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["SC"],
        composites: compositesPath,
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(manifest.symbols.SC.normal.layers).toEqual([
        "./SC-0.png",
        {
          index: 1,
          texture: "./SC-1-0.png",
          keyframes: [
            "./SC-1-0.png",
            "./SC-1-1.png",
            "./SC-1-2.png",
            "./SC-1-3.png",
            "./SC-1-4.png",
          ],
        },
        "./SC-2.png",
      ]);
      await expect(
        stat(join(tempDir, "SC.spinBlur.png")),
      ).resolves.toMatchObject({ size: expect.any(Number) });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when composite layer dimensions differ", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
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
              layers: ["./SC-0.png", "./SC-1.png"],
            },
          },
        }),
        "utf8",
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["SC"],
          composites: compositesPath,
        }),
      ).rejects.toThrow(/identical dimensions/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when explicit keyframe contracts are invalid", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "SC-0.png"), 4, 4, "#111111");
      await writePng(join(tempDir, "SC-1-0.png"), 4, 4, "#222222");
      await writePng(join(tempDir, "SC-1-1.png"), 5, 4, "#333333");
      await writePng(join(tempDir, "SC-2.png"), 4, 4, "#777777");
      const compositesPath = join(tempDir, "symbol-composites.json");
      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: [
                "./SC-0.png",
                {
                  index: 1,
                  texture: "./SC-1-0.png",
                  keyframes: ["./SC-1-0.png", "./SC-1-1.png"],
                },
                "./SC-2.png",
              ],
            },
          },
        }),
        "utf8",
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["SC"],
          composites: compositesPath,
        }),
      ).rejects.toThrow(/keyframe textures/);

      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: [
                "./SC-0.png",
                {
                  index: 1,
                  texture: "./SC-1-0.png",
                  keyframes: ["./SC-1-2.png", "./SC-1-0.png"],
                },
                "./SC-2.png",
              ],
            },
          },
        }),
        "utf8",
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["SC"],
          composites: compositesPath,
        }),
      ).rejects.toThrow(/start with the layer texture/);

      await writeFile(
        compositesPath,
        JSON.stringify({
          version: 1,
          symbols: {
            SC: {
              layers: [
                "./SC-0.png",
                {
                  index: 1,
                  texture: "./SC-1-0.png",
                  keyframes: ["./SC-1-0.png", "./SC-1-2.png"],
                },
                "./SC-2.png",
              ],
            },
          },
        }),
        "utf8",
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["SC"],
          composites: compositesPath,
        }),
      ).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function writePng(
  filePath: string,
  width: number,
  height: number,
  color: string,
): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toFile(filePath);
}
