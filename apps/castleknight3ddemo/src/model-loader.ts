import { Box3, Group, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

interface NormalizedGlbOptions {
  readonly url: string;
  readonly rootName: string;
  readonly height: number;
  readonly verticalAnchor: "bottom" | "center";
}

function normalizeModel(model: Group, options: NormalizedGlbOptions): Group {
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) {
    throw new Error(`${options.rootName} GLB has invalid or empty geometry.`);
  }

  model.scale.multiplyScalar(options.height / size.y);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.y -=
    options.verticalAnchor === "bottom" ? bounds.min.y : center.y;
  model.position.z -= center.z;

  const root = new Group();
  root.name = options.rootName;
  root.add(model);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

export function createNormalizedGlbLoader(
  options: NormalizedGlbOptions,
): () => Promise<Group> {
  let modelPromise: Promise<Group> | undefined;
  return () => {
    modelPromise ??= new GLTFLoader()
      .loadAsync(options.url)
      .then((gltf) => normalizeModel(gltf.scene, options));
    return modelPromise;
  };
}
