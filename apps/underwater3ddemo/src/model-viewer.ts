import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationClip,
  AnimationMixer,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  LoopRepeat,
  Mesh,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./model-viewer.css";

const defaultModelUrl = new URL(
  "../assets/models/20260829155447_d0c3ff02-rigged.glb",
  import.meta.url,
).href;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing viewer element: #${id}`);
  return element as T;
}

const stage = requiredElement<HTMLElement>("viewer-stage");
const animationSelect = requiredElement<HTMLSelectElement>("animation-select");
const playToggle = requiredElement<HTMLButtonElement>("play-toggle");
const replayButton = requiredElement<HTMLButtonElement>("replay");
const speedInput = requiredElement<HTMLInputElement>("speed");
const speedValue = requiredElement<HTMLOutputElement>("speed-value");
const skeletonInput = requiredElement<HTMLInputElement>("show-skeleton");
const fileInput = requiredElement<HTMLInputElement>("model-file");
const modelName = requiredElement<HTMLElement>("model-name");
const modelStats = requiredElement<HTMLElement>("model-stats");
const status = requiredElement<HTMLElement>("status");

const scene = new Scene();
scene.background = new Color(0x051c35);
const camera = new PerspectiveCamera(42, 1, 0.01, 100);
const renderer = new WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.domElement.className = "viewer-canvas";
stage.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 1.7;
controls.maxDistance = 8;

scene.add(new AmbientLight(0x8ecbf0, 1.15));
scene.add(new HemisphereLight(0xa8edff, 0x031226, 2.3));
const keyLight = new DirectionalLight(0xffffff, 4.2);
keyLight.position.set(-3.5, 5, 4);
keyLight.castShadow = true;
scene.add(keyLight);
const rimLight = new DirectionalLight(0x36bfff, 3.1);
rimLight.position.set(4, 1, -4);
scene.add(rimLight);
const grid = new GridHelper(8, 24, 0x176184, 0x0a3955);
grid.position.y = -1.18;
scene.add(grid);

const modelContainer = new Group();
scene.add(modelContainer);
const clock = new Clock();
let mixer: AnimationMixer | null = null;
let clips: AnimationClip[] = [];
let skeleton: SkeletonHelper | null = null;
let currentModel: Object3D | null = null;
let playing = true;
let destroyed = false;

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && "isTexture" in value) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeCurrentModel(): void {
  mixer?.stopAllAction();
  if (mixer && currentModel) mixer.uncacheRoot(currentModel);
  skeleton?.dispose();
  skeleton = null;
  if (currentModel) {
    currentModel.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) disposeMaterial(material);
    });
  }
  modelContainer.clear();
  mixer = null;
  currentModel = null;
  clips = [];
}

function countModel(model: Object3D): {
  meshes: number;
  triangles: number;
  bones: number;
} {
  let meshes = 0;
  let triangles = 0;
  let bones = 0;
  model.traverse((object) => {
    if (object.type === "Bone") bones += 1;
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    const index = object.geometry.index;
    triangles += index
      ? Math.floor(index.count / 3)
      : Math.floor((object.geometry.getAttribute("position")?.count ?? 0) / 3);
  });
  return { meshes, triangles, bones };
}

function populateStats(model: Object3D): void {
  const counts = countModel(model);
  const rows = [
    ["Meshes", counts.meshes.toLocaleString()],
    ["Triangles", counts.triangles.toLocaleString()],
    ["Bones", counts.bones.toLocaleString()],
    ["Animations", clips.length.toLocaleString()],
  ];
  modelStats.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    }),
  );
}

function playClip(name: string): void {
  if (!mixer) return;
  const clip = clips.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`Animation not found: ${name}`);
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
  action.play();
  playing = true;
  playToggle.textContent = "暂停";
  status.textContent = `${clip.name} · ${clip.duration.toFixed(2)} 秒 · 循环播放`;
}

function frameModel(model: Object3D): void {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 2.15 / largest;
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const framedBox = new Box3().setFromObject(model);
  const framedCenter = framedBox.getCenter(new Vector3());
  model.position.sub(framedCenter);
  camera.position.set(3.2, 1.35, 3.6);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function loadModel(url: string, label: string): Promise<void> {
  status.textContent = "正在载入模型…";
  animationSelect.disabled = true;
  const gltf: GLTF = await new GLTFLoader().loadAsync(url);
  disposeCurrentModel();
  currentModel = gltf.scene;
  currentModel.name = label;
  frameModel(currentModel);
  currentModel.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });
  modelContainer.add(currentModel);
  clips = gltf.animations;
  mixer = new AnimationMixer(currentModel);
  skeleton = new SkeletonHelper(currentModel);
  skeleton.visible = skeletonInput.checked;
  scene.add(skeleton);

  animationSelect.replaceChildren(
    ...clips.map((clip) => {
      const option = document.createElement("option");
      option.value = clip.name;
      option.textContent = `${clip.name} (${clip.duration.toFixed(2)}s)`;
      return option;
    }),
  );
  animationSelect.disabled = clips.length === 0;
  modelName.textContent = label;
  populateStats(currentModel);
  if (clips.length > 0) {
    const preferred = clips.find((clip) => clip.name === "idle") ?? clips[0];
    animationSelect.value = preferred.name;
    playClip(preferred.name);
  } else {
    status.textContent = "模型没有动画片段";
  }
}

async function loadLocalFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    await loadModel(url, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

animationSelect.addEventListener("change", () =>
  playClip(animationSelect.value),
);
playToggle.addEventListener("click", () => {
  playing = !playing;
  playToggle.textContent = playing ? "暂停" : "播放";
});
replayButton.addEventListener("click", () => playClip(animationSelect.value));
speedInput.addEventListener("input", () => {
  speedValue.value = `${Number(speedInput.value).toFixed(2)}×`;
});
skeletonInput.addEventListener("change", () => {
  if (skeleton) skeleton.visible = skeletonInput.checked;
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadLocalFile(file).catch(showError);
});
stage.addEventListener("dragover", (event) => {
  event.preventDefault();
  stage.classList.add("is-dragging");
});
stage.addEventListener("dragleave", () =>
  stage.classList.remove("is-dragging"),
);
stage.addEventListener("drop", (event) => {
  event.preventDefault();
  stage.classList.remove("is-dragging");
  const file = event.dataTransfer?.files[0];
  if (file) void loadLocalFile(file).catch(showError);
});

function showError(error: unknown): void {
  console.error("GLB viewer failed", error);
  status.textContent = error instanceof Error ? error.message : String(error);
  status.classList.add("is-error");
}

function resize(): void {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
}

function render(): void {
  if (destroyed) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  if (mixer && playing) mixer.update(delta * Number(speedInput.value));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stage);
resize();
render();
void loadModel(defaultModelUrl, "20260829155447_d0c3ff02-rigged.glb").catch(
  showError,
);

window.addEventListener(
  "beforeunload",
  () => {
    destroyed = true;
    resizeObserver.disconnect();
    disposeCurrentModel();
    controls.dispose();
    renderer.dispose();
  },
  { once: true },
);
