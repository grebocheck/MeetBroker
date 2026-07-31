import { spawnSync } from "node:child_process";

const allowedTypes = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];
const subjectPattern = new RegExp(
  `^(${allowedTypes.join("|")})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: .+`,
);
const [base = "HEAD^", head = "HEAD"] = process.argv.slice(2);

for (const revision of [base, head]) {
  const verified = spawnSync("git", ["rev-parse", "--verify", revision], {
    encoding: "utf8",
  });
  if (verified.status !== 0) {
    console.error(`Cannot resolve Git revision: ${revision}`);
    process.exit(2);
  }
}

const log = spawnSync(
  "git",
  ["log", "--format=%H%x09%s", "--no-merges", `${base}..${head}`],
  { encoding: "utf8" },
);
if (log.status !== 0) {
  console.error(log.stderr.trim() || "Cannot read commit history");
  process.exit(2);
}

const invalid = log.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [hash, ...subjectParts] = line.split("\t");
    return { hash, subject: subjectParts.join("\t") };
  })
  .filter(({ subject }) => !subjectPattern.test(subject));

if (invalid.length) {
  console.error("Commit subjects must follow CONTRIBUTING.md:");
  for (const { hash, subject } of invalid) {
    console.error(`- ${hash.slice(0, 8)} ${subject}`);
  }
  process.exit(1);
}

console.log(
  log.stdout.trim()
    ? "Commit subjects follow the project convention."
    : "No commits to validate.",
);
