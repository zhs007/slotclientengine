import {
  getServerBetMethodComponentCatalog,
  inspectSceneLayoutTemplateInputs,
  parseSceneLayoutSlotTemplateConfig,
  suggestSlotRoundFlow,
  type SceneLayoutSlotTemplateConfigV1,
  type SlotRoundFlowSuggestions,
} from "@slotclientengine/gameframeworks/scene-layout-template";
import { importLayoutFile, importServerAuthoringFile } from "../io/imports.js";
import { GameViewerStore } from "../model/store.js";
import { launchRuntimeWindow } from "../runtime/launch-channel.js";

export function createGameViewerAppShell(root: HTMLElement): void {
  const store = new GameViewerStore();
  root.innerHTML = shellMarkup();
  const form = requireElement<HTMLFormElement>(root, "form");
  const launchButton = requireElement<HTMLButtonElement>(root, "[data-launch]");
  const readinessButton = requireElement<HTMLButtonElement>(
    root,
    "[data-readiness]",
  );
  const layoutInput = requireElement<HTMLInputElement>(
    root,
    "[data-layout-input]",
  );
  const serverInput = requireElement<HTMLInputElement>(
    root,
    "[data-server-input]",
  );
  const methodSelect = requireElement<HTMLSelectElement>(
    root,
    "[data-bet-method]",
  );
  const confirmButton = requireElement<HTMLButtonElement>(
    root,
    "[data-confirm-suggestions]",
  );
  const cascadeToggle = requireElement<HTMLInputElement>(
    root,
    "[name=cascadeEnabled]",
  );
  const reelKind = requireElement<HTMLSelectElement>(root, "[name=reelKind]");

  const invalidate = (): void => {
    store.markEdited();
    launchButton.disabled = true;
    renderReadiness(root, null);
  };
  form.addEventListener("input", (event) => {
    if (
      event.target === layoutInput ||
      event.target === serverInput ||
      event.target === methodSelect
    )
      return;
    invalidate();
  });
  cascadeToggle.addEventListener("change", () =>
    updateConditionalSections(root),
  );
  reelKind.addEventListener("change", () => updateConditionalSections(root));

  layoutInput.addEventListener("change", () => {
    const file = layoutInput.files?.[0];
    if (!file) return;
    void withBusy(root, "正在严格校验 production ZIP…", async () => {
      const imported = await importLayoutFile(file);
      store.replaceLayout(imported);
      launchButton.disabled = true;
      renderLayoutSummary(root, imported);
      renderReadiness(root, null);
    }).catch((error) => {
      layoutInput.value = "";
      renderError(root, error);
    });
  });

  serverInput.addEventListener("change", () => {
    const file = serverInput.files?.[0];
    if (!file) return;
    void withBusy(root, "正在读取下注方式与组件目录…", async () => {
      const imported = await importServerAuthoringFile(file);
      store.replaceServer(imported);
      populateServerSummary(root, imported.summary);
      populateBetMethodOptions(methodSelect, imported.summary);
      applyServerDefaults(form, imported.summary.gamecode);
      renderCatalog(root, store);
      launchButton.disabled = true;
      renderReadiness(root, null);
    }).catch((error) => {
      serverInput.value = "";
      renderError(root, error);
    });
  });

  methodSelect.addEventListener("change", () => {
    store.selectBetMethod(methodSelect.value);
    renderCatalog(root, store);
    launchButton.disabled = true;
    renderReadiness(root, null);
  });

  confirmButton.addEventListener("click", () => {
    try {
      const snapshot = store.getSnapshot();
      if (!snapshot.server || !snapshot.selectedBetMethodId)
        throw new Error("请先导入服务器作者配置并选择下注方式。");
      const catalog = getServerBetMethodComponentCatalog(
        snapshot.server.summary,
        snapshot.selectedBetMethodId,
      );
      const suggestions = suggestSlotRoundFlow(catalog);
      applySuggestions(form, suggestions);
      store.confirmSuggestions();
      renderCatalog(root, store);
      updateConditionalSections(root);
      launchButton.disabled = true;
      renderReadiness(root, null);
    } catch (error) {
      renderError(root, error);
    }
  });

  readinessButton.addEventListener("click", () => {
    const snapshot = store.getSnapshot();
    if (!snapshot.layout) {
      renderError(root, new Error("请先上传 scene-layout ZIP。"));
      return;
    }
    if (snapshot.server && !snapshot.suggestionsConfirmed) {
      renderError(root, new Error("当前下注方式的职责建议尚未显式确认。"));
      return;
    }
    const revision = snapshot.revision;
    void withBusy(root, "正在编译 immutable readiness snapshot…", async () => {
      const config = buildConfig(form);
      const readiness = await inspectSceneLayoutTemplateInputs({
        layoutZipBytes: snapshot.layout!.bytes,
        expectedLayoutSha256: snapshot.layout!.summary.sha256,
        config,
      });
      if (!store.commitReadiness(readiness, revision)) return;
      renderReadiness(root, readiness);
      launchButton.disabled = false;
    }).catch((error) => {
      launchButton.disabled = true;
      renderReadiness(root, null);
      renderError(root, error);
    });
  });

  launchButton.addEventListener("click", () => {
    const snapshot = store.getSnapshot();
    const readiness = snapshot.readiness;
    if (!snapshot.layout || !readiness) {
      renderError(root, new Error("当前配置没有有效 readiness snapshot。"));
      return;
    }
    const token = value(form, "token").trim();
    const businessid = value(form, "businessid").trim();
    void launchRuntimeWindow({
      layoutSha256: readiness.layout.sha256,
      layoutZipBytes: snapshot.layout.bytes,
      config: readiness.normalizedConfig,
      credential: {
        ...(token ? { token } : {}),
        ...(businessid ? { businessid } : {}),
      },
    })
      .then(() => renderNotice(root, "独立运行窗口已安全接收一次性 payload。"))
      .catch((error) => renderError(root, error));
  });

  updateConditionalSections(root);
}

