import { FateThreadSimulation } from "../src/physics/fate-thread-simulation.js";

describe("FateThreadSimulation", () => {
  it("builds a continuous particle chain pinned to every anchor", () => {
    const simulation = new FateThreadSimulation(
      [
        { x: 0, y: 0 },
        { x: 100, y: 20 },
        { x: 220, y: -10 },
      ],
      { segmentsPerSpan: 5 },
    );

    expect(simulation.points).toHaveLength(11);
    expect(simulation.anchorParticleIndices).toEqual([0, 5, 10]);
    expect(simulation.points[5]).toEqual({ x: 100, y: 20 });
  });

  it("keeps anchors exact while free particles react to gravity and wind", () => {
    const simulation = new FateThreadSimulation(
      [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
      ],
      { segmentsPerSpan: 8, sag: 0, wind: 20 },
    );
    const initialMiddleY = simulation.points[4].y;

    for (let frame = 0; frame < 30; frame += 1) {
      simulation.step(1 / 60, frame / 60);
    }

    expect(simulation.points[0]).toEqual({ x: 0, y: 0 });
    expect(simulation.points[8]).toEqual({ x: 180, y: 0 });
    expect(simulation.points[4].y).toBeGreaterThan(initialMiddleY);
  });

  it("moves a dragged anchor and settles adjacent rope segments without NaN", () => {
    const simulation = new FateThreadSimulation(
      [
        { x: 0, y: 0 },
        { x: 120, y: 40 },
        { x: 240, y: 0 },
      ],
      { segmentsPerSpan: 6 },
    );

    simulation.setAnchor(1, { x: 150, y: -30 });
    simulation.pluck(12);
    for (let frame = 0; frame < 60; frame += 1) {
      simulation.step(1 / 60, frame / 60);
    }

    expect(simulation.getAnchor(1)).toEqual({ x: 150, y: -30 });
    expect(simulation.points[6]).toEqual({ x: 150, y: -30 });
    expect(
      simulation.points.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    ).toBe(true);
  });

  it("restores the authored anchor layout on reset", () => {
    const simulation = new FateThreadSimulation([
      { x: 10, y: 20 },
      { x: 200, y: 80 },
    ]);
    simulation.setAnchor(0, { x: 90, y: 100 });

    simulation.reset();

    expect(simulation.getAnchor(0)).toEqual({ x: 10, y: 20 });
    expect(simulation.points[0]).toEqual({ x: 10, y: 20 });
  });
});
