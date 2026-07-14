import { Container, Text } from "pixi.js";
import {
  createOfficialSpinePlayer,
  validateOfficialSpineResource,
  type RendercoreSpineSlotPlayer,
} from "../spine/runtime-player.js";
import { SymbolAssetError } from "../symbol/errors.js";
import {
  parseSymbolStateTextureManifest,
  type ParseSymbolStateTextureManifestOptions,
} from "../symbol/manifest.js";
import type {
  PreparedSymbolValuePresentation,
  SymbolValueGeometryTarget,
  SymbolValuePresentationItem,
  SymbolValuePresentationResourceMap,
  SymbolValuePresentationSnapshot,
  SymbolValuePresentationTierResource,
  SymbolValuePresenter,
} from "./types.js";

export interface CreateSymbolValuePresentationResourcesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly spineSkeletonModules: Readonly<Record<string, unknown>>;
  readonly spineAtlasModules: Readonly<Record<string, string>>;
  readonly spineTextureModules: Readonly<Record<string, string>>;
}

export interface SymbolValuePresentationPlayer extends RendercoreSpineSlotPlayer {}

export type SymbolValuePresentationPlayerFactory = (options: {
  readonly resource: SymbolValuePresentationTierResource;
}) => SymbolValuePresentationPlayer;

export interface CreateSymbolValuePresenterOptions {
  readonly target: SymbolValueGeometryTarget;
  readonly resources: SymbolValuePresentationResourceMap;
  readonly playerFactory?: SymbolValuePresentationPlayerFactory;
}

export function createSymbolValuePresentationResourcesFromManifest(
  options: CreateSymbolValuePresentationResourcesOptions,
): SymbolValuePresentationResourceMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const skeletons = createModuleMap(options.spineSkeletonModules, "skeleton");
  const atlases = createModuleMap(options.spineAtlasModules, "atlas");
  const textures = createModuleMap(options.spineTextureModules, "texture");
  const resources = Object.entries(manifest.symbols).flatMap(
    ([symbol, manifestSymbol]) => {
      const presentation = manifestSymbol.valuePresentation;
      if (!presentation) return [];
      const tiers = presentation.tiers.map((tier, index) => {
        const skeleton = requireModule(
          skeletons,
          tier.animation.skeleton,
          `${symbol} value tier ${index} skeleton`,
        );
        const atlasText = requireStringModule(
          atlases,
          tier.animation.atlas,
          `${symbol} value tier ${index} atlas`,
        );
        const textureUrl = requireStringModule(
          textures,
          tier.animation.texture,
          `${symbol} value tier ${index} texture`,
        );
        const atlasPage = getBaseName(tier.animation.texture);
        try {
          validateOfficialSpineResource({
            resource: {
              skeleton,
              atlasText,
              textureUrls: { [atlasPage]: textureUrl },
            },
            requiredAnimations: [tier.animation.playback.animationName],
            requiredSlots: [presentation.text.slot],
          });
        } catch (error) {
          throw new SymbolAssetError(
            `Symbol "${symbol}" value tier ${index} Spine resource is invalid: ${formatError(error)}.`,
          );
        }
        return Object.freeze({
          ...(tier.maxExclusive === undefined
            ? {}
            : { maxExclusive: tier.maxExclusive }),
          spec: tier.animation,
          skeleton,
          atlasText,
          textureUrl,
          atlasPage,
        });
      });
      return [
        [
          symbol,
          Object.freeze({
            symbol,
            defaultValues: presentation.defaultValues,
            tiers: Object.freeze(tiers),
            text: presentation.text,
          }),
        ] as const,
      ];
    },
  );
  return Object.freeze(Object.fromEntries(resources));
}

export function createSymbolValuePresenter(
  options: CreateSymbolValuePresenterOptions,
): SymbolValuePresenter {
  return new SymbolValuePresenterModel(options);
}

interface PreparedEntry {
  readonly item: SymbolValuePresentationItem;
  readonly tierIndex: number;
  readonly resource: SymbolValuePresentationTierResource;
  readonly player: SymbolValuePresentationPlayer;
}

interface PreparedInternal {
  readonly entries: readonly PreparedEntry[];
  consumed: boolean;
}

interface ActiveEntry {
  readonly prepared: PreparedEntry;
  readonly label: Text;
}

class SymbolValuePresenterModel implements SymbolValuePresenter {
  readonly container = new Container();
  readonly #target: SymbolValueGeometryTarget;
  readonly #resources: SymbolValuePresentationResourceMap;
  readonly #playerFactory: SymbolValuePresentationPlayerFactory;
  readonly #prepared = new WeakMap<
    PreparedSymbolValuePresentation,
    PreparedInternal
  >();
  readonly #unconsumedPrepared = new Set<PreparedInternal>();
  #active: readonly ActiveEntry[] = [];
  #snapshotItems: SymbolValuePresentationSnapshot["items"] = [];
  #phase: SymbolValuePresentationSnapshot["phase"] = "idle";
  #prepareVersion = 0;

