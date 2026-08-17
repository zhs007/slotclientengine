export function assertPopupFilenameKey(value: string): string {
  if (!value || value.normalize("NFC") !== value)
    throw new Error("asset filename key 必须是非空 NFC 字符串");
  if (
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  )
    throw new Error("asset filename key 必须是单个 basename");
  if (
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  )
    throw new Error("asset filename key 不得包含控制字符");
  const dot = value.lastIndexOf(".");
  const extension = value.slice(dot + 1).toLocaleLowerCase("en-US");
  if (dot <= 0 || dot === value.length - 1 || !/^[a-z0-9]+$/u.test(extension))
    throw new Error("asset filename key 必须包含合法扩展名");
  return value;
}

export function assertPopupPackagePath(value: string): string {
  if (!value || value.includes("\0") || value.includes("\\"))
    throw new Error("package path 必须是非空 POSIX 路径");
  if (/^(?:\/|[A-Za-z]:|[A-Za-z][A-Za-z0-9+.-]*:)/u.test(value))
    throw new Error("package path 不得是绝对路径或 URL");
  if (/[?#]/u.test(value) || /%[0-9A-Fa-f]{2}/u.test(value))
    throw new Error("package path 不得包含 query、hash 或 percent escape");
  if (value.normalize("NFC") !== value || value !== value.toLowerCase())
    throw new Error("package path 必须使用 NFC lowercase");
  if (
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error("package path 包含非法 segment");
  return value;
}
