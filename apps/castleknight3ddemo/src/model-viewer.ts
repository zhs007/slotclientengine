import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SkinnedMesh,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import "./model-viewer.css";

const defaultModelUrl = new URL(
  "./models/castle-knight-rigged-ktx2.glb",
  window.location.href,
).href;
const requiredDefaultClips = new Set(["idle", "attack", "victory", "walk"]);

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing viewer element: #${id}`);
  return element as T;
}

const stage = requiredElement<HTMLElement>("viewer-stage");
const animationSelect = requiredElement<HTMLSelectElement>("animation-select");
const playToggle = requiredElement<HTMLButtonElement>("play-toggle");
const replayButton = requiredElement<HTMLButtonElement>("replay");
const timelineInput = requiredElement<HTMLInputElement>("timeline");
const timelineValue = requiredElement<HTMLOutputElement>("timeline-value");
const speedInput = requiredElement<HTMLInputElement>("speed");
const speedValue = requiredElement<HTMLOutputElement>("speed-value");
const loopInput = requiredElement<HTMLInputElement>("loop-animation");
const skeletonInput = requiredElement<HTMLInputElement>("show-skeleton");
const fileInput = requiredElement<HTMLInputElement>("model-file");
const modelName = requiredElement<HTMLElement>("model-name");
const modelStats = requiredElement<HTMLElement>("model-stats");
const status = requiredElement<HTMLElement>("status");

const scene = new Scene();
scene.background = new Color(0x0c0916);

const camera = new PerspectiveCamera(40, 1, 0.01, 100);
const renderer = new WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.domElement.className = "viewer-canvas";
stage.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 2.2;
controls.maxDistance = 9;

scene.add(new AmbientLight(0x9d8fc0, 0.75));
scene.add(new HemisphereLight(0xb9c9ff, 0x1a1029, 2.35));
const keyLight = new DirectionalLight(0xfff3df, 4.5);
keyLight.position.set(-3.8, 5.2, 4.5);
keyLight.castShadow = true;
scene.add(keyLight);
const rimLight = new DirectionalLight(0x5479ff, 3.1);
rimLight.position.set(4.2, 2.2, -4.2);
scene.add(rimLight);
const warmLight = new DirectionalLight(0xffbc5b, 1.45);
warmLight.position.set(-2.4, 1.1, -3.2);
scene.add(warmLight);

const grid = new GridHelper(8, 24, 0x72552c, 0x2f2742);
grid.position.y = -0.002;
scene.add(grid);

const modelContainer = new Group();
modelContainer.name = "viewer-model-container";
scene.add(modelContainer);

const ktx2Loader = new KTX2Loader().detectSupport(renderer);
const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2Loader);
const timer = new Timer();
timer.connect(document);

let mixer: AnimationMixer | null = null;
let clips: AnimationClip[] = [];
let skeleton: SkeletonHelper | null = null;
let currentModel: Object3D | null = null;
let currentAction: AnimationAction | null = null;
let currentClip: AnimationClip | null = null;
let playing = true;
let destroyed = false;
let loadGeneration = 0;

function disposeModel(model: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value) {
          textures.add(value as Texture);
        }
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function disposeCurrentModel(): void {
  currentAction?.stop();
  mixer?.stopAllAction();
  if (mixer && currentModel) mixer.uncacheRoot(currentModel);
  if (skeleton) {
    scene.remove(skeleton);
    skeleton.dispose();
    skeleton = null;
  }
  if (currentModel) disposeModel(currentModel);
  modelContainer.clear();
  mixer = null;
  currentModel = null;
  currentAction = null;
  currentClip = null;
  clips = [];
}

interface ModelCounts {
  readonly meshes: number;
  readonly triangles: number;
  readonly bones: number;
  readonly skins: number;
}

function countModel(model: Object3D): ModelCounts {
  let meshes = 0;
  let triangles = 0;
  let bones = 0;
  let skins = 0;
  model.traverse((object) => {
    if (object.type === "Bone") bones += 1;
    if (object instanceof SkinnedMesh) skins += 1;
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    const index = object.geometry.index;
    triangles += index
      ? Math.floor(index.count / 3)
      : Math.floor((object.geometry.getAttribute("position")?.count ?? 0) / 3);
  });
  return { meshes, triangles, bones, skins };
}

