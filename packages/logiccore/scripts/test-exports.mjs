import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const requireFromPackage = createRequire(import.meta.url);

assertBuiltFile("dist/index.js");
assertBuiltFile("dist/node.js");

const commonJsCore = requireFromPackage("@slotclientengine/logiccore");
assertTopLevelCore(commonJsCore, "CommonJS require");

const importedCore = await import("@slotclientengine/logiccore");
assertTopLevelCore(
  importedCore.createGameConfig ? importedCore : importedCore.default,
  "Node import",
);

const commonJsNode = requireFromPackage("@slotclientengine/logiccore/node");
assertNodeCore(commonJsNode, "CommonJS require node subpath");

const importedNode = await import("@slotclientengine/logiccore/node");
assertNodeCore(
  importedNode.loadGameConfigFromJsonFile ? importedNode : importedNode.default,
  "Node import node subpath",
);

assertBrowserSafeTopLevelBundle();
await assertViteNamedImport();

console.log("logiccore export smoke passed.");

function assertBuiltFile(relativePath) {
  const filePath = join(packageRoot, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(
      `${relativePath} does not exist. Run pnpm build before pnpm test:exports.`,
    );
  }
}

function assertTopLevelCore(api, label) {
  if (!api || typeof api.createGameConfig !== "function") {
    throw new Error(`${label}: missing createGameConfig.`);
  }

  if ("loadGameConfigFromJsonFile" in api) {
    throw new Error(
      `${label}: loadGameConfigFromJsonFile leaked from top-level export.`,
    );
  }
}

function assertNodeCore(api, label) {
  if (!api || typeof api.loadGameConfigFromJsonFile !== "function") {
    throw new Error(`${label}: missing loadGameConfigFromJsonFile.`);
  }
}

function assertBrowserSafeTopLevelBundle() {
  const indexBundle = readFileSync(join(packageRoot, "dist/index.js"), "utf8");
  for (const forbidden of [
    "node:fs",
    "node:path",
    "node:crypto",
    "node:fs/promises",
  ]) {
    if (indexBundle.includes(forbidden)) {
      throw new Error(
        `Top-level bundle contains Node-only import token: ${forbidden}.`,
      );
    }
  }
}

async function assertViteNamedImport() {
  const tempRoot = join(packageRoot, `.export-smoke-${Date.now()}`);
  try {
    mkdirSync(join(tempRoot, "src"), { recursive: true });
    writeFileSync(join(tempRoot, "index.html"), '<div id="app"></div>\n');
    writeFileSync(
      join(tempRoot, "src/main.ts"),
      [
        "import { createGameConfig } from '@slotclientengine/logiccore';",
        "",
        "if (typeof createGameConfig !== 'function') {",
        "  throw new Error('missing createGameConfig');",
        "}",
        "",
        'document.querySelector("#app")!.textContent = String(typeof createGameConfig);',
        "",
      ].join("\n"),
    );

    await build({
      root: tempRoot,
      logLevel: "silent",
      build: {
        outDir: "dist",
        emptyOutDir: true,
      },
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
