import type {
  AudioAssetV1,
  AudioBgmFocusPolicyV1,
  AudioCatalogManifestV1,
  AudioCueV1,
  AudioEffectBindingV1,
  AudioEffectManifestV1,
  AudioEventTrackBindingV1,
  AudioMediaType,
  AudioMusicBindingV1,
  AudioSourceV1,
  CompiledAudioCueTable,
  CompiledAudioEffectRoute,
} from "./types.js";

const LOCAL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ROUTE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MEDIA_TYPES = new Set<AudioMediaType>([
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
]);

export function parseAudioEffectManifestV1(
  value: unknown,
): AudioEffectManifestV1 {
  const root = record(value, "audio effect manifest");
  keys(root, ["version", "effects"], "audio effect manifest");
  if (root.version !== 1) fail("audio effect manifest.version must be 1.");
  return freeze({ version: 1, effects: parseEffects(root.effects) });
}

export function parseAudioCatalogManifestV1(
  value: unknown,
): AudioCatalogManifestV1 {
  const root = record(value, "audio catalog manifest");
  keys(
    root,
    ["version", "effects", "music", "programmaticEffects"],
    "audio catalog manifest",
  );
  if (root.version !== 1) fail("audio catalog manifest.version must be 1.");
  const effects = parseEffects(root.effects);
  const music = array(root.music, "audio catalog music").map((item, index) =>
    parseAudioMusicBindingV1(item, `music[${index}]`),
  );
  unique(
    music.map(({ name }) => name),
    "audio music name",
  );
  const effectNames = new Set(effects.map(({ name }) => name));
  const programmaticEffects = array(
    root.programmaticEffects,
    "programmaticEffects",
  ).map((item, index) => localName(item, `programmaticEffects[${index}]`));
  unique(programmaticEffects, "programmatic effect");
  for (const name of programmaticEffects)
    if (!effectNames.has(name))
      fail(`programmatic effect is not declared: ${name}`);
  return freeze({ version: 1, effects, music, programmaticEffects });
}

export function parseAudioEffectBindingV1(
  value: unknown,
  label = "audio effect",
): AudioEffectBindingV1 {
  const item = record(value, label);
  keys(
    item,
    ["name", "asset", "playback", "offsetSeconds", "voices", "bgm"],
    label,
  );
  const playback = item.playback;
  if (playback !== "once" && playback !== "loop")
    fail(`${label}.playback must be once or loop.`);
  const voices = record(item.voices, `${label}.voices`);
  keys(voices, ["maxConcurrent", "overflow"], `${label}.voices`);
  const overflow = voices.overflow;
  if (overflow !== "reject" && overflow !== "restart-oldest")
    fail(`${label}.voices.overflow must be reject or restart-oldest.`);
  const maxConcurrent = positiveInteger(
    voices.maxConcurrent,
    `${label}.voices.maxConcurrent`,
  );
  if (playback === "loop" && maxConcurrent !== 1)
    fail(`${label}.voices.maxConcurrent must be 1 for loop playback.`);
  return freeze({
    name: localName(item.name, `${label}.name`),
    asset: parseAsset(item.asset, `${label}.asset`),
    playback,
    offsetSeconds: nonNegative(item.offsetSeconds, `${label}.offsetSeconds`),
    voices: { maxConcurrent, overflow },
    bgm: parseFocus(item.bgm, `${label}.bgm`),
  });
}

export function parseAudioMusicBindingV1(
  value: unknown,
  label = "audio music",
): AudioMusicBindingV1 {
  const item = record(value, label);
  keys(
    item,
    ["name", "asset", "loop", "fadeOutSeconds", "fadeInSeconds"],
    label,
  );
  if (item.loop !== true) fail(`${label}.loop must be true.`);
  return freeze({
    name: localName(item.name, `${label}.name`),
    asset: parseAsset(item.asset, `${label}.asset`),
    loop: true,
    fadeOutSeconds: positive(item.fadeOutSeconds, `${label}.fadeOutSeconds`),
    fadeInSeconds: positive(item.fadeInSeconds, `${label}.fadeInSeconds`),
  });
}

