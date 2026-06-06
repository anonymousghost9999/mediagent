import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const services = [
  { name: "FRONTEND", args: ["run", "dev:frontend"] },
  { name: "BACKEND", args: ["run", "dev:backend"] },
];

const children = [];
let shuttingDown = false;

function stopChildren(signal = "SIGINT") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const service of services) {
  const child = spawn(npmCommand, service.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`${service.name} exited with code ${code ?? 1}`);
      stopChildren();
      process.exit(code ?? 1);
      return;
    }

    if (signal) {
      console.error(`${service.name} exited with signal ${signal}`);
      stopChildren(signal);
      process.exit(1);
    }
  });

  child.on("error", (error) => {
    console.error(`Failed to start ${service.name}:`, error);
    stopChildren();
    process.exit(1);
  });
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));
