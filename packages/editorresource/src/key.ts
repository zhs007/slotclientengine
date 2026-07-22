export type EditorAssetKey = string;

export function assertEditorAssetKey(value: string): EditorAssetKey {
  if (typeof value !== "string" || value.length === 0)
    throw new Error("asset filename key 必须是非空字符串。");
  if (value.normalize("NFC") !== value)
    throw new Error(`asset filename key 必须使用 Unicode NFC：${value}`);
  if (value === "." || value === "..")
    throw new Error(`asset filename key 不得是 dot segment：${value}`);
  if (value.includes("/") || value.includes("\\"))
    throw new Error(`asset filename key 必须是单个 basename：${value}`);
  if (
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  )
    throw new Error(`asset filename key 不得包含控制字符：${value}`);
  if (!extensionOfEditorAssetKey(value))
    throw new Error(`asset filename key 必须包含扩展名：${value}`);
  return value;
}

export function editorAssetKeyCollisionToken(value: string): string {
  return assertEditorAssetKey(value)
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

export function assertUniqueEditorAssetKeys(
  keys: readonly string[],
): readonly EditorAssetKey[] {
  const seen = new Map<string, string>();
  return Object.freeze(
    keys.map((key) => {
      const valid = assertEditorAssetKey(key);
      const token = editorAssetKeyCollisionToken(valid);
      const previous = seen.get(token);
      if (previous !== undefined)
        throw new Error(`asset filename key collision：${previous} / ${valid}`);
      seen.set(token, valid);
      return valid;
    }),
  );
}

export function assertNoEditorAssetKeyAliases(keys: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const key of keys) {
    const valid = assertEditorAssetKey(key);
    const token = editorAssetKeyCollisionToken(valid);
    const previous = seen.get(token);
    if (previous !== undefined && previous !== valid)
      throw new Error(
        `asset filename key alias collision：${previous} / ${valid}`,
      );
    seen.set(token, valid);
  }
}

export function extensionOfEditorAssetKey(value: string): string {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return "";
  const extension = value.slice(dot + 1).toLocaleLowerCase("en-US");
  return /^[a-z0-9]+$/u.test(extension) ? extension : "";
}

export function canonicalExtensionOfEditorAssetKey(value: string): string {
  const extension = extensionOfEditorAssetKey(value);
  return extension === "jpeg" ? "jpg" : extension;
}

export function basenameFromSourcePath(path: string): EditorAssetKey {
  if (typeof path !== "string" || path.length === 0)
    throw new Error("source path 必须是非空字符串。");
  const segments = path.replace(/\\/gu, "/").split("/");
  return assertEditorAssetKey(segments.at(-1)!);
}
