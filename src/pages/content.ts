import { mountShell } from "../lib/shell.ts";
import { registerServiceWorker } from "../pwa/register.ts";

mountShell();
registerServiceWorker();
