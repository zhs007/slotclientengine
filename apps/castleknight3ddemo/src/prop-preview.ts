import {
  AmbientLight,
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
import {
  createCartoonTreasureChest,
  createRoundCastleColumn,
} from "./reconstructed-props.js";
import {
  createCastleTextureLibrary,
  type CastleTextureLibrary,
} from "./textures.js";

export type PropPreviewKind = "chest" | "column";

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
    } else {
      const stoneMap = this.#textureLibrary?.columnStoneAlbedo;
      const gradientMap = this.#textureLibrary?.toonGradient;
      const column = createRoundCastleColumn({
        stone: textured
          ? new MeshToonMaterial({
              color: 0xffffff,
              map: stoneMap,
              gradientMap,
            })
          : new MeshBasicMaterial({ color: 0x6d5879 }),
        stoneLight: textured
          ? new MeshToonMaterial({
              color: 0xc4b4ca,
              map: stoneMap,
              gradientMap,
            })
          : new MeshBasicMaterial({ color: 0x8a7195 }),
        stoneDark: textured
          ? new MeshToonMaterial({
              color: 0x5d5064,
              map: stoneMap,
              gradientMap,
            })
          : new MeshBasicMaterial({ color: 0x3c3146 }),
      });
      column.rotation.y = sideView ? Math.PI * 0.32 : -Math.PI * 0.12;
      column.position.y = -2.65;
      this.#scene.add(column);
      this.#camera.position.set(sideView ? 5.4 : 3.8, 0.8, 10.8);
      this.#camera.lookAt(0, 0, 0);
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
