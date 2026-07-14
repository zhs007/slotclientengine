import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

interface GeneratorModule {
  readonly generateSymbolValueViteResources: (options: {
    readonly manifest: string;
    readonly out: string;
    readonly check: boolean;
  }) => Promise<{ readonly outPath: string; readonly resourceCount: number }>;
  readonly parseSymbolValueResourceArgs: (argv: readonly string[]) => {
    readonly manifest: string;
    readonly out: string;
    readonly check: boolean;
  };
}

async function loadGenerator(): Promise<GeneratorModule> {
  const url = new URL(
    "../../scripts/generate-symbol-value-vite-resources.mjs",
    import.meta.url,
  ).href;
  return (await import(url)) as GeneratorModule;
}

describe("symbol value Vite resource generator", () => {
  it("supports one, three and five arbitrarily named tiers", async () => {
    const generator = await loadGenerator();
    const root = await mkdtemp(join(tmpdir(), "symbol-value-tier-counts-"));
    await writeFile(join(root, "shared.atlas"), "page.png\n");
    await writeFile(join(root, "page.png"), "png");
    await writeFile(join(root, "value.spinBlur.png"), "png");
    await writeFile(join(root, "value.disabled.png"), "png");
    for (const count of [1, 3, 5]) {
      const names = Array.from(
        { length: count },
        (_, index) => `tier-${count}-${index}.json`,
      );
      await Promise.all(names.map((name) => writeFile(join(root, name), "{}")));
      const manifestPath = join(root, `manifest-${count}.json`);
      const outPath = join(root, `generated-${count}.ts`);
      await writeFile(manifestPath, JSON.stringify(createManifest(names)));
      await expect(
        generator.generateSymbolValueViteResources({
          manifest: manifestPath,
          out: outPath,
          check: false,
        }),
      ).resolves.toMatchObject({ resourceCount: count + 4 });
    }
  });

  it("generates a stable exact closure for arbitrary tier names and shared assets", async () => {
    const generator = await loadGenerator();
    const root = await mkdtemp(join(tmpdir(), "symbol-value-resources-"));
    const manifestPath = join(root, "symbol-state-textures.manifest.json");
    const outPath = join(root, "generated", "resources.ts");
    await Promise.all([
      writeFile(join(root, "bronze.json"), "{}"),
      writeFile(join(root, "ruby.json"), "{}"),
      writeFile(join(root, "ultra.json"), "{}"),
      writeFile(join(root, "shared.atlas"), "page.png\n"),
      writeFile(join(root, "page.png"), "png"),
      writeFile(join(root, "value.spinBlur.png"), "png"),
      writeFile(join(root, "value.disabled.png"), "png"),
    ]);
    await writeFile(
      manifestPath,
      JSON.stringify(
        createManifest(["bronze.json", "ruby.json", "ultra.json"]),
      ),
    );

    const result = await generator.generateSymbolValueViteResources({
      manifest: manifestPath,
      out: outPath,
      check: false,
    });
    expect(result.resourceCount).toBe(7);
    const source = await readFile(outPath, "utf8");
    expect(source).toContain('"./bronze.json"');
    expect(source).toContain('"./ruby.json"');
    expect(source).toContain('"./ultra.json"');
    expect(source.match(/shared\.atlas\?raw/gu)).toHaveLength(1);
    expect(source).toContain("symbolValueReelStateTextureModules");
    await expect(
      generator.generateSymbolValueViteResources({
        manifest: manifestPath,
        out: outPath,
        check: true,
      }),
    ).resolves.toMatchObject({ resourceCount: 7 });
    await writeFile(outPath, `${source}// stale\n`);
    await expect(
      generator.generateSymbolValueViteResources({
        manifest: manifestPath,
        out: outPath,
        check: true,
      }),
    ).rejects.toThrow(/stale/);
  });

  it("generates exact full-value image resources from the configured prefix", async () => {
    const generator = await loadGenerator();
    const root = await mkdtemp(join(tmpdir(), "symbol-value-images-"));
    const manifestPath = join(root, "manifest.json");
    const outPath = join(root, "resources.ts");
    await Promise.all([
      writeFile(join(root, "bronze.json"), "{}"),
      writeFile(join(root, "shared.atlas"), "page.png\n"),
      writeFile(join(root, "page.png"), "png"),
      writeFile(join(root, "value.spinBlur.png"), "png"),
      writeFile(join(root, "value.disabled.png"), "png"),
      ...[1, 10, 100].map((value) =>
        writeFile(join(root, `art-${value}.png`), "png"),
      ),
    ]);
    const manifest = createManifest(["bronze.json"]);
    manifest.symbols.GOLD.valuePresentation.text = {
      type: "image",
      slot: "ValueSlot",
      x: 0,
      y: 0,
      prefix: "./art-",
    };
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(
      generator.generateSymbolValueViteResources({
        manifest: manifestPath,
        out: outPath,
        check: false,
      }),
    ).resolves.toMatchObject({ resourceCount: 8 });
    const source = await readFile(outPath, "utf8");
    expect(source).toContain("symbolValueTextImageModules");
    expect(source).toContain('"./art-1.png"');
    expect(source).toContain('kind: "value-image"');

    manifest.symbols.GOLD.valuePresentation.defaultValues.push(250);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(
      generator.generateSymbolValueViteResources({
        manifest: manifestPath,
        out: outPath,
        check: false,
      }),
    ).rejects.toThrow(/art-250\.png/);
  });

  it("rejects invalid bounds, unknown fields, non-Spine tiers and path escape", async () => {
    const generator = await loadGenerator();
    const root = await mkdtemp(join(tmpdir(), "symbol-value-invalid-"));
    const manifestPath = join(root, "manifest.json");
    const outPath = join(root, "out.ts");
    await writeFile(join(root, "value.spinBlur.png"), "png");
    await writeFile(join(root, "value.disabled.png"), "png");
    for (const mutate of [
      (manifest: any) => (manifest.symbols.GOLD.valuePresentation.extra = true),
      (manifest: any) =>
        (manifest.symbols.GOLD.valuePresentation.tiers[0].maxExclusive =
          undefined),
      (manifest: any) =>
        (manifest.symbols.GOLD.valuePresentation.tiers[0].animation.kind =
          "vni"),
      (manifest: any) =>
        (manifest.symbols.GOLD.valuePresentation.tiers[0].animation.skeleton =
          "../outside.json"),
      (manifest: any) =>
        (manifest.symbols.GOLD.valuePresentation.text.unexpected = true),
      (manifest: any) =>
        (manifest.symbols.GOLD.valuePresentation.text.fontSize = 0),
      (manifest: any) => (manifest.symbols.GOLD.normal = "./gold.png"),
    ]) {
      const manifest = createManifest(["bronze.json", "ruby.json"]);
      mutate(manifest);
      await writeFile(manifestPath, JSON.stringify(manifest));
      await expect(
        generator.generateSymbolValueViteResources({
          manifest: manifestPath,
          out: outPath,
          check: false,
        }),
      ).rejects.toThrow();
    }
  });

  it("parses required CLI options", async () => {
    const generator = await loadGenerator();
    expect(
      generator.parseSymbolValueResourceArgs([
        "--manifest",
        "manifest.json",
        "--out",
        "out.ts",
        "--check",
      ]),
    ).toEqual({ manifest: "manifest.json", out: "out.ts", check: true });
  });
});

