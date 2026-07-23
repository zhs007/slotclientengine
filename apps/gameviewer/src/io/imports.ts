import {
  inspectSceneLayoutPackageInput,
  parseServerGameAuthoringSummary,
} from "@slotclientengine/gameframeworks/scene-layout-template";
import type {
  ImportedLayoutState,
  ImportedServerState,
} from "../model/store.js";

export async function importLayoutFile(
  file: File,
): Promise<ImportedLayoutState> {
  if (!file.name.toLowerCase().endsWith(".zip"))
    throw new Error("运行包必须是单个 .zip 文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const summary = await inspectSceneLayoutPackageInput({
    layoutZipBytes: bytes,
  });
  return Object.freeze({ fileName: file.name, bytes, summary });
}

export async function importServerAuthoringFile(
  file: File,
): Promise<ImportedServerState> {
  if (!file.name.toLowerCase().endsWith(".json"))
    throw new Error("服务器作者配置必须是单个 .json 文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`服务器作者配置 JSON 无效：${formatError(error)}`);
  }
  const [summary, sha256] = await Promise.all([
    Promise.resolve(parseServerGameAuthoringSummary(raw)),
    sha256Hex(bytes),
  ]);
  return Object.freeze({ fileName: file.name, sha256, summary });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("当前浏览器缺少 Web Crypto SHA-256。");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
