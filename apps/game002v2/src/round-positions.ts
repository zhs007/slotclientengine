export interface Game002v2Position {
  readonly x: number;
  readonly y: number;
}

export function uniqueGame002v2Positions(
  positions: readonly Game002v2Position[],
): readonly Game002v2Position[] {
  return Object.freeze([
    ...new Map(
      positions.map((position) => [positionKey(position), position]),
    ).values(),
  ]);
}

function positionKey({ x, y }: Game002v2Position): string {
  return `${x}:${y}`;
}
