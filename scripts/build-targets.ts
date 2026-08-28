import { mkdirSync } from "node:fs";
import path from "node:path";

const targets = [
  ["bun-darwin-arm64", "lore-darwin-arm64"],
  ["bun-darwin-x64", "lore-darwin-x64"],
  ["bun-linux-x64", "lore-linux-x64"],
  ["bun-linux-arm64", "lore-linux-arm64"],
  ["bun-windows-x64", "lore-windows-x64.exe"],
] as const;

mkdirSync("dist", { recursive: true });
for (const [target, filename] of targets) {
  const child = Bun.spawnSync([
    "bun", "build", "./src/cli.ts", "--compile", "--define", "__LORE_COMPILED__=true",
    `--target=${target}`, `--outfile=${path.join("dist", filename)}`,
  ], { stdout: "inherit", stderr: "inherit" });
  if (child.exitCode !== 0) process.exit(child.exitCode);
}
