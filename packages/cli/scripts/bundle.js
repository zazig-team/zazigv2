import * as esbuild from "esbuild";
import { chmodSync, readFileSync } from "node:fs";

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
