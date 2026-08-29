import {
  AnimationMixer,
  Box3,
  Group,
  LoopRepeat,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createSymbolPlacements, type SymbolPlacement } from "./layout.js";

const modelUrl = new URL(
  "../assets/models/20260829155447_d0c3ff02-rigged.glb",
  import.meta.url,
).href;

const requiredAnimations = ["idle", "win", "land"] as const;

interface PufferfishActor {
  readonly anchor: Group;
  readonly model: Object3D;
  readonly mixer: AnimationMixer;
  readonly placement: SymbolPlacement;
  readonly bobSpeed: number;
  readonly bobHeight: number;
  readonly swayAmount: number;
}

export function selectSymbolAnimation(
  placement: Pick<SymbolPlacement, "column" | "row">,
): (typeof requiredAnimations)[number] {
  return requiredAnimations[(placement.row + placement.column * 2) % 3];
}

export class SymbolField extends Object3D {
  readonly #placements: SymbolPlacement[];
  readonly #actors: PufferfishActor[] = [];
  #lastUpdateTime = 0;
  #loadError: Error | null = null;
  #disposed = false;

  constructor(seed: number) {
    super();
    this.name = "animated-pufferfish-symbol-grid";
    this.#placements = createSymbolPlacements(seed);
    void this.#loadModel();
  }

  update(time: number): void {
    if (this.#loadError) {
      const error = this.#loadError;
      this.#loadError = null;
      throw error;
    }

    const delta = Math.min(0.05, Math.max(0, time - this.#lastUpdateTime));
    this.#lastUpdateTime = time;
    for (const actor of this.#actors) {
      actor.mixer.update(delta);
      const phase = actor.placement.phase;
      actor.anchor.position.y =
        actor.placement.y +
        Math.sin(time * actor.bobSpeed + phase) * actor.bobHeight;
      actor.anchor.rotation.z =
        Math.sin(time * (actor.bobSpeed * 0.63) + phase * 1.7) *
        actor.swayAmount;
    }
  }

  dispose(): void {
    this.#disposed = true;
    for (const actor of this.#actors) {
      actor.mixer.stopAllAction();
      actor.mixer.uncacheRoot(actor.model);
    }
    this.#actors.length = 0;
  }

  async #loadModel(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      if (this.#disposed) return;

      const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
      for (const name of requiredAnimations) {
        if (!clips.has(name)) {
          throw new Error(
            `Pufferfish GLB is missing required animation: ${name}`,
          );
        }
      }

      for (let index = 0; index < this.#placements.length; index += 1) {
        const placement = this.#placements[index];
        const anchor = new Group();
        anchor.name = `pufferfish-symbol-${placement.row}-${placement.column}`;
        anchor.position.set(placement.x, placement.y, placement.z);

        const model = cloneSkeleton(gltf.scene);
        model.rotation.y = -Math.PI / 2;
        model.scale.setScalar(0.92 * placement.scale);
        model.updateMatrixWorld(true);

        const center = new Box3().setFromObject(model).getCenter(new Vector3());
        model.position.sub(center);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        });
        anchor.add(model);
        this.add(anchor);

        const animationName = selectSymbolAnimation(placement);
        const clip = clips.get(animationName);
        if (!clip) throw new Error(`Missing animation clip: ${animationName}`);
        const mixer = new AnimationMixer(model);
        const action = mixer.clipAction(clip);
        action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
        action.timeScale = 0.76 + ((index * 17) % 41) / 100;
        action.play();
        mixer.setTime(
          (placement.phase / (Math.PI * 2)) * Math.max(clip.duration, 0.01),
        );

        this.#actors.push({
          anchor,
          model,
          mixer,
          placement,
          bobSpeed: 0.82 + ((index * 13) % 29) / 32,
          bobHeight: 0.035 + ((index * 7) % 9) / 180,
          swayAmount: 0.018 + ((index * 11) % 13) / 430,
        });
      }
    } catch (error) {
      this.#loadError =
        error instanceof Error
          ? error
          : new Error(`Failed to load pufferfish GLB: ${String(error)}`);
    }
  }
}
