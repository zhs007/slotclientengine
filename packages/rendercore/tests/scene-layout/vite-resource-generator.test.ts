import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface GeneratorOptions {
  readonly manifest: string;
  readonly out: string;
  readonly check: boolean;
}

interface GeneratorModule {
  readonly generateSceneLayoutViteResources: (
    options: GeneratorOptions,
  ) => Promise<{ readonly outPath: string; readonly resourceCount: number }>;
  readonly parseSceneLayoutResourceArgs: (
    argv: readonly string[],
  ) => GeneratorOptions;
}

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("scene layout Vite resource generator", () => {
  it("parses generator options", async () => {
    const generator = await loadGenerator();
    expect(
      generator.parseSceneLayoutResourceArgs([
        "--manifest",
        "assets/art/layout.manifest.json",
        "--out",
        "apps/game/src/generated.ts",
        "--check",
      ]),
    ).toEqual({
      check: true,
      manifest: "assets/art/layout.manifest.json",
      out: "apps/game/src/generated.ts",
    });
  });

  it("trusts present art bytes and ignores unused or extra files", async () => {
    const generator = await loadGenerator();
    const fixture = await createFixture({
      files: {
        "art.json": {
          path: "assets/art.json",
          sha256: "stale-art-metadata",
          mediaType: null,
          byteLength: -1,
        },
        "unused.json": {
          path: "assets/missing.json",
          sha256: null,
          byteLength: null,
        },
        "ignored-invalid-entry.json": 5,
      },
      payloads: {
        "assets/art.json": "final art delivery\n",
        "assets/artist-notes.txt": "not used by the game\n",
      },
    });
    await generator.generateSceneLayoutViteResources({
      manifest: fixture.manifest,
      out: fixture.out,
      check: false,
    });
    const source = await readFile(fixture.out, "utf8");
    expect(source).toContain("assets/art.json?url");
    expect(source).not.toContain("assets/missing.json");
    expect(source).not.toContain("artist-notes.txt");
    await expect(
      generator.generateSceneLayoutViteResources({
        manifest: fixture.manifest,
        out: fixture.out,
        check: true,
      }),
    ).resolves.toMatchObject({ resourceCount: 3 });
  });

  it("rejects unsafe trusted art paths", async () => {
    const generator = await loadGenerator();
    const fixture = await createFixture({
      files: {
        "art.json": { path: "../outside.json" },
      },
      payloads: {},
    });
    await expect(
      generator.generateSceneLayoutViteResources({
        manifest: fixture.manifest,
        out: fixture.out,
        check: false,
      }),
    ).rejects.toThrow(/canonical relative package path/);
  });
});

async function loadGenerator(): Promise<GeneratorModule> {
  const url = new URL(
    "../../scripts/generate-scene-layout-vite-resources.mjs",
    import.meta.url,
  ).href;
  return (await import(url)) as GeneratorModule;
}

async function createFixture(options: {
  readonly files: Readonly<Record<string, unknown>>;
  readonly payloads: Readonly<Record<string, string>>;
}): Promise<{ readonly manifest: string; readonly out: string }> {
  const root = await mkdtemp(join(tmpdir(), "scene-layout-vite-generator-"));
  temporaryRoots.push(root);
  const packageRoot = join(root, "art");
  await mkdir(join(packageRoot, "assets"), { recursive: true });
  const manifest = join(packageRoot, "layout.manifest.json");
  const out = join(root, "generated.ts");
  await writeFile(
    manifest,
    `${JSON.stringify({ version: 1, kind: "scene-layout" })}\n`,
  );
  await writeFile(
    join(packageRoot, "assets.map.json"),
    `${JSON.stringify({
      version: 1,
      kind: "editor-assets",
      files: options.files,
    })}\n`,
  );
  for (const [path, contents] of Object.entries(options.payloads)) {
    await writeFile(join(packageRoot, path), contents);
  }
  return { manifest, out };
}
