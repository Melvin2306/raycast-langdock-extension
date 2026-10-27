// Bundles each tests/*.test.ts with the @raycast/api mock and runs them with Node's test runner.
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outdir = ".test-build";
const entries = readdirSync("tests").filter((file) => file.endsWith(".test.ts"));
await build({
  entryPoints: entries.map((file) => `tests/${file}`),
  bundle: true,
  platform: "node",
  format: "esm",
  outdir,
  outExtension: { ".js": ".mjs" },
  alias: { "@raycast/api": "./tests/raycast-mock.ts" },
  external: ["@raycast/utils", "react"],
  logLevel: "warning",
});
const result = spawnSync(
  process.execPath,
  ["--test", ...entries.map((file) => `${outdir}/${file.replace(/\.ts$/, ".mjs")}`)],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
