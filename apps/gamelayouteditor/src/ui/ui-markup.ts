export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function numberField(
  label: string,
  path: string,
  value: number,
  step = 1,
  min?: number,
  max?: number,
): string {
  return `<label>${escapeHtml(label)}<input type="number" step="${step}"${min === undefined ? "" : ` min="${min}"`}${max === undefined ? "" : ` max="${max}"`} data-number="${escapeHtml(path)}" value="${value}" /></label>`;
}

export function statusText(status: "ready" | "incomplete" | "error"): string {
  if (status === "ready") return "就绪";
  if (status === "incomplete") return "不完整";
  return "错误";
}

export function runtimeAddressMarkup(
  label: string,
  address: string,
  hint = "由当前 editor identity 派生，不写入 manifest。",
): string {
  return `<section class="inspector-section" data-runtime-address-inspector><h3>${escapeHtml(label)}</h3><p class="path"><code data-runtime-address>${escapeHtml(address)}</code></p><button type="button" data-copy-runtime-address="${escapeHtml(address)}">复制地址</button><p class="hint">${escapeHtml(hint)}</p></section>`;
}
