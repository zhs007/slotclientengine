import type { SceneMatrix } from "@slotclientengine/gameframeworks";
import type { GridCellCoordinate } from "@slotclientengine/rendercore";

export interface NearwinLandingState {
  readonly activationGate: Readonly<{ readonly x: number; readonly y: number }>;
  readonly wildPositions: readonly Readonly<{
    readonly x: number;
    readonly y: number;
  }>[];
}

export interface NearwinPosition {
  readonly x: number;
  readonly y: number;
}

export interface NearwinPresentationTarget {
  hasMainReelSymbolStateCapability(
    position: NearwinPosition,
    state: string,
  ): boolean;
  requestMainReelSymbolStates(
    positions: readonly NearwinPosition[],
    state: string,
    restart: "immediate",
  ): void;
}

export function createNearwinLandingState(
  scene: SceneMatrix,
  wildCode: number,
  order: readonly GridCellCoordinate[],
): NearwinLandingState | null {
  const wildPositions = order
    .filter(({ x, y }) => scene[x]?.[y] === wildCode)
    .map(({ x, y }) => Object.freeze({ x, y }));
  if (wildPositions.length < 2) return null;
  return Object.freeze({
    activationGate: wildPositions[1]!,
    wildPositions: Object.freeze(wildPositions),
  });
}

export class Game002v2NearwinController {
  readonly #target: NearwinPresentationTarget;
  readonly #activationGate: NearwinPosition;
  readonly #wildKeys: ReadonlySet<string>;
  readonly #landed = new Map<string, NearwinPosition>();
  readonly #requested = new Map<string, NearwinPosition>();
  #activated = false;

  constructor(state: NearwinLandingState, target: NearwinPresentationTarget) {
    this.#target = target;
    this.#activationGate = state.activationGate;
    this.#wildKeys = new Set(state.wildPositions.map(positionKey));
  }

  update(
    landed: readonly NearwinPosition[],
    activated: readonly NearwinPosition[],
  ): void {
    const newlyLandedWilds = landed.filter((position) =>
      this.#wildKeys.has(positionKey(position)),
    );
    for (const position of newlyLandedWilds)
      this.#landed.set(positionKey(position), position);
    if (activated.length > 0) {
      if (
        activated.length !== 1 ||
        positionKey(activated[0]!) !== positionKey(this.#activationGate) ||
        this.#activated
      )
        throw new Error(
          "game002v2 received an invalid Nearwin activation edge.",
        );
      this.#activated = true;
      this.request([...this.#landed.values()]);
    } else if (this.#activated) {
      this.request(newlyLandedWilds);
    }
  }

  finish(): void {
    if (this.#requested.size === 0) return;
    this.#target.requestMainReelSymbolStates(
      [...this.#requested.values()],
      "normal",
      "immediate",
    );
    this.#requested.clear();
  }

  private request(positions: readonly NearwinPosition[]): void {
    const pending = positions.filter(
      (position) => !this.#requested.has(positionKey(position)),
    );
    if (pending.length === 0) return;
    for (const position of pending)
      if (
        !this.#target.hasMainReelSymbolStateCapability(position, "Reel_NearWin")
      )
        throw new Error(
          `game002v2 WL at (${position.x},${position.y}) cannot play Reel_NearWin.`,
        );
    this.#target.requestMainReelSymbolStates(
      pending,
      "Reel_NearWin",
      "immediate",
    );
    for (const position of pending)
      this.#requested.set(positionKey(position), position);
  }
}

function positionKey({ x, y }: NearwinPosition): string {
  return `${x}:${y}`;
}
