import type {
  EditorImportConflictResolution,
  EditorImportResolution,
  EditorImportReview,
} from "@slotclientengine/editorresource";

export async function requestSymbolImportReview(
  host: HTMLElement,
  review: EditorImportReview,
  options: {
    readonly keepBothDisabledItemIndexes?: ReadonlySet<number>;
  } = {},
): Promise<readonly EditorImportResolution[] | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "import-review-dialog";
  dialog.dataset.importReview = "";
  dialog.innerHTML = `
    <form method="dialog" class="import-review-shell">
      <header><div><small>原子导入审查</small><h2>确认资源 filename key</h2></div></header>
      <div class="import-review-actions">
        <button type="button" data-import-all="overwrite">全部替换同名</button>
        <button type="button" data-import-all="keep-both">全部保留两份</button>
      </div>
      <div class="import-review-list"></div>
      <footer>
        <button type="button" data-import-cancel>取消</button>
        <button type="button" class="primary" data-import-confirm>原子提交</button>
      </footer>
    </form>`;
  const list = dialog.querySelector<HTMLElement>(".import-review-list")!;
  for (const [index, item] of review.items.entries()) {
    const keepBothDisabled =
      options.keepBothDisabledItemIndexes?.has(index) ?? false;
    const row = document.createElement("article");
    row.className = "import-review-row";
    row.innerHTML = `
      <div><strong></strong><small></small></div>
      <div class="import-review-impact"></div>
      ${
        item.action === "overwrite" || item.action === "rename-required"
          ? item.action === "rename-required" && keepBothDisabled
            ? '<span class="inline-error">同批 structured resource 冲突必须拆分后重新导入</span>'
            : `<label>冲突处理<select data-import-resolution="${index}">
              ${
                item.action === "overwrite"
                  ? '<option value="overwrite">替换同名资源（配置不变）</option>'
                  : ""
              }
              ${
                keepBothDisabled
                  ? ""
                  : '<option value="keep-both">保留两份（自动 suffix）</option>'
              }
            </select></label>`
          : `<span class="status-${item.action}">${item.action === "noop" ? "相同 bytes，不变" : "新增"}</span>`
      }`;
    row.querySelector("strong")!.textContent = item.targetKey;
    row.querySelector("small")!.textContent =
      `${item.incoming.byteLength} bytes · ${item.incoming.mediaType}`;
    row.querySelector<HTMLElement>(".import-review-impact")!.textContent =
      item.references.length > 0
        ? `现有引用：${item.references.map(({ location }) => location).join("、")}`
        : "无现有引用";
    list.append(row);
  }
  if (
    review.items.some(
      (item, index) =>
        item.action === "rename-required" &&
        options.keepBothDisabledItemIndexes?.has(index),
    )
  )
    dialog
      .querySelector<HTMLButtonElement>("[data-import-confirm]")!
      .setAttribute("disabled", "");
  host.append(dialog);

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: readonly EditorImportResolution[] | null): void => {
      if (settled) return;
      settled = true;
      dialog.remove();
      resolve(value);
    };
    dialog
      .querySelector("[data-import-cancel]")!
      .addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog
      .querySelector("[data-import-confirm]")!
      .addEventListener("click", () => {
        const resolutions = [
          ...dialog.querySelectorAll<HTMLSelectElement>(
            "[data-import-resolution]",
          ),
        ].map((select) => ({
          itemIndex: Number(select.dataset.importResolution),
          resolution: select.value as EditorImportConflictResolution,
        }));
        finish(Object.freeze(resolutions));
      });
    for (const button of dialog.querySelectorAll<HTMLButtonElement>(
      "[data-import-all]",
    ))
      button.addEventListener("click", () => {
        const resolution = button.dataset
          .importAll as EditorImportConflictResolution;
        for (const select of dialog.querySelectorAll<HTMLSelectElement>(
          "[data-import-resolution]",
        )) {
          if (![...select.options].some(({ value }) => value === resolution))
            continue;
          select.value = resolution;
        }
      });
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });
}
