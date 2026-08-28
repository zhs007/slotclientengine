import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import type { BufferGeometry, Material } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOARD, boardDepth, boardWidth } from "./config.js";
import { createRandom, type RandomSource } from "./random.js";
import { createCartoonTreasureChest } from "./reconstructed-props.js";
import {
  createCartoonCrownSymbol,
  createCartoonSpellbookSymbol,
} from "./reconstructed-symbols.js";
import type { CastleTextureLibrary } from "./textures.js";

export const SYMBOL_TYPES = [
  "chest",
  "helmet",
  "shield",
  "purplePotion",
  "greenPotion",
  "gem",
  "sword",
  "king",
  "battleAxe",
  "spellbook",
  "crown",
] as const;

export type SymbolType = (typeof SYMBOL_TYPES)[number];

export interface SymbolPlacement {
  readonly type: SymbolType;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly phase: number;
  readonly rotation: number;
  readonly delay: number;
}

interface AnimatedSymbol {
  readonly pivot: Group;
  readonly spinner: Group;
  readonly shadow: Mesh;
  readonly placement: SymbolPlacement;
}

interface Palette {
  readonly stoneDark: Material;
  readonly steel: Material;
  readonly steelDark: Material;
  readonly gold: Material;
  readonly chestGold: Material;
  readonly wood: Material;
  readonly chestWood: Material;
  readonly purple: Material;
  readonly green: Material;
  readonly blue: Material;
  readonly skin: Material;
  readonly beard: Material;
  readonly plume: Material;
  readonly leather: Material;
  readonly parchment: Material;
}

function toon(
  color: number,
  textures: CastleTextureLibrary,
  emissiveIntensity = 0.025,
): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    gradientMap: textures.toonGradient,
    emissive: color,
    emissiveIntensity,
  });
}

function metal(
  color: number,
  textures: CastleTextureLibrary,
  metalness: number,
  roughness: number,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness,
    roughness,
    bumpMap: textures.metalDetail,
    bumpScale: 0.018,
    flatShading: true,
  });
}

function createPalette(textures: CastleTextureLibrary): Palette {
  const wood = toon(0xffffff, textures);
  wood.map = textures.woodAlbedo;
  wood.bumpMap = textures.woodDetail;
  wood.bumpScale = 0.022;
  const chestWood = toon(0xffffff, textures);
  chestWood.map = textures.chestWoodAlbedo;
  chestWood.bumpMap = textures.woodDetail;
  chestWood.bumpScale = 0.032;
  const chestGold = metal(0xffffff, textures, 0.68, 0.31);
  chestGold.map = textures.chestGoldAlbedo;
  const leather = toon(0xffffff, textures);
  leather.map = textures.crimsonLeatherAlbedo;
  leather.bumpMap = textures.fabricDetail;
  leather.bumpScale = 0.018;
  const parchment = toon(0xffffff, textures);
  parchment.map = textures.parchmentPagesAlbedo;
  parchment.bumpMap = textures.fabricDetail;
  parchment.bumpScale = 0.012;
  return {
    stoneDark: toon(0x30283b, textures),
    steel: metal(0xc7c7d0, textures, 0.78, 0.32),
    steelDark: metal(0x4c4655, textures, 0.7, 0.42),
    gold: metal(0xf0a51b, textures, 0.68, 0.28),
    chestGold,
    wood,
    chestWood,
    purple: toon(0xac2ee1, textures, 0.16),
    green: toon(0x61b326, textures, 0.11),
    blue: toon(0x159cde, textures, 0.16),
    skin: toon(0xd27a45, textures),
    beard: toon(0x3f2924, textures),
    plume: toon(0x5c2cad, textures, 0.05),
    leather,
    parchment,
  };
}

const symbolOutlineMaterial = new MeshBasicMaterial({
  color: 0x18121f,
  side: BackSide,
  toneMapped: false,
});

function part(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const outline = new Mesh(geometry, symbolOutlineMaterial);
  outline.scale.setScalar(1.035);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return mesh;
}

function createChest(palette: Palette): Group {
  const group = createCartoonTreasureChest({
    wood: palette.chestWood,
    gold: palette.chestGold,
    iron: palette.steelDark,
    gem: palette.purple,
  });
  group.scale.set(1.16, 1.03, 1.06);
  return group;
}

