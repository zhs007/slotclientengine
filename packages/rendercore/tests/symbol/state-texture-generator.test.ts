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
    readonly scale?: number;
  };
  readonly generateSymbolStateTextures: (options: {
    readonly inputDir: string;
    readonly outputDir: string;
    readonly symbols: readonly string[];
    readonly composites?: string;
    readonly scale?: number;
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
      expect(manifest.symbols.S00.scale).toBe(1);
      expect(manifest.symbols.SC.normal).toEqual({
        kind: "layered",
        layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"],
      });
      expect(manifest.symbols.SC.scale).toBe(1);
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
        "--scale",
        "0.8",
      ]);
      if (!args.inputDir || !args.outputDir || !args.symbols || !args.scale) {
        throw new Error(
          "Expected input-dir style arguments to parse completely.",
        );
      }
      const result = await generator.generateSymbolStateTextures({
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        symbols: args.symbols,
        scale: args.scale,
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(result.symbols).toEqual(["WL", "H1"]);
      expect(manifest.symbols.WL.normal).toBe("./WL.png");
      expect(manifest.symbols.H1.normal).toBe("./H1.png");
      expect(manifest.symbols.WL.spinBlur).toBe("./WL.spinBlur.png");
      expect(manifest.symbols.H1.disabled).toBe("./H1.disabled.png");
      expect(manifest.symbols.WL.scale).toBe(0.8);
      expect(manifest.symbols.H1.scale).toBe(0.8);
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
      expect(manifest.symbols.SC.scale).toBe(1);
      await expect(
        stat(join(tempDir, "SC.spinBlur.png")),
      ).resolves.toMatchObject({ size: expect.any(Number) });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves manifest animation specs while regenerating state textures", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "L1.png"), 4, 4, "#ff0000");
      await writePng(join(tempDir, "H1.png"), 4, 4, "#00ff00");
      const manifestPath = join(tempDir, "symbol-state-textures.manifest.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            version: 1,
            states: ["spinBlur", "disabled"],
            settings: {
              spinBlur: { kind: "verticalBoxBlur", kernelHeight: 21 },
              disabled: { kind: "grayscale", brightness: 0.72 },
              additionalStateDefinitions: [
                { id: "winStart", phase: "once", playback: "once" },
              ],
            },
            symbols: {
              L1: {
                scale: 1,
                renderPriority: 2,
                animations: {
                  appear: {
                    kind: "activeSpine",
                    playback: {
                      mode: "animation",
                      animationName: "Start",
                      loop: false,
                    },
                  },
                  win: {
                    kind: "activeSpine",
                    playback: {
                      mode: "animation",
                      animationName: "Win",
                      loop: false,
                    },
                  },
                  winStart: {
                    kind: "activeSpine",
                    playback: {
                      mode: "animation",
                      animationName: "Win_Start",
                      loop: false,
                    },
                  },
                },
                valuePresentation: {
                  defaultValues: [1, 10, 100],
                  reelStates: {
                    normal: {
                      kind: "transparent",
                      width: 200,
                      height: 200,
                    },
                    spinBlur: "./L1.spinBlur.png",
                    disabled: "./L1.disabled.png",
                  },
                  tiers: [
                    {
                      animation: {
                        kind: "spine",
                        skeleton: "./jackpot-ultra.json",
                        atlas: "./gold.atlas",
                        texture: "./gold.png",
                        playback: {
                          mode: "animation",
                          animationName: "Idle",
                          loop: true,
                        },
                      },
                    },
                  ],
                  text: {
                    slot: "ValueSlot",
                    x: 0,
                    y: 0,
                    fontFamily: "Arial",
                    fontSize: 32,
                    fontWeight: "900",
                    fill: "#fff",
                    stroke: "#000",
                    strokeWidth: 4,
                  },
                },
              },
              H1: {
                normal: "./H1.png",
                spinBlur: "./H1.spinBlur.png",
                disabled: "./H1.disabled.png",
                scale: 1,
                renderPriority: 0,
                cascadeWinPresentation: {
                  order: 0,
                  playback: {
                    mode: "group",
                    winState: "win",
                    removeState: "remove",
                  },
                  summary: { mode: "groupAmount" },
                },
                animations: {
                  normal: {
                    kind: "spine",
                    skeleton: "./H1.json",
                    atlas: "./Symbol.atlas",
                    texture: "./Symbol.png",
                    playback: {
                      mode: "animation",
                      animationName: "Idle",
                      loop: true,
                    },
                    transform: { x: 3, y: -4, scale: 0.75 },
                  },
                  appear: {
                    kind: "spine",
                    skeleton: "./H1.json",
                    atlas: "./Symbol.atlas",
                    texture: "./Symbol.png",
                    playback: {
                      mode: "animation",
                      animationName: "Start",
                      loop: false,
                    },
                  },
                  win: { kind: "builtin", durationSeconds: 0.58 },
                },
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["L1", "H1"],
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

      expect(manifest.symbols.L1.animations).toEqual({
        appear: {
          kind: "activeSpine",
          playback: { mode: "animation", animationName: "Start", loop: false },
        },
        win: {
          kind: "activeSpine",
          playback: { mode: "animation", animationName: "Win", loop: false },
        },
        winStart: {
          kind: "activeSpine",
          playback: {
            mode: "animation",
            animationName: "Win_Start",
            loop: false,
          },
        },
      });
      expect(manifest.settings.additionalStateDefinitions).toEqual([
        { id: "winStart", phase: "once", playback: "once" },
      ]);
      expect(manifest.symbols.L1.renderPriority).toBe(2);
      expect(manifest.symbols.L1).not.toHaveProperty("normal");
      expect(manifest.symbols.L1).not.toHaveProperty("spinBlur");
      expect(manifest.symbols.L1).not.toHaveProperty("disabled");
      expect(manifest.symbols.L1.valuePresentation).toEqual({
        defaultValues: [1, 10, 100],
        reelStates: {
          normal: { kind: "transparent", width: 200, height: 200 },
          spinBlur: "./L1.spinBlur.png",
          disabled: "./L1.disabled.png",
        },
        tiers: [
          {
            animation: {
              kind: "spine",
              skeleton: "./jackpot-ultra.json",
              atlas: "./gold.atlas",
              texture: "./gold.png",
              playback: {
                mode: "animation",
                animationName: "Idle",
                loop: true,
              },
            },
          },
        ],
        text: {
          type: "font",
          slot: "ValueSlot",
          x: 0,
          y: 0,
          fontFamily: "Arial",
          fontSize: 32,
          fontWeight: "900",
          fill: "#fff",
          stroke: "#000",
          strokeWidth: 4,
        },
      });
      expect(manifest.symbols.H1.animations).toEqual({
        normal: {
          kind: "spine",
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Idle",
            loop: true,
          },
          transform: { x: 3, y: -4, scale: 0.75 },
        },
        appear: {
          kind: "spine",
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Start",
            loop: false,
          },
        },
        win: { kind: "builtin", durationSeconds: 0.58 },
      });
      expect(manifest.symbols.H1.renderPriority).toBe(0);
      expect(manifest.symbols.H1.cascadeWinPresentation).toEqual({
        order: 0,
        playback: {
          mode: "group",
          winState: "win",
          removeState: "remove",
        },
        summary: { mode: "groupAmount" },
      });

      const imageStringText = {
        type: "image-string",
        tiers: [
          {
            resource: "./dependencies/digits/image-string.manifest.json",
            slot: "Num",
            anchor: { x: 0.5, y: 0.5 },
            transform: { x: 0, y: 0, scale: 1 },
            followSlotColor: true,
          },
        ],
      };
      manifest.symbols.L1.valuePresentation.text = imageStringText;
      await writeFile(
        result.manifestPath,
        JSON.stringify(manifest, null, 2),
        "utf8",
      );
      await generator.generateSymbolStateTextures({
        inputDir: tempDir,
        outputDir: tempDir,
        symbols: ["L1", "H1"],
      });
      const preserved = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(preserved.symbols.L1.valuePresentation.text).toEqual(
        imageStringText,
      );

      preserved.symbols.L1.valuePresentation.text.prefix = "./";
      await writeFile(
        result.manifestPath,
        JSON.stringify(preserved, null, 2),
        "utf8",
      );
      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["L1", "H1"],
        }),
      ).rejects.toThrow(/unknown field|prefix/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when an existing manifest contains an invalid renderPriority", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "L1.png"), 4, 4, "#ff0000");
      await writeFile(
        join(tempDir, "symbol-state-textures.manifest.json"),
        JSON.stringify(
          {
            version: 1,
            states: ["spinBlur", "disabled"],
            symbols: {
              L1: {
                normal: "./L1.png",
                spinBlur: "./L1.spinBlur.png",
                disabled: "./L1.disabled.png",
                scale: 1,
                renderPriority: -1,
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["L1"],
        }),
      ).rejects.toThrow(/L1.*renderPriority/);
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

  it("rejects invalid symbol display scales", async () => {
    const generator = await loadGeneratorModule();
    const tempDir = await mkdtemp(
      join(tmpdir(), "rendercore-symbol-generator-"),
    );
    try {
      await writePng(join(tempDir, "WL.png"), 4, 4, "#ff0000");

      for (const argv of [
        ["--input-dir", tempDir, "--symbols", "WL", "--scale", "0"],
        ["--input-dir", tempDir, "--symbols", "WL", "--scale=-1"],
        ["--input-dir", tempDir, "--symbols", "WL", "--scale=NaN"],
        ["--input-dir", tempDir, "--symbols", "WL", "--scale="],
        ["--input-dir", tempDir, "--symbols", "WL", "--scale", "abc"],
      ]) {
        expect(() =>
          generator.parseGenerateSymbolStateTextureArgs(argv),
        ).toThrow(/scale/);
      }

      await expect(
        generator.generateSymbolStateTextures({
          inputDir: tempDir,
          outputDir: tempDir,
          symbols: ["WL"],
          scale: 0,
        }),
      ).rejects.toThrow(/scale/);
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
