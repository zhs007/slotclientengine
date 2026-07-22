import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

describe("gameframeworks UI factory source boundary", () => {
  it("keeps test-branch frameworks, event continuations, and global stores out of source", () => {
    const source = readSourceTree(join(PACKAGE_ROOT, "src"));

    expect(source).not.toMatch(
      /netcore2|game-leo-frameworks|ui-leo-frameworks|stateData|EventEmitter|spinEnd|zustand|inversify|from ["']react["']/i,
    );
    expect(source).not.toMatch(/document\.querySelector/);
  });

  it("imports the default UI only through the uiframeworks public entry", () => {
    const source = readFileSync(
      join(PACKAGE_ROOT, "src/ui-adapter.ts"),
      "utf8",
    );
    const imports = source.match(/from ["'][^"']+["']/g) ?? [];
    const uiImports = imports.filter((value) =>
      value.includes("@slotclientengine/uiframeworks"),
    );

    expect(uiImports).toEqual([
      'from "@slotclientengine/uiframeworks"',
      'from "@slotclientengine/uiframeworks"',
    ]);
    expect(source).not.toMatch(/@slotclientengine\/uiframeworks\//);
  });

  it("keeps the UI create context presentation-only", () => {
    const types = readFileSync(join(PACKAGE_ROOT, "src/types.ts"), "utf8");
    const context = readInterface(types, "SlotGameUiCreateContext");

    expect(context).toContain("initialState: SlotGameStateSnapshot");
    expect(context).toContain("commands: SlotGameUiCommands");
    expect(context).not.toMatch(
      /live|session|socket|clientFactory|gameAdapter|collect|logicFactory/i,
    );
  });

  it("does not add lower-level dependencies to game002 or game003", () => {
    for (const appName of ["game002", "game003"]) {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, "apps", appName, "package.json"), "utf8"),
      ) as { dependencies?: Record<string, string> };
      expect(pkg.dependencies).toHaveProperty(
        "@slotclientengine/gameframeworks",
      );
      expect(pkg.dependencies).not.toHaveProperty(
        "@slotclientengine/uiframeworks",
      );
      expect(pkg.dependencies).not.toHaveProperty("@slotclientengine/netcore");
      expect(pkg.dependencies).not.toHaveProperty(
        "@slotclientengine/logiccore",
      );
    }
  });
});

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? readSourceTree(path)
        : entry.name.endsWith(".ts")
          ? readFileSync(path, "utf8")
          : "";
    })
    .join("\n");
}

function readInterface(source: string, name: string): string {
  const match = source.match(
    new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) {
    throw new Error(`missing interface: ${name}`);
  }
  return match[1];
}
