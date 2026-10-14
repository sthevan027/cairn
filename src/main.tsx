import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Sem <StrictMode>: o efeito do terminal abre um PTY real e o double-mount do dev
// subiria dois shells.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
