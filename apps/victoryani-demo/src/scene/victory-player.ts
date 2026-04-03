import type { GSAPTimeline } from "gsap";
import { Container, type Application, type Texture } from "pixi.js";
import { registerBuiltinAnimations } from "../animations/index.js";
import type { VictoryProjectConfig } from "../config/victory-types.js";
import { entityManager } from "../core/entitymanager.js";
import { AnimationRegistry } from "../runtime/animation-registry.js";
import { createLayerInstances } from "../runtime/layer-factory.js";
import { applyMasks } from "../runtime/mask-manager.js";
import { buildMasterTimeline, resetLayerInstances } from "../runtime/timeline.js";

export class VictoryPlayer {
  public readonly root = new Container();
  public readonly registry = new AnimationRegistry();
  private readonly instances: ReturnType<typeof createLayerInstances>;
  private timeline: GSAPTimeline | null = null;
  private loop = true;
  private playing = false;
  private currentTime = 0;
  private readonly timeListeners = new Set<(time: number) => void>();
  private readonly stateListeners = new Set<(playing: boolean) => void>();

  constructor(
    private readonly app: Application,
    private readonly project: VictoryProjectConfig,
    textures: Map<string, Texture>
  ) {
    registerBuiltinAnimations(this.registry);
    this.instances = createLayerInstances(project.layers, textures);
    for (const layer of project.layers) {
      this.root.addChild(this.instances.get(layer.id)!.container);
    }
    applyMasks(project.layers, this.instances);
    resetLayerInstances(this.instances);
  }

  play() {
    if (this.playing) {
      return;
    }

    this.timeline = buildMasterTimeline({
      project: this.project,
      registry: this.registry,
      instances: this.instances,
      onTimeUpdate: (time) => {
        this.currentTime = time;
        for (const listener of this.timeListeners) {
          listener(time);
        }
      }
    });

    this.timeline.eventCallback("onComplete", () => {
      this.playing = false;
      this.emitState();
      if (this.loop) {
        queueMicrotask(() => {
          this.replay();
        });
      }
    });
    this.playing = true;
    this.emitState();
    this.timeline.play(0);
  }

  stop() {
    this.timeline?.kill();
    this.timeline = null;
    this.playing = false;
    this.currentTime = 0;
    resetLayerInstances(this.instances);
    this.emitTime();
    this.emitState();
  }

  replay() {
    this.stop();
    this.play();
  }

  setLoop(loop: boolean) {
    this.loop = loop;
  }

  isPlaying() {
    return this.playing;
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.project.duration;
  }

  getLayerCount() {
    return this.project.layers.length;
  }

  getUsedAnimationTypes() {
    return [...new Set(this.project.layers.flatMap((layer) => layer.animations.map((animation) => animation.type)))].sort();
  }

  update(deltaSeconds: number) {
    entityManager.update(deltaSeconds);
    this.app.renderer.render(this.app.stage);
  }

  onTimeChange(listener: (time: number) => void) {
    this.timeListeners.add(listener);
    return () => {
      this.timeListeners.delete(listener);
    };
  }

  onStateChange(listener: (playing: boolean) => void) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  destroy() {
    this.stop();
    this.root.destroy({ children: true });
  }

  private emitTime() {
    for (const listener of this.timeListeners) {
      listener(this.currentTime);
    }
  }

  private emitState() {
    for (const listener of this.stateListeners) {
      listener(this.playing);
    }
  }
}