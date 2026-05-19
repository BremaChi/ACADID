import { existsSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "..", "..");
const mainFile = join(apiRoot, "dist", "apps", "api", "src", "main.js");
const distDir = join(apiRoot, "dist", "apps", "api", "src");
const workspaceNestBin = join(apiRoot, "node_modules", ".bin", process.platform === "win32" ? "nest.cmd" : "nest");
const localNestBin = existsSync(workspaceNestBin)
  ? workspaceNestBin
  : join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "nest.cmd" : "nest");
const nestBin = existsSync(localNestBin) ? localNestBin : process.platform === "win32" ? "nest.cmd" : "nest";
const workspaceNestCli = join(apiRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js");
const localNestCli = existsSync(workspaceNestCli)
  ? workspaceNestCli
  : join(repoRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js");
const hasNestCli = existsSync(localNestCli);
const compilerCommand = hasNestCli ? process.execPath : process.platform === "win32" ? "cmd.exe" : nestBin;
const compilerArgs = hasNestCli
  ? [localNestCli, "build", "--watch"]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", `"${nestBin}" build --watch`]
    : ["build", "--watch"];

let apiProcess = null;
let started = false;
let restartTimer = null;
let watcher = null;
let restarting = false;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[acadid-api-dev] ${message}\n`);
}

function startApi() {
  if (!existsSync(mainFile)) return;
  if (apiProcess && !apiProcess.killed) return;
  started = true;
  log(`starting ${mainFile}`);
  apiProcess = spawn(process.execPath, [mainFile], {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit"
  });
  apiProcess.on("exit", (code, signal) => {
    if (signal) log(`api stopped by ${signal}`);
    else if (code !== 0 && code !== null) log(`api exited with code ${code}`);
    apiProcess = null;
    if (restarting && !shuttingDown) {
      restarting = false;
      startApi();
    }
  });
}

function scheduleRestart() {
  if (!started) {
    startApi();
    return;
  }
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (apiProcess) {
      log("compiled output changed; restarting api");
      restarting = true;
      apiProcess.kill();
      return;
    }
    startApi();
  }, 700);
}

function watchDist() {
  if (watcher || !existsSync(distDir)) return;
  watcher = watch(distDir, { recursive: true }, (_eventType, filename) => {
    if (filename && !String(filename).endsWith(".js")) return;
    scheduleRestart();
  });
  watcher.on("error", (error) => log(`dist watcher error: ${error.message}`));
}

const compiler = spawn(compilerCommand, compilerArgs, {
  cwd: apiRoot,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
  shell: false
});

compiler.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (text.includes("Found 0 errors")) {
    watchDist();
    scheduleRestart();
  }
});

compiler.stderr.on("data", (chunk) => process.stderr.write(chunk));

compiler.on("exit", (code) => {
  if (shuttingDown) return;
  log(`compiler exited with code ${code ?? "unknown"}`);
  process.exit(code ?? 1);
});

process.on("SIGINT", () => {
  shuttingDown = true;
  watcher?.close();
  compiler.kill();
  apiProcess?.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  watcher?.close();
  compiler.kill();
  apiProcess?.kill();
  process.exit(0);
});