export function parseAudioEventTrackBindingV1(
  value: unknown,
  label = "audio event track",
): AudioEventTrackBindingV1 {
  const item = record(value, label);
  keys(
    item,
    ["name", "asset", "category", "playback", "voices", "focus"],
    label,
  );
  if (item.category !== "music" && item.category !== "effect")
    fail(`${label}.category must be music or effect.`);
  if (item.playback !== "once" && item.playback !== "loop")
    fail(`${label}.playback must be once or loop.`);
  const voices = record(item.voices, `${label}.voices`);
  keys(voices, ["maxConcurrent", "overflow"], `${label}.voices`);
  if (voices.overflow !== "reject" && voices.overflow !== "restart-oldest")
    fail(`${label}.voices.overflow must be reject or restart-oldest.`);
  const maxConcurrent = positiveInteger(
    voices.maxConcurrent,
    `${label}.voices.maxConcurrent`,
  );
  if (item.playback === "loop" && maxConcurrent !== 1)
    fail(`${label}.voices.maxConcurrent must be 1 for loop playback.`);
  const focus = record(item.focus, `${label}.focus`);
  known(focus, ["bgm", "effects"], `${label}.focus`);
  if (
    item.playback === "loop" &&
    (focus.bgm !== undefined || focus.effects !== undefined)
  )
    fail(`${label}.focus must be empty for loop playback.`);
  const bgm =
    focus.bgm !== undefined
      ? parseTargetGain(focus.bgm, `${label}.focus.bgm`)
      : undefined;
  let effects:
    | { readonly scope: "same-audio" | "all"; readonly targetGain: number }
    | undefined;
  if (focus.effects !== undefined) {
    const raw = record(focus.effects, `${label}.focus.effects`);
    keys(raw, ["scope", "targetGain"], `${label}.focus.effects`);
    if (raw.scope !== "same-audio" && raw.scope !== "all")
      fail(`${label}.focus.effects.scope must be same-audio or all.`);
    effects = {
      scope: raw.scope,
      targetGain: unitGain(raw.targetGain, `${label}.focus.effects.targetGain`),
    };
  }
  return freeze({
    name: localName(item.name, `${label}.name`),
    asset: parseAsset(item.asset, `${label}.asset`),
    category: item.category,
    playback: item.playback,
    voices: { maxConcurrent, overflow: voices.overflow },
    focus: {
      ...(bgm ? { bgm } : {}),
      ...(effects ? { effects } : {}),
    },
  });
}

function parseTargetGain(
  value: unknown,
  label: string,
): { readonly targetGain: number } {
  const item = record(value, label);
  keys(item, ["targetGain"], label);
  return freeze({
    targetGain: unitGain(item.targetGain, `${label}.targetGain`),
  });
}

function unitGain(value: unknown, label: string): number {
  const gain = finite(value, label);
  if (gain < 0 || gain > 1) fail(`${label} must be between 0 and 1.`);
  return gain;
}

export function collectAudioAssetPaths(
  value: AudioEffectManifestV1 | AudioCatalogManifestV1,
): readonly string[] {
  const paths = new Set<string>();
  for (const binding of [
    ...value.effects,
    ...(isCatalog(value) ? value.music : []),
  ])
    for (const source of binding.asset.sources) paths.add(source.path);
  return Object.freeze([...paths].sort((a, b) => a.localeCompare(b, "en")));
}

export function rewriteAudioAssetPaths<
  T extends AudioEffectManifestV1 | AudioCatalogManifestV1,
>(
  value: T,
  rewrite: ReadonlyMap<string, string> | ((path: string) => string),
): T {
  const replace =
    typeof rewrite === "function"
      ? rewrite
      : (path: string) => rewrite.get(path) ?? path;
  const effects = value.effects.map((effect) => ({
    ...effect,
    asset: {
      sources: effect.asset.sources.map((source) => ({
        ...source,
        path: replace(source.path),
      })),
    },
  }));
  if (!isCatalog(value))
    return parseAudioEffectManifestV1({ version: 1, effects }) as T;
  const music = value.music.map((binding) => ({
    ...binding,
    asset: {
      sources: binding.asset.sources.map((source) => ({
        ...source,
        path: replace(source.path),
      })),
    },
  }));
  return parseAudioCatalogManifestV1({ ...value, effects, music }) as T;
}

export function compileAudioCueTable(
  value: readonly AudioCueV1[],
): CompiledAudioCueTable {
  const ids = new Set<string>();
  const cues = value.map((cue, index) => {
    const item = record(cue, `audio cue[${index}]`);
    keys(item, ["id", "effect", "offsetSeconds"], `audio cue[${index}]`);
    const id = localName(item.id, `audio cue[${index}].id`);
    if (ids.has(id)) fail(`duplicate audio cue id: ${id}`);
    ids.add(id);
    return freeze({
      id,
      effect: localName(item.effect, `audio cue[${index}].effect`),
      offsetSeconds: nonNegative(
        item.offsetSeconds,
        `audio cue[${index}].offsetSeconds`,
      ),
    });
  });
  cues.sort(
    (a, b) =>
      a.offsetSeconds - b.offsetSeconds || a.id.localeCompare(b.id, "en"),
  );
  return freeze({ cues });
}

