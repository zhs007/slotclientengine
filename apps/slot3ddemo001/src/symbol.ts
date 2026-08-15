import {
  Box3,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  NORMAL_MAP_STRENGTH,
  SYMBOL_FIT_HEIGHT,
  SYMBOL_FIT_WIDTH,
} from "./config.js";
import { SYMBOL_CODES, type SymbolCode } from "./scene-data.js";

const MODEL_PATHS: Readonly<Record<SymbolCode, string>> = Object.freeze({
  "megalith-a": "models/megalith-a.glb",
  "megalith-b": "models/megalith-b.glb",
});

interface SymbolTemplate {
  readonly code: SymbolCode;
  readonly root: Group;
}

export interface MegalithSymbolLibrary {
  createInstance(code: SymbolCode): Group;
  dispose(): void;
}

export async function loadMegalithSymbolLibrary(): Promise<MegalithSymbolLibrary> {
  const loader = new GLTFLoader();
  const templates = new Map<SymbolCode, SymbolTemplate>();
  const loaded = await Promise.all(
    SYMBOL_CODES.map(async (code) => {
      const url = new URL(MODEL_PATHS[code], document.baseURI).href;
      const gltf = await loader.loadAsync(url);
      return createTemplate(code, gltf.scene);
    }),
  );
  for (const template of loaded) templates.set(template.code, template);
  return new MegalithSymbolLibraryImpl(templates);
}

class MegalithSymbolLibraryImpl implements MegalithSymbolLibrary {
  readonly #templates: ReadonlyMap<SymbolCode, SymbolTemplate>;
  #disposed = false;

  constructor(templates: ReadonlyMap<SymbolCode, SymbolTemplate>) {
    this.#templates = templates;
  }

  createInstance(code: SymbolCode): Group {
    if (this.#disposed) throw new Error("Megalith symbol library is disposed.");
    const template = this.#templates.get(code);
    if (!template)
      throw new RangeError(`Unknown megalith symbol code: ${code}.`);
    const instance = template.root.clone(true);
    instance.name = `symbol:${code}`;
    instance.userData.symbolCode = code;
    return instance;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const geometries = new Set<unknown>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const template of this.#templates.values()) {
      template.root.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        geometries.add(node.geometry);
        const nodeMaterials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        for (const material of nodeMaterials) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof Texture) textures.add(value);
          }
        }
      });
    }
    for (const geometry of geometries) {
      if (
        typeof geometry === "object" &&
        geometry !== null &&
        "dispose" in geometry &&
        typeof geometry.dispose === "function"
      ) {
        geometry.dispose();
      }
    }
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
  }
}

function createTemplate(code: SymbolCode, source: Object3D): SymbolTemplate {
  source.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(source);
  if (bounds.isEmpty())
    throw new Error(`Megalith model ${code} has empty bounds.`);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    throw new Error(`Megalith model ${code} must have positive 3D bounds.`);
  }
  const scale = Math.min(SYMBOL_FIT_WIDTH / size.x, SYMBOL_FIT_HEIGHT / size.y);
  source.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) tuneMegalithMaterial(material);
  });

  const origin = new Group();
  origin.name = `${code}:contact-origin`;
  origin.position.set(-center.x, -bounds.min.y, -bounds.max.z);
  origin.add(source);

  const scaled = new Group();
  scaled.name = `${code}:uniform-scale`;
  scaled.scale.setScalar(scale);
  scaled.add(origin);

  const root = new Group();
  root.name = `${code}:template`;
  root.add(scaled);
  return Object.freeze({ code, root });
}

export function tuneMegalithMaterial(material: Material): void {
  if (!(material instanceof MeshStandardMaterial)) return;
  material.normalScale.set(NORMAL_MAP_STRENGTH, NORMAL_MAP_STRENGTH);
}