function buildConfig(form: HTMLFormElement): SceneLayoutSlotTemplateConfigV1 {
  const cascadeEnabled = checked(form, "cascadeEnabled");
  const reelKind = value(form, "reelKind");
  const amount = {
    cashFields: ["cashWin64", "cashWin"],
    coinFields: ["coinWin64", "coinWin"],
    cashUnit: "cents",
  };
  const round = {
    kind: "slot-round-flow",
    version: 1,
    components: {
      spin: value(form, "spinComponent"),
      wins: list(value(form, "winComponents")),
      valueUpdates: list(value(form, "valueComponents")),
    },
    ...(cascadeEnabled
      ? {
          cascade: {
            kind: "cascade",
            version: 1,
            components: {
              remove: value(form, "removeComponent"),
              dropdown: value(form, "dropdownComponent"),
              refill: value(form, "refillComponent"),
              ...(value(form, "stepComponent").trim()
                ? { stepMarker: value(form, "stepComponent") }
                : {}),
            },
            symbols: {
              emptyCode: numberValue(form, "emptyCode"),
              removeExcludedSymbols: list(value(form, "removeExcludedSymbols")),
              dropHeldSymbols: list(value(form, "dropHeldSymbols")),
              valueSymbols: list(value(form, "valueSymbols")),
              sequentialWinCompanionSymbols: list(
                value(form, "companionSymbols"),
              ),
            },
            amount,
          },
        }
      : {}),
    amount,
  };
  const reel =
    reelKind === "standard"
      ? {
          kind: "standard",
          version: 1,
          direction: value(form, "direction"),
          speedSymbolsPerSecond: numberValue(form, "speed"),
          minimumSpinCycles: numberValue(form, "minimumCycles"),
          baseDurationMs: numberValue(form, "baseDurationMs"),
          startDelayMs: numberValue(form, "startDelayMs"),
          stopDelayMs: numberValue(form, "stopDelayMs"),
          bounceStrength: numberValue(form, "bounceStrength"),
        }
      : {
          kind: "grid-cell",
          version: 1,
          direction: value(form, "direction"),
          order: "top-down-left-right",
          timing: {
            startStepMs: numberValue(form, "cellStartStepMs"),
            stopStepMs: numberValue(form, "cellStopStepMs"),
            settleAfterLastStartMs: numberValue(form, "settleAfterLastStartMs"),
            minimumSpinCycles: numberValue(form, "minimumCycles"),
            speedSymbolsPerSecond: numberValue(form, "speed"),
          },
          bounceStrength: numberValue(form, "bounceStrength"),
        };
  return parseSceneLayoutSlotTemplateConfig({
    kind: "scene-layout-slot-template",
    version: 1,
    title: value(form, "title"),
    live: {
      serverUrl: value(form, "serverUrl"),
      gamecode: value(form, "gamecode"),
      clienttype: value(form, "clienttype"),
      ...(value(form, "jurisdiction").trim()
        ? { jurisdiction: value(form, "jurisdiction") }
        : {}),
      ...(value(form, "language").trim()
        ? { language: value(form, "language") }
        : {}),
      requestTimeoutMs: numberValue(form, "requestTimeoutMs"),
    },
    wager: {
      betOptions: [
        {
          bet: numberValue(form, "bet"),
          lines: numberValue(form, "lines"),
          ...(value(form, "times").trim()
            ? { times: numberValue(form, "times") }
            : {}),
          label: "默认投注",
        },
      ],
      initialBetIndex: 0,
    },
    round,
    presentation: {
      reel,
      flow: {
        version: 1,
        symbolStates: {
          normal: value(form, "normalState"),
          win: value(form, "winState"),
          remove: value(form, "removeState"),
        },
        dimmingAlpha: numberValue(form, "dimmingAlpha"),
        popup: { enabled: checked(form, "popupEnabled") },
        cascade: {
          emphasisFadeInMs: numberValue(form, "emphasisFadeInMs"),
          emphasisHoldMs: numberValue(form, "emphasisHoldMs"),
          emphasisFadeOutMs: numberValue(form, "emphasisFadeOutMs"),
          baseFallSeconds: numberValue(form, "baseFallSeconds"),
          perRowFallSeconds: numberValue(form, "perRowFallSeconds"),
          maxFallSeconds: numberValue(form, "maxFallSeconds"),
          settleSeconds: numberValue(form, "settleSeconds"),
        },
      },
    },
  });
}

