import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { VisualEntity } from "../../src/core/visualentity";

class TestEntity extends VisualEntity {
  init(_config?: unknown) {
    this.finished = false;
    this.killTimeline();
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.finished = true;
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
