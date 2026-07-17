import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DIST_ROOT = join(APP_ROOT, "dist");
const DIST_ASSETS = join(DIST_ROOT, "assets");
const SOURCE_ROOT = join(REPO_ROOT, "assets/game002-s3");
const INDEX_HTML = join(DIST_ROOT, "index.html");
const MANIFEST_PATH = join(SOURCE_ROOT, "symbol-state-textures.manifest.json");
const BACKGROUND_MANIFEST_PATH = join(SOURCE_ROOT, "background.manifest.json");
const REEL_MANIFEST_PATH = join(SOURCE_ROOT, "reel.manifest.json");
const BACKGROUND_PAGES = Object.freeze([
  "BG.png",
  "BG_2.png",
  "BG_3.png",
  "BG_4.png",
  "BG_5.png",
  "BG_6.png",
  "BG_7.png",
  "BG_8.png",
]);
const SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
]);
const SPINE_SYMBOLS = Object.freeze(
  SYMBOLS.filter((symbol) => symbol !== "CN"),
);
const EXCLUDED_RESOURCE_PREFIXES = Object.freeze(["Nearwin3", "WM_Fx"]);
const REEL_EFFECTS = Object.freeze([
  {
    id: "anticipation",
    skeleton: "Nearwin1.json",
    duration: 0.6666667,
    loopCount: 3,
  },
  {
    id: "refillSweep",
    skeleton: "Nearwin2.json",
    duration: 0.4,
    loopCount: 1,
  },
]);
const OLD_SOURCE_DIRECTORIES = Object.freeze([
  ["assets", "symbols" + "001", ""].join("/"),
  ["assets", "symbols" + "002", ""].join("/"),
  ["assets", "symbols" + "003", ""].join("/"),
  ["assets", "game002" + "-s1", ""].join("/"),
  ["assets", "game002" + "-s2", ""].join("/"),
  ["assets", "game003" + "-s1", ""].join("/"),
]);
const SENSITIVE_VALUES = Object.freeze([
  ["VITE", "GAME002"].join("_"),
  ["7a82f5ca", "45b5aa32", "46b2ad01", "23272295"].join(""),
  ["065P8N", "OEgwd", "SXFTB6uDqX"].join(""),
]);
const failures = [];