function shellMarkup(): string {
  return `
    <header class="topbar">
      <a class="brand" href="./" aria-label="Game Viewer 首页">
        <span class="brand-mark">GV</span>
        <span><strong>Game Viewer</strong><small>ZERO-CODE SLOT TEMPLATE</small></span>
      </a>
      <div class="topbar-status"><i></i> LOCAL CONFIGURATOR · NO SERVER HOSTING</div>
    </header>
    <main class="workspace">
      <aside class="rail">
        <p class="eyebrow">WORKSPACE</p>
        ${[
          "运行包",
          "服务器配置",
          "基础配置",
          "逻辑配置",
          "表现配置",
          "启动检查",
        ]
          .map(
            (label, index) =>
              `<a href="#step-${index + 1}"><span>0${index + 1}</span>${label}</a>`,
          )
          .join("")}
        <div class="security-note">
          <strong>Session only</strong>
          <p>Credential 不进入 URL、project、storage 或日志。</p>
        </div>
      </aside>
      <form class="editor" novalidate>
        <section class="hero">
          <div>
            <p class="eyebrow">RUNTIME CONFIGURATOR / V1</p>
            <h1>用配置装配游戏，<br /><em>不再复制代码。</em></h1>
          </div>
          <p>上传 production scene-layout ZIP，确认 component 职责和两条正交轴，在独立窗口连接外部 live server。</p>
        </section>

        <section class="panel" id="step-1">
          ${sectionHeader("01", "运行包", "唯一美术与 runtime resource owner")}
          <label class="file-drop">
            <input type="file" accept=".zip" data-layout-input />
            <span class="file-icon">ZIP</span>
            <span><strong>选择 scene-layout ZIP</strong><small>canonical filename-key / SHA-256 content-addressed package</small></span>
          </label>
          <div class="summary empty" data-layout-summary>尚未导入运行包</div>
        </section>

        <section class="panel" id="step-2">
          ${sectionHeader("02", "服务器配置", "只生成候选，不执行 graph")}
          <label class="file-drop compact">
            <input type="file" accept=".json" data-server-input />
            <span class="file-icon">JSON</span>
            <span><strong>导入作者配置（可选）</strong><small>repository reels 永不进入前端运行 payload</small></span>
          </label>
          <div class="server-summary empty" data-server-summary>可手工填写组件；导入后可逐下注方式 review。</div>
          <div class="field-grid two">
            ${field("下注方式", `<select data-bet-method disabled><option>等待导入</option></select>`)}
            <div class="field action-field"><span>职责建议</span><button type="button" class="secondary" data-confirm-suggestions disabled>应用并显式确认</button></div>
          </div>
          <div data-component-catalog class="component-catalog"></div>
        </section>

        <section class="panel" id="step-3">
          ${sectionHeader("03", "基础配置", "外部 live session 与投注")}
          <div class="field-grid three">
            ${inputField("项目标题", "title", "新游戏实例", "text")}
            ${inputField("Live WebSocket URL", "serverUrl", "", "url")}
            ${inputField("Game code", "gamecode", "", "text")}
            ${inputField("Client type", "clienttype", "web", "text")}
            ${inputField("Jurisdiction", "jurisdiction", "", "text")}
            ${inputField("Language", "language", "zh-CN", "text")}
            ${inputField("Timeout (ms)", "requestTimeoutMs", "15000", "number")}
            ${inputField("Bet", "bet", "1", "number")}
            ${inputField("Lines", "lines", "1", "number")}
            ${inputField("Times（可选）", "times", "", "number")}
            ${inputField("Token（仅本次启动）", "token", "", "password", "off")}
            ${inputField("Business ID（仅本次）", "businessid", "", "password", "off")}
          </div>
        </section>

        <section class="panel" id="step-4">
          ${sectionHeader("04", "逻辑配置", "base components + optional cascade block")}
          <div class="field-grid three">
            ${inputField("Main spin component", "spinComponent", "", "text")}
            ${inputField("Win components（逗号分隔）", "winComponents", "", "text")}
            ${inputField("Value components（逗号分隔）", "valueComponents", "", "text")}
          </div>
          <label class="switch-row"><input type="checkbox" name="cascadeEnabled" /><span></span><strong>启用 cascade block</strong><small>不会改变 reel presentation</small></label>
          <div class="conditional cascade-fields" data-cascade-fields>
            <div class="field-grid four">
              ${inputField("Remove", "removeComponent", "", "text")}
              ${inputField("Dropdown", "dropdownComponent", "", "text")}
              ${inputField("Refill", "refillComponent", "", "text")}
              ${inputField("Step marker（可选）", "stepComponent", "", "text")}
              ${inputField("Empty code", "emptyCode", "-1", "number")}
              ${inputField("Remove excluded", "removeExcludedSymbols", "", "text")}
              ${inputField("Drop held", "dropHeldSymbols", "", "text")}
              ${inputField("Value symbols", "valueSymbols", "", "text")}
              ${inputField("Sequential companions", "companionSymbols", "", "text")}
            </div>
          </div>
        </section>

        <section class="panel" id="step-5">
          ${sectionHeader("05", "表现配置", "reel presentation 与 flow 独立")}
          <div class="axis-grid">
            <div class="axis-card">
              <p class="eyebrow">AXIS A · REEL</p>
              ${field("Presentation kind", `<select name="reelKind"><option value="grid-cell">grid-cell-v1</option><option value="standard">standard-v1</option></select>`)}
              <div class="field-grid two">
                ${field("Direction", `<select name="direction"><option value="forward">forward</option><option value="backward">backward</option></select>`)}
                ${inputField("Speed (symbols/s)", "speed", "24", "number")}
                ${inputField("Minimum cycles", "minimumCycles", "3", "number")}
                ${inputField("Bounce strength", "bounceStrength", "0", "number")}
              </div>
              <div data-standard-fields class="field-grid two conditional">
                ${inputField("Base duration (ms)", "baseDurationMs", "900", "number")}
                ${inputField("Start delay (ms)", "startDelayMs", "60", "number")}
                ${inputField("Stop delay (ms)", "stopDelayMs", "100", "number")}
              </div>
              <div data-grid-fields class="field-grid two conditional">
                ${inputField("Cell start step (ms)", "cellStartStepMs", "16", "number")}
                ${inputField("Cell stop step (ms)", "cellStopStepMs", "100", "number")}
                ${inputField("Settle after last start (ms)", "settleAfterLastStartMs", "800", "number")}
              </div>
            </div>
            <div class="axis-card">
              <p class="eyebrow">AXIS B · FLOW</p>
              <div class="field-grid two">
                ${inputField("Normal state", "normalState", "normal", "text")}
                ${inputField("Win state", "winState", "win", "text")}
                ${inputField("Remove state", "removeState", "remove", "text")}
                ${inputField("Dimming alpha", "dimmingAlpha", "0.5", "number")}
              </div>
              <label class="switch-row"><input type="checkbox" name="popupEnabled" checked /><span></span><strong>启用 manifest popup</strong></label>
              <div class="field-grid two">
                ${inputField("Emphasis fade in (ms)", "emphasisFadeInMs", "100", "number")}
                ${inputField("Emphasis hold (ms)", "emphasisHoldMs", "1000", "number")}
                ${inputField("Emphasis fade out (ms)", "emphasisFadeOutMs", "100", "number")}
                ${inputField("Base fall (s)", "baseFallSeconds", "0.2", "number")}
                ${inputField("Per-row fall (s)", "perRowFallSeconds", "0.05", "number")}
                ${inputField("Max fall (s)", "maxFallSeconds", "1", "number")}
                ${inputField("Settle (s)", "settleSeconds", "0.1", "number")}
              </div>
            </div>
          </div>
        </section>

        <section class="panel readiness-panel" id="step-6">
          ${sectionHeader("06", "启动检查", "immutable normalized snapshot")}
          <div data-readiness-output class="readiness-output empty">修改任意输入都会使旧 snapshot 失效。</div>
          <div class="launch-actions">
            <button type="button" class="secondary large" data-readiness>编译启动检查</button>
            <button type="button" class="primary large" data-launch disabled>在新窗口运行 <span>↗</span></button>
          </div>
        </section>
      </form>
    </main>
    <div class="toast-stack" data-toast-stack aria-live="polite"></div>
    <div class="busy" data-busy hidden><i></i><span></span></div>
  `;
}

