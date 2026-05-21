import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build"]);
run("git", ["add", "-A"]);

const hasStagedChanges = spawnSync("git", ["diff", "--cached", "--quiet"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (hasStagedChanges.status === 0) {
  console.log("No changes to commit after build. Skip commit and push.");
  process.exit(0);
}

run("git", ["commit", "-m", "publish"]);
run("git", ["push"]);
