import ReactDOM from "react-dom/client";
import App from "./App";
import { getSettings, subscribeSettings } from "./settings";
import { applyTheme, getTheme } from "./themes";
import "./styles.css";

// Pinta o tema antes do primeiro quadro (sem piscar) e a cada mudança de configuração.
const paint = () => applyTheme(getTheme(getSettings().theme));
paint();
subscribeSettings(paint);

// Sem <StrictMode>: o efeito do terminal abre um PTY real e o double-mount do dev
// subiria dois shells.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
