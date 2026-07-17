import "./styles.css";
import { SymbolsEditorApp } from "./ui/app-shell.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root.");
const app = new SymbolsEditorApp(root);
void app.init();
window.addEventListener("beforeunload", () => app.destroy(), { once: true });