function sectionHeader(index: string, title: string, subtitle: string): string {
  return `<header class="section-header"><span>${index}</span><div><h2>${title}</h2><p>${subtitle}</p></div></header>`;
}

function inputField(
  label: string,
  name: string,
  inputValue: string,
  type: string,
  autocomplete = "on",
): string {
  return field(
    label,
    `<input name="${name}" value="${inputValue}" type="${type}" autocomplete="${autocomplete}" />`,
  );
}

function field(label: string, control: string): string {
  return `<label class="field"><span>${label}</span>${control}</label>`;
}

function populateServerSummary(
  root: HTMLElement,
  summary: ReturnType<typeof importServerAuthoringFile> extends Promise<infer T>
    ? T extends { summary: infer S }
      ? S
      : never
    : never,
): void {
  const element = requireElement(root, "[data-server-summary]");
  element.classList.remove("empty");
  const parameters = Object.fromEntries(
    summary.parameters.map((item) => [item.name, item.value]),
  );
  element.innerHTML = `
    <div><small>GAME</small><strong>${escapeHtml(summary.gameName)}</strong></div>
    <div><small>GAMECODE</small><strong>${escapeHtml(summary.gamecode)}</strong></div>
    <div><small>DIMENSIONS</small><strong>${String(parameters.Width ?? "—")} × ${String(parameters.Height ?? "—")}</strong></div>
    <div><small>BET METHODS</small><strong>${summary.betMethods.length}</strong></div>
  `;
}

