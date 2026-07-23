import "./styles.css";
import { startRuntimeWindow } from "./runtime/entry.js";
import { createGameViewerAppShell } from "./ui/app-shell.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("缺少 #app 根节点。");

if (new URLSearchParams(window.location.search).get("runtime") === "1")
  void startRuntimeWindow(root);
else createGameViewerAppShell(root);
