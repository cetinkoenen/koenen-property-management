import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const projectParent = path.dirname(projectDirectory);
const projectName = path.basename(projectDirectory);
const destinationDirectory = process.argv[2];
const shouldPrune = process.argv.includes("--prune");

if (!destinationDirectory || !path.isAbsolute(destinationDirectory)) {
  throw new Error("Ein absoluter OneDrive-Zielpfad muss als erstes Argument angegeben werden.");
}

const pad = (value) => String(value).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const archiveName = `koenen-app-quellcode-${stamp}.tar.gz`;
const temporaryDirectory = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(tmpdir(), "koenen-app-backup-")));
const temporaryArchive = path.join(temporaryDirectory, archiveName);
const destinationArchive = path.join(destinationDirectory, archiveName);
const partialDestination = `${destinationArchive}.partial`;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} fehlgeschlagen: ${result.stderr || result.stdout || `Exit ${result.status}`}`);
  }
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function isoWeekKey(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${pad(week)}`;
}

function parseArchive(entry) {
  const match = /^koenen-app-quellcode-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.tar\.gz$/.exec(entry);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return { entry, date, monthKey: `${year}-${month}`, weekKey: isoWeekKey(date) };
}

async function pruneArchives() {
  const archives = (await readdir(destinationDirectory))
    .map(parseArchive)
    .filter(Boolean)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const keep = new Set(archives.slice(0, 7).map(({ entry }) => entry));
  const weeks = new Set();
  const months = new Set();

  for (const archive of archives) {
    if (weeks.size < 4 && !weeks.has(archive.weekKey)) {
      weeks.add(archive.weekKey);
      keep.add(archive.entry);
    }
    if (months.size < 12 && !months.has(archive.monthKey)) {
      months.add(archive.monthKey);
      keep.add(archive.entry);
    }
  }

  const removed = [];
  for (const archive of archives) {
    if (keep.has(archive.entry)) continue;
    await unlink(path.join(destinationDirectory, archive.entry));
    await unlink(path.join(destinationDirectory, `${archive.entry}.sha256`)).catch(() => undefined);
    removed.push(archive.entry);
  }
  return removed;
}

try {
  run("tar", [
    `--exclude=${projectName}/node_modules`,
    `--exclude=${projectName}/dist`,
    `--exclude=${projectName}/.git`,
    `--exclude=${projectName}/.vercel`,
    `--exclude=${projectName}/.env.local`,
    `--exclude=${projectName}/tmp`,
    `--exclude=${projectName}/output`,
    `--exclude=${projectName}/backups`,
    "-czf",
    temporaryArchive,
    projectName,
  ], projectParent);
  run("gzip", ["-t", temporaryArchive], projectParent);

  await mkdir(destinationDirectory, { recursive: true });
  await copyFile(temporaryArchive, partialDestination);
  const sourceHash = await sha256(temporaryArchive);
  const destinationHash = await sha256(partialDestination);
  if (sourceHash !== destinationHash) throw new Error("Die SHA-256-Pruefsummen stimmen nicht ueberein.");
  await rename(partialDestination, destinationArchive);
  await writeFile(`${destinationArchive}.sha256`, `${destinationHash}  ${archiveName}\n`, "utf8");

  const removed = shouldPrune ? await pruneArchives() : [];
  console.log(JSON.stringify({ archive: destinationArchive, sha256: destinationHash, removed }, null, 2));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
  await unlink(partialDestination).catch(() => undefined);
}
