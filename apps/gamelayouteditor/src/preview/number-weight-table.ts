import {
  sampleUnbiasedInteger,
  type RandomUint32Source,
} from "./random-reel-scene.js";

const UINT32_RANGE = 0x1_0000_0000;

export function sampleNumberWeightTable(
  entries: readonly Readonly<{ value: number; weight: number }>[],
  randomSource: RandomUint32Source,
): number {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("number weight table 必须包含至少一项。");
  }
  const seen = new Set<number>();
  let totalWeight = 0;
  for (const [index, entry] of entries.entries()) {
    if (!Number.isSafeInteger(entry.value) || entry.value <= 0) {
      throw new Error(`number weight table[${index}].value 必须是正安全整数。`);
    }
    if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
      throw new Error(
        `number weight table[${index}].weight 必须是正安全整数。`,
      );
    }
    if (seen.has(entry.value)) {
      throw new Error(`number weight table value ${entry.value} 重复。`);
    }
    seen.add(entry.value);
    totalWeight += entry.weight;
    if (!Number.isSafeInteger(totalWeight) || totalWeight > UINT32_RANGE) {
      throw new Error(`number weight table 总权重必须在 1..${UINT32_RANGE}。`);
    }
  }
  const sample = sampleUnbiasedInteger(totalWeight, randomSource);
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (sample < cumulative) return entry.value;
  }
  throw new Error("number weight table 累计权重不完整。");
}
