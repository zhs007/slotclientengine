import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOARD, boardDepth, boardWidth, GROUND, VEGETATION } from "./config.js";
import { FlowerField } from "./flowers.js";
import { createBladeGeometry, createGrassClumpGeometry } from "./geometry.js";
import { createPerimeterPlacements } from "./layout.js";
import { createRandom } from "./random.js";
import { createTurfTextures, type TurfTextureSet } from "./textures.js";
import { createWindMaterial, type WindMaterialHandle } from "./wind.js";

export class GardenBoardRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(36, 1, 0.1, 80);
  readonly #root = new Group();
  readonly #textures: TurfTextureSet[] = [];
  readonly #standaloneTextures: Texture[] = [];
  readonly #windMaterials: WindMaterialHandle[] = [];
  readonly #flowers: FlowerField;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "garden-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.setClearColor(0x4b8934, 1);
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;
    host.append(this.#renderer.domElement);
    this.#scene.background = new Color(0x4b8934);
    this.#scene.fog = new FogExp2(0x4b8934, 0.018);
    this.#root.name = "garden-board-environment";
    this.#scene.add(this.#root);
    this.#createGround();
    this.#createBoard();
    this.#createFoliage();
    this.#flowers = this.#createFlowers();
    this.#createLighting();
    this.#camera.position.set(0, 18, 14.5);
    this.#camera.lookAt(new Vector3(0, 0.12, 1.65));
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(Math.floor(width), 1);
    const safeHeight = Math.max(Math.floor(height), 1);
    this.#camera.aspect = safeWidth / safeHeight;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.#renderer.setSize(safeWidth, safeHeight, false);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);
    this.#root.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof InstancedMesh))
        return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    for (const texture of this.#textures) texture.dispose();
    for (const texture of this.#standaloneTextures) texture.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    const timeSeconds = timeMilliseconds / 1000;
    for (const handle of this.#windMaterials) handle.setTime(timeSeconds);
    this.#flowers.update(timeSeconds);
    this.#renderer.render(this.#scene, this.#camera);
  };

  #createGround(): void {
    const surfaceWidth = GROUND.width + 60;
    const surfaceDepth = GROUND.depth + 110;
    const textures = createTurfTextures(
      0x18f36a,
      "#397b25",
      surfaceWidth / 2.4,
      surfaceDepth / 2.4,
    );
    this.#textures.push(textures);
    const ground = new Mesh(
      new RoundedBoxGeometry(
        surfaceWidth,
        GROUND.height,
        surfaceDepth,
        4,
        0.34,
      ),
      new MeshStandardMaterial({
        map: textures.albedo,
        roughnessMap: textures.roughness,
        bumpMap: textures.bump,
        bumpScale: 0.055,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    ground.name = "textured-grass-ground";
    ground.position.y = -GROUND.height / 2;
    ground.receiveShadow = true;
    this.#root.add(ground);
  }

  #createBoard(): void {
    const lightTextures = createTurfTextures(0x481f2b, "#83c83a", 1.6, 1.6);
    const darkTextures = createTurfTextures(0x229af1, "#5bab2a", 1.6, 1.6);
    this.#textures.push(lightTextures, darkTextures);
    const geometry = new RoundedBoxGeometry(
      BOARD.cellSize,
      BOARD.cellHeight,
      BOARD.cellSize,
      3,
      0.085,
    );
    const makeMaterial = (textures: TurfTextureSet) =>
      new MeshStandardMaterial({
        map: textures.albedo,
        roughnessMap: textures.roughness,
        bumpMap: textures.bump,
        bumpScale: 0.035,
        roughness: 0.88,
        metalness: 0,
      });
    const count = (BOARD.columns * BOARD.rows) / 2;
    const light = new InstancedMesh(
      geometry,
      makeMaterial(lightTextures),
      count,
    );
    const dark = new InstancedMesh(
      geometry.clone(),
      makeMaterial(darkTextures),
      count,
    );
    light.name = "light-checker-cells";
    dark.name = "dark-checker-cells";
    const matrix = new Matrix4();
    let lightIndex = 0;
    let darkIndex = 0;
    for (let row = 0; row < BOARD.rows; row += 1) {
      for (let column = 0; column < BOARD.columns; column += 1) {
        const x =
          -boardWidth / 2 +
          BOARD.cellSize / 2 +
          column * (BOARD.cellSize + BOARD.cellGap);
        const z =
          -boardDepth / 2 +
          BOARD.cellSize / 2 +
          row * (BOARD.cellSize + BOARD.cellGap);
        matrix.makeTranslation(x, BOARD.cellHeight / 2 + 0.015, z);
        const target = (row + column) % 2 === 0 ? light : dark;
        const index = (row + column) % 2 === 0 ? lightIndex++ : darkIndex++;
        target.setMatrixAt(index, matrix);
      }
    }
    light.instanceMatrix.needsUpdate = true;
    dark.instanceMatrix.needsUpdate = true;
    light.receiveShadow = true;
    dark.receiveShadow = true;
    light.castShadow = true;
    dark.castShadow = true;
    this.#root.add(light, dark);
  }

  #createFoliage(): void {
    const nearGrassPlacements = createPerimeterPlacements({
      count: VEGETATION.grassCount,
      seed: VEGETATION.seed,
      boardClearance: BOARD.cellSize,
      edgeInset: 0.16,
      areaWidth: 15,
      areaDepth: 28,
      scaleRange: [0.58, 1.38],
      paletteSize: 8,
    });
    const distantGrassPlacements = createPerimeterPlacements({
      count: VEGETATION.distantGrassCount,
      seed: VEGETATION.seed ^ 0x3f62a,
      boardClearance: 1.1,
      edgeInset: 0.16,
      areaWidth: 22,
      zRange: [-25, -6.5],
      scaleRange: [0.42, 0.92],
      paletteSize: 8,
    });
    const accentGrassPlacements = createPerimeterPlacements({
      count: VEGETATION.accentGrassCount,
      seed: VEGETATION.seed ^ 0x8d31f,
      boardClearance: 0.14,
      edgeInset: 0.04,
      areaWidth: boardWidth + BOARD.cellSize * 2,
      areaDepth: boardDepth + BOARD.cellSize * 2,
      scaleRange: [0.36, 0.72],
      paletteSize: 8,
    });
    const grassPlacements = [
      ...nearGrassPlacements,
      ...distantGrassPlacements,
      ...accentGrassPlacements,
    ];
    const leafPlacements = createPerimeterPlacements({
      count: VEGETATION.leafCount,
      seed: VEGETATION.seed ^ 0x7b219,
      boardClearance: BOARD.cellSize,
      edgeInset: 0.08,
      scaleRange: [0.65, 1.35],
      paletteSize: 6,
    });
    const grassAlbedo = new TextureLoader().load(
      "/textures/grass-blade-albedo.png",
    );
    grassAlbedo.colorSpace = SRGBColorSpace;
    grassAlbedo.anisotropy = Math.min(
      this.#renderer.capabilities.getMaxAnisotropy(),
      8,
    );
    this.#standaloneTextures.push(grassAlbedo);
    const grassWind = createWindMaterial(
      {
        color: 0xffffff,
        map: grassAlbedo,
        emissive: 0x245c18,
        emissiveIntensity: 1.1,
        roughness: 0.82,
        metalness: 0,
        side: DoubleSide,
        vertexColors: true,
      },
      0.22,
    );
    const leafWind = createWindMaterial(
      {
        color: 0xffffff,
        map: grassAlbedo,
        emissive: 0x276b25,
        emissiveIntensity: 1.05,
        roughness: 0.74,
        metalness: 0,
        side: DoubleSide,
        vertexColors: true,
      },
      0.27,
    );
    this.#windMaterials.push(grassWind, leafWind);
    const grass = new InstancedMesh(
      createGrassClumpGeometry(0.21, 0.7),
      grassWind.material,
      grassPlacements.length,
    );
    const leaves = new InstancedMesh(
      createBladeGeometry(0.72, 1.22),
      leafWind.material,
      leafPlacements.length,
    );
    grass.name = "instanced-wind-grass";
    leaves.name = "instanced-wind-broad-leaves";
    const dummy = new Object3D();
    const grassPalette = [
      0x68ad3e, 0x78bc49, 0x4b9237, 0x8bc957, 0x417f3c, 0x9acb64, 0x617f35,
      0x58a34a,
    ];
    const leafPalette = [
      0x3d9138, 0x51a845, 0x347f34, 0x65b34e, 0x477e45, 0x718f3e,
    ];
    grassPlacements.forEach((placement, index) => {
      dummy.position.set(placement.x, 0.01, placement.z);
      dummy.rotation.set(0, placement.rotation, 0);
      dummy.scale.set(placement.scale, placement.scale, placement.scale);
      dummy.updateMatrix();
      grass.setMatrixAt(index, dummy.matrix);
      grass.setColorAt(index, new Color(grassPalette[placement.paletteIndex]));
    });
    const random = createRandom(VEGETATION.seed ^ 0x91c4);
    leafPlacements.forEach((placement, index) => {
      dummy.position.set(placement.x, 0.02, placement.z);
      dummy.rotation.set(
        random.range(-0.18, 0.2),
        placement.rotation,
        random.range(-0.42, 0.42),
      );
      dummy.scale.set(placement.scale, placement.scale, placement.scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
      leaves.setColorAt(index, new Color(leafPalette[placement.paletteIndex]));
    });
    grass.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    grass.instanceColor!.needsUpdate = true;
    leaves.instanceColor!.needsUpdate = true;
    grass.receiveShadow = true;
    leaves.receiveShadow = true;
    this.#root.add(grass, leaves);
  }

  #createFlowers(): FlowerField {
    const outerPlacements = createPerimeterPlacements({
      count: VEGETATION.flowerCount,
      seed: VEGETATION.seed ^ 0x4ab79,
      boardClearance: BOARD.cellSize,
      edgeInset: 0.35,
      scaleRange: [0.7, 1.28],
      paletteSize: 8,
    });
    const accentPlacements = createPerimeterPlacements({
      count: VEGETATION.accentFlowerCount,
      seed: VEGETATION.seed ^ 0xc5117,
      boardClearance: 0.22,
      edgeInset: 0.08,
      areaWidth: boardWidth + BOARD.cellSize * 2,
      areaDepth: boardDepth + BOARD.cellSize * 2,
      scaleRange: [0.52, 0.9],
      paletteSize: 8,
    });
    const placements = [...outerPlacements, ...accentPlacements];
    const flowers = new FlowerField(placements);
    this.#root.add(flowers);
    return flowers;
  }

  #createLighting(): void {
    const hemisphere = new HemisphereLight(0xd7f1c8, 0x28551f, 2.25);
    const ambient = new AmbientLight(0x8fc979, 0.35);
    const key = new DirectionalLight(0xfff1c9, 3.4);
    key.position.set(-7, 15, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -11;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.00045;
    const fill = new DirectionalLight(0x9ecbff, 0.75);
    fill.position.set(7, 9, -8);
    this.#scene.add(hemisphere, ambient, key, fill);
  }
}