  constructor(options: CreateSymbolValuePresenterOptions) {
    this.#target = options.target;
    this.#resources = options.resources;
    this.#playerFactory = options.playerFactory ?? createDefaultPlayer;
  }

  async prepare(
    items: readonly SymbolValuePresentationItem[],
  ): Promise<PreparedSymbolValuePresentation> {
    this.assertNotDestroyed();
    if (this.#phase === "preparing") {
      throw new Error("Symbol value presenter is already preparing.");
    }
    const version = ++this.#prepareVersion;
    this.#phase = "preparing";
    const normalized = normalizeItems(items);
    const entries: PreparedEntry[] = [];
    try {
      for (const item of normalized) {
        const presentation = this.#resources[item.symbol];
        if (!presentation) {
          throw new Error(
            `Symbol "${item.symbol}" has no valuePresentation resources.`,
          );
        }
        const tierIndex = presentation.tiers.findIndex(
          (tier) =>
            tier.maxExclusive === undefined || item.value < tier.maxExclusive,
        );
        const resource = presentation.tiers[tierIndex];
        if (!resource || tierIndex < 0) {
          throw new Error(`No valuePresentation tier covers ${item.value}.`);
        }
        const player = this.#playerFactory({ resource });
        entries.push(Object.freeze({ item, tierIndex, resource, player }));
        await player.init();
        if (version !== this.#prepareVersion) {
          throw new Error("Symbol value presenter prepare was cancelled.");
        }
        player.play({
          animationName: resource.spec.playback.animationName,
          loop: true,
        });
      }
      const prepared = Object.freeze({
        itemCount: normalized.length,
        items: normalized,
      });
      const internal = {
        entries: Object.freeze(entries),
        consumed: false,
      };
      this.#prepared.set(prepared, internal);
      this.#unconsumedPrepared.add(internal);
      this.#phase = "idle";
      return prepared;
    } catch (error) {
      for (const entry of entries) entry.player.destroy();
      if (version === this.#prepareVersion) this.#phase = "idle";
      throw error;
    }
  }

  show(prepared: PreparedSymbolValuePresentation): void {
    this.assertNotDestroyed();
    if (this.#active.length > 0 || this.#phase === "visible") {
      throw new Error(
        "Symbol value presenter already has an active presentation.",
      );
    }
    const internal = this.#prepared.get(prepared);
    if (!internal || internal.consumed) {
      throw new Error(
        "Prepared symbol value presentation is foreign or consumed.",
      );
    }
    internal.consumed = true;
    this.#unconsumedPrepared.delete(internal);
    const positions = internal.entries.map(({ item }) => ({
      x: item.x,
      y: item.y,
    }));
    const geometries =
      this.#target.getVisibleSymbolGeometrySnapshots(positions);
    if (geometries.length !== internal.entries.length) {
      this.destroyEntries(internal.entries);
      throw new Error("Symbol value presentation geometry count mismatch.");
    }
    const snapshotItems = [];
    const mounted: ActiveEntry[] = [];
    try {
      for (const [index, entry] of internal.entries.entries()) {
        const geometry = geometries[index];
        if (
          !geometry ||
          geometry.x !== entry.item.x ||
          geometry.y !== entry.item.y ||
          geometry.code !== entry.item.symbolCode ||
          geometry.kind !== "textured"
        ) {
          throw new Error(
            `Symbol value presentation geometry mismatch at index ${index}.`,
          );
        }
        const transform = entry.resource.spec.transform;
        entry.player.view.position.set(
          geometry.centerX + (transform?.x ?? 0),
          geometry.centerY + (transform?.y ?? 0),
        );
        entry.player.view.scale.set(transform?.scale ?? 1);
        const textSpec = this.#resources[entry.item.symbol].text;
        const label = new Text({
          text: String(entry.item.value),
          style: {
            fontFamily: textSpec.fontFamily,
            fontSize: textSpec.fontSize,
            fontWeight: textSpec.fontWeight as never,
            fill: textSpec.fill,
            stroke: { color: textSpec.stroke, width: textSpec.strokeWidth },
            align: "center",
          },
        });
        label.anchor.set(0.5);
        label.position.set(textSpec.x, textSpec.y);
        entry.player.attachSlotObject({
          slot: textSpec.slot,
          object: label,
          followSlotColor: true,
        });
        this.container.addChild(entry.player.view);
        mounted.push({ prepared: entry, label });
        snapshotItems.push(
          Object.freeze({
            ...entry.item,
            tierIndex: entry.tierIndex,
            skeleton: entry.resource.spec.skeleton,
            text: String(entry.item.value),
          }),
        );
      }
    } catch (error) {
      this.destroyActiveEntries(mounted);
      this.destroyEntries(internal.entries.slice(mounted.length));
      throw error;
    }
    this.#active = Object.freeze(mounted);
    this.#snapshotItems = Object.freeze(snapshotItems);
    this.#phase = internal.entries.length > 0 ? "visible" : "idle";
  }

  discard(prepared: PreparedSymbolValuePresentation): void {
    this.assertNotDestroyed();
    const internal = this.#prepared.get(prepared);
    if (!internal || internal.consumed) {
      throw new Error(
        "Prepared symbol value presentation is foreign or consumed.",
      );
    }
    internal.consumed = true;
    this.#unconsumedPrepared.delete(internal);
    this.destroyEntries(internal.entries);
  }

  update(deltaSeconds: number): void {
    this.assertNotDestroyed();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("deltaSeconds must be a finite non-negative number.");
    }
    for (const entry of this.#active) {
      entry.prepared.player.update(deltaSeconds);
    }
  }