export function compileAudioEffectRoutes(
  owners: readonly {
    readonly owner: string;
    readonly effects: readonly AudioEffectBindingV1[];
  }[],
): readonly CompiledAudioEffectRoute[] {
  const routes = new Map<string, CompiledAudioEffectRoute>();
  for (const entry of owners) {
    const owner = routePath(entry.owner, "audio route owner");
    for (const effect of entry.effects) {
      const parsed = parseAudioEffectBindingV1(effect);
      const route = `${owner}.${parsed.name}`;
      if (routes.has(route)) fail(`duplicate audio effect route: ${route}`);
      routes.set(
        route,
        freeze({ route, owner, localName: parsed.name, effect: parsed }),
      );
    }
  }
  return Object.freeze(
    [...routes.values()].sort((a, b) => a.route.localeCompare(b.route, "en")),
  );
}

export function assertAudioRoute(value: unknown): string {
  return routePath(value, "audio effect route");
}

function parseEffects(value: unknown): readonly AudioEffectBindingV1[] {
  const effects = array(value, "audio effects").map((item, index) =>
    parseAudioEffectBindingV1(item, `effects[${index}]`),
  );
  unique(
    effects.map(({ name }) => name),
    "audio effect name",
  );
  return Object.freeze(effects);
}

function parseAsset(value: unknown, label: string): AudioAssetV1 {
  const asset = record(value, label);
  keys(asset, ["sources"], label);
  const sources = array(asset.sources, `${label}.sources`).map((item, index) =>
    parseSource(item, `${label}.sources[${index}]`),
  );
  if (sources.length === 0) fail(`${label}.sources must not be empty.`);
  unique(
    sources.map(({ mediaType }) => mediaType),
    `${label} media type`,
  );
  return freeze({ sources });
}

function parseSource(value: unknown, label: string): AudioSourceV1 {
  const source = record(value, label);
  keys(source, ["path", "mediaType"], label);
  const mediaType = source.mediaType as AudioMediaType;
  if (!MEDIA_TYPES.has(mediaType)) fail(`${label}.mediaType is unsupported.`);
  return freeze({ path: assetPath(source.path, `${label}.path`), mediaType });
}

function parseFocus(value: unknown, label: string): AudioBgmFocusPolicyV1 {
  const focus = record(value, label);
  if (focus.kind === "keep") {
    keys(focus, ["kind"], label);
    return freeze({ kind: "keep" });
  }
  if (focus.kind === "duck") {
    keys(
      focus,
      ["kind", "targetGain", "attackSeconds", "releaseSeconds"],
      label,
    );
    const targetGain = finite(focus.targetGain, `${label}.targetGain`);
    if (targetGain < 0 || targetGain > 1)
      fail(`${label}.targetGain must be between 0 and 1.`);
    return freeze({
      kind: "duck",
      targetGain,
      attackSeconds: nonNegative(focus.attackSeconds, `${label}.attackSeconds`),
      releaseSeconds: nonNegative(
        focus.releaseSeconds,
        `${label}.releaseSeconds`,
      ),
    });
  }
  if (focus.kind === "pause") {
    keys(focus, ["kind", "fadeOutSeconds", "fadeInSeconds"], label);
    return freeze({
      kind: "pause",
      fadeOutSeconds: nonNegative(
        focus.fadeOutSeconds,
        `${label}.fadeOutSeconds`,
      ),
      fadeInSeconds: nonNegative(focus.fadeInSeconds, `${label}.fadeInSeconds`),
    });
  }
  return fail(`${label}.kind must be keep, duck, or pause.`);
}

function isCatalog(
  value: AudioEffectManifestV1 | AudioCatalogManifestV1,
): value is AudioCatalogManifestV1 {
  return "music" in value;
}

function routePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    return fail(`${label} must be non-empty.`);
  const segments = value.split(".");
  if (segments.some((segment) => !ROUTE_SEGMENT.test(segment)))
    return fail(`${label} must contain lowercase kebab-case dot segments.`);
  return value;
}

function localName(value: unknown, label: string): string {
  if (typeof value !== "string" || !LOCAL_NAME.test(value))
    return fail(`${label} must be lowercase ASCII kebab-case.`);
  return value;
}

function assetPath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.split("/").some((x) => x === "" || x === "." || x === "..")
  )
    return fail(`${label} must be a safe non-empty path.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    return fail(`${label} must be a positive safe integer.`);
  return value as number;
}
function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) return fail(`${label} must be positive.`);
  return number;
}
function nonNegative(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0) return fail(`${label} must be non-negative.`);
  return number;
}
function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return fail(`${label} must be finite.`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) return fail(`${label} must be an array.`);
  return value;
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length)
    fail(`${label} contains unknown keys: ${extras.join(", ")}.`);
  for (const key of allowed)
    if (!Object.hasOwn(value, key)) fail(`${label}.${key} is required.`);
}
function known(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length)
    fail(`${label} contains unknown keys: ${extras.join(", ")}.`);
}
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}
function fail(message: string): never {
  throw new Error(message);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}
