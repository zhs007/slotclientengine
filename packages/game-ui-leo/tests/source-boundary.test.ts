import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

describe("Leo game UI source boundary", () => {
  it("contains only presentation dependencies and one React runtime version", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({
      "@slotclientengine/gameframeworks": "workspace:*",
      "@slotclientengine/uiframeworks": "workspace:*",
      react: "^19.2.7",
      "react-dom": "^19.2.7",
    });
    const lockfile = readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8");
    expect(readLockedVersions(lockfile, "react")).toEqual(["19.2.8"]);
    expect(readLockedVersions(lockfile, "react-dom")).toEqual(["19.2.8"]);
  });

  it("has no forbidden framework, singleton, global lookup, or body mutation", () => {
    const source = readSource(join(PACKAGE_ROOT, "src"));
    expect(source).not.toMatch(
      /netcore2?|logiccore|eventcore|zustand|inversify|game-leo-frameworks|ui-leo-frameworks/i,
    );
    expect(source).not.toMatch(
      /stateData|spinEnd|RoundService|GameContainer|__PLATFORM__|document\.querySelector|document\.getElementById|document\.body|window\.[A-Za-z_$][\w$]*\s*=/,
    );
    expect(source).not.toMatch(
      /@slotclientengine\/(?:gameframeworks|uiframeworks)\/src/,
    );
    expect(source).not.toMatch(/import\.meta\.glob|setTimeout/);
    expect(source).not.toMatch(/\bposition\s*:\s*fixed|\d(?:vw|vh)\b/);
    expect(source).not.toMatch(
      /(^|[,}]\s*)(?:body|main|button|\.disabled)\s*\{/m,
    );
    const factorySource = readFileSync(
      join(PACKAGE_ROOT, "src/factory.ts"),
      "utf8",
    );
    expect(factorySource).toContain("createSlotUiFrameHost");
    expect(factorySource).not.toMatch(
      /createSlotUiController|createMoneyFormatter|calculateSlotUiFrameViewport/,
    );
  });

  it("keeps the exact referenced asset whitelist with no loading assets", () => {
    const assetRoot = join(PACKAGE_ROOT, "src/assets");
    const assets = listFiles(assetRoot)
      .map((file) => file.slice(assetRoot.length + 1))
      .sort();
    expect(assets).toEqual([
      "controls/addbet.png",
      "controls/image-autoplay.png",
      "controls/image-background-music-off.png",
      "controls/image-background-music.png",
      "controls/image-fasplays-off.png",
      "controls/image-fastplays.png",
      "controls/image-play.png",
      "controls/removbet.png",
      "font/Anton-Regular.woff2",
      "font/NotoSansR.woff2",
    ]);
    const styles = readFileSync(join(PACKAGE_ROOT, "src/styles.css"), "utf8");
    for (const asset of assets) expect(styles).toContain(`./assets/${asset}`);
    expect(assets.join("\n")).not.toMatch(/loading|wildsheep|modal|buy/i);
  });

  it("preserves dependency direction and keeps game003/loading packages React-free", () => {
    const frameworkPackage = readFileSync(
      join(REPO_ROOT, "packages/gameframeworks/package.json"),
      "utf8",
    );
    expect(frameworkPackage).not.toMatch(/game-ui-leo|react(?:-dom)?/);
    for (const relative of [
      "packages/gameloading/package.json",
      "packages/gameloading-ui-leo/package.json",
      "packages/gameloading-ui-simple/package.json",
      "apps/game003/package.json",
    ]) {
      const content = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(content, relative).not.toMatch(/game-ui-leo|react(?:-dom)?/);
    }
  });
});

function readSource(root: string): string {
  return listFiles(root)
    .filter((file) => /\.(?:ts|tsx|css)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function listFiles(root: string): string[] {
  return readdirSync(root)
    .sort()
    .flatMap((entry) => {
      const path = join(root, entry);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    })
    .filter((file) => basename(file) !== ".keepme");
}

function readLockedVersions(lockfile: string, dependency: string): string[] {
  return [
    ...new Set(
      [...lockfile.matchAll(new RegExp(`^  ${dependency}@([^:(]+)`, "gm"))].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}