function populateStats(counts: ModelCounts): void {
  const rows = [
    ["Meshes", counts.meshes.toLocaleString()],
    ["Triangles", counts.triangles.toLocaleString()],
    ["Bones", counts.bones.toLocaleString()],
    ["Skins", counts.skins.toLocaleString()],
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

function frameModel(model: Object3D): void {
  model.updateMatrixWorld(true);
  const initialBounds = new Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new Vector3());
  if (
    initialBounds.isEmpty() ||
    !Number.isFinite(initialSize.y) ||
    initialSize.y <= 0
  ) {
    throw new Error("GLB scene has invalid or empty geometry");
  }

  const largest = Math.max(initialSize.x, initialSize.y, initialSize.z);
  model.scale.setScalar(2.45 / largest);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  model.updateMatrixWorld(true);

  const framedBounds = new Box3().setFromObject(model);
  const framedSize = framedBounds.getSize(new Vector3());
  controls.target.set(0, framedSize.y * 0.5, 0);
  camera.position.set(3.25, framedSize.y * 0.72, 4.15);
  controls.update();
}

function setError(error: unknown): void {
  console.error("GLB animation viewer failed", error);
  status.textContent = error instanceof Error ? error.message : String(error);
  status.classList.add("is-error");
}

function clearError(): void {
  status.classList.remove("is-error");
}

function updateTimeline(): void {
  const duration = currentClip?.duration ?? 0;
  const time = currentAction?.time ?? 0;
  timelineInput.value = String(Math.min(duration, Math.max(0, time)));
  timelineValue.value = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
}

function applyLoopMode(): void {
  if (!currentAction) return;
  currentAction.clampWhenFinished = !loopInput.checked;
  currentAction.setLoop(
    loopInput.checked ? LoopRepeat : LoopOnce,
    loopInput.checked ? Number.POSITIVE_INFINITY : 1,
  );
}

function playClip(name: string): void {
  if (!mixer) throw new Error("Current GLB does not have an animation mixer");
  const clip = clips.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`Animation not found: ${name}`);

  mixer.stopAllAction();
  currentClip = clip;
  currentAction = mixer.clipAction(clip);
  currentAction.reset();
  applyLoopMode();
  currentAction.play();
  playing = true;
  playToggle.textContent = "暂停";
  timelineInput.max = String(clip.duration);
  timelineInput.disabled = false;
  replayButton.disabled = false;
  playToggle.disabled = false;
  updateTimeline();
  clearError();
  status.textContent = `${clip.name} · ${clip.duration.toFixed(2)} 秒 · ${
    loopInput.checked ? "循环播放" : "单次播放"
  }`;
}

function validateDefaultModel(gltf: GLTF, counts: ModelCounts): void {
  if (counts.skins !== 1 || counts.bones !== 20) {
    throw new Error(
      `Default knight GLB requires 1 skin and 20 bones; got ${counts.skins} skin(s), ${counts.bones} bone(s)`,
    );
  }
  const names = new Set(gltf.animations.map((clip) => clip.name));
  if (
    names.size !== requiredDefaultClips.size ||
    [...requiredDefaultClips].some((name) => !names.has(name))
  ) {
    throw new Error(
      `Default knight GLB requires exact clips: ${[...requiredDefaultClips].join(", ")}`,
    );
  }
}