function populateBetMethodOptions(
  select: HTMLSelectElement,
  summary: Parameters<typeof populateServerSummary>[1],
): void {
  select.replaceChildren(
    ...summary.betMethods.map((method) => {
      const option = document.createElement("option");
      option.value = method.id;
      option.textContent = `${method.label} · bet=${method.bet}`;
      return option;
    }),
  );
  select.disabled = false;
}

function renderCatalog(root: HTMLElement, store: GameViewerStore): void {
  const snapshot = store.getSnapshot();
  const target = requireElement(root, "[data-component-catalog]");
  const button = requireElement<HTMLButtonElement>(
    root,
    "[data-confirm-suggestions]",
  );
  if (!snapshot.server || !snapshot.selectedBetMethodId) {
    target.replaceChildren();
    button.disabled = true;
    return;
  }
  const catalog = getServerBetMethodComponentCatalog(
    snapshot.server.summary,
    snapshot.selectedBetMethodId,
  );
  target.innerHTML = `
    <div class="catalog-head"><span>SERVER NODE TYPE</span><span>COMPONENT</span><span>候选职责</span></div>
    ${catalog.components
      .map(
        (component) => `
          <div class="${component.role === "unsupported" ? "unsupported" : ""}">
            <code>${escapeHtml(component.nodeType)}</code>
            <strong>${escapeHtml(component.componentName)}</strong>
            <span>${escapeHtml(component.role)}</span>
          </div>
        `,
      )
      .join("")}
    <p class="catalog-foot">repository 与 graph edge 已在 parser 边界丢弃，不会进入 readiness 或 runtime。</p>
  `;
  button.disabled = snapshot.suggestionsConfirmed;
  button.textContent = snapshot.suggestionsConfirmed
    ? "当前建议已确认"
    : "应用并显式确认";
}

