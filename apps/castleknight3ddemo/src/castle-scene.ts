import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  ExtrudeGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { BufferGeometry, Material, Texture } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CartoonPass } from "./cartoon-pass.js";
import { BOARD, boardDepth, boardWidth, ROOM } from "./config.js";
import { createRandom } from "./random.js";
import {
  createCartoonCastleBench,
  createCartoonCastleWallSection,
  createCartoonOakBarrel,
  createCartoonWallTorch,
  createRoundCastleColumn,
} from "./reconstructed-props.js";
import {
  createSessionSeed,
  createSymbolPlacements,
  SymbolField,
} from "./symbols.js";
import {
  createCastleTextureLibrary,
  type CastleTextureLibrary,
} from "./textures.js";

interface FlameHandle {
  readonly core: Mesh;
  readonly halo: Mesh;
  readonly light: PointLight;
  readonly phase: number;
  readonly baseIntensity: number;
}

interface CastleMaterials {
  readonly wall: Material;
  readonly floor: Material;
  readonly stone: Material;
  readonly stoneLight: Material;
  readonly stoneDark: Material;
  readonly columnStone: Material;
  readonly columnStoneLight: Material;
  readonly columnStoneDark: Material;
  readonly mortar: Material;
  readonly wood: Material;
  readonly woodDark: Material;
  readonly iron: Material;
  readonly ironLight: Material;
  readonly gold: Material;
  readonly banner: Material;
  readonly bannerGold: Material;
  readonly purpleGlass: Material;
  readonly candle: Material;
  readonly flame: Material;
  readonly flameCore: Material;
}

function standard(
  color: number,
  metalness = 0,
  roughness = 0.8,
  bumpMap?: Texture,
  map?: Texture,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness,
    roughness,
    flatShading: true,
    ...(bumpMap ? { bumpMap, bumpScale: 0.024 } : {}),
    ...(map ? { map } : {}),
  });
}

function toon(
  color: number,
  gradientMap: Texture,
  options: {
    readonly map?: Texture;
    readonly bumpMap?: Texture;
    readonly bumpScale?: number;
  } = {},
): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    gradientMap,
    ...(options.map ? { map: options.map } : {}),
    ...(options.bumpMap
      ? { bumpMap: options.bumpMap, bumpScale: options.bumpScale ?? 0 }
      : {}),
  });
}

function sceneMesh(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeBannerShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.72, 1.7);
  shape.lineTo(0.72, 1.7);
  shape.lineTo(0.72, -1.2);
  shape.lineTo(0, -1.72);
  shape.lineTo(-0.72, -1.2);
  shape.closePath();
  return shape;
}

