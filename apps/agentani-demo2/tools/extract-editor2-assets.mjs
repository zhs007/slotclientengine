import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(appRoot, "../..");
const sourcePath = path.join(repoRoot, "assets/editor2/bg/project.json");
const outDir = path.join(appRoot, "src/assets/bg");

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match || match[2] !== ";base64") {
    throw new Error("Only base64 data URLs are supported.");
  }

  const mime = match[1] || "application/octet-stream";
  const bytes = Buffer.from(match[3], "base64");
  return { mime, bytes };
}

export function extensionForImage(mime, bytes) {
  if (
    mime === "image/png" ||
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  ) {
    return ".png";
  }

  if (
    mime === "image/jpeg" ||
    bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
  ) {
    return ".jpg";
  }

  return ".bin";
}

export async function extractBgAssets() {
  const project = JSON.parse(await readFile(sourcePath, "utf8"));
  const hashToFile = new Map();
  const rows = [];

  await mkdir(outDir, { recursive: true });

  for (const [index, layer] of project.layers.entries()) {
    if (
      layer.type !== "pic" ||
      typeof layer.asset !== "string" ||
      layer.asset.length === 0
    ) {
      continue;
    }

    const { mime, bytes } = parseDataUrl(layer.asset);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const existing = hashToFile.get(hash);
    const extension = extensionForImage(mime, bytes);
    const fileName =
      existing ??
      `layer-${String(hashToFile.size).padStart(2, "0")}${extension}`;

    if (!existing) {
      if (extension === ".bin") {
        console.warn(`Unknown image type for layer ${layer.id}; wrote .bin.`);
      }
      hashToFile.set(hash, fileName);
      await writeFile(path.join(outDir, fileName), bytes);
    }

    rows.push({
      index,
      id: layer.id,
      fileName,
      hash,
      reused: Boolean(existing),
      bytes: bytes.length,
      animations:
        (layer.animations ?? []).map((step) => step.type).join(",") || "-",
    });
  }

  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await extractBgAssets();
  for (const row of rows) {
    console.log(
      [
        String(row.index).padStart(2, "0"),
        row.id,
        row.fileName,
        row.hash,
        row.reused ? "reuse" : "new",
        `${row.bytes} bytes`,
        row.animations,
      ].join(" | "),
    );
  }
}
