export type CanvasLayoutInput = {
  designWidth: number;
  designHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type CanvasLayout = {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function computeCanvasLayout({
  designWidth,
  designHeight,
  viewportWidth,
  viewportHeight
}: CanvasLayoutInput): CanvasLayout {
  const rawScale = Math.min(viewportWidth / designWidth, viewportHeight / designHeight, 1);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const width = Math.round(designWidth * scale);
  const height = Math.round(designHeight * scale);
  const offsetX = Math.max(0, Math.floor((viewportWidth - width) / 2));
  const offsetY = Math.max(0, Math.floor((viewportHeight - height) / 2));

  return {
    width,
    height,
    scale,
    offsetX,
    offsetY
  };
}