export class CastleKnightRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(39, 1, 0.1, 80);
  readonly #root = new Group();
  readonly #cartoonPass = new CartoonPass();
  readonly #flames: FlameHandle[] = [];
  readonly #pointer = new Vector2();
  readonly #cameraOffset = new Vector2();
  readonly #drawingBufferSize = new Vector2();
  readonly #textureLibrary: CastleTextureLibrary;
  readonly #symbols: SymbolField;
  readonly #materials: CastleMaterials;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "castle-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.38;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;
    host.prepend(this.#renderer.domElement);

    this.#scene.background = new Color(0x090713);
    this.#scene.fog = new FogExp2(0x0a0814, 0.018);
    this.#scene.add(this.#root);
    this.#textureLibrary = createCastleTextureLibrary(
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    this.#materials = this.#createMaterials();
    this.#createFloor();
    this.#createWalls();
    this.#createBoard();
    this.#createThroneArea();
    this.#createArchitecture();
    this.#createFurniture();
    this.#createChandelier();
    this.#createTorches();
    this.#createLighting();
    this.#symbols = new SymbolField(
      createSymbolPlacements(0x6a17d39b),
      this.#textureLibrary,
    );
    this.#root.add(this.#symbols);

    host.addEventListener("pointermove", this.#onPointerMove);
    host.addEventListener("pointerleave", this.#onPointerLeave);
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  spin(): boolean {
    return this.#symbols.replace(createSymbolPlacements(createSessionSeed()));
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const aspect = safeWidth / safeHeight;
    this.#camera.aspect = aspect;
    this.#camera.fov = aspect < 0.82 ? 40 : aspect < 1.2 ? 36 : 31;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.#renderer.setSize(safeWidth, safeHeight, false);
    this.#renderer.getDrawingBufferSize(this.#drawingBufferSize);
    this.#cartoonPass.setSize(
      this.#drawingBufferSize.x,
      this.#drawingBufferSize.y,
    );
  }

  destroy(host: HTMLElement): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);
    host.removeEventListener("pointermove", this.#onPointerMove);
    host.removeEventListener("pointerleave", this.#onPointerLeave);
    this.#root.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof InstancedMesh))
        return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.#symbols.disposeResources();
    this.#textureLibrary.dispose();
    this.#cartoonPass.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #onPointerMove = (event: PointerEvent): void => {
    const bounds = this.#renderer.domElement.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1,
    );
  };

  readonly #onPointerLeave = (): void => {
    this.#pointer.set(0, 0);
  };

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    const time = timeMilliseconds / 1000;
    this.#symbols.update(time);
    this.#cameraOffset.lerp(this.#pointer, 0.025);
    this.#camera.position.set(
      this.#cameraOffset.x * 0.42,
      15.8 - this.#cameraOffset.y * 0.18,
      17.9 + this.#cameraOffset.y * 0.32,
    );
    this.#camera.lookAt(this.#cameraOffset.x * 0.25, 0.25, -2.7);
    for (const flame of this.#flames) {
      const flicker =
        1 +
        Math.sin(time * 8.7 + flame.phase) * 0.1 +
        Math.sin(time * 13.1 + flame.phase * 1.7) * 0.055;
      flame.core.scale.set(0.86 / flicker, flicker, 0.86 / flicker);
      flame.halo.scale.setScalar(0.9 + flicker * 0.12);
      flame.light.intensity = flame.baseIntensity * flicker;
    }
    this.#cartoonPass.render(this.#renderer, this.#scene, this.#camera);
  };

  #createMaterials(): CastleMaterials {
    const textures = this.#textureLibrary;
    const stone = toon(0xffffff, textures.toonGradient, {
      map: textures.cutStoneAlbedo,
      bumpMap: textures.stoneDetail,
      bumpScale: 0.055,
    });
    return {
      wall: toon(0xffffff, textures.toonGradient, {
        map: textures.wallAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.045,
      }),
      floor: toon(0xffffff, textures.toonGradient, {
        map: textures.floorAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.035,
      }),
      stone,
      stoneLight: toon(0xc8b8d0, textures.toonGradient, {
        map: textures.cutStoneAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.045,
      }),
      stoneDark: toon(0x665573, textures.toonGradient, {
        map: textures.cutStoneAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.045,
      }),
      columnStone: toon(0xffffff, textures.toonGradient, {
        map: textures.columnStoneAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.055,
      }),
      columnStoneLight: toon(0xc4b4ca, textures.toonGradient, {
        map: textures.columnStoneAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.045,
      }),
      columnStoneDark: toon(0x5d5064, textures.toonGradient, {
        map: textures.columnStoneAlbedo,
        bumpMap: textures.stoneDetail,
        bumpScale: 0.05,
      }),
      mortar: toon(0x30263b, textures.toonGradient),
      wood: toon(0xffffff, textures.toonGradient, {
        map: textures.oakStavesAlbedo,
        bumpMap: textures.woodDetail,
        bumpScale: 0.027,
      }),
      woodDark: toon(0x6b5664, textures.toonGradient, {
        map: textures.woodAlbedo,
        bumpMap: textures.woodDetail,
        bumpScale: 0.03,
      }),
      iron: standard(
        0xffffff,
        0.82,
        0.42,
        textures.metalDetail,
        textures.forgedIronAlbedo,
      ),
      ironLight: standard(
        0x777080,
        0.76,
        0.35,
        textures.metalDetail,
        textures.forgedIronAlbedo,
      ),
      gold: standard(0xd49119, 0.72, 0.29, textures.metalDetail),
      banner: toon(0xffffff, textures.toonGradient, {
        map: textures.fabricAlbedo,
        bumpMap: textures.fabricDetail,
        bumpScale: 0.016,
      }),
      bannerGold: standard(0xc58418, 0.56, 0.4, textures.metalDetail),
      purpleGlass: new MeshStandardMaterial({
        color: 0x4932a8,
        emissive: 0x38288e,
        emissiveIntensity: 1.1,
        roughness: 0.38,
        metalness: 0.05,
      }),
      candle: toon(0xf2d19b, textures.toonGradient),
      flame: new MeshBasicMaterial({ color: 0xff7a0b, toneMapped: false }),
      flameCore: new MeshBasicMaterial({ color: 0xffe379, toneMapped: false }),
    };
  }

  #createFloor(): void {
    const slab = sceneMesh(
      new BoxGeometry(ROOM.width, ROOM.floorHeight, ROOM.depth),
      this.#materials.mortar,
    );
    slab.position.y = -ROOM.floorHeight / 2;
    this.#root.add(slab);
    const floor = sceneMesh(
      new PlaneGeometry(ROOM.width - 0.08, ROOM.depth - 0.08),
      this.#materials.floor,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.018;
    floor.castShadow = false;
    this.#root.add(floor);
  }

  #createWalls(): void {
    const backWall = sceneMesh(
      new PlaneGeometry(ROOM.width, ROOM.wallHeight),
      this.#materials.wall,
    );
    backWall.position.set(0, ROOM.wallHeight / 2, -ROOM.depth / 2 + 0.18);
    backWall.castShadow = false;
    this.#root.add(backWall);

    const plainWall = createCartoonCastleWallSection(
      {
        stone: this.#materials.stone,
        stoneLight: this.#materials.stoneLight,
        stoneDark: this.#materials.stoneDark,
        mortar: this.#materials.mortar,
      },
      false,
    );
    const pilasterWall = createCartoonCastleWallSection({
      stone: this.#materials.stone,
      stoneLight: this.#materials.stoneLight,
      stoneDark: this.#materials.stoneDark,
      mortar: this.#materials.mortar,
    });
    plainWall.scale.y = 1.42;
    pilasterWall.scale.y = 1.42;
    for (const side of [-1, 1]) {
      for (let sectionIndex = 0; sectionIndex < 7; sectionIndex += 1) {
        const wall = (sectionIndex % 2 === 1 ? pilasterWall : plainWall).clone(
          true,
        );
        wall.position.set(
          side * (ROOM.width / 2 - 0.14),
          0,
          -9.78 + sectionIndex * 3.26,
        );
        wall.rotation.y = (side * -Math.PI) / 2;
        this.#root.add(wall);
      }
    }
  }

  #createBoard(): void {
    const underlay = sceneMesh(
      new RoundedBoxGeometry(boardWidth + 0.32, 0.1, boardDepth + 0.32, 3, 0.1),
      this.#materials.stoneDark,
    );
    underlay.position.set(0, 0.14, BOARD.zOffset);
    this.#root.add(underlay);
    const random = createRandom(0xb04ad);
    const tileGeometry = new RoundedBoxGeometry(
      BOARD.cellSize,
      BOARD.cellHeight,
      BOARD.cellSize,
      3,
      0.07,
    );
    const boardTiles = new InstancedMesh(
      tileGeometry,
      this.#materials.stoneLight,
      BOARD.columns * BOARD.rows,
    );
    const matrix = new Matrix4();
    let index = 0;
    for (let row = 0; row < BOARD.rows; row += 1) {
      for (let column = 0; column < BOARD.columns; column += 1) {
        const x =
          -boardWidth / 2 +
          BOARD.cellSize / 2 +
          column * (BOARD.cellSize + BOARD.cellGap);
        const z =
          -boardDepth / 2 +
          BOARD.cellSize / 2 +
          row * (BOARD.cellSize + BOARD.cellGap) +
          BOARD.zOffset;
        matrix.makeTranslation(x, 0.24, z);
        boardTiles.setMatrixAt(index, matrix);
        boardTiles.setColorAt(
          index,
          new Color(0x6f6972).offsetHSL(0, 0, random.range(-0.055, 0.055)),
        );
        index += 1;
      }
    }
    boardTiles.instanceMatrix.needsUpdate = true;
    boardTiles.instanceColor!.needsUpdate = true;
    boardTiles.castShadow = true;
    boardTiles.receiveShadow = true;
    this.#root.add(boardTiles);
  }

  #createThroneArea(): void {
    for (let index = 0; index < 3; index += 1) {
      const step = sceneMesh(
        new RoundedBoxGeometry(5.2 - index * 0.72, 0.32, 1.2, 2, 0.08),
        this.#materials.stoneDark,
      );
      step.position.set(0, 0.22 + index * 0.3, -7.5 - index * 0.58);
      this.#root.add(step);
    }
    const dais = sceneMesh(
      new RoundedBoxGeometry(3.1, 0.42, 2.35, 3, 0.1),
      this.#materials.stoneDark,
    );
    dais.position.set(0, 0.82, -9.25);
    this.#root.add(dais);

    const throne = new Group();
    const seat = sceneMesh(
      new RoundedBoxGeometry(1.35, 0.45, 1.05, 3, 0.08),
      this.#materials.woodDark,
    );
    seat.position.y = 0.75;
    const back = sceneMesh(
      new RoundedBoxGeometry(1.5, 2.65, 0.42, 4, 0.12),
      this.#materials.banner,
    );
    back.position.set(0, 1.98, -0.38);
    const frame = sceneMesh(
      new RoundedBoxGeometry(1.78, 2.9, 0.3, 3, 0.09),
      this.#materials.gold,
    );
    frame.position.set(0, 1.98, -0.55);
    back.renderOrder = 1;
    for (const x of [-0.82, 0.82]) {
      const post = sceneMesh(
        new CylinderGeometry(0.14, 0.18, 3.2, 8),
        this.#materials.gold,
      );
      post.position.set(x, 1.85, -0.4);
      throne.add(post);
      const cap = sceneMesh(
        new ConeGeometry(0.22, 0.48, 6),
        this.#materials.gold,
      );
      cap.position.set(x, 3.63, -0.4);
      throne.add(cap);
    }
    for (const x of [-0.86, 0.86]) {
      const arm = sceneMesh(
        new RoundedBoxGeometry(0.28, 0.3, 1.05, 2, 0.06),
        this.#materials.gold,
      );
      arm.position.set(x, 1.05, 0.05);
      throne.add(arm);
    }
    const jewel = sceneMesh(
      new DodecahedronGeometry(0.19, 0),
      this.#materials.purpleGlass,
    );
    jewel.position.set(0, 2.66, -0.12);
    throne.add(frame, back, seat, jewel);
    throne.position.set(0, 0.75, -9.45);
    this.#root.add(throne);

    const windowShape = new Shape();
    windowShape.moveTo(-0.5, -1.2);
    windowShape.lineTo(0.5, -1.2);
    windowShape.lineTo(0.5, 0.55);
    windowShape.quadraticCurveTo(0, 1.35, -0.5, 0.55);
    windowShape.closePath();
    const window = sceneMesh(
      new ExtrudeGeometry(windowShape, { depth: 0.04, bevelEnabled: false }),
      this.#materials.purpleGlass,
    );
    window.position.set(0, 4.75, -11.14);
    this.#root.add(window);
  }

  #createArchitecture(): void {
    const columnMaster = createRoundCastleColumn({
      stone: this.#materials.columnStone,
      stoneLight: this.#materials.columnStoneLight,
      stoneDark: this.#materials.columnStoneDark,
    });
    columnMaster.scale.setScalar(0.96);
    for (const x of [-4.7, -2.75, 2.75, 4.7]) {
      const pillar = columnMaster.clone(true);
      pillar.position.set(x, 0, -5.25);
      this.#root.add(pillar);
    }

    for (const x of [-3.85, 3.85]) {
      const arch = sceneMesh(
        new TorusGeometry(1.55, 0.36, 7, 18, Math.PI),
        this.#materials.stoneDark,
      );
      arch.position.set(x, 5.15, -10.95);
      this.#root.add(arch);
    }
    const centerArch = sceneMesh(
      new TorusGeometry(2.25, 0.42, 7, 20, Math.PI),
      this.#materials.stoneDark,
    );
    centerArch.position.set(0, 6.15, -10.9);
    this.#root.add(centerArch);

    for (const x of [-4.25, 4.25]) {
      const banner = sceneMesh(
        new ExtrudeGeometry(makeBannerShape(), {
          depth: 0.055,
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.02,
          bevelSegments: 1,
        }),
        this.#materials.banner,
      );
      banner.position.set(x, 4.8, -10.82);
      const emblem = sceneMesh(
        new DodecahedronGeometry(0.31, 0),
        this.#materials.bannerGold,
      );
      emblem.scale.set(0.55, 1.2, 0.28);
      emblem.position.set(x, 4.92, -10.68);
      this.#root.add(banner, emblem);
    }
  }

  #createFurniture(): void {
    const benchMaster = createCartoonCastleBench({
      wood: this.#materials.wood,
      woodDark: this.#materials.woodDark,
      iron: this.#materials.iron,
    });
    const barrelMaster = createCartoonOakBarrel({
      wood: this.#materials.wood,
      woodDark: this.#materials.woodDark,
      iron: this.#materials.iron,
    });
    for (const side of [-1, 1]) {
      const bench = benchMaster.clone(true);
      bench.position.set(side * 4.75, 0, -1.8);
      bench.rotation.y = side * -0.12;
      this.#root.add(bench);

      const barrel = barrelMaster.clone(true);
      barrel.position.set(side * 5.08, 0, 3.15);
      barrel.rotation.y = side * 0.18;
      this.#root.add(barrel);
    }
  }

  #createChandelier(): void {
    const group = new Group();
    const ring = sceneMesh(
      new TorusGeometry(1.55, 0.13, 8, 24),
      this.#materials.iron,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 6.25;
    group.add(ring);
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const candle = sceneMesh(
        new CylinderGeometry(0.065, 0.075, 0.42, 8),
        this.#materials.candle,
      );
      candle.position.set(Math.cos(angle) * 1.55, 6.55, Math.sin(angle) * 1.55);
      group.add(candle);
      this.#addFlame(
        group,
        candle.position.x,
        6.89,
        candle.position.z,
        0.35,
        index,
      );
    }
    for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const chain = sceneMesh(
        new CylinderGeometry(0.035, 0.035, 3.1, 6),
        this.#materials.iron,
      );
      chain.position.set(Math.cos(angle) * 0.78, 7.55, Math.sin(angle) * 0.78);
      chain.rotation.z = Math.cos(angle) * 0.22;
      chain.rotation.x = Math.sin(angle) * 0.22;
      group.add(chain);
    }
    group.position.set(0, 1.05, -4.45);
    this.#root.add(group);
  }

  #createTorches(): void {
    const torchMaster = createCartoonWallTorch({
      iron: this.#materials.iron,
      ironLight: this.#materials.ironLight,
      gold: this.#materials.gold,
    });
    const placements = [
      [-6.08, 2.3, -6.8, Math.PI / 2],
      [6.08, 2.3, -6.8, -Math.PI / 2],
      [-6.08, 2.05, 0.4, Math.PI / 2],
      [6.08, 2.05, 0.4, -Math.PI / 2],
      [-4.15, 1.55, -11.28, 0],
      [4.15, 1.55, -11.28, 0],
    ] as const;
    placements.forEach(([x, y, z, rotationY], index) => {
      const torch = torchMaster.clone(true);
      torch.position.set(x, y, z);
      torch.rotation.y = rotationY;
      this.#root.add(torch);
      torch.updateMatrixWorld(true);
      const flameSocket = torch.getObjectByName("flame-socket");
      if (!flameSocket) throw new Error("Wall torch flame socket is missing.");
      const flamePosition = flameSocket.getWorldPosition(new Vector3());
      this.#addFlame(
        this.#root,
        flamePosition.x,
        flamePosition.y,
        flamePosition.z,
        1.05,
        index + 20,
      );
    });
  }

  #addFlame(
    parent: Group,
    x: number,
    y: number,
    z: number,
    intensity: number,
    phase: number,
  ): void {
    const core = sceneMesh(
      new ConeGeometry(0.12, 0.5, 7),
      this.#materials.flameCore,
    );
    core.position.set(x, y, z);
    core.castShadow = false;
    const halo = sceneMesh(
      new ConeGeometry(0.18, 0.58, 7),
      this.#materials.flame,
    );
    halo.scale.set(0.9, 1.08, 0.9);
    halo.position.set(x, y - 0.04, z);
    halo.castShadow = false;
    const light = new PointLight(0xff8127, intensity * 2.4, 6.5, 2);
    light.position.set(x, y, z);
    parent.add(halo, core, light);
    this.#flames.push({
      core,
      halo,
      light,
      phase,
      baseIntensity: intensity * 2.4,
    });
  }

  #createLighting(): void {
    const hemisphere = new HemisphereLight(0x9c8be0, 0x25161c, 1.18);
    const ambient = new AmbientLight(0x6b5c7b, 0.72);
    const moon = new DirectionalLight(0x8f83ff, 2.35);
    moon.position.set(-3, 11, -8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -8;
    moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 12;
    moon.shadow.camera.bottom = -4;
    moon.shadow.camera.near = 2;
    moon.shadow.camera.far = 35;
    moon.shadow.bias = -0.0005;
    const key = new DirectionalLight(0xffb45b, 3.7);
    key.position.set(-5, 10, 9);
    const throneGlow = new PointLight(0x6047ff, 8.5, 12, 2);
    throneGlow.position.set(0, 4.8, -9.6);
    const boardGlow = new PointLight(0xff8c3e, 4.2, 13, 2);
    boardGlow.position.set(-1.8, 4.5, 3.6);
    this.#scene.add(hemisphere, ambient, moon, key, throneGlow, boardGlow);
  }
}