verify();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`game002 static dist check failed: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("game002 static dist check passed.");
}

function verify() {
  assertFile(INDEX_HTML);
  assertDirectory(DIST_ASSETS);
  if (!existsSync(INDEX_HTML) || !existsSync(DIST_ASSETS)) {
    return;
  }

  const assetNames = readdirSync(DIST_ASSETS).sort();
  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  const bundledJavaScript = assetNames
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(DIST_ASSETS, name), "utf8"))
    .join("\n");

  verifyIndexHtml(indexHtml);
  verifySourceContract();
  verifyDistAssets(assetNames, bundledJavaScript);
  verifySensitiveValues(listFiles(DIST_ROOT));
}

function verifyIndexHtml(indexHtml) {
  if (indexHtml.includes("/src/main.ts")) {
    failures.push("dist/index.html still references /src/main.ts.");
  }
  const refs = [...indexHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const builtRefs = refs.filter((ref) => /\.(?:js|css)(?:$|\?)/.test(ref));
  if (!builtRefs.some((ref) => /^\.\/assets\/index-.+\.js$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.js.");
  }
  if (!builtRefs.some((ref) => /^\.\/assets\/index-.+\.css$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.css.");
  }
  for (const ref of builtRefs) {
    if (!ref.startsWith("./assets/")) {
      failures.push(`dist/index.html asset URL must be relative: ${ref}.`);
    }
  }
}

function verifySourceContract() {
  assertAbsent(join(SOURCE_ROOT, "bg.jpg"));
  assertFile(BACKGROUND_MANIFEST_PATH);
  assertFile(REEL_MANIFEST_PATH);
  assertFile(join(SOURCE_ROOT, "BG.json"));
  assertFile(join(SOURCE_ROOT, "BG.atlas"));
  for (const page of BACKGROUND_PAGES) {
    assertFile(join(SOURCE_ROOT, page));
  }
  verifyBackgroundSourceContract();
  verifyReelSourceContract();
  assertFile(MANIFEST_PATH);
  assertFile(join(SOURCE_ROOT, "Symbol.atlas"));
  assertFile(join(SOURCE_ROOT, "Symbol.png"));
  if (!existsSync(MANIFEST_PATH)) {
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const additionalStates = manifest.settings?.additionalStateDefinitions;
  if (
    JSON.stringify(additionalStates) !==
    JSON.stringify([
      { id: "winStart", phase: "once", playback: "once" },
      { id: "winLoop", phase: "stable", playback: "loop" },
      { id: "collect", phase: "once", playback: "once" },
    ])
  ) {
    failures.push(
      "source manifest additional state definitions must declare the exact task 96 choreography states.",
    );
  }
  const manifestSymbols = Object.keys(manifest.symbols ?? {});
  if (JSON.stringify(manifestSymbols) !== JSON.stringify(SYMBOLS)) {
    failures.push(
      `source manifest symbol order must be ${SYMBOLS.join(",")}, got ${manifestSymbols.join(",")}.`,
    );
  }
  for (const symbol of SYMBOLS) {
    const entry = manifest.symbols?.[symbol];
    if (!entry) {
      failures.push(`source manifest is missing ${symbol}.`);
      continue;
    }
    if (entry.scale !== 1) {
      failures.push(`source manifest ${symbol} scale must be 1.`);
    }
    if (
      entry.animations?.win &&
      (entry.cascadeWinPresentation?.order !== 0 ||
        entry.cascadeWinPresentation?.playback?.mode !== "group" ||
        entry.cascadeWinPresentation?.playback?.winState !== "win" ||
        entry.cascadeWinPresentation?.playback?.removeState !== "remove" ||
        entry.cascadeWinPresentation?.summary?.mode !== "groupAmount")
    ) {
      failures.push(
        `source manifest ${symbol}.cascadeWinPresentation must declare ordinary group playback.`,
      );
    }
    const valuePresentation = entry.valuePresentation;
    if (valuePresentation) {
      for (const field of ["normal", "spinBlur", "disabled"]) {
        if (Object.prototype.hasOwnProperty.call(entry, field)) {
          failures.push(
            `source manifest ${symbol} must not declare top-level ${field}.`,
          );
        }
      }
      const defaults = valuePresentation.defaultValues;
      if (
        !Array.isArray(defaults) ||
        defaults.length === 0 ||
        defaults.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
        new Set(defaults).size !== defaults.length
      ) {
        failures.push(
          `source manifest ${symbol}.valuePresentation.defaultValues must be unique positive safe integers.`,
        );
      }
      for (const state of [
        "appear",
        "winStart",
        "winLoop",
        "collect",
        "remove",
        "dropdown",
      ]) {
        const animation = entry.animations?.[state];
        const expectedNames = {
          appear: "Start",
          winStart: "Win_Start",
          winLoop: "Win",
          collect: "Collect",
          remove: "End",
          dropdown: "Loop",
        };
        if (
          animation?.kind !== "activeSpine" ||
          animation.playback?.mode !== "animation" ||
          animation.playback.animationName !== expectedNames[state] ||
          animation.playback.loop !==
            (state === "dropdown" || state === "winLoop")
        ) {
          failures.push(
            `source manifest ${symbol}.animations.${state} must be a valid activeSpine animation.`,
          );
        }
      }
      if (entry.animations?.win !== undefined) {
        failures.push(
          `source manifest ${symbol} must not retain the old ordinary win animation.`,
        );
      }
      if (
        entry.cascadeWinPresentation?.order !== 1 ||
        entry.cascadeWinPresentation?.playback?.mode !== "sequentialCollect" ||
        entry.cascadeWinPresentation?.playback?.startState !== "winStart" ||
        entry.cascadeWinPresentation?.playback?.loopState !== "winLoop" ||
        entry.cascadeWinPresentation?.playback?.collectState !== "collect" ||
        entry.cascadeWinPresentation?.playback?.removeState !== "remove" ||
        entry.cascadeWinPresentation?.summary?.mode !== "itemAmount"
      ) {
        failures.push(
          `source manifest ${symbol}.cascadeWinPresentation must declare sequential item collection.`,
        );
      }
      const normal = valuePresentation.reelStates?.normal;
      if (
        normal?.kind !== "transparent" ||
        !Number.isFinite(normal.width) ||
        normal.width <= 0 ||
        !Number.isFinite(normal.height) ||
        normal.height <= 0
      ) {
        failures.push(
          `source manifest ${symbol}.valuePresentation.reelStates.normal must be transparent.`,
        );
      }
      const text = valuePresentation.text;
      if (
        text?.type !== "image" ||
        text.slot !== "Num" ||
        text.prefix !== "./"
      ) {
        failures.push(
          `source manifest ${symbol}.valuePresentation.text must use image type, Num slot and ./ prefix.`,
        );
      }
      for (const value of defaults ?? []) {
        assertFile(join(SOURCE_ROOT, `${value}.png`));
      }
    }
    for (const [state, suffix] of [
      ["normal", ""],
      ["spinBlur", ".spinBlur"],
      ["disabled", ".disabled"],
    ]) {
      if (valuePresentation && state === "normal") continue;
      const configuredPath = valuePresentation
        ? valuePresentation.reelStates?.[state]
        : entry[state];
      const expectedPath = `./${symbol}${suffix}.png`;
      if (configuredPath !== expectedPath) {
        failures.push(
          `source manifest ${symbol}.${state} must be ${expectedPath}.`,
        );
      }
      assertFile(join(SOURCE_ROOT, `${symbol}${suffix}.png`));
    }
  }
  for (const symbol of SPINE_SYMBOLS) {
    const skeletonPath = join(SOURCE_ROOT, `${symbol}.json`);
    assertFile(skeletonPath);
    if (!existsSync(skeletonPath)) {
      continue;
    }
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
      failures.push(`${symbol}.json must declare Spine 4.3.x.`);
    }
  }
  for (const resource of readValuePresentationResources(manifest)) {
    assertFile(join(SOURCE_ROOT, resource.skeleton.slice(2)));
    assertFile(join(SOURCE_ROOT, resource.atlas.slice(2)));
    assertFile(join(SOURCE_ROOT, resource.texture.slice(2)));
    const skeletonPath = join(SOURCE_ROOT, resource.skeleton.slice(2));
    if (existsSync(skeletonPath)) {
      const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
      if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
        failures.push(`${resource.skeleton} must declare Spine 4.3.x.`);
      }
      for (const animationName of resource.animationNames) {
        if (!skeleton.animations?.[animationName]) {
          failures.push(
            `${resource.skeleton} is missing configured animation ${animationName}.`,
          );
        }
      }
    }
  }
  for (const entry of Object.values(manifest.symbols ?? {})) {
    const presentation = entry.valuePresentation;
    if (presentation?.text?.type !== "image") continue;
    for (const value of presentation.defaultValues ?? []) {
      assertFile(
        join(SOURCE_ROOT, `${presentation.text.prefix.slice(2)}${value}.png`),
      );
    }
  }
  const atlasFirstLine = readFileSync(join(SOURCE_ROOT, "Symbol.atlas"), "utf8")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (atlasFirstLine !== "Symbol.png") {
    failures.push(
      `Symbol.atlas page must be Symbol.png, got ${atlasFirstLine}.`,
    );
  }
}

function verifyReelSourceContract() {
  if (!existsSync(REEL_MANIFEST_PATH)) {
    return;
  }
  const manifest = JSON.parse(readFileSync(REEL_MANIFEST_PATH, "utf8"));
  if (manifest.version !== 1) {
    failures.push("reel manifest must declare version=1.");
  }
  if (
    manifest.spin?.bounceStrength !== 0 ||
    manifest.spin?.dimmingAlpha !== 0.5 ||
    JSON.stringify(manifest.spin?.timing) !==
      JSON.stringify({
        startStepMs: 16,
        stopStepMs: 16,
        settleAfterLastStartMs: 180,
        minimumSpinCycles: 6,
        speedSymbolsPerSecond: 54,
      }) ||
    JSON.stringify(manifest.spin?.anticipation) !==
      JSON.stringify({
        effect: "anticipation",
        triggerLandedCount: 2,
        firstFollowingStopDelayMs: 2000.0001,
        stopStepMs: 240,
      })
  ) {
    failures.push(
      "reel manifest spin motion/timing/activation contract changed.",
    );
  }
  for (const effect of REEL_EFFECTS) {
    const entry = manifest.spin?.cellEffects?.[effect.id];
    if (
      entry?.skeleton !== `./${effect.skeleton}` ||
      entry.atlas !== "./Symbol.atlas" ||
      entry.texture !== "./Symbol.png" ||
      entry.animation !== "Loop" ||
      entry.loopCount !== effect.loopCount ||
      entry.finishBeforeStopMs !== 0 ||
      JSON.stringify(entry.transform) !==
        JSON.stringify({ x: 0, y: 0, scale: 1 })
    ) {
      failures.push(`reel manifest ${effect.id} effect contract changed.`);
    }
    const skeletonPath = join(SOURCE_ROOT, effect.skeleton);
    assertFile(skeletonPath);
    if (!existsSync(skeletonPath)) continue;
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
      failures.push(`${effect.skeleton} must declare Spine 4.3.x.`);
    }
    if (JSON.stringify(Object.keys(skeleton.animations ?? {})) !== '["Loop"]') {
      failures.push(
        `${effect.skeleton} must contain exact Loop animation only.`,
      );
    }
    const duration = readSpineAnimationDuration(skeleton.animations?.Loop);
    if (Math.abs(duration - effect.duration) > 1e-6) {
      failures.push(
        `${effect.skeleton} Loop duration must be ${effect.duration}, got ${duration}.`,
      );
    }
  }
  if (
    JSON.stringify(manifest.cascade?.anticipationRefill) !==
    JSON.stringify({
      sweep: {
        effect: "refillSweep",
        loopCount: 1,
        startStepMs: 80,
        order: "left-right-bottom-up",
      },
      spin: {
        effect: "anticipation",
        order: "left-right-top-down",
        startStepMs: 16,
        stopStepMs: 240,
        settleAfterLastStartMs: 2000.0001,
        minimumSpinCycles: 6,
        speedSymbolsPerSecond: 54,
      },
    })
  ) {
    failures.push("reel manifest anticipation refill contract changed.");
  }
}

function verifyBackgroundSourceContract() {
  if (!existsSync(BACKGROUND_MANIFEST_PATH)) {
    return;
  }
  const manifest = JSON.parse(readFileSync(BACKGROUND_MANIFEST_PATH, "utf8"));
  if (manifest.version !== 1 || manifest.kind !== "spine") {
    failures.push("background manifest must declare version=1 and kind=spine.");
  }
  if (
    manifest.artSize?.width !== 2000 ||
    manifest.artSize?.height !== 2000 ||
    JSON.stringify(manifest.adaptation) !==
      JSON.stringify({
        mode: "maximized-focus",
        focusRect: { x: 580, y: 277, width: 840, height: 1200 },
      })
  ) {
    failures.push("background manifest art/focus contract changed.");
  }
  if (
    manifest.resource?.skeleton !== "./BG.json" ||
    manifest.resource?.atlas !== "./BG.atlas" ||
    JSON.stringify(manifest.resource?.transform) !==
      JSON.stringify({ x: 1000, y: 1000, scale: 1 })
  ) {
    failures.push("background manifest resource/transform contract changed.");
  }
  if (
    JSON.stringify(Object.keys(manifest.resource?.textures ?? {})) !==
    JSON.stringify(BACKGROUND_PAGES)
  ) {
    failures.push("background manifest texture page closure changed.");
  }
  for (const page of BACKGROUND_PAGES) {
    if (manifest.resource?.textures?.[page] !== `./${page}`) {
      failures.push(`background manifest texture ${page} path is invalid.`);
    }
  }
  if (
    manifest.initialState !== "BaseGame" ||
    JSON.stringify(manifest.states) !==
      JSON.stringify({
        BaseGame: { animation: "BG" },
        FreeGame: { animation: "FG" },
      }) ||
    JSON.stringify(manifest.transitions) !==
      JSON.stringify([
        { from: "BaseGame", to: "FreeGame", animation: "BG_FG" },
        { from: "FreeGame", to: "BaseGame", animation: "FG_BG" },
      ])
  ) {
    failures.push("background manifest state/transition contract changed.");
  }
  const skeleton = JSON.parse(
    readFileSync(join(SOURCE_ROOT, "BG.json"), "utf8"),
  );
  if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
    failures.push("BG.json must declare Spine 4.3.x.");
  }
  for (const animation of ["BG", "FG", "BG_FG", "FG_BG"]) {
    if (!skeleton.animations?.[animation]) {
      failures.push(`BG.json is missing animation ${animation}.`);
    }
  }
  const atlasPages = readAtlasPages(
    readFileSync(join(SOURCE_ROOT, "BG.atlas"), "utf8"),
  );
  if (JSON.stringify(atlasPages) !== JSON.stringify(BACKGROUND_PAGES)) {
    failures.push(
      `BG.atlas pages must be ${BACKGROUND_PAGES.join(",")}, got ${atlasPages.join(",")}.`,
    );
  }
}

function verifyDistAssets(assetNames, bundledJavaScript) {
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.js$/, "index JS");
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.css$/, "index CSS");
  assertOne(
    assetNames,
    /^background\.manifest-[A-Za-z0-9_-]+\.json$/,
    "background manifest",
  );
  assertOne(
    assetNames,
    /^reel\.manifest-[A-Za-z0-9_-]+\.json$/,
    "reel manifest",
  );
  assertOne(assetNames, /^BG-[A-Za-z0-9_-]+\.json$/, "background skeleton");
  assertOne(assetNames, /^BG-[A-Za-z0-9_-]+\.atlas$/, "background atlas");
  assertOne(assetNames, /^Symbol-[A-Za-z0-9_-]+\.atlas$/, "Spine atlas");
  assertOne(assetNames, /^Symbol-[A-Za-z0-9_-]+\.png$/, "Spine texture");
  assertOne(
    assetNames,
    /^symbol-state-textures\.manifest-[A-Za-z0-9_-]+\.json$/,
    "symbol manifest",
  );

  const backgroundPageGroups = new Map();
  for (const page of BACKGROUND_PAGES) {
    const sourceFile = join(SOURCE_ROOT, page);
    const contentKey = readFileSync(sourceFile).toString("base64");
    const pages = backgroundPageGroups.get(contentKey) ?? [];
    pages.push(page);
    backgroundPageGroups.set(contentKey, pages);
  }
  for (const pages of backgroundPageGroups.values()) {
    const stems = pages.map((page) => page.slice(0, -".png".length));
    assertOne(
      assetNames,
      new RegExp(
        `^(?:${stems.map(escapeRegExp).join("|")})-[A-Za-z0-9_-]+\\.png$`,
      ),
      `background atlas page content ${pages.join("/")}`,
    );
    assertDistContainsSourceAssetExactlyOnce(
      assetNames,
      join(SOURCE_ROOT, pages[0]),
    );
  }
  assertDistContainsSourceAsset(assetNames, BACKGROUND_MANIFEST_PATH);
  assertDistContainsSourceAsset(assetNames, REEL_MANIFEST_PATH);
  assertDistContainsSourceAsset(assetNames, join(SOURCE_ROOT, "BG.json"));
  assertDistContainsSourceAsset(assetNames, join(SOURCE_ROOT, "BG.atlas"));
  if (assetNames.some((name) => /^bg-[A-Za-z0-9_-]+\.jpg$/.test(name))) {
    failures.push("dist must not contain the removed bg.jpg background.");
  }
  if (bundledJavaScript.includes("bg.jpg")) {
    failures.push("bundle must not reference the removed bg.jpg background.");
  }
  if (!bundledJavaScript.includes("spineAtlasPage=")) {
    failures.push(
      "bundle must disambiguate identical atlas-page bytes with logical page query URLs.",
    );
  }
  assertOne(
    assetNames,
    /^win-amount\.manifest-[A-Za-z0-9_-]+\.json$/,
    "win-amount manifest",
  );

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  for (const symbol of SYMBOLS) {
    const valuePresentation = manifest.symbols?.[symbol]?.valuePresentation;
    if (valuePresentation) {
      assertNone(
        assetNames,
        hashedAssetPattern(symbol, "png"),
        `${symbol} top-level normal PNG`,
      );
      for (const state of ["spinBlur", "disabled"]) {
        const statePath = valuePresentation.reelStates?.[state];
        if (statePath !== `./${symbol}.${state}.png`) {
          failures.push(
            `${symbol}.valuePresentation.reelStates.${state} must be ./${symbol}.${state}.png.`,
          );
        }
      }
    } else {
      assertOne(
        assetNames,
        hashedAssetPattern(symbol, "png"),
        `${symbol} normal PNG`,
      );
    }
    assertOne(
      assetNames,
      hashedAssetPattern(`${symbol}.spinBlur`, "png"),
      `${symbol} spinBlur PNG`,
    );
    assertOne(
      assetNames,
      hashedAssetPattern(`${symbol}.disabled`, "png"),
      `${symbol} disabled PNG`,
    );
  }
  for (const symbol of SPINE_SYMBOLS) {
    assertOne(
      assetNames,
      hashedAssetPattern(symbol, "json"),
      `${symbol} skeleton`,
    );
  }
  for (const effect of REEL_EFFECTS) {
    const stem = effect.skeleton.slice(0, -".json".length);
    assertOne(
      assetNames,
      hashedAssetPattern(stem, "json"),
      `${effect.id} reel-effect skeleton`,
    );
    assertDistContainsSourceAssetExactlyOnce(
      assetNames,
      join(SOURCE_ROOT, effect.skeleton),
    );
  }
  for (const resource of readValuePresentationResources(manifest)) {
    assertOne(
      assetNames,
      hashedAssetPattern(resource.skeleton.slice(2, -".json".length), "json"),
      `${resource.skeleton} value-presentation skeleton`,
    );
    assertDistContainsSourceAsset(
      assetNames,
      join(SOURCE_ROOT, resource.skeleton.slice(2)),
    );
    assertDistContainsSourceAsset(
      assetNames,
      join(SOURCE_ROOT, resource.atlas.slice(2)),
    );
    assertDistContainsSourceAsset(
      assetNames,
      join(SOURCE_ROOT, resource.texture.slice(2)),
    );
    const skeleton = JSON.parse(
      readFileSync(join(SOURCE_ROOT, resource.skeleton.slice(2)), "utf8"),
    );
    if (!(skeleton.slots ?? []).some((slot) => slot.name === resource.slot)) {
      failures.push(
        `${resource.skeleton} is missing configured value text slot ${resource.slot}.`,
      );
    }
  }
  for (const entry of Object.values(manifest.symbols ?? {})) {
    const presentation = entry.valuePresentation;
    if (presentation?.text?.type !== "image") continue;
    for (const value of presentation.defaultValues ?? []) {
      assertDistContainsSourceAsset(
        assetNames,
        join(SOURCE_ROOT, `${presentation.text.prefix.slice(2)}${value}.png`),
      );
    }
  }
  for (const project of ["bigwin", "superwin", "megawin"]) {
    assertOne(
      assetNames,
      hashedAssetPattern(project, "json"),
      `${project} project`,
    );
  }
  for (const assetName of readWinAmountAssetNames()) {
    assertDistContainsSourceAsset(
      assetNames,
      join(SOURCE_ROOT, "win-amount/assets", assetName),
    );
  }

  if (!bundledJavaScript.includes("../../../assets/game002-s3/")) {
    failures.push("bundle does not reference assets/game002-s3.");
  }
  for (const oldDirectory of OLD_SOURCE_DIRECTORIES) {
    if (bundledJavaScript.includes(oldDirectory)) {
      failures.push(
        `bundle still references old source directory ${oldDirectory}.`,
      );
    }
  }
  for (const excluded of EXCLUDED_RESOURCE_PREFIXES) {
    if (assetNames.some((name) => name.startsWith(`${excluded}-`))) {
      failures.push(
        `dist unexpectedly contains excluded resource ${excluded}.`,
      );
    }
  }
}

function readValuePresentationResources(manifest) {
  const resources = [];
  const seen = new Set();
  for (const [symbol, entry] of Object.entries(manifest.symbols ?? {})) {
    const slot = entry.valuePresentation?.text?.slot;
    const activeSpineAnimationNames = Object.values(entry.animations ?? {})
      .filter((animation) => animation?.kind === "activeSpine")
      .map((animation) => animation.playback?.animationName);
    if (entry.valuePresentation && (!slot || typeof slot !== "string")) {
      failures.push(
        `${symbol}.valuePresentation.text.slot must be configured.`,
      );
    }
    for (const [index, tier] of (
      entry.valuePresentation?.tiers ?? []
    ).entries()) {
      const animation = tier.animation;
      if (
        animation?.kind !== "spine" ||
        animation.playback?.mode !== "animation" ||
        animation.playback?.loop !== true
      ) {
        failures.push(
          `${symbol}.valuePresentation.tiers[${index}] must use a looping Spine animation.`,
        );
        continue;
      }
      const resource = {
        skeleton: animation.skeleton,
        atlas: animation.atlas,
        texture: animation.texture,
        animationNames: [
          animation.playback.animationName,
          ...activeSpineAnimationNames,
        ],
        slot,
      };
      const key = JSON.stringify(resource);
      if (!seen.has(key)) {
        seen.add(key);
        resources.push(resource);
      }
    }
  }
  return resources;
}

function readWinAmountAssetNames() {
  const names = new Set();
  for (const project of ["bigwin", "superwin", "megawin"]) {
    const data = JSON.parse(
      readFileSync(join(SOURCE_ROOT, `win-amount/${project}.json`), "utf8"),
    );
    for (const asset of data.assets ?? []) {
      const filename = asset.path?.split("/").at(-1);
      if (!filename) {
        failures.push(`${project}.json contains an invalid asset path.`);
        continue;
      }
      names.add(filename);
    }
  }
  return [...names].sort();
}

function hashedAssetPattern(stem, extension) {
  return new RegExp(
    `^${escapeRegExp(stem)}-[A-Za-z0-9_-]+\\.${escapeRegExp(extension)}$`,
  );
}

function assertOne(names, pattern, label) {
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    failures.push(
      `dist/assets must contain exactly one ${label}, got ${matches.length}.`,
    );
  }
}

function assertNone(names, pattern, label) {
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length !== 0) {
    failures.push(
      `dist/assets must not contain ${label}, got ${matches.length}.`,
    );
  }
}

function assertDistContainsSourceAsset(assetNames, sourceFile) {
  assertFile(sourceFile);
  if (!existsSync(sourceFile)) {
    return;
  }
  const sourceBytes = readFileSync(sourceFile);
  const extension = sourceFile.split(".").at(-1);
  const matchingContent = assetNames.some((name) => {
    if (!name.endsWith(`.${extension}`)) {
      return false;
    }
    return readFileSync(join(DIST_ASSETS, name)).equals(sourceBytes);
  });
  if (!matchingContent) {
    failures.push(
      `dist/assets is missing source asset content for ${relative(SOURCE_ROOT, sourceFile)}.`,
    );
  }
}

function assertDistContainsSourceAssetExactlyOnce(assetNames, sourceFile) {
  assertFile(sourceFile);
  if (!existsSync(sourceFile)) {
    return;
  }
  const sourceBytes = readFileSync(sourceFile);
  const extension = sourceFile.split(".").at(-1);
  const matches = assetNames.filter(
    (name) =>
      name.endsWith(`.${extension}`) &&
      readFileSync(join(DIST_ASSETS, name)).equals(sourceBytes),
  );
  if (matches.length !== 1) {
    failures.push(
      `dist/assets must contain source asset content exactly once for ${relative(SOURCE_ROOT, sourceFile)}, got ${matches.length}.`,
    );
  }
}

function verifySensitiveValues(files) {
  for (const file of files) {
    const content = readFileSync(file);
    for (const value of SENSITIVE_VALUES) {
      if (content.includes(Buffer.from(value))) {
        failures.push(
          `${relative(APP_ROOT, file)} contains a forbidden default value.`,
        );
      }
    }
  }
}

function assertFile(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    failures.push(`${relative(APP_ROOT, file)} is missing.`);
  }
}

function assertAbsent(file) {
  if (existsSync(file)) {
    failures.push(`${relative(APP_ROOT, file)} must not exist.`);
  }
}

function assertDirectory(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    failures.push(`${relative(APP_ROOT, directory)} is missing.`);
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry);
    if (statSync(file).isDirectory()) {
      files.push(...listFiles(file));
    } else {
      files.push(file);
    }
  }
  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readAtlasPages(atlasText) {
  return [...atlasText.matchAll(/^([^\s].*\.png)\r?$/gmu)].map(
    (match) => match[1],
  );
}

function readSpineAnimationDuration(value) {
  let maximum = 0;
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    if (typeof candidate.time === "number") {
      maximum = Math.max(maximum, candidate.time);
    }
    for (const child of Object.values(candidate)) visit(child);
  };
  visit(value);
  return maximum;
}
