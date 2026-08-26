import { Box3, Group, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BARREL_MODEL_URL = "./models/castle-barrel.glb";
const BARREL_HEIGHT = 1.36;

function normalizeBarrelModel(model: Group): Group {
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) {
    throw new Error("Castle barrel GLB has invalid or empty geometry.");
  }

  model.scale.multiplyScalar(BARREL_HEIGHT / size.y);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;

  const root = new Group();
  root.name = "castle-barrel-glb";
  root.add(model);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

let barrelModelPromise: Promise<Group> | undefined;

export function loadCastleBarrelModel(): Promise<Group> {
  barrelModelPromise ??= new GLTFLoader()
    .loadAsync(BARREL_MODEL_URL)
    .then((gltf) => normalizeBarrelModel(gltf.scene));
  return barrelModelPromise;
}
