import { Container } from "pixi.js";
import gsap from "gsap";

export abstract class VisualEntity<TConfig = void> extends Container {
  public finished = false;
  protected timeline: gsap.core.Timeline | null = null;

  abstract init(config: TConfig): void;
  abstract update(deltaSeconds: number): void;
  abstract reset(): void;

  protected beginLifecycle() {
    this.finished = false;
    this.killTimeline();
  }

  protected markFinished() {
    this.finished = true;
  }

  protected killTimeline() {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }
}