  clear(): void {
    this.assertNotDestroyed();
    this.clearActive();
  }

  getSnapshot(): SymbolValuePresentationSnapshot {
    return Object.freeze({
      phase: this.#phase,
      activeCount: this.#active.length,
      items: this.#snapshotItems,
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    this.#prepareVersion += 1;
    this.clearActive();
    for (const internal of this.#unconsumedPrepared) {
      internal.consumed = true;
      this.destroyEntries(internal.entries);
    }
    this.#unconsumedPrepared.clear();
    this.container.destroy({ children: true });
    this.#phase = "destroyed";
  }

  private clearActive(): void {
    this.destroyActiveEntries(this.#active);
    this.container.removeChildren();
    this.#active = [];
    this.#snapshotItems = [];
    if (this.#phase !== "destroyed") this.#phase = "idle";
  }

  private destroyEntries(entries: readonly PreparedEntry[]): void {
    for (const entry of entries) entry.player.destroy();
  }

  private destroyActiveEntries(entries: readonly ActiveEntry[]): void {
    for (const entry of entries) {
      entry.prepared.player.removeSlotObject(entry.label);
      entry.label.destroy();
      entry.prepared.player.destroy();
    }
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("Symbol value presenter was destroyed.");
    }
  }
}

function normalizeItems(
  items: readonly SymbolValuePresentationItem[],
): readonly SymbolValuePresentationItem[] {
  if (!Array.isArray(items))
    throw new Error("Symbol value items must be an array.");
  const seen = new Set<string>();
  return Object.freeze(
    items.map((item, index) => {
      if (!item || typeof item !== "object")
        throw new Error(`Item ${index} is invalid.`);
      for (const [label, value] of [
        ["x", item.x],
        ["y", item.y],
        ["symbolCode", item.symbolCode],
      ] as const) {
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new Error(
            `Item ${index} ${label} must be a non-negative safe integer.`,
          );
        }
      }
      if (!Number.isSafeInteger(item.value) || item.value <= 0) {
        throw new Error(`Item ${index} value must be a positive safe integer.`);
      }
      if (typeof item.symbol !== "string" || item.symbol.trim().length === 0) {
        throw new Error(`Item ${index} symbol must be non-empty.`);
      }
      const key = `${item.x},${item.y}`;
      if (seen.has(key))
        throw new Error(`Duplicate symbol value position ${key}.`);
      seen.add(key);
      return Object.freeze({ ...item });
    }),
  );
}

function createDefaultPlayer(options: {
  readonly resource: SymbolValuePresentationTierResource;
}): SymbolValuePresentationPlayer {
  return createOfficialSpinePlayer({
    resource: {
      skeleton: options.resource.skeleton,
      atlasText: options.resource.atlasText,
      textureUrls: {
        [options.resource.atlasPage]: options.resource.textureUrl,
      },
    },
  });
}

function createModuleMap(
  modules: Readonly<Record<string, unknown>>,
  label: string,
): ReadonlyMap<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [path, value] of Object.entries(modules)) {
    const key = path.startsWith("./") ? path : `./${getBaseName(path)}`;
    if (result.has(key))
      throw new SymbolAssetError(`Duplicate ${label} module ${key}.`);
    result.set(key, value);
  }
  return result;
}

function requireModule(
  modules: ReadonlyMap<string, unknown>,
  path: string,
  label: string,
): unknown {
  if (!modules.has(path))
    throw new SymbolAssetError(`${label} is missing: ${path}.`);
  return modules.get(path);
}

function requireStringModule(
  modules: ReadonlyMap<string, unknown>,
  path: string,
  label: string,
): string {
  const value = requireModule(modules, path, label);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SymbolAssetError(`${label} must be a non-empty string.`);
  }
  return value;
}

function getBaseName(path: string): string {
  const name = path.split(/[\\/]/u).at(-1);
  if (!name) throw new SymbolAssetError(`Cannot read basename from ${path}.`);
  return name;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
