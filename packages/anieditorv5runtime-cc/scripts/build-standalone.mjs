import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { build } from "vite";
import { format } from "prettier";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = resolve(packageDir, "src/index.ts");
const outputPath = resolve(packageDir, "standalone/anieditorv5runtime-cc.ts");

const buildResult = await build({
  configFile: false,
  logLevel: "error",
  build: {
    target: "es2015",
    minify: false,
    write: false,
    lib: {
      entry: entryPath,
      formats: ["es"],
      fileName: () => "anieditorv5runtime-cc.js",
    },
    rollupOptions: {
      external: ["cc"],
    },
  },
});

const outputs = Array.isArray(buildResult)
  ? buildResult.flatMap((result) => result.output)
  : buildResult.output;
const chunk = outputs.find(
  (output) => output.type === "chunk" && output.isEntry,
);
if (!chunk || chunk.type !== "chunk") {
  throw new Error("Vite did not emit the standalone runtime entry chunk.");
}

const configPath = ts.findConfigFile(
  packageDir,
  ts.sys.fileExists,
  "tsconfig.json",
);
if (!configPath)
  throw new Error("Missing anieditorv5runtime-cc tsconfig.json.");
const parsedConfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  packageDir,
);
const program = ts.createProgram([entryPath], parsedConfig.options);
const checker = program.getTypeChecker();
const entrySource = program.getSourceFile(entryPath);
const entrySymbol = entrySource && checker.getSymbolAtLocation(entrySource);
if (!entrySource || !entrySymbol) {
  throw new Error("Unable to inspect standalone public TypeScript exports.");
}
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const declarations = [];
const runtimeBindings = [];
const runtimeExports = [];
const names = new Set();
for (const exported of checker.getExportsOfModule(entrySymbol)) {
  const symbol =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
  const valueDeclaration = symbol.valueDeclaration;
  if (valueDeclaration) {
    if (ts.isFunctionDeclaration(valueDeclaration)) {
      const functionType = checker.getTypeOfSymbolAtLocation(
        exported,
        valueDeclaration,
      );
      const typeNode = checker.typeToTypeNode(
        functionType,
        undefined,
        ts.NodeBuilderFlags.NoTruncation |
          ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope,
      );
      if (!typeNode) {
        throw new Error(`Unable to emit standalone type for ${exported.name}.`);
      }
      const bindingName = `__standalone_${exported.name}`;
      runtimeBindings.push(
        `const ${bindingName}: ${printer.printNode(
          ts.EmitHint.Unspecified,
          typeNode,
          valueDeclaration.getSourceFile(),
        )} = ${symbol.name};`,
      );
      runtimeExports.push(`${bindingName} as ${exported.name}`);
    } else {
      runtimeExports.push(
        symbol.name === exported.name
          ? exported.name
          : `${symbol.name} as ${exported.name}`,
      );
    }
  }
  const declaration = symbol.declarations?.find(
    (candidate) =>
      ts.isInterfaceDeclaration(candidate) ||
      ts.isTypeAliasDeclaration(candidate) ||
      ts.isClassDeclaration(candidate),
  );
  if (!declaration || names.has(exported.name)) continue;
  names.add(exported.name);
  if (ts.isClassDeclaration(declaration)) {
    const members = declaration.members.flatMap((member) => {
      const flags = ts.getCombinedModifierFlags(member);
      if (
        flags &
        (ts.ModifierFlags.Private |
          ts.ModifierFlags.Protected |
          ts.ModifierFlags.Static)
      ) {
        return [];
      }
      if (ts.isMethodDeclaration(member)) {
        return [
          ts.factory.createMethodSignature(
            undefined,
            member.name,
            member.questionToken,
            member.typeParameters,
            member.parameters,
            member.type,
          ),
        ];
      }
      if (ts.isGetAccessorDeclaration(member)) {
        return [
          ts.factory.createPropertySignature(
            [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
            member.name,
            undefined,
            member.type,
          ),
        ];
      }
      if (ts.isPropertyDeclaration(member)) {
        return [
          ts.factory.createPropertySignature(
            undefined,
            member.name,
            member.questionToken,
            member.type,
          ),
        ];
      }
      return [];
    });
    const publicInterface = ts.factory.createInterfaceDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      exported.name,
      declaration.typeParameters,
      undefined,
      members,
    );
    declarations.push(
      printer.printNode(
        ts.EmitHint.Unspecified,
        publicInterface,
        declaration.getSourceFile(),
      ),
    );
    continue;
  }
  const printed = printer.printNode(
    ts.EmitHint.Unspecified,
    declaration,
    declaration.getSourceFile(),
  );
  declarations.push(
    printed.startsWith("export ") ? printed : `export ${printed}`,
  );
}
declarations.sort((left, right) => left.localeCompare(right));

const source = [
  "// @ts-nocheck",
  "// Generated by scripts/build-standalone.mjs. Do not edit by hand.",
  ...declarations,
  chunk.code
    .replace(/\nexport \{[^}]+\};\s*$/u, "")
    .replace(/^\/\/#(?:end)?region src\/(?:core|cocos)\/[^\n]+\n?/gmu, "")
    .trim(),
  ...runtimeBindings,
  `export { ${runtimeExports.join(", ")} };`,
  "",
].join("\n\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  await format(source, { parser: "typescript" }),
  "utf8",
);
