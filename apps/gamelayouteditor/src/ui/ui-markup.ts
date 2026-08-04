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
