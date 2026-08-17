import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["eslint", "."],
  {
    cwd: root,
    stdio: "inherit",
  }
);
