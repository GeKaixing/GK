import { execFileSync } from "node:child_process";

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["eslint", "."],
  { stdio: "inherit" }
);
