import "./styles.css";
import { GameLayoutEditorApp } from "./ui/app-shell.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("gamelayouteditor root #app is missing.");

const app = new GameLayoutEditorApp(root);
await app.init();

window.addEventListener("beforeunload", () => app.destroy(), { once: true });
