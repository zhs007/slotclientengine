import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { applyFrontCameraFrame, createFrontCamera } from "./camera.js";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  IMPACT,
  SYMBOL_FIT_HEIGHT,
  SYMBOL_FIT_WIDTH,
  WALL_BASE_Y,
  WALL_COLUMNS,
  WALL_ROWS,
} from "./config.js";
import {
  ImpactDustSystem,
  sampleImpactCameraOffset,
} from "./impact-effects.js";
import {
  calculateDropY,
  createDropSchedule,
  type DropScheduleEntry,
} from "./drop-timeline.js";
import type { MegalithScene } from "./scene-data.js";
import type { MegalithSymbolLibrary } from "./symbol.js";

interface ActiveStone {
  readonly object: Group;
  readonly schedule: DropScheduleEntry;
  settled: boolean;
}

interface ActiveDrop {
  readonly root: Group;
  readonly stones: readonly ActiveStone[];
  readonly startedAtSeconds: number;
  readonly onImpact: (settledCount: number, total: number) => void;
  readonly onComplete: () => void;
  settledCount: number;
  complete: boolean;
}

export interface StartDropOptions {
  readonly onImpact?: (settledCount: number, total: number) => void;
  readonly onComplete?: () => void;
}

export class MegalithWallRenderer {
  readonly #host: HTMLElement;
  readonly #symbols: MegalithSymbolLibrary;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera;
  readonly #cameraHome = new Vector3();
  readonly #cameraTarget = new Vector3();
  readonly #environment = new Group();
  readonly #impactLight = new PointLight(0xffc879, 0, 18, 2);
  readonly #dust: ImpactDustSystem;
  #activeDrop: ActiveDrop | null = null;
  #impactEnergy = 0;
  #cameraImpactEnergy = 0;
  #lastFrameSeconds = 0;
  #destroyed = false;

