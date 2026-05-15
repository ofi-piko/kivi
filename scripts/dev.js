import { spawn } from "node:child_process";

function run(cmd, args, name, extraEnv = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[${name}] failed to start`, err);
    process.exitCode = 1;
  });
  return child;
}

run("node", ["server/index.js"], "server", { PORT: "5176" });
run("vite", ["--port", "5173"], "vite");

