import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let i = 0; i < 12; i++) {
    const desktopPkg = join(current, "packages", "desktop", "package.json");
    const cliPkg = join(current, "packages", "cli", "package.json");
    if (existsSync(desktopPkg) && existsSync(cliPkg)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const fromCwd = resolve(process.cwd());
  let cwdCurrent = fromCwd;

  for (let i = 0; i < 12; i++) {
    const desktopPkg = join(cwdCurrent, "packages", "desktop", "package.json");
    const cliPkg = join(cwdCurrent, "packages", "cli", "package.json");
    if (existsSync(desktopPkg) && existsSync(cliPkg)) {
      return cwdCurrent;
    }

    const parent = dirname(cwdCurrent);
    if (parent === cwdCurrent) break;
    cwdCurrent = parent;
  }

  return fromCwd;
}

function resolveElectronBinary(desktopDir: string): string | null {
  try {
    const desktopRequire = createRequire(join(desktopDir, "package.json"));
    return desktopRequire("electron");
  } catch {
    const fallback = join(desktopDir, "node_modules", ".bin", "electron");
    return existsSync(fallback) ? fallback : null;
  }
}

function runBuild(desktopDir: string): Promise<void> {
  return new Promise((resolveBuild, rejectBuild) => {
    const build = spawn("bun", ["run", "build"], {
      cwd: desktopDir,
      stdio: "inherit",
    });

    build.on("error", rejectBuild);
    build.on("exit", (code, signal) => {
      if (signal) {
        rejectBuild(new Error(`Desktop build terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectBuild(new Error(`Desktop build failed with exit code ${code ?? 1}`));
        return;
      }
      resolveBuild();
    });
  });
}

export async function desktop(args: string[] = process.argv.slice(3)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Launch the Electron desktop dashboard");
    console.log("Usage: zazig desktop");
    return;
  }

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(thisDir);
  const desktopDir = join(repoRoot, "packages", "desktop");
  const desktopEntry = join(desktopDir, "dist", "main.js");

  if (!existsSync(desktopEntry)) {
    try {
      await runBuild(desktopDir);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
  }

  const electronBinary = resolveElectronBinary(desktopDir);
  if (!electronBinary) {
    console.error("Electron is not installed. Run `bun install` in packages/desktop first");
    process.exitCode = 1;
    return;
  }

  const cliBin = basename(process.argv[1] ?? "zazig");

  await new Promise<void>((resolveLaunch) => {
    const child = spawn(electronBinary, [desktopEntry], {
      cwd: desktopDir,
      stdio: "inherit",
      env: { ...process.env, ZAZIG_CLI_BIN: cliBin },
    });

    child.on("error", (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      resolveLaunch();
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  });
}