  constructor(host: HTMLElement, symbols: MegalithSymbolLibrary) {
    this.#host = host;
    this.#symbols = symbols;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    this.#camera = createFrontCamera(width / height);
    this.#renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "three-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;
    host.prepend(this.#renderer.domElement);

    this.#scene.background = new Color(0x080704);
    this.#scene.fog = new Fog(0x080704, 20, 48);
    this.#createEnvironment();
    this.#dust = new ImpactDustSystem(this.#scene);
    this.resize(width, height);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  startDrop(scene: MegalithScene, options: StartDropOptions = {}): void {
    this.#requireAlive();
    this.#clearDrop();
    const schedule = createDropSchedule(scene);
    const root = new Group();
    root.name = "active-megalith-wall";
    const stones = schedule.map((entry) => {
      const object = this.#symbols.createInstance(entry.code);
      object.position.set(entry.finalX, entry.startY, 0);
      object.visible = false;
      root.add(object);
      return { object, schedule: entry, settled: false };
    });
    this.#scene.add(root);
    this.#activeDrop = {
      root,
      stones,
      startedAtSeconds: performance.now() / 1000,
      onImpact: options.onImpact ?? (() => undefined),
      onComplete: options.onComplete ?? (() => undefined),
      settledCount: 0,
      complete: false,
    };
  }

  resize(width: number, height: number): void {
    this.#requireAlive();
    const safeWidth = Math.max(Math.floor(width), 1);
    const safeHeight = Math.max(Math.floor(height), 1);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.#renderer.setSize(safeWidth, safeHeight, false);
    applyFrontCameraFrame(this.#camera, safeWidth / safeHeight);
    this.#cameraHome.copy(this.#camera.position);
    this.#cameraTarget.set(0, this.#camera.position.y, 0);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);
    this.#clearDrop();
    this.#dust.destroy();
    this.#environment.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const material of materials) material.dispose();
    });
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#host.style.transform = "";
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    const timeSeconds = timeMilliseconds / 1000;
    const deltaSeconds = Math.min(
      Math.max(timeSeconds - this.#lastFrameSeconds, 0),
      0.1,
    );
    this.#lastFrameSeconds = timeSeconds;
    this.#updateDrop(timeSeconds);
    this.#dust.update(deltaSeconds);
    this.#impactEnergy *= Math.exp(
      -IMPACT.lightDecayPerSecond * deltaSeconds,
    );
    this.#impactLight.intensity = this.#impactEnergy;
    this.#cameraImpactEnergy *= Math.exp(
      -IMPACT.cameraDecayPerSecond * deltaSeconds,
    );
    const cameraOffset = sampleImpactCameraOffset(
      timeSeconds,
      this.#cameraImpactEnergy,
    );
    this.#camera.position
      .copy(this.#cameraHome)
      .add(new Vector3(cameraOffset.x, cameraOffset.y, cameraOffset.z));
    this.#camera.lookAt(
      this.#cameraTarget.x,
      this.#cameraTarget.y + cameraOffset.y * 0.18,
      this.#cameraTarget.z,
    );
    if (this.#cameraImpactEnergy > 0.008) {
      const screenX = cameraOffset.x * 42;
      const screenY = cameraOffset.y * 54;
      this.#host.style.transform = `translate3d(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px, 0) scale(1.018)`;
    } else if (this.#host.style.transform) {
      this.#host.style.transform = "";
    }
    this.#renderer.render(this.#scene, this.#camera);
  };

  #updateDrop(timeSeconds: number): void {
    const active = this.#activeDrop;
    if (!active || active.complete) return;
    const elapsedSeconds = timeSeconds - active.startedAtSeconds;
    for (const stone of active.stones) {
      if (stone.settled) continue;
      const y = calculateDropY(stone.schedule, elapsedSeconds);
      if (y === null) continue;
      stone.object.visible = true;
      stone.object.position.y = y;
      if (
        elapsedSeconds <
        stone.schedule.delaySeconds + stone.schedule.durationSeconds
      ) {
        continue;
      }
      stone.object.position.y = stone.schedule.finalY;
      stone.settled = true;
      active.settledCount += 1;
      this.#impactLight.position.set(
        stone.schedule.finalX,
        stone.schedule.finalY + 0.42,
        4.1,
      );
      this.#impactEnergy = Math.min(
        this.#impactEnergy + IMPACT.lightEnergyPerStone,
        IMPACT.lightEnergyLimit,
      );
      this.#cameraImpactEnergy = Math.min(
        this.#cameraImpactEnergy + IMPACT.cameraEnergyPerStone,
        IMPACT.cameraEnergyLimit,
      );
      this.#dust.spawn(
        stone.schedule.finalX,
        stone.schedule.finalY + 0.08,
        stone.schedule.row * 101 + stone.schedule.column * 17 + 1,
      );
      active.onImpact(active.settledCount, active.stones.length);
    }
    if (active.settledCount !== active.stones.length) return;
    active.complete = true;
    active.onComplete();
  }

  #createEnvironment(): void {
    const wallWidth = (WALL_COLUMNS - 1) * CELL_WIDTH + SYMBOL_FIT_WIDTH;
    const wallHeight = (WALL_ROWS - 1) * CELL_HEIGHT + SYMBOL_FIT_HEIGHT;
    const plinthMaterial = new MeshStandardMaterial({
      color: 0x30281d,
      roughness: 0.94,
      metalness: 0.02,
    });
    const plinth = new Mesh(
      new BoxGeometry(wallWidth + 1.15, 0.52, 2.65),
      plinthMaterial,
    );
    plinth.name = "megalith-plinth";
    plinth.position.set(0, 0.02, -0.82);
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    this.#environment.add(plinth);

    const backing = new Mesh(
      new BoxGeometry(wallWidth + 1.8, wallHeight + 1.4, 0.38),
      new MeshStandardMaterial({
        color: 0x17140f,
        roughness: 1,
        metalness: 0,
      }),
    );
    backing.name = "shadowed-wall-backdrop";
    backing.position.set(0, WALL_BASE_Y + wallHeight / 2 - 0.12, -2.32);
    backing.receiveShadow = true;
    this.#environment.add(backing);

    const hemisphere = new HemisphereLight(0xb8cad0, 0x2b1a0f, 2.25);
    const key = new DirectionalLight(0xffdfaf, 4.8);
    key.position.set(-7, 12, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 32;

    const rim = new DirectionalLight(0x758da2, 2.4);
    rim.position.set(8, 7, -4);
    this.#impactLight.position.set(0, 3.2, 5.5);
    this.#environment.add(hemisphere, key, rim, this.#impactLight);
    this.#scene.add(this.#environment);
  }

  #clearDrop(): void {
    const active = this.#activeDrop;
    if (!active) return;
    active.root.removeFromParent();
    active.root.clear();
    this.#activeDrop = null;
    this.#impactEnergy = 0;
    this.#cameraImpactEnergy = 0;
    this.#dust.clear();
    this.#camera.position.copy(this.#cameraHome);
    this.#camera.lookAt(this.#cameraTarget);
    this.#host.style.transform = "";
  }

  #requireAlive(): void {
    if (this.#destroyed)
      throw new Error("Megalith wall renderer is destroyed.");
  }
}
