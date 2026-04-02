import { Container } from "pixi.js";
import gsap from "gsap";

export abstract class VisualEntity extends Container {
  public finished = false;
  protected timeline: gsap.core.Timeline | null = null;

  abstract init(config: unknown): void;
  abstract update(delta: number): void;
  abstract reset(): void;

  protected killTimeline() {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
  }
}