async function loadModel(
  url: string,
  label: string,
  requireKnightContract: boolean,
): Promise<void> {
  const generation = ++loadGeneration;
  let loadedScene: Object3D | null = null;
  clearError();
  status.textContent = "正在准备 GLB 与 KTX2 纹理…";
  animationSelect.disabled = true;

  try {
    const gltf = await gltfLoader.loadAsync(url);
    loadedScene = gltf.scene;
    if (destroyed || generation !== loadGeneration) {
      disposeModel(gltf.scene);
      return;
    }

    const counts = countModel(gltf.scene);
    if (counts.meshes === 0)
      throw new Error("GLB scene does not contain a mesh");
    if (requireKnightContract) validateDefaultModel(gltf, counts);
    frameModel(gltf.scene);
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    });

    disposeCurrentModel();
    currentModel = gltf.scene;
    currentModel.name = label;
    clips = gltf.animations;
    modelContainer.add(currentModel);
    mixer = clips.length > 0 ? new AnimationMixer(currentModel) : null;
    skeleton = counts.bones > 0 ? new SkeletonHelper(currentModel) : null;
    if (skeleton) {
      skeleton.visible = skeletonInput.checked;
      scene.add(skeleton);
    }

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
    populateStats(counts);
    loadedScene = null;

    if (clips.length > 0) {
      const preferred = clips.find((clip) => clip.name === "idle") ?? clips[0];
      animationSelect.value = preferred.name;
      playClip(preferred.name);
    } else {
      playing = false;
      currentAction = null;
      currentClip = null;
      playToggle.disabled = true;
      replayButton.disabled = true;
      timelineInput.disabled = true;
      timelineInput.max = "0";
      timelineInput.value = "0";
      timelineValue.value = "0.00 / 0.00s";
      clearError();
      status.textContent = `模型已载入；没有动画片段，skins ${counts.skins} · bones ${counts.bones}`;
    }
  } catch (error) {
    if (loadedScene) disposeModel(loadedScene);
    if (!destroyed && generation === loadGeneration) {
      animationSelect.disabled = clips.length === 0;
    }
    throw error;
  }
}

async function loadLocalFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    throw new Error(
      `Only self-contained .glb files are supported: ${file.name}`,
    );
  }
  const url = URL.createObjectURL(file);
  try {
    await loadModel(url, file.name, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

animationSelect.addEventListener("change", () => {
  try {
    playClip(animationSelect.value);
  } catch (error) {
    setError(error);
  }
});

playToggle.addEventListener("click", () => {
  if (!currentAction) return;
  playing = !playing;
  playToggle.textContent = playing ? "暂停" : "播放";
  if (playing && currentClip && currentAction.time >= currentClip.duration) {
    currentAction.reset().play();
  }
});

replayButton.addEventListener("click", () => {
  if (currentClip) playClip(currentClip.name);
});

timelineInput.addEventListener("input", () => {
  if (!currentAction || !currentClip) return;
  playing = false;
  playToggle.textContent = "播放";
  currentAction.time = Math.min(
    currentClip.duration,
    Math.max(0, Number(timelineInput.value)),
  );
  currentAction.play();
  mixer?.update(0);
  updateTimeline();
});

speedInput.addEventListener("input", () => {
  speedValue.value = `${Number(speedInput.value).toFixed(2)}×`;
});

loopInput.addEventListener("change", () => {
  applyLoopMode();
  if (currentClip) {
    status.textContent = `${currentClip.name} · ${currentClip.duration.toFixed(
      2,
    )} 秒 · ${loopInput.checked ? "循环播放" : "单次播放"}`;
  }
});

skeletonInput.addEventListener("change", () => {
  if (skeleton) skeleton.visible = skeletonInput.checked;
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadLocalFile(file).catch(setError);
  fileInput.value = "";
});

stage.addEventListener("dragover", (event) => {
  event.preventDefault();
  stage.classList.add("is-dragging");
});
stage.addEventListener("dragleave", (event) => {
  if (event.relatedTarget && stage.contains(event.relatedTarget as Node))
    return;
  stage.classList.remove("is-dragging");
});
stage.addEventListener("drop", (event) => {
  event.preventDefault();
  stage.classList.remove("is-dragging");
  const file = event.dataTransfer?.files[0];
  if (file) void loadLocalFile(file).catch(setError);
});

function resize(): void {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
}

function render(timestamp: number): void {
  if (destroyed) return;
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  if (mixer && currentAction && currentClip && playing) {
    mixer.update(delta * Number(speedInput.value));
    if (
      !loopInput.checked &&
      currentAction.time >= currentClip.duration - 0.0001
    ) {
      playing = false;
      playToggle.textContent = "播放";
    }
    updateTimeline();
  }
  controls.update();
  renderer.render(scene, camera);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stage);
resize();
renderer.setAnimationLoop(render);
void loadModel(defaultModelUrl, "castle-knight-rigged-ktx2.glb", true).catch(
  setError,
);

window.addEventListener(
  "beforeunload",
  () => {
    destroyed = true;
    loadGeneration += 1;
    resizeObserver.disconnect();
    renderer.setAnimationLoop(null);
    disposeCurrentModel();
    controls.dispose();
    ktx2Loader.dispose();
    timer.dispose();
    renderer.dispose();
  },
  { once: true },
);
