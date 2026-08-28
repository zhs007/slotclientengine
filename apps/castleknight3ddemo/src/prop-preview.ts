import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import type { Group } from "three";
import { createCartoonCastleChandelier } from "./reconstructed-furnishings.js";
import {
  createCartoonTreasureChest,
  createCartoonWallTorch,
} from "./reconstructed-props.js";
import {
  createCartoonCrownSymbol,
  createCartoonSpellbookSymbol,
} from "./reconstructed-symbols.js";
import {
  createCastleTextureLibrary,
  type CastleTextureLibrary,
} from "./textures.js";

export type PropPreviewKind =
  | "chest"
  | "column"
  | "bench"
  | "barrel"
  | "wall"
  | "torch"
  | "stair"
  | "throne"
  | "chandelier"
  | "battleAxe"
  | "spellbook"
  | "crown";

export class PropPreviewRenderer {
  readonly #renderer = new WebGLRenderer({ antialias: true, alpha: false });
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(32, 1, 0.1, 60);
  readonly #drawingBufferSize = new Vector2();
  readonly #textureLibrary?: CastleTextureLibrary;
  #animationFrame = 0;

  constructor(
    host: HTMLElement,
    kind: PropPreviewKind,
    sideView: boolean,
    textured: boolean,
    barrelModel: Group | null,
    battleAxeModel: Group | null,
    benchModel: Group | null,
    throneDaisModel: Group | null,
    throneModel: Group | null,
    wallModel: Group | null,
    columnModel: Group | null,
  ) {
    this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.domElement.className = "prop-preview-canvas";
    host.classList.add("prop-preview");
    host.append(this.#renderer.domElement);
    this.#scene.background = new Color(0xe5dfd8);
    if (textured) {
      this.#textureLibrary = createCastleTextureLibrary(
        this.#renderer.capabilities.getMaxAnisotropy(),
      );
      const ambient = new AmbientLight(0xb7a6d0, 2.1);
      const key = new DirectionalLight(0xffd29a, 4.8);
      key.position.set(4, 7, 6);
      const rim = new DirectionalLight(0x7656ff, 2.2);
      rim.position.set(-5, 3, -4);
      this.#scene.add(ambient, key, rim);
    }

    if (kind === "chest") {
      const chestWood = textured
        ? new MeshToonMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.chestWoodAlbedo,
            bumpMap: this.#textureLibrary?.woodDetail,
            bumpScale: 0.032,
            gradientMap: this.#textureLibrary?.toonGradient,
          })
        : new MeshBasicMaterial({ color: 0x8c4625 });
      const chestGold = textured
        ? new MeshStandardMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.chestGoldAlbedo,
            bumpMap: this.#textureLibrary?.metalDetail,
            bumpScale: 0.018,
            metalness: 0.68,
            roughness: 0.31,
            flatShading: true,
          })
        : new MeshBasicMaterial({ color: 0xd18a19 });
      const chest = createCartoonTreasureChest({
        wood: chestWood,
        gold: chestGold,
        iron: new MeshBasicMaterial({ color: 0x3d3942 }),
        gem: new MeshBasicMaterial({ color: 0x8f32d2 }),
      });
      chest.scale.set(3.4, 3, 3);
      chest.rotation.y = sideView ? Math.PI * 0.52 : -Math.PI * 0.18;
      chest.position.y = 0.25;
      this.#scene.add(chest);
      this.#camera.position.set(0, 2.25, 7.2);
      this.#camera.lookAt(0, 0.2, 0);
    } else if (kind === "column") {
      if (!columnModel) throw new Error("Castle column GLB is not loaded.");
      const column = columnModel.clone(true);
      column.scale.set(1.5, 1, 1.5);
      column.rotation.y = sideView ? Math.PI * 0.32 : -Math.PI * 0.12;
      column.position.y = -2.65;
      this.#scene.add(column);
      this.#camera.position.set(sideView ? 5.4 : 3.8, 0.8, 10.8);
      this.#camera.lookAt(0, 0, 0);
    } else {
      const gradientMap = this.#textureLibrary?.toonGradient;
      const wood = textured
        ? new MeshToonMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.oakStavesAlbedo,
            bumpMap: this.#textureLibrary?.woodDetail,
            bumpScale: 0.03,
            gradientMap,
          })
        : new MeshBasicMaterial({ color: 0x9b5527 });
      const iron = textured
        ? new MeshStandardMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.forgedIronAlbedo,
            bumpMap: this.#textureLibrary?.metalDetail,
            bumpScale: 0.02,
            metalness: 0.78,
            roughness: 0.4,
            flatShading: true,
          })
        : new MeshBasicMaterial({ color: 0x34303d });
      const ironLight = textured
        ? new MeshStandardMaterial({
            color: 0x777080,
            map: this.#textureLibrary?.forgedIronAlbedo,
            metalness: 0.72,
            roughness: 0.33,
            flatShading: true,
          })
        : new MeshBasicMaterial({ color: 0x6c6476 });
      const steel = textured
        ? new MeshStandardMaterial({
            color: 0xc9c9d2,
            bumpMap: this.#textureLibrary?.metalDetail,
            bumpScale: 0.014,
            metalness: 0.8,
            roughness: 0.3,
            flatShading: true,
          })
        : new MeshBasicMaterial({ color: 0xbfc0c9 });
      const gold = textured
        ? new MeshStandardMaterial({
            color: 0xd49119,
            metalness: 0.72,
            roughness: 0.29,
            flatShading: true,
          })
        : new MeshBasicMaterial({ color: 0xd49119 });
      const leather = textured
        ? new MeshToonMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.crimsonLeatherAlbedo,
            bumpMap: this.#textureLibrary?.fabricDetail,
            bumpScale: 0.018,
            gradientMap,
          })
        : new MeshBasicMaterial({ color: 0x7c1d2c });
      const parchment = textured
        ? new MeshToonMaterial({
            color: 0xffffff,
            map: this.#textureLibrary?.parchmentPagesAlbedo,
            gradientMap,
          })
        : new MeshBasicMaterial({ color: 0xd7b979 });
      const purple = new MeshBasicMaterial({ color: 0x8f32d2 });
      const blue = new MeshBasicMaterial({ color: 0x169bd8 });
      const candle = new MeshBasicMaterial({ color: 0xf0d39a });
      const outline = new MeshBasicMaterial({
        color: 0x18121f,
        side: BackSide,
      });

      if (kind === "bench") {
        if (!benchModel) throw new Error("Castle bench GLB is not loaded.");
        const bench = benchModel.clone(true);
        bench.scale.setScalar(2.6);
        bench.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.18;
        bench.position.y = -1.35;
        this.#scene.add(bench);
        this.#camera.position.set(0, 1.6, 8.5);
        this.#camera.lookAt(0, -0.15, 0);
      } else if (kind === "barrel") {
        if (!barrelModel) throw new Error("Castle barrel GLB is not loaded.");
        const barrel = barrelModel.clone(true);
        barrel.scale.setScalar(2.25);
        barrel.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.16;
        barrel.position.y = -1.55;
        this.#scene.add(barrel);
        this.#camera.position.set(0, 1.4, 7.8);
        this.#camera.lookAt(0, 0, 0);
      } else if (kind === "wall") {
        if (!wallModel) throw new Error("Castle wall GLB is not loaded.");
        const wall = wallModel.clone(true);
        wall.scale.setScalar(0.6);
        wall.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.14;
        wall.position.y = -2.7;
        this.#scene.add(wall);
        this.#camera.position.set(0, 0.55, 10.5);
        this.#camera.lookAt(0, 0, 0);
      } else if (kind === "torch") {
        const torch = createCartoonWallTorch({ iron, ironLight, gold });
        torch.scale.setScalar(2.8);
        torch.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.18;
        torch.position.y = -0.15;
        this.#scene.add(torch);
        this.#camera.position.set(0, 1.2, 7.6);
        this.#camera.lookAt(0, 0.1, 0);
      } else if (kind === "stair") {
        if (!throneDaisModel) {
          throw new Error("Castle throne dais GLB is not loaded.");
        }
        const stair = throneDaisModel.clone(true);
        stair.scale.setScalar(0.92);
        stair.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.15;
        stair.position.y = -1.7;
        this.#scene.add(stair);
        this.#camera.position.set(0, 2.4, 10.5);
        this.#camera.lookAt(0, -0.25, 0);
      } else if (kind === "throne") {
        if (!throneModel) throw new Error("Castle throne GLB is not loaded.");
        const throne = throneModel.clone(true);
        throne.scale.setScalar(1.25);
        throne.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.14;
        throne.position.y = -2;
        this.#scene.add(throne);
        this.#camera.position.set(0, 1.15, 9.8);
        this.#camera.lookAt(0, 0.15, 0);
      } else if (kind === "chandelier") {
        const chandelier = createCartoonCastleChandelier({
          iron,
          ironLight,
          gold,
          candle,
          gem: purple,
        });
        chandelier.scale.setScalar(1.35);
        chandelier.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.14;
        chandelier.position.y = -2;
        this.#scene.add(chandelier);
        this.#camera.position.set(0, 1.1, 10.8);
        this.#camera.lookAt(0, 0.15, 0);
      } else {
        const materials = {
          wood,
          steel,
          iron,
          gold,
          leather,
          parchment,
          purple,
          blue,
          outline,
        };
        let symbol: Group;
        if (kind === "battleAxe") {
          if (!battleAxeModel) {
            throw new Error("Castle battle axe GLB is not loaded.");
          }
          symbol = battleAxeModel.clone(true);
        } else {
          symbol =
            kind === "spellbook"
              ? createCartoonSpellbookSymbol(materials)
              : createCartoonCrownSymbol(materials);
        }
        symbol.scale.setScalar(
          kind === "battleAxe" ? 1.85 : kind === "spellbook" ? 2.35 : 2.1,
        );
        symbol.rotation.y = sideView ? Math.PI / 2 : -Math.PI * 0.12;
        this.#scene.add(symbol);
        this.#camera.position.set(0, 0.9, 8.4);
        this.#camera.lookAt(0, 0, 0);
      }
    }
    this.#animationFrame = requestAnimationFrame(this.#render);
  }

  readonly #render = (): void => {
    this.#renderer.render(this.#scene, this.#camera);
    this.#animationFrame = requestAnimationFrame(this.#render);
  };

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.#camera.aspect = safeWidth / safeHeight;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(safeWidth, safeHeight, false);
    this.#renderer.getDrawingBufferSize(this.#drawingBufferSize);
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(host: HTMLElement): void {
    cancelAnimationFrame(this.#animationFrame);
    this.#scene.traverse((object) => {
      if (!("geometry" in object)) return;
      const mesh = object as {
        geometry?: { dispose(): void };
        material?: MeshBasicMaterial | MeshBasicMaterial[];
      };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) material.dispose();
      } else {
        mesh.material?.dispose();
      }
    });
    this.#textureLibrary?.dispose();
    this.#renderer.dispose();
    host.classList.remove("prop-preview");
    this.#renderer.domElement.remove();
  }
}
