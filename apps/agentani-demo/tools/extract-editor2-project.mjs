import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectMap = new Map([
  ["bg", "bg"],
  ["fang", "fang"],
  ["heart", "heart"],
  ["mei", "mei"],
  ["tao", "tao"],
  ["海滩", "beach"],
  ["竹子1", "bamboo1"],
]);

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extensionFor(mime, buffer, sourcePath = "") {
  const lowerPath = sourcePath.toLowerCase();
  if (lowerPath.endsWith(".jpeg")) {
    return "jpeg";
  }
  if (lowerPath.endsWith(".jpg") || mime === "image/jpeg") {
    return "jpg";
  }
  if (
    lowerPath.endsWith(".png") ||
    mime === "image/png" ||
    buffer.subarray(0, 8).equals(pngMagic)
  ) {
    return "png";
  }
  console.warn(`未知图片 MIME: ${mime || sourcePath}，使用 .bin`);
  return "bin";
}

async function readLayerAsset(sourceDir, asset) {
  if (asset.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(asset);
    if (!match) {
      throw new Error("图层资源不是合法 base64 data URL");
    }
    const buffer = Buffer.from(match[2], "base64");
    return {
      buffer,
      extension: extensionFor(match[1], buffer),
    };
  }

  const sourcePath = path.join(sourceDir, asset.replace(/^\.\//, ""));
  const buffer = await readFile(sourcePath);
  return {
    buffer,
    extension: extensionFor("", buffer, sourcePath),
  };
}

const sourceRoot = path.resolve("assets/editor2");
const targetRoot = path.resolve("apps/agentani-demo/src/assets");
const requested = process.argv.slice(2);
const sourceDirs = requested.length > 0 ? requested : await readdir(sourceRoot);

for (const sourceName of sourceDirs) {
  const targetName = projectMap.get(sourceName);
  if (!targetName) {
    continue;
  }

  const sourceDir = path.join(sourceRoot, sourceName);
  const project = JSON.parse(
    await readFile(path.join(sourceDir, "project.json"), "utf8"),
  );
  const outputDir = path.join(targetRoot, targetName);
  await mkdir(outputDir, { recursive: true });

  for (const [index, layer] of project.layers.entries()) {
    if (layer.type !== "pic" || !layer.asset) {
      continue;
    }
    const { buffer, extension } = await readLayerAsset(sourceDir, layer.asset);
    const filename = `layer-${String(index).padStart(2, "0")}.${extension}`;
    await writeFile(path.join(outputDir, filename), buffer);
    console.log(
      `${sourceName} ${String(index).padStart(2, "0")} ${layer.id} -> ${filename} ${buffer.length} bytes ` +
        `${(layer.animations ?? []).map((animation) => animation.type).join(",") || "-"}`,
    );
  }
}
