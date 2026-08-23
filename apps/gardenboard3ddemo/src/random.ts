export interface RandomSource {
  next(): number;
  range(min: number, max: number): number;
  integer(min: number, maxInclusive: number): number;
}

export function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    integer: (min, maxInclusive) =>
      Math.floor(min + next() * (maxInclusive - min + 1)),
  };
}
