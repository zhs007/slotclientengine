import { loadCastleBarrelModel } from "./barrel-model.js";
import { loadCastleBattleAxeModel } from "./battle-axe-model.js";
import { loadCastleBenchModel } from "./bench-model.js";
import { CastleKnightRenderer } from "./castle-scene.js";
import { loadCastleChandelierModel } from "./chandelier-model.js";
import { loadCastleChestModel } from "./chest-model.js";
import { loadCastleColumnModel } from "./column-model.js";
import { PropPreviewRenderer, type PropPreviewKind } from "./prop-preview.js";
import { loadCastleSwordModel } from "./sword-model.js";
import { loadCastleThroneDaisModel } from "./throne-dais-model.js";
import { loadCastleThroneModel } from "./throne-model.js";
import { loadCastleWallModel } from "./wall-model.js";
import "./styles.css";

function button(
  label: string,
  className: string,
  ariaLabel: string,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.setAttribute("aria-label", ariaLabel);
  return element;
}

function createHud(root: HTMLElement, game: CastleKnightRenderer): HTMLElement {
  const hud = document.createElement("section");
  hud.className = "game-hud";
  hud.setAttribute("aria-label", "游戏控制");

  const panel = document.createElement("div");
  panel.className = "hud-panel";
  const menu = button("☰", "round-control menu-control", "菜单");
  const turbo = button("ϟ", "round-control turbo-control", "快速模式");
  const spin = button("↻", "spin-control", "旋转棋盘");
  const minus = button("−", "small-control", "降低下注");
  const plus = button("+", "small-control", "提高下注");

  const balance = document.createElement("div");
  balance.className = "hud-value balance-value";
  balance.innerHTML = "<span>BALANCE</span><strong>$999.65</strong>";
  const bet = document.createElement("div");
  bet.className = "hud-value bet-value";
  bet.innerHTML = "<span>BET</span><strong>$1.00</strong>";
  const betAmount = bet.querySelector("strong");
  if (!betAmount) throw new Error("Missing bet amount element.");
  let currentBet = 1;
  const renderBet = () => {
    betAmount.textContent = `$${currentBet.toFixed(2)}`;
  };
  minus.addEventListener("click", () => {
    currentBet = Math.max(0.2, currentBet - 0.2);
    renderBet();
  });
  plus.addEventListener("click", () => {
    currentBet = Math.min(10, currentBet + 0.2);
    renderBet();
  });
  spin.addEventListener("click", () => {
    if (!game.spin()) return;
    spin.classList.remove("is-spinning");
    requestAnimationFrame(() => spin.classList.add("is-spinning"));
  });
  turbo.addEventListener("click", () => {
    turbo.classList.toggle("is-active");
  });
  menu.addEventListener("click", () => {
    root.classList.toggle("show-hint");
  });

  const balanceGroup = document.createElement("div");
  balanceGroup.className = "hud-group hud-group-balance";
  const coin = document.createElement("span");
  coin.className = "coin-emblem";
  coin.textContent = "$";
  balanceGroup.append(coin, balance);

  const betGroup = document.createElement("div");
  betGroup.className = "hud-group hud-group-bet";
  betGroup.append(minus, bet, plus);
  panel.append(balanceGroup, spin, betGroup);
  hud.append(panel, menu, turbo);

  const hint = document.createElement("div");
  hint.className = "interaction-hint";
  hint.textContent = "移动指针观察大厅 · 点击中央按钮换盘";
  hud.append(hint);
  return hud;
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  const previewKind = new URLSearchParams(location.search).get("prop");
  if (
    previewKind === "chest" ||
    previewKind === "column" ||
    previewKind === "bench" ||
    previewKind === "barrel" ||
    previewKind === "wall" ||
    previewKind === "torch" ||
    previewKind === "stair" ||
    previewKind === "throne" ||
    previewKind === "chandelier" ||
    previewKind === "sword" ||
    previewKind === "battleAxe" ||
    previewKind === "spellbook" ||
    previewKind === "crown"
  ) {
    await bootstrapPropPreview(root, previewKind);
    return;
  }
  const [
    barrelModel,
    battleAxeModel,
    benchModel,
    throneDaisModel,
    throneModel,
    wallModel,
    columnModel,
    swordModel,
    chandelierModel,
    chestModel,
  ] = await Promise.all([
    loadCastleBarrelModel(),
    loadCastleBattleAxeModel(),
    loadCastleBenchModel(),
    loadCastleThroneDaisModel(),
    loadCastleThroneModel(),
    loadCastleWallModel(),
    loadCastleColumnModel(),
    loadCastleSwordModel(),
    loadCastleChandelierModel(),
    loadCastleChestModel(),
  ]);
  const game = new CastleKnightRenderer(
    root,
    barrelModel,
    battleAxeModel,
    benchModel,
    throneDaisModel,
    throneModel,
    wallModel,
    columnModel,
    swordModel,
    chandelierModel,
    chestModel,
  );
  root.append(createHud(root, game));
  const resize = () => game.resize(root.clientWidth, root.clientHeight);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();
  window.addEventListener(
    "beforeunload",
    () => {
      resizeObserver.disconnect();
      game.destroy(root);
    },
    { once: true },
  );
}

async function bootstrapPropPreview(
  root: HTMLElement,
  kind: PropPreviewKind,
): Promise<void> {
  const parameters = new URLSearchParams(location.search);
  const sideView = parameters.get("view") === "side";
  const textured = parameters.get("mode") === "final";
  const barrelModel = kind === "barrel" ? await loadCastleBarrelModel() : null;
  const battleAxeModel =
    kind === "battleAxe" ? await loadCastleBattleAxeModel() : null;
  const swordModel = kind === "sword" ? await loadCastleSwordModel() : null;
  const benchModel = kind === "bench" ? await loadCastleBenchModel() : null;
  const throneDaisModel =
    kind === "stair" ? await loadCastleThroneDaisModel() : null;
  const throneModel = kind === "throne" ? await loadCastleThroneModel() : null;
  const wallModel = kind === "wall" ? await loadCastleWallModel() : null;
  const columnModel = kind === "column" ? await loadCastleColumnModel() : null;
  const chandelierModel =
    kind === "chandelier" ? await loadCastleChandelierModel() : null;
  const chestModel = kind === "chest" ? await loadCastleChestModel() : null;
  const preview = new PropPreviewRenderer(
    root,
    kind,
    sideView,
    textured,
    barrelModel,
    battleAxeModel,
    swordModel,
    benchModel,
    throneDaisModel,
    throneModel,
    wallModel,
    columnModel,
    chandelierModel,
    chestModel,
  );
  const resize = () => preview.resize(root.clientWidth, root.clientHeight);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();
  window.addEventListener(
    "beforeunload",
    () => {
      resizeObserver.disconnect();
      preview.destroy(root);
    },
    { once: true },
  );
}

void bootstrap().catch((error: unknown) => {
  console.error("castleknight3ddemo bootstrap failed", error);
  const root = document.getElementById("app");
  if (root) {
    const message = document.createElement("pre");
    message.className = "fatal-error";
    message.textContent =
      error instanceof Error ? error.message : String(error);
    root.replaceChildren(message);
  }
});