function createHelmet(palette: Palette): Group {
  const group = new Group();
  const dome = part(
    new SphereGeometry(0.39, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    palette.steel,
  );
  const face = part(
    new RoundedBoxGeometry(0.62, 0.42, 0.18, 2, 0.05),
    palette.steelDark,
  );
  face.position.set(0, -0.17, 0.29);
  const slit = part(new BoxGeometry(0.43, 0.055, 0.035), palette.stoneDark);
  slit.position.set(0, -0.08, 0.4);
  const nose = part(new BoxGeometry(0.075, 0.34, 0.11), palette.steel);
  nose.position.set(0, -0.12, 0.42);
  const crest = part(
    new TorusGeometry(0.28, 0.08, 6, 10, Math.PI),
    palette.plume,
  );
  crest.rotation.z = Math.PI / 2;
  crest.position.y = 0.42;
  group.add(dome, face, slit, nose, crest);
  group.name = "knight-helmet";
  return group;
}

function createShield(palette: Palette): Group {
  const group = new Group();
  const body = part(new CylinderGeometry(0.43, 0.43, 0.16, 14), palette.wood);
  body.rotation.x = Math.PI / 2;
  const rim = part(new TorusGeometry(0.43, 0.065, 7, 14), palette.steelDark);
  rim.position.z = 0.08;
  const boss = part(new SphereGeometry(0.16, 10, 6), palette.steel);
  boss.scale.z = 0.5;
  boss.position.z = 0.13;
  group.add(body, rim, boss);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const rivet = part(new SphereGeometry(0.035, 6, 4), palette.steel);
    rivet.position.set(Math.cos(angle) * 0.34, Math.sin(angle) * 0.34, 0.135);
    group.add(rivet);
  }
  group.name = "round-shield";
  return group;
}

function createPotion(palette: Palette, liquid: Material, name: string): Group {
  const group = new Group();
  const bottle = part(
    new LatheGeometry(
      [
        new Vector2(0.04, -0.45),
        new Vector2(0.25, -0.39),
        new Vector2(0.38, -0.16),
        new Vector2(0.32, 0.08),
        new Vector2(0.15, 0.22),
        new Vector2(0.12, 0.42),
      ],
      10,
    ),
    liquid,
  );
  const cork = part(new CylinderGeometry(0.15, 0.13, 0.19, 8), palette.wood);
  cork.position.y = 0.52;
  const band = part(new TorusGeometry(0.25, 0.035, 5, 10), palette.steel);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, -0.03, 0.26);
  group.add(bottle, cork, band);
  group.name = name;
  return group;
}

function createGem(palette: Palette): Group {
  const group = new Group();
  const gem = part(new IcosahedronGeometry(0.46, 1), palette.blue);
  gem.scale.set(0.92, 1.06, 0.88);
  gem.rotation.set(0.2, 0.42, -0.12);
  group.add(gem);
  group.name = "faceted-blue-gem";
  return group;
}

function createKing(palette: Palette): Group {
  const group = new Group();
  const head = part(new SphereGeometry(0.34, 10, 8), palette.skin);
  const beard = part(new ConeGeometry(0.34, 0.58, 7), palette.beard);
  beard.position.y = -0.43;
  const nose = part(new DodecahedronGeometry(0.09, 0), palette.skin);
  nose.position.set(0, -0.02, 0.32);
  const crownBand = part(
    new CylinderGeometry(0.38, 0.36, 0.16, 7),
    palette.gold,
  );
  crownBand.position.y = 0.35;
  group.add(head, beard, nose, crownBand);
  for (const x of [-0.13, 0.13]) {
    const eye = part(new SphereGeometry(0.035, 6, 4), palette.stoneDark);
    eye.position.set(x, 0.08, 0.31);
    group.add(eye);
  }
  for (let index = 0; index < 5; index += 1) {
    const point = part(new ConeGeometry(0.09, 0.32, 4), palette.gold);
    const angle = ((index - 2) / 5) * Math.PI;
    point.position.set(Math.sin(angle) * 0.31, 0.56, Math.cos(angle) * 0.22);
    group.add(point);
  }
  const jewel = part(new DodecahedronGeometry(0.09, 0), palette.purple);
  jewel.position.set(0, 0.41, 0.34);
  group.add(jewel);
  group.name = "crowned-king";
  return group;
}

