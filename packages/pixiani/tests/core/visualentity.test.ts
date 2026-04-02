import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { VisualEntity } from "../../src/core/visualentity.js";

class TestEntity extends VisualEntity<Record<string, never>> {
  init(_config: Record<string, never>) {
    this.beginLifecycle();
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.markFinished();
      }
    });
    this.timeline.to(this, { duration: 0.1 });
  }

  update() {}

  reset() {
    this.killTimeline();
  }
}

describe("VisualEntity", () => {
  it("creates and kills timelines", () => {
    const entity = new TestEntity();
    entity.init({});
    const timeline = (entity as unknown as { timeline: gsap.core.Timeline | null }).timeline;
    expect(timeline).toBeTruthy();

    timeline?.progress(1);
    expect(entity.finished).toBe(true);

    entity.reset();
    const afterReset = (entity as unknown as { timeline: gsap.core.Timeline | null }).timeline;
    expect(afterReset).toBeNull();
  });
});
