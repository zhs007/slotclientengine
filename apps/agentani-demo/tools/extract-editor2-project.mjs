import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const input = path.resolve("assets/editor2/bg/project.json");
const outputDir = path.resolve("apps/agentani-demo/src/assets/bg");

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extensionFor(mime, buffer) {
  if (mime === "image/png" || buffer.subarray(0, 8).equals(pngMagic)) {
    return "png";
  }
  if (mime === "image/jpeg") {
    return "jpg";
  }
  console.warn(`未知图片 MIME: ${mime}，使用 .bin`);
  return "bin";
}

const project = JSON.parse(await readFile(input, "utf8"));
await mkdir(outputDir, { recursive: true });

for (const [index, layer] of project.layers.entries()) {
  if (layer.type !== "pic" || !layer.asset) {
    continue;
  }
  const match = /^data:([^;]+);base64,(.*)$/.exec(layer.asset);
  if (!match) {
    throw new Error(`图层 ${layer.id} 不是 base64 data URL`);
  }
  const buffer = Buffer.from(match[2], "base64");
  const filename = `layer-${String(index).padStart(2, "0")}.${extensionFor(match[1], buffer)}`;
  await writeFile(path.join(outputDir, filename), buffer);
  console.log(
    `${String(index).padStart(2, "0")} ${layer.id} -> ${filename} ${buffer.length} bytes ` +
      `${(layer.animations ?? []).map((animation) => animation.type).join(",") || "-"}`,
  );
}
