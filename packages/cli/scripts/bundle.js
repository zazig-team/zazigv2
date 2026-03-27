import * as esbuild from "esbuild";
import { chmodSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

// CJS→ESM shim: some dependencies (e.g. ws) use require() for Node built-ins.
// When bundled as ESM, esbuild's synthetic require() rejects these. Injecting a
// real require via createRequire fixes it.
const requireShim = 'import { createRequire } from "module"; const require = createRequire(import.meta.url);';

// Strip shebangs from input files so the banner shebang is the only one.
const stripShebang = {
  name: "strip-shebang",
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      let contents = readFileSync(args.path, "utf8");
      if (contents.startsWith("#!")) {
        contents = contents.replace(/^#!.*\n/, "");
      }
      return { contents, loader: "js" };
    });
  },
};

// 1. Bundle the CLI
await esbuild.build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "releases/zazig.mjs",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@zazigv2/local-agent"],
  plugins: [stripShebang],
});

chmodSync("releases/zazig.mjs", 0o755);
console.log("Bundle written to releases/zazig.mjs");

// 2. Bundle the local-agent daemon + MCP server
const agentDir = resolve(repoRoot, "packages", "local-agent");
const agentReleasesDir = resolve(agentDir, "releases");
mkdirSync(agentReleasesDir, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(agentDir, "dist", "index.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: resolve(agentReleasesDir, "zazig-agent.mjs"),
  banner: { js: requireShim },
  plugins: [stripShebang],
});
console.log("Bundle written to packages/local-agent/releases/zazig-agent.mjs");

await esbuild.build({
  entryPoints: [resolve(agentDir, "dist", "agent-mcp-server.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: resolve(agentReleasesDir, "agent-mcp-server.mjs"),
  banner: { js: "#!/usr/bin/env node\n" + requireShim },
  plugins: [stripShebang],
});

chmodSync(resolve(agentReleasesDir, "agent-mcp-server.mjs"), 0o755);
console.log("Bundle written to packages/local-agent/releases/agent-mcp-server.mjs");