function applySuggestions(
  form: HTMLFormElement,
  suggestions: SlotRoundFlowSuggestions,
): void {
  setValue(form, "spinComponent", suggestions.components.spin ?? "");
  setValue(form, "winComponents", suggestions.components.wins.join(", "));
  setValue(
    form,
    "valueComponents",
    suggestions.components.valueUpdates.join(", "),
  );
  const cascade = suggestions.cascade;
  setChecked(form, "cascadeEnabled", Boolean(cascade));
  if (!cascade) return;
  setValue(form, "removeComponent", cascade.remove ?? "");
  setValue(form, "dropdownComponent", cascade.dropdown ?? "");
  setValue(form, "refillComponent", cascade.refill ?? "");
  setValue(form, "stepComponent", cascade.stepMarker ?? "");
  setValue(form, "emptyCode", String(cascade.emptyCode ?? -1));
  setValue(
    form,
    "removeExcludedSymbols",
    cascade.removeExcludedSymbols.join(", "),
  );
  setValue(form, "dropHeldSymbols", cascade.dropHeldSymbols.join(", "));
  setValue(form, "valueSymbols", cascade.valueSymbols.join(", "));
}

function applyServerDefaults(form: HTMLFormElement, gamecode: string): void {
  if (!value(form, "gamecode").trim()) setValue(form, "gamecode", gamecode);
}

function updateConditionalSections(root: HTMLElement): void {
  const cascade = requireElement<HTMLInputElement>(
    root,
    "[name=cascadeEnabled]",
  ).checked;
  requireElement(root, "[data-cascade-fields]").toggleAttribute(
    "data-visible",
    cascade,
  );
  const standard =
    requireElement<HTMLSelectElement>(root, "[name=reelKind]").value ===
    "standard";
  requireElement(root, "[data-standard-fields]").toggleAttribute(
    "data-visible",
    standard,
  );
  requireElement(root, "[data-grid-fields]").toggleAttribute(
    "data-visible",
    !standard,
  );
}

