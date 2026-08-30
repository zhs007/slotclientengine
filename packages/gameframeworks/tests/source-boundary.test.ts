import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(__dirname, "..");

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

  it("exports the lightweight Popup runtime without the editor snapshot surface", () => {
    const source = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");

    expect(source).toContain("createSpinePopupRuntime");
    expect(source).toContain("SpinePopupRuntime");
    expect(source).not.toContain("createSpinePopupPlayer");
    expect(source).not.toContain("SpinePopupPlayer");
    expect(source).not.toContain("SpinePopupSnapshot");
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
