import {
  parseSceneLayoutSlotTemplateConfig,
  type SceneLayoutSlotTemplateConfigV1,
  type SceneLayoutTemplateCredential,
} from "@slotclientengine/gameframeworks/scene-layout-template";

export interface GameViewerLaunchPayloadV1 {
  readonly kind: "game-viewer-launch";
  readonly version: 1;
  readonly nonce: string;
  readonly layoutSha256: string;
  readonly layoutZipBytes: Uint8Array;
  readonly config: SceneLayoutSlotTemplateConfigV1;
  readonly credential: SceneLayoutTemplateCredential;
}

export function parseGameViewerLaunchPayload(
  input: unknown,
  expectedNonce: string,
): GameViewerLaunchPayloadV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("启动 payload 必须是对象。");
  const record = input as Record<string, unknown>;
  const allowed = [
    "kind",
    "version",
    "nonce",
    "layoutSha256",
    "layoutZipBytes",
    "config",
    "credential",
  ];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`启动 payload.${unknown} 不受支持。`);
  if (record.kind !== "game-viewer-launch")
    throw new Error("启动 payload kind 无效。");
  if (record.version !== 1) throw new Error("启动 payload version 无效。");
  if (record.nonce !== expectedNonce)
    throw new Error("启动 payload nonce 不匹配。");
  if (
    typeof record.layoutSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.layoutSha256)
  )
    throw new Error("启动 payload layoutSha256 无效。");
  if (!(record.layoutZipBytes instanceof Uint8Array))
    throw new Error("启动 payload layoutZipBytes 必须是 Uint8Array。");
  const credential = parseCredential(record.credential);
  return Object.freeze({
    kind: "game-viewer-launch",
    version: 1,
    nonce: expectedNonce,
    layoutSha256: record.layoutSha256,
    layoutZipBytes: record.layoutZipBytes,
    config: parseSceneLayoutSlotTemplateConfig(record.config),
    credential,
  });
}

function parseCredential(value: unknown): SceneLayoutTemplateCredential {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("启动 credential 必须是对象。");
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find(
    (key) => key !== "token" && key !== "businessid",
  );
  if (unknown) throw new Error(`启动 credential.${unknown} 不受支持。`);
  const token = optionalString(record.token, "credential.token");
  const businessid = optionalString(record.businessid, "credential.businessid");
  return Object.freeze({
    ...(token ? { token } : {}),
    ...(businessid ? { businessid } : {}),
  });
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} 必须是非空字符串。`);
  return value.trim();
}
