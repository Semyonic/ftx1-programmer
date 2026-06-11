import "./index.css";
import "./theme.css";
import { AppShell } from "./ui/App";

const app = new AppShell();
document.getElementById("root")!.appendChild(app.el);
app.mount();