function createModels(
  palette: Palette,
  battleAxeModel: Group,
  swordModel: Group,
): ReadonlyMap<SymbolType, Group> {
  const reconstructedMaterials = {
    wood: palette.wood,
    steel: palette.steel,
    iron: palette.steelDark,
    gold: palette.gold,
    leather: palette.leather,
    parchment: palette.parchment,
    purple: palette.purple,
    blue: palette.blue,
    outline: symbolOutlineMaterial,
  };
  const sword = swordModel.clone(true);
  sword.scale.setScalar(1.25);
  sword.rotation.z = -0.72;
  return new Map<SymbolType, Group>([
    ["chest", createChest(palette)],
    ["helmet", createHelmet(palette)],
    ["shield", createShield(palette)],
    ["purplePotion", createPotion(palette, palette.purple, "purple-potion")],
    ["greenPotion", createPotion(palette, palette.green, "green-potion")],
    ["gem", createGem(palette)],
    ["sword", sword],
    ["king", createKing(palette)],
    ["battleAxe", battleAxeModel],
    ["spellbook", createCartoonSpellbookSymbol(reconstructedMaterials)],
    ["crown", createCartoonCrownSymbol(reconstructedMaterials)],
  ]);
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = random.integer(0, index);
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function assignBalancedTypes(
  cells: readonly number[],
  random: RandomSource,
): ReadonlyMap<number, SymbolType> {
  const orderedCells = [...cells].sort((left, right) => left - right);
  const remainderOrder = shuffle([...SYMBOL_TYPES], random);
  const baseCount = Math.floor(cells.length / SYMBOL_TYPES.length);
  const extraCount = cells.length % SYMBOL_TYPES.length;
  const targets = new Map<SymbolType, number>(
    SYMBOL_TYPES.map((type) => [
      type,
      baseCount + (remainderOrder.indexOf(type) < extraCount ? 1 : 0),
    ]),
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const remaining = new Map(targets);
    const assigned = new Map<number, SymbolType>();
    let failed = false;
    for (const cell of orderedCells) {
      const column = cell % BOARD.columns;
      const forbidden = new Set<SymbolType>();
      if (column > 0) {
        const left = assigned.get(cell - 1);
        if (left) forbidden.add(left);
      }
      const above = assigned.get(cell - BOARD.columns);
      if (above) forbidden.add(above);
      const candidates = SYMBOL_TYPES.filter(
        (type) => (remaining.get(type) ?? 0) > 0 && !forbidden.has(type),
      );
      if (candidates.length === 0) {
        failed = true;
        break;
      }
      const maxRemaining = Math.max(
        ...candidates.map((type) => remaining.get(type) ?? 0),
      );
      const preferred = candidates.filter(
        (type) => (remaining.get(type) ?? 0) >= maxRemaining - 1,
      );
      const selected = preferred[random.integer(0, preferred.length - 1)];
      assigned.set(cell, selected);
      remaining.set(selected, (remaining.get(selected) ?? 0) - 1);
    }
    if (!failed && assigned.size === orderedCells.length) return assigned;
  }
  throw new Error("Unable to create a balanced symbol layout.");
}

export function createSymbolPlacements(
  seed: number,
  count = BOARD.columns * BOARD.rows,
): SymbolPlacement[] {
  const capacity = BOARD.columns * BOARD.rows;
  if (!Number.isInteger(count) || count < 0 || count > capacity) {
    throw new RangeError(
      `Symbol count must be an integer from 0 to ${capacity}.`,
    );
  }
  const random = createRandom(seed);
  const cells = shuffle(
    Array.from({ length: capacity }, (_, index) => index),
    random,
  ).slice(0, count);
  const types = assignBalancedTypes(cells, random);
  return cells.map((cell) => {
    const column = cell % BOARD.columns;
    const row = Math.floor(cell / BOARD.columns);
    return {
      type: types.get(cell)!,
      column,
      row,
      x:
        -boardWidth / 2 +
        BOARD.cellSize / 2 +
        column * (BOARD.cellSize + BOARD.cellGap),
      z:
        -boardDepth / 2 +
        BOARD.cellSize / 2 +
        row * (BOARD.cellSize + BOARD.cellGap) +
        BOARD.zOffset,
      scale: random.range(0.93, 1.05),
      phase: random.range(0, Math.PI * 2),
      rotation: random.range(-0.18, 0.18),
      delay: (row * BOARD.columns + column) * 0.018,
    };
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export interface SymbolMotion {
  readonly scale: number;
  readonly yOffset: number;
}

export function sampleSymbolEntrance(progress: number): SymbolMotion {
  const value = clamp01(progress);
  const shifted = value - 1;
  return {
    scale: value === 0 ? 0 : 1 + 2.5 * shifted ** 3 + 1.5 * shifted ** 2,
    yOffset: -0.2 * (1 - smoothstep(value)) + Math.sin(Math.PI * value) * 0.2,
  };
}

export function sampleSymbolExit(progress: number): SymbolMotion {
  const value = clamp01(progress);
  return {
    scale: 1 - smoothstep((value - 0.08) / 0.92),
    yOffset: Math.sin(Math.PI * value) * 0.36 + value * 0.12,
  };
}

type Phase = "entering" | "idle" | "exiting";

export class SymbolField extends Group {
  readonly #palette: Palette;
  readonly #masters: ReadonlyMap<SymbolType, Group>;
  readonly #symbols: AnimatedSymbol[] = [];
  readonly #shadowGeometry = new CircleGeometry(0.38, 20);
  readonly #shadowMaterial = new MeshBasicMaterial({
    color: 0x05040a,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
  });
  #phase: Phase = "entering";
  #phaseStartedAt: number | null = null;
  #lastUpdateAt: number | null = null;
  #pending: readonly SymbolPlacement[] | null = null;

  constructor(
    placements: readonly SymbolPlacement[],
    textures: CastleTextureLibrary,
    battleAxeModel: Group,
    swordModel: Group,
  ) {
    super();
    this.#palette = createPalette(textures);
    this.#masters = createModels(this.#palette, battleAxeModel, swordModel);
    this.name = "animated-castle-symbols";
    this.#populate(placements);
  }

  replace(placements: readonly SymbolPlacement[]): boolean {
    if (this.#phase !== "idle" || this.#lastUpdateAt === null) return false;
    this.#pending = [...placements];
    this.#phase = "exiting";
    this.#phaseStartedAt = this.#lastUpdateAt;
    return true;
  }

  update(timeSeconds: number): void {
    this.#lastUpdateAt = timeSeconds;
    this.#phaseStartedAt ??= timeSeconds;
    const elapsed = timeSeconds - this.#phaseStartedAt;
    if (this.#phase === "exiting") {
      this.#updateExit(elapsed, timeSeconds);
    } else if (this.#phase === "entering") {
      this.#updateEntrance(elapsed, timeSeconds);
    } else {
      for (const symbol of this.#symbols)
        this.#applyIdle(symbol, timeSeconds, 1);
    }
  }

  disposeResources(): void {
    this.#clear();
    this.#shadowGeometry.dispose();
    this.#shadowMaterial.dispose();
    const geometries = new Set<BufferGeometry>();
    for (const master of this.#masters.values()) {
      master.traverse((object) => {
        if (object instanceof Mesh) geometries.add(object.geometry);
      });
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(this.#palette)) material.dispose();
    symbolOutlineMaterial.dispose();
  }

  #populate(placements: readonly SymbolPlacement[]): void {
    for (const placement of placements) {
      const pivot = new Group();
      pivot.position.set(placement.x, BOARD.cellHeight + 0.64, placement.z);
      pivot.scale.setScalar(0);
      const spinner = new Group();
      spinner.rotation.set(-0.2, 0, placement.rotation);
      spinner.add(this.#masters.get(placement.type)!.clone(true));
      pivot.add(spinner);
      const shadow = new Mesh(this.#shadowGeometry, this.#shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(placement.x, BOARD.cellHeight + 0.025, placement.z);
      shadow.scale.set(1.1, 0.7, 1.1);
      this.add(shadow, pivot);
      this.#symbols.push({ pivot, spinner, shadow, placement });
    }
  }

  #updateEntrance(elapsed: number, timeSeconds: number): void {
    let finished = true;
    for (const symbol of this.#symbols) {
      const progress = clamp01((elapsed - symbol.placement.delay) / 0.48);
      if (progress < 1) finished = false;
      const motion = sampleSymbolEntrance(progress);
      this.#applyIdle(symbol, timeSeconds, motion.scale, motion.yOffset);
    }
    if (finished) {
      this.#phase = "idle";
      this.#phaseStartedAt = timeSeconds;
    }
  }

  #updateExit(elapsed: number, timeSeconds: number): void {
    let finished = true;
    for (const symbol of this.#symbols) {
      const progress = clamp01((elapsed - symbol.placement.delay * 0.4) / 0.3);
      if (progress < 1) finished = false;
      const motion = sampleSymbolExit(progress);
      this.#applyIdle(symbol, timeSeconds, motion.scale, motion.yOffset);
    }
    if (!finished) return;
    const placements = this.#pending;
    this.#pending = null;
    this.#clear();
    if (placements) this.#populate(placements);
    this.#phase = placements ? "entering" : "idle";
    this.#phaseStartedAt = timeSeconds;
  }

  #applyIdle(
    symbol: AnimatedSymbol,
    timeSeconds: number,
    scaleFactor: number,
    yOffset = 0,
  ): void {
    symbol.pivot.scale.setScalar(symbol.placement.scale * scaleFactor);
    symbol.pivot.position.y =
      BOARD.cellHeight +
      0.64 +
      Math.sin(timeSeconds * 1.3 + symbol.placement.phase) * 0.055 +
      yOffset;
    symbol.spinner.rotation.y =
      Math.sin(timeSeconds * 0.55 + symbol.placement.phase) * 0.12;
    symbol.spinner.rotation.z =
      symbol.placement.rotation +
      Math.sin(timeSeconds * 0.8 + symbol.placement.phase) * 0.035;
    const pulse =
      1 - Math.sin(timeSeconds * 1.3 + symbol.placement.phase) * 0.07;
    symbol.shadow.scale.set(pulse, pulse * 0.64, pulse);
  }

  #clear(): void {
    for (const symbol of this.#symbols)
      this.remove(symbol.pivot, symbol.shadow);
    this.#symbols.length = 0;
  }
}

export function createSessionSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0];
}
