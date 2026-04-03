import { Texture } from "pixi.js";
import { VisualEntity } from "../../core/visualentity.js";
import { CabinScene } from "./cabin-scene.js";
import { sampleAnimationPose } from "../../runtime/timeline-sampler.js";
import type { SampledAnimationPose, SpineModel } from "../../runtime/spine-types.js";

export class CabinAnimationEntity extends VisualEntity<{ animationName: string; loop?: boolean }> {
  private readonly scene: CabinScene;
  private elapsedSeconds = 0;
  private loop = true;
  private running = true;
  private readonly defaultAnimationName: string;
  private activeAnimationName: string;
  private lastPose: SampledAnimationPose;

  constructor(model: SpineModel, textures: Record<string, Texture>, initialAnimationName?: string) {
    super();
    this.scene = new CabinScene(model, textures);
    this.addChild(this.scene.view);
    this.defaultAnimationName = initialAnimationName ?? Object.keys(model.animations)[0] ?? "";
    this.activeAnimationName = this.defaultAnimationName;
    this.lastPose = sampleAnimationPose(model, this.activeAnimationName, 0, true);
    this.scene.applyPose(this.lastPose);
    this.model = model;
  }

  private readonly model: SpineModel;

  init(config: { animationName: string; loop?: boolean }) {
    this.beginLifecycle();
    this.loop = config.loop ?? true;
    this.play(config.animationName);
  }

  update(deltaSeconds: number) {
    if (!this.running) {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    this.lastPose = sampleAnimationPose(this.model, this.activeAnimationName, this.elapsedSeconds, this.loop);
    this.scene.applyPose(this.lastPose);
  }

  reset() {
    this.running = false;
    this.elapsedSeconds = 0;
    this.lastPose = sampleAnimationPose(this.model, this.activeAnimationName, 0, this.loop);
    this.scene.applyPose(this.lastPose);
  }

  play(animationName: string) {
    this.activeAnimationName = animationName;
    this.running = true;
    this.elapsedSeconds = 0;
    this.lastPose = sampleAnimationPose(this.model, this.activeAnimationName, 0, this.loop);
    this.scene.applyPose(this.lastPose);
  }

  replay() {
    this.play(this.activeAnimationName);
  }

  stop() {
    this.running = false;
  }

  setLoop(loop: boolean) {
    this.loop = loop;
    this.lastPose = sampleAnimationPose(this.model, this.activeAnimationName, this.elapsedSeconds, this.loop);
    this.scene.applyPose(this.lastPose);
  }

  setPickingEnabled(enabled: boolean) {
    this.scene.setPickingEnabled(enabled);
  }

  setSelectedNode(nodeId: string | null) {
    this.scene.setSelectedNode(nodeId);
  }

  onBoneSelected(listener: (boneName: string) => void) {
    return this.scene.onBoneSelected(listener);
  }

  get currentAnimationName() {
    return this.activeAnimationName;
  }

  get currentTime() {
    return this.elapsedSeconds;
  }

  getCurrentPose() {
    return this.lastPose;
  }
}