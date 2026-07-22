export function createLeoLoadingStyles(selector: string): string {
  return `
${selector} {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: grid;
  place-items: center;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: #000;
  opacity: 1;
  transition: opacity var(--sce-leo-exit-duration) ease;
}
${selector}.sce-leo-loading--exiting { opacity: 0; pointer-events: none; }
${selector} .sce-leo-loading__frame { position: relative; width: min(35em, 92vw); aspect-ratio: 1 / 1; }
${selector} .sce-leo-loading__art { position: absolute; inset: 50% auto auto 50%; width: 100%; max-height: 92vh; transform: translate(-50%, -50%); object-fit: contain; }
${selector} .sce-leo-loading__logo { animation: sce-leo-slide-in 500ms ease-out; }
${selector} .sce-leo-loading__intro, ${selector} .sce-leo-loading__progress-art { opacity: 0; }
${selector} .sce-leo-loading__art[data-visible="true"] { opacity: 1; }
${selector} .sce-leo-loading__progress-art { transition: opacity 300ms ease; }
${selector} .sce-leo-loading__error { position: absolute; right: 24px; bottom: 24px; left: 24px; color: #f87171; font: 600 14px/1.5 ui-sans-serif, system-ui, sans-serif; text-align: center; overflow-wrap: anywhere; }
@keyframes sce-leo-slide-in { from { opacity: 0; transform: translate(-50%, -50%) scale(.8); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
`;
}
