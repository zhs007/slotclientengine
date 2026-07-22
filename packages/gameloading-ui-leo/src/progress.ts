export interface LeoProgressStyles {
  readonly radialClipPath: string;
  readonly horizontalClipPath: string;
}

export function normalizeLeoProgress(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function createLeoProgressStyles(progress: number): LeoProgressStyles {
  const normalized = normalizeLeoProgress(progress);
  if (normalized === 0) {
    return Object.freeze({
      radialClipPath: "polygon(50% 50%, 50% 50%, 50% 50%)",
      horizontalClipPath: "inset(0 100% 0 0)",
    });
  }
  const angle = normalized * 3.6;
  const points = ["50% 50%", "50% 0%"];
  for (let current = 5; current < angle; current += 5) {
    points.push(pointAtAngle(current));
  }
  if (angle > 0) {
    points.push(pointAtAngle(angle));
  }
  return Object.freeze({
    radialClipPath: `polygon(${points.join(", ")})`,
    horizontalClipPath: `inset(0 ${formatNumber(100 - normalized)}% 0 0)`,
  });
}

function pointAtAngle(angle: number): string {
  const radians = (angle * Math.PI) / 180;
  const x = 50 + 50 * Math.sin(radians);
  const y = 50 - 50 * Math.cos(radians);
  return `${formatNumber(x)}% ${formatNumber(y)}%`;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}
