export function allocateSpineAtlasPageName(options: {
  readonly contentPath: string;
  readonly usedPageNames: Set<string>;
}): string {
  const match = /^assets\/([a-f0-9]{64})\.([a-z0-9]+)$/u.exec(
    options.contentPath,
  );
  if (!match) {
    throw new Error(
      `Spine texture 必须使用完整 SHA-256 hash-flat path：${options.contentPath}`,
    );
  }
  const digest = match[1]!;
  const extension = match[2]!;
  const canonicalName = `${digest}.${extension}`;
  if (!options.usedPageNames.has(canonicalName)) {
    options.usedPageNames.add(canonicalName);
    return canonicalName;
  }
  for (let occurrence = 2; Number.isSafeInteger(occurrence); occurrence += 1) {
    const alias = `${digest}-${occurrence}.${extension}`;
    if (options.usedPageNames.has(alias)) continue;
    options.usedPageNames.add(alias);
    return alias;
  }
  throw new Error(
    `Spine atlas page alias 数量超出 safe integer：${canonicalName}`,
  );
}