function createManifest(skeletonNames: readonly string[]): any {
  return {
    version: 1,
    states: ["spinBlur", "disabled"],
    settings: {},
    symbols: {
      GOLD: {
        scale: 1,
        valuePresentation: {
          defaultValues: [1, 10, 100],
          appearPlayback: {
            mode: "animation",
            animationName: "Start",
            loop: false,
          },
          reelStates: {
            normal: { kind: "transparent", width: 200, height: 200 },
            spinBlur: "./value.spinBlur.png",
            disabled: "./value.disabled.png",
          },
          tiers: skeletonNames.map((skeleton, index) => ({
            ...(index === skeletonNames.length - 1
              ? {}
              : { maxExclusive: 10 ** (index + 1) }),
            animation: {
              kind: "spine",
              skeleton: `./${skeleton}`,
              atlas: "./shared.atlas",
              texture: "./page.png",
              playback: {
                mode: "animation",
                animationName: "Idle",
                loop: true,
              },
            },
          })),
          text: {
            slot: "ValueSlot",
            x: 0,
            y: 0,
            fontFamily: "Arial",
            fontSize: 32,
            fontWeight: "900",
            fill: "#ffffff",
            stroke: "#000000",
            strokeWidth: 4,
          },
        },
      },
    },
  };
}
