import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { loadEnv } from "./env";
import { fontStack, getSettings, initSettings, subscribeSettings } from "./settings";
import { applyTheme, getTheme } from "./themes";
import "./styles.css";

// As configurações vêm do arquivo no disco: carrega antes de pintar o primeiro quadro.
await Promise.all([initSettings(), loadEnv()]);

// Tema e modo do prompt acompanham cada mudança de configuração (inclusive edição do arquivo à mão).
let lastMode = "";
let lastLook = "";
const sync = () => {
  const { theme, prompt, fontFamily, fontSize } = getSettings();
  // só repinta quando o visual mudou: ajustar um widget do prompt não deve mexer em nenhuma variável CSS
  const look = `${theme}|${fontFamily}|${fontSize}`;
  if (look !== lastLook) {
    lastLook = look;
    applyTheme(getTheme(theme));
    // os chips do prompt usam a mesma fonte do terminal
    document.documentElement.style.setProperty("--term-font", fontStack(fontFamily));
    document.documentElement.style.setProperty("--term-size", `${fontSize}px`);
  }
  if (prompt.mode !== lastMode) {
    lastMode = prompt.mode;
    invoke("set_prompt_mode", { mode: prompt.mode }).catch(() => {});
  }
};
sync();
subscribeSettings(sync);

// Sem <StrictMode>: o efeito do terminal abre um PTY real e o double-mount do dev
// subiria dois shells.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
