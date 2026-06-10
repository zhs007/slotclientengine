import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

interface GenerateSymbolStateTexturesModule {
  parseGenerateSymbolStateTextureArgs(argv: readonly string[]): {
    readonly symbols?: readonly string[];
    readonly inputDir?: string;
    readonly outputDir?: string;
  };
  generateSymbolStateTextures(options: {
    readonly inputDir: string;
    readonly outputDir: string;
    readonly symbols?: readonly string[];
  }): Promise<{
    readonly symbols: readonly string[];
    readonly manifestPath: string;
    readonly files: readonly string[];
  }>;
}

async function loadGenerator(): Promise<GenerateSymbolStateTexturesModule> {
  return (await import(
    new URL("../../scripts/generate-symbol-state-textures.mjs", import.meta.url).href
  )) as GenerateSymbolStateTexturesModule;
}

describe("generate-symbol-state-textures", () => {
  it("parses pnpm-style leading separators and direct node arguments", async () => {
    const generator = await loadGenerator();

    expect(generator.parseGenerateSymbolStateTextureArgs(["--", "--symbols", "S00,S0"]).symbols).toEqual([
      "S00",
      "S0"
    ]);
    expect(generator.parseGenerateSymbolStateTextureArgs(["--symbols=S00,S0"]).symbols).toEqual([
      "S00",
      "S0"
    ]);
  });

  it("generates deterministic spinBlur and disabled PNGs with a stable manifest", async () => {
    const generator = await loadGenerator();
    const tempDir = await mkdtemp(join(tmpdir(), "rendercore-state-textures-"));
    try {
      const inputFile = join(tempDir, "S00.png");
      const width = 3;
      const height = 25;
      await sharp(createVerticalHardEdgeRgba(width, height), {
        raw: {
          width,
          height,
          channels: 4
        }
      })
        .png()
        .toFile(inputFile);

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["S00"]
      });

      const spinBlurFile = join(tempDir, "S00.spinBlur.png");
      const disabledFile = join(tempDir, "S00.disabled.png");
      expect(result.files).toEqual([spinBlurFile, disabledFile, result.manifestPath]);

      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
        readonly version: number;
        readonly states: readonly string[];
        readonly settings: Record<string, unknown>;
        readonly symbols: Record<string, Record<string, string>>;
      };
      expect(JSON.stringify(manifest)).not.toContain("generated");
      expect(manifest).toEqual({
        version: 1,
        states: ["spinBlur", "disabled"],
        settings: {
          spinBlur: {
            kind: "verticalBoxBlur",
            kernelHeight: 21
          },
          disabled: {
            kind: "grayscale",
            brightness: 0.72
          }
        },
        symbols: {
          S00: {
            normal: "./S00.png",
            spinBlur: "./S00.spinBlur.png",
            disabled: "./S00.disabled.png"
          }
        }
      });

      await expectImageSize(spinBlurFile, width, height);
      await expectImageSize(disabledFile, width, height);

      const disabledRaw = await sharp(disabledFile).ensureAlpha().raw().toBuffer();
      expect(Math.abs(disabledRaw[0] - disabledRaw[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(disabledRaw[1] - disabledRaw[2])).toBeLessThanOrEqual(1);

      const sourceRaw = await sharp(inputFile).ensureAlpha().raw().toBuffer();
      const spinBlurRaw = await sharp(spinBlurFile).ensureAlpha().raw().toBuffer();
      expect(Buffer.compare(sourceRaw, spinBlurRaw)).not.toBe(0);
      const mixedRed = spinBlurRaw[(11 * width + 1) * 4];
      expect(mixedRed).toBeGreaterThan(0);
      expect(mixedRed).toBeLessThan(255);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function expectImageSize(filePath: string, width: number, height: number): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  expect(metadata.width).toBe(width);
  expect(metadata.height).toBe(height);
}

function createVerticalHardEdgeRgba(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      buffer[offset] = y < Math.floor(height / 2) ? 255 : 0;
      buffer[offset + 1] = 0;
      buffer[offset + 2] = 0;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}
