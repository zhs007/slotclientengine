import { createRuntimeGame } from "./create-game.js";
import { receiveRuntimeLaunchPayload } from "./launch-channel.js";

export async function startRuntimeWindow(root: HTMLElement): Promise<void> {
  root.className = "runtime-root";
  root.innerHTML = `
    <div class="runtime-status">
      <div class="runtime-spinner" aria-hidden="true"></div>
      <p data-runtime-status>正在验证一次性启动会话…</p>
    </div>
  `;
  const status = root.querySelector<HTMLElement>("[data-runtime-status]")!;
  try {
    const payload = await receiveRuntimeLaunchPayload();
    status.textContent = "正在严格加载运行包并连接 live session…";
    const destroy = await createRuntimeGame(root, payload);
    window.addEventListener("pagehide", destroy, { once: true });
  } catch (error) {
    root.innerHTML = `
      <section class="runtime-error" role="alert">
        <p class="eyebrow">RUNTIME BOOT FAILED</p>
        <h1>游戏实例未启动</h1>
        <p>${escapeHtml(formatError(error))}</p>
        <small>启动凭据、原始 GMI 与 ZIP 内容不会写入此页面或本地存储。</small>
      </section>
    `;
  }
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
