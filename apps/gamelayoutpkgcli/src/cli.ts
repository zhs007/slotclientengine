import { basename, dirname, extname, resolve } from "node:path";
import {
  createSceneLayoutAssetGroups,
  serializeSceneLayoutAssetGroups,
} from "./asset-groups.js";
import { optimizeLayoutImages, nodeCwebpRunner } from "./image-optimizer.js";
import {
  readAndValidateLayoutPackage,
  validateLayoutPackageBytes,
} from "./package-reader.js";
import { buildOptimizedPackage, commitOutputPair } from "./package-writer.js";
import { rewriteLayoutPackageReferences } from "./reference-rewriter.js";
import type {
  CwebpRunner,
  GamelayoutPkgCliOptions,
  ResolvedGamelayoutPkgCliOptions,
} from "./types.js";

export async function runGamelayoutPkgCli(
  argv: readonly string[],
): Promise<void> {
  try {
    const options = resolveCliOptions(parseCliArgs(argv));
    const result = await optimizeLayoutPackageFile(options);
    console.log(`gamelayoutpkg 优化成功：${result.outputPath}`);
    console.log(`资源分组 JSON：${result.assetsJsonPath}`);
    console.log(
      `图片 ${result.convertedImageCount} 个，ZIP ${result.inputZipBytes} -> ${result.outputZipBytes} bytes。`,
    );
  } catch (error) {
    process.exitCode = 1;
    console.error(
      `gamelayoutpkg 执行失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseCliArgs(argv: readonly string[]): GamelayoutPkgCliOptions {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  const supported = new Set([
    "--input",
    "--output",
    "--assets-json",
    "--quality",
    "--cwebp",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (!supported.has(flag)) throw new Error(`未知参数：${flag}`);
    if (values.has(flag)) throw new Error(`${flag} 不能重复提供。`);
    const value = args[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${flag} 需要一个参数值。`);
    values.set(flag, value);
    index += 1;
  }
  const inputPath = values.get("--input");
  if (!inputPath) throw new Error("--input 是必填参数。");
  const qualityRaw = values.get("--quality") ?? "80";
  const quality = Number(qualityRaw);
  if (!Number.isFinite(quality) || quality < 0 || quality > 100)
    throw new Error("--quality 必须是 0..100 的有限数。");
  return Object.freeze({
    inputPath,
    outputPath: values.get("--output"),
    assetsJsonPath: values.get("--assets-json"),
    quality,
    cwebpExecutable: values.get("--cwebp") ?? "cwebp",
  });
}

export function resolveCliOptions(
  options: GamelayoutPkgCliOptions,
): ResolvedGamelayoutPkgCliOptions {
  const inputPath = resolve(options.inputPath);
  const directory = dirname(inputPath);
  const inputName = basename(inputPath);
  const stem =
    extname(inputName).toLowerCase() === ".zip"
      ? inputName.slice(0, -extname(inputName).length)
      : inputName;
  const outputPath = resolve(
    options.outputPath ?? resolve(directory, `${stem}.optimized.zip`),
  );
  const assetsJsonPath = resolve(
    options.assetsJsonPath ?? resolve(directory, `${stem}.assets-groups.json`),
  );
  const paths = [inputPath, outputPath, assetsJsonPath];
  if (new Set(paths).size !== paths.length)
    throw new Error("input、output 和 assets-json 路径必须互不相同。");
  return Object.freeze({
    inputPath,
    outputPath,
    assetsJsonPath,
    quality: options.quality,
    cwebpExecutable: options.cwebpExecutable,
  });
}

export async function optimizeLayoutPackageFile(
  options: ResolvedGamelayoutPkgCliOptions,
  runner: CwebpRunner = nodeCwebpRunner,
): Promise<{
  readonly outputPath: string;
  readonly assetsJsonPath: string;
  readonly inputZipBytes: number;
  readonly outputZipBytes: number;
  readonly convertedImageCount: number;
}> {
  const source = await readAndValidateLayoutPackage(options.inputPath);
  const optimization = await optimizeLayoutImages({
    source,
    quality: options.quality,
    cwebpExecutable: options.cwebpExecutable,
    runner,
  });
  const rewritten = rewriteLayoutPackageReferences({
    manifest: source.manifest,
    optimization,
  });
  const output = await buildOptimizedPackage(rewritten);
  const verified = await validateLayoutPackageBytes(output.zipBytes);
  const assetGroups = createSceneLayoutAssetGroups({
    manifest: verified.manifest,
    files: verified.files,
    sourceZipBytes: source.zipBytes.byteLength,
    output,
    quality: options.quality,
    cwebpVersion: optimization.cwebpVersion,
    convertedImageCount: optimization.convertedImageCount,
  });
  const assetsJsonBytes = serializeSceneLayoutAssetGroups(assetGroups);
  await commitOutputPair({
    outputPath: options.outputPath,
    zipBytes: output.zipBytes,
    assetsJsonPath: options.assetsJsonPath,
    assetsJsonBytes,
  });
  return Object.freeze({
    outputPath: options.outputPath,
    assetsJsonPath: options.assetsJsonPath,
    inputZipBytes: source.zipBytes.byteLength,
    outputZipBytes: output.zipBytes.byteLength,
    convertedImageCount: optimization.convertedImageCount,
  });
}