function renderLayoutSummary(
  root: HTMLElement,
  imported: NonNullable<ReturnType<GameViewerStore["getSnapshot"]>["layout"]>,
): void {
  const target = requireElement(root, "[data-layout-summary]");
  target.classList.remove("empty");
  target.innerHTML = `
    <div><small>PACKAGE</small><strong>${escapeHtml(imported.summary.id)}</strong></div>
    <div><small>SHA-256</small><code>${imported.summary.sha256}</code></div>
    <div><small>ENTRIES / BYTES</small><strong>${imported.summary.entryCount} / ${formatBytes(imported.summary.totalBytes)}</strong></div>
    <div><small>MODES</small><strong>${escapeHtml(imported.summary.modes.join(" · ") || "—")}</strong></div>
    <div><small>SYMBOL PACKAGE</small><strong>${escapeHtml(imported.summary.symbolPackages.join(" · "))}</strong></div>
    <div><small>POPUPS</small><strong>${escapeHtml(imported.summary.popups.join(" · ") || "—")}</strong></div>
  `;
}

function renderReadiness(
  root: HTMLElement,
  readiness: ReturnType<GameViewerStore["getSnapshot"]>["readiness"],
): void {
  const target = requireElement(root, "[data-readiness-output]");
  if (!readiness) {
    target.className = "readiness-output empty";
    target.textContent = "修改任意输入都会使旧 snapshot 失效。";
    return;
  }
  target.className = "readiness-output ready";
  target.innerHTML = `
    <div class="ready-badge"><i></i><strong>READY</strong><span>${escapeHtml(readiness.compatibility.reelKind)} + ${readiness.compatibility.cascadeEnabled ? "cascade" : "base"}</span></div>
    <dl>
      <div><dt>Layout hash</dt><dd><code>${readiness.layout.sha256}</code></dd></div>
      <div><dt>Grid</dt><dd>${readiness.compatibility.columns} × ${readiness.compatibility.rows}</dd></div>
      <div><dt>Initial mode</dt><dd>${escapeHtml(readiness.compatibility.initialMode ?? "none")}</dd></div>
      <div><dt>Capabilities</dt><dd>spin · states · remove · dropdown · refill</dd></div>
    </dl>
    <details><summary>Normalized config snapshot</summary><pre>${escapeHtml(JSON.stringify(readiness.normalizedConfig, null, 2))}</pre></details>
    <ul>${readiness.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
  `;
}

async function withBusy<T>(
  root: HTMLElement,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const busy = requireElement<HTMLElement>(root, "[data-busy]");
  busy.querySelector("span")!.textContent = label;
  busy.hidden = false;
  try {
    return await task();
  } finally {
    busy.hidden = true;
  }
}

function renderError(root: HTMLElement, error: unknown): void {
  renderToast(
    root,
    "error",
    error instanceof Error ? error.message : String(error),
  );
}

function renderNotice(root: HTMLElement, message: string): void {
  renderToast(root, "notice", message);
}

function renderToast(
  root: HTMLElement,
  kind: "error" | "notice",
  message: string,
): void {
  const stack = requireElement(root, "[data-toast-stack]");
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 7000);
}

function requireElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少 UI 元素 ${selector}。`);
  return element;
}

function value(form: HTMLFormElement, name: string): string {
  const element = form.elements.namedItem(name);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    )
  )
    throw new Error(`缺少表单字段 ${name}。`);
  return element.value;
}

function numberValue(form: HTMLFormElement, name: string): number {
  const raw = value(form, name);
  if (!raw.trim()) return Number.NaN;
  return Number(raw);
}

function checked(form: HTMLFormElement, name: string): boolean {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`缺少 checkbox ${name}。`);
  return element.checked;
}

function setValue(
  form: HTMLFormElement,
  name: string,
  nextValue: string,
): void {
  const element = form.elements.namedItem(name);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    )
  )
    throw new Error(`缺少表单字段 ${name}。`);
  element.value = nextValue;
}

function setChecked(
  form: HTMLFormElement,
  name: string,
  nextValue: boolean,
): void {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`缺少 checkbox ${name}。`);
  element.checked = nextValue;
}

function list(value: string): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}
