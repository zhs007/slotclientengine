import { basename, dirname, extname, resolve } from "node:path";
import {
  createSceneLayoutAssetGroups,
  serializeSceneLayoutAssetGroups,
} from "./asset-groups.js";
import { optimizeLayoutAudio, nodeAudioToolRunner } from "./audio-optimizer.js";
import { optimizeLayoutImages, nodeCwebpRunner } from "./image-optimizer.js";
import {
  buildSceneLayoutDelivery,
  checkSceneLayoutDeliveryDirectory,
  commitSceneLayoutDeliveryDirectory,
} from "./delivery-builder.js";
import {
  readAndValidateLayoutPackage,
  validateLayoutPackageBytes,
} from "./package-reader.js";
import { buildOptimizedPackage, commitOutputPair } from "./package-writer.js";
import { rewriteLayoutPackageReferences } from "./reference-rewriter.js";
import type {
  AudioToolRunner,
  CwebpRunner,
  GamelayoutPkgCliOptions,
  ResolvedGamelayoutPkgCliOptions,
} from "./types.js";

export async function runGamelayoutPkgCli(
  argv: readonly string[],
): Promise<void> {
  try {
    const options = resolveCliOptions(parseCliArgs(argv));
    if (options.deliveryDirectory) {
      const result = await publishSceneLayoutDeliveryFile(options);
      console.log(
        `gamelayoutpkg CDN 交付目录${options.check ? "校验" : "生成"}成功：${result.outputDirectory}`,
      );
      console.log(
        `Atlas ${result.atlasCount} 张、合图帧 ${result.atlasFrameCount} 个、外置资源 ${result.externalAssetCount} 个。`,
      );
      return;
    }
    const result = await optimizeLayoutPackageFile(options);
    console.log(`gamelayoutpkg 优化成功：${result.outputPath}`);
    console.log(`资源分组 JSON：${result.assetsJsonPath}`);
    console.log(
      `图片 ${result.convertedImageCount} 个，ZIP ${result.inputZipBytes} -> ${result.outputZipBytes} bytes。`,
    );
    console.log(`AAC 音频 ${result.convertedAudioCount} 个。`);
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
  let check = false;
  const supported = new Set([
    "--input",
    "--delivery-dir",
    "--output",
    "--assets-json",
    "--quality",
    "--cwebp",
    "--ffmpeg",
    "--ffprobe",
    "--bgm-bitrate",
    "--effect-mono-bitrate",
    "--effect-stereo-bitrate",
    "--atlas-max-size",
    "--atlas-padding",
    "--atlas-extrude",
    "--check",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (!supported.has(flag)) throw new Error(`未知参数：${flag}`);
    if (flag === "--check") {
      if (check) throw new Error("--check 不能重复提供。");
      check = true;
      continue;
    }
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
  const bgmBitrateKbps = parseBitrate(values, "--bgm-bitrate", 128);
  const effectMonoBitrateKbps = parseBitrate(
    values,
    "--effect-mono-bitrate",
    64,
  );
  const effectStereoBitrateKbps = parseBitrate(
    values,
    "--effect-stereo-bitrate",
    96,
  );
  const maxAtlasSize = parseInteger(
    values,
    "--atlas-max-size",
    4096,
    256,
    8192,
  );
  const atlasPadding = parseInteger(values, "--atlas-padding", 4, 0, 32);
  const atlasExtrude = parseInteger(values, "--atlas-extrude", 2, 0, 16);
  return Object.freeze({
    inputPath,
    deliveryDirectory: values.get("--delivery-dir"),
    check,
    outputPath: values.get("--output"),
    assetsJsonPath: values.get("--assets-json"),
    quality,
    cwebpExecutable: values.get("--cwebp") ?? "cwebp",
    ffmpegExecutable: values.get("--ffmpeg") ?? "ffmpeg",
    ffprobeExecutable: values.get("--ffprobe") ?? "ffprobe",
    bgmBitrateKbps,
    effectMonoBitrateKbps,
    effectStereoBitrateKbps,
    maxAtlasSize,
    atlasPadding,
    atlasExtrude,
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
  const deliveryDirectory = options.deliveryDirectory
    ? resolve(options.deliveryDirectory)
    : undefined;
  if (options.check && !deliveryDirectory)
    throw new Error("--check 只能与 --delivery-dir 一起使用。");
  const paths = [
    inputPath,
    outputPath,
    assetsJsonPath,
    deliveryDirectory,
  ].filter((path): path is string => path !== undefined);
  if (new Set(paths).size !== paths.length)
    throw new Error("input、output 和 assets-json 路径必须互不相同。");
  return Object.freeze({
    inputPath,
    ...(deliveryDirectory ? { deliveryDirectory } : {}),
    check: options.check ?? false,
    outputPath,
    assetsJsonPath,
    quality: options.quality,
    cwebpExecutable: options.cwebpExecutable,
    ffmpegExecutable: options.ffmpegExecutable ?? "ffmpeg",
    ffprobeExecutable: options.ffprobeExecutable ?? "ffprobe",
    bgmBitrateKbps: options.bgmBitrateKbps ?? 128,
    effectMonoBitrateKbps: options.effectMonoBitrateKbps ?? 64,
    effectStereoBitrateKbps: options.effectStereoBitrateKbps ?? 96,
    maxAtlasSize: options.maxAtlasSize ?? 4096,
    atlasPadding: options.atlasPadding ?? 4,
    atlasExtrude: options.atlasExtrude ?? 2,
  });
}

export async function publishSceneLayoutDeliveryFile(
  options: ResolvedGamelayoutPkgCliOptions,
  cwebpRunner: CwebpRunner = nodeCwebpRunner,
): Promise<{
  readonly outputDirectory: string;
  readonly atlasCount: number;
  readonly atlasFrameCount: number;
  readonly externalAssetCount: number;
}> {
  if (!options.deliveryDirectory)
    throw new Error("CDN 交付模式必须提供 --delivery-dir。");
  const source = await readAndValidateLayoutPackage(options.inputPath);
  const delivery = await buildSceneLayoutDelivery({
    source,
    quality: options.quality,
    cwebpExecutable: options.cwebpExecutable,
    cwebpRunner,
    maxAtlasSize: options.maxAtlasSize,
    atlasPadding: options.atlasPadding,
    atlasExtrude: options.atlasExtrude,
  });
  if (options.check)
    await checkSceneLayoutDeliveryDirectory({
      outputDirectory: options.deliveryDirectory,
      delivery,
    });
  else
    await commitSceneLayoutDeliveryDirectory({
      outputDirectory: options.deliveryDirectory,
      delivery,
    });
  return Object.freeze({
    outputDirectory: options.deliveryDirectory,
    atlasCount: delivery.atlasCount,
    atlasFrameCount: delivery.atlasFrameCount,
    externalAssetCount: delivery.externalAssetCount,
  });
}

export async function optimizeLayoutPackageFile(
  options: ResolvedGamelayoutPkgCliOptions,
  cwebpRunner: CwebpRunner = nodeCwebpRunner,
  audioRunner: AudioToolRunner = nodeAudioToolRunner,
): Promise<{
  readonly outputPath: string;
  readonly assetsJsonPath: string;
  readonly inputZipBytes: number;
  readonly outputZipBytes: number;
  readonly convertedImageCount: number;
  readonly convertedAudioCount: number;
}> {
  const source = await readAndValidateLayoutPackage(options.inputPath);
  const optimization = await optimizeLayoutImages({
    source,
    quality: options.quality,
    cwebpExecutable: options.cwebpExecutable,
    runner: cwebpRunner,
  });
  const audioOptimization = await optimizeLayoutAudio({
    source,
    optimization,
    audio: {
      ffmpegExecutable: options.ffmpegExecutable,
      ffprobeExecutable: options.ffprobeExecutable,
      bgmBitrateKbps: options.bgmBitrateKbps,
      effectMonoBitrateKbps: options.effectMonoBitrateKbps,
      effectStereoBitrateKbps: options.effectStereoBitrateKbps,
    },
    runner: audioRunner,
  });
  const rewritten = rewriteLayoutPackageReferences({
    manifest: source.manifest,
    optimization: audioOptimization,
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
    audioOptimization,
    audioOptions: options,
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
    convertedAudioCount: audioOptimization.convertedAudioCount,
  });
}

function parseBitrate(
  values: ReadonlyMap<string, string>,
  flag: string,
  fallback: number,
): number {
  const raw = values.get(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 8 || value > 512)
    throw new Error(`${flag} 必须是 8..512 的整数 kbps。`);
  return value;
}

function parseInteger(
  values: ReadonlyMap<string, string>,
  flag: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = values.get(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${flag} 必须是 ${minimum}..${maximum} 的整数。`);
  return value;
}
