#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../../..");
const defaultConfigPath = path.resolve(__dirname, "../state/paths.json");

function usage() {
  console.log(`Usage:
  skills/video-unwatched-pipeline/scripts/run_unwatched_pipeline.mjs [options] [runner args]

Options:
  --config <path>        JSON config path (default: skills/.../state/paths.json)
  --mediaops-dir <path>  Override mediaops dir
  --help                 Show help

Runner args are passed to unwatched_pipeline_runner.py.
If --db/--source-root/--dest-root are omitted, values are filled from config.`);
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function resolveWorkspaceVar(v) {
  if (typeof v !== "string") return v;
  return v.replaceAll("<workspace>", workspaceRoot);
}

function parseArgs(argv) {
  const passthrough = [];
  let configPath = process.env.VIDEO_PIPELINE_CONFIG || defaultConfigPath;
  let mediaopsDirOverride = process.env.VIDEO_PIPELINE_MEDIAOPS_DIR || "";

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
    if (a === "--config") {
      const v = argv[i + 1];
      if (!v) throw new Error("Missing value for --config");
      configPath = path.resolve(v);
      i += 1;
      continue;
    }
    if (a === "--mediaops-dir") {
      const v = argv[i + 1];
      if (!v) throw new Error("Missing value for --mediaops-dir");
      mediaopsDirOverride = path.resolve(v);
      i += 1;
      continue;
    }
    passthrough.push(a);
  }

  return { configPath, mediaopsDirOverride, passthrough };
}

const { configPath, mediaopsDirOverride, passthrough } = parseArgs(process.argv.slice(2));
const cfg = loadConfig(configPath);

const mediaopsDir = mediaopsDirOverride || resolveWorkspaceVar(cfg.mediaopsDir || path.join(workspaceRoot, "mediaops"));
const runner = path.join(mediaopsDir, "unwatched_pipeline_runner.py");

const args = [...passthrough];
if (cfg.db && !hasFlag(args, "--db")) args.push("--db", cfg.db);
if (cfg.sourceRoot && !hasFlag(args, "--source-root")) args.push("--source-root", cfg.sourceRoot);
if (cfg.destRoot && !hasFlag(args, "--dest-root")) args.push("--dest-root", cfg.destRoot);

const cmdArgs = ["run", "python", runner, ...args];
const cp = spawnSync("uv", cmdArgs, {
  cwd: mediaopsDir,
  stdio: "inherit",
  env: process.env,
});

if (cp.error) {
  console.error(cp.error.message);
  process.exit(1);
}
process.exit(cp.status ?? 1);
