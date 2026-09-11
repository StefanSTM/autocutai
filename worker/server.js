import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, "output");
const PORT = Number(process.env.PORT || 3977);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));

function ok(res, data) { res.json({ ok: true, data }); }
function fail(res, err, status = 500) {
  const message = err && err.message ? err.message : String(err || "Unknown error");
  console.error(message);
  res.status(status).json({ ok: false, error: message });
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min, max) {
  value = Number(value);
  if (!Number.isFinite(value)) value = min;
  return Math.max(min, Math.min(max, value));
}

function sanitizeFileName(name) {
  return String(name || "autocut")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      shell: false,
      windowsHide: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let timer = null;

    if (options.timeoutMs && Number(options.timeoutMs) > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        try { child.kill("SIGTERM"); } catch (_) {}
        settled = true;
        reject(new Error(`${command} timed out after ${Math.round(Number(options.timeoutMs) / 1000)}s.`));
      }, Number(options.timeoutMs));
    }

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on("close", code => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0 && !options.allowNonZero) {
        const tail = (stderr || stdout).split("\n").slice(-30).join("\n");
        reject(new Error(`${command} exited with code ${code}. ${tail}`));
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });
}

function parseFfmpegDuration(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text || "");
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function mergeRanges(ranges, gap = 0.03) {
  const sorted = (ranges || [])
    .filter(r => Number.isFinite(Number(r.start)) && Number.isFinite(Number(r.end)) && Number(r.end) > Number(r.start))
    .map(r => ({ ...r, start: Number(r.start), end: Number(r.end) }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + gap && last.reason === r.reason) {
      last.end = Math.max(last.end, r.end);
      last.removedDuration = Math.max(0, last.end - last.start);
      last.rawEnd = Math.max(Number(last.rawEnd || 0), Number(r.rawEnd || r.end));
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

async function detectSilences({
  mediaPath,
  ffmpegPath,
  thresholdDb,
  minSilence,
  padding,
  duration,
  cutStyle,
  preRoll,
  postRoll,
  minCutSeconds,
  mergeGap,
  protectStart,
  protectEnd
}) {
  thresholdDb = clampNumber(numberOr(thresholdDb, -35), -80, -5);
  minSilence = clampNumber(numberOr(minSilence, 0.25), 0.03, 5);
  padding = clampNumber(numberOr(padding, 0.03), 0, 1);
  cutStyle = String(cutStyle || "smoothHandles");
  preRoll = clampNumber(numberOr(preRoll, 0.08), 0, 2);
  postRoll = clampNumber(numberOr(postRoll, 0.12), 0, 2);
  minCutSeconds = clampNumber(numberOr(minCutSeconds, 0.18), 0.03, 10);
  mergeGap = clampNumber(numberOr(mergeGap, 0.06), 0, 2);
  protectStart = clampNumber(numberOr(protectStart, 0.15), 0, 10);
  protectEnd = clampNumber(numberOr(protectEnd, 0.15), 0, 10);

  const args = [
    "-hide_banner",
    "-nostats",
    "-i", mediaPath,
    "-af", `silencedetect=n=${thresholdDb}dB:d=${minSilence}`,
    "-f", "null",
    "-"
  ];

  const result = await runProcess(ffmpegPath, args, { timeoutMs: 1000 * 60 * 15 });
  const text = result.stderr + "\n" + result.stdout;
  const mediaDuration = duration || parseFfmpegDuration(text) || null;

  const raw = [];
  let currentStart = null;
  for (const line of text.split(/\r?\n/)) {
    const startMatch = /silence_start:\s*([0-9.]+)/.exec(line);
    if (startMatch) {
      currentStart = Number(startMatch[1]);
      continue;
    }
    const endMatch = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/.exec(line);
    if (endMatch) {
      const end = Number(endMatch[1]);
      const dur = Number(endMatch[2]);
      const start = currentStart !== null ? currentStart : Math.max(0, end - dur);
      raw.push({ start, end, duration: dur });
      currentStart = null;
    }
  }

  if (currentStart !== null && mediaDuration && mediaDuration > currentStart) {
    raw.push({ start: currentStart, end: mediaDuration, duration: mediaDuration - currentStart });
  }

  const cutRanges = [];
  for (const r of raw) {
    let start;
    let end;
    let keptBefore = 0;
    let keptAfter = 0;

    if (cutStyle === "legacyTrim" || cutStyle === "snappy") {
      start = r.start - padding;
      end = r.end + padding;
    } else {
      start = r.start + preRoll;
      end = r.end - postRoll;
      keptBefore = Math.max(0, start - r.start);
      keptAfter = Math.max(0, r.end - end);
    }

    start = Math.max(0, start);
    if (mediaDuration) end = Math.min(mediaDuration, end);
    if (protectStart > 0 && start < protectStart) start = protectStart;
    if (mediaDuration && protectEnd > 0 && end > mediaDuration - protectEnd) end = mediaDuration - protectEnd;

    if (end <= start) continue;
    const removeDuration = end - start;
    if (removeDuration < minCutSeconds) continue;

    cutRanges.push({
      start,
      end,
      reason: "silence",
      confidence: 1,
      rawStart: r.start,
      rawEnd: r.end,
      rawDuration: r.duration,
      removedDuration: removeDuration,
      cutStyle,
      keptBefore,
      keptAfter
    });
  }

  return mergeRanges(cutRanges, mergeGap);
}

function totalRemoved(cuts) {
  return (cuts || []).reduce((sum, c) => sum + Math.max(0, Number(c.end) - Number(c.start)), 0);
}

async function buildPlan(body) {
  const { mediaPath, clip = {}, settings = {} } = body;
  if (!mediaPath || !fs.existsSync(mediaPath)) throw new Error(`Media path does not exist: ${mediaPath}`);

  const ffmpegPath = settings.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
  const duration = numberOr(clip.duration, null) || numberOr(clip.seqEnd, 0) - numberOr(clip.seqStart, 0) || null;
  const warnings = [];

  const cuts = await detectSilences({
    mediaPath,
    ffmpegPath,
    thresholdDb: settings.thresholdDb,
    minSilence: settings.minSilence,
    padding: settings.padding,
    cutStyle: settings.cutStyle,
    preRoll: settings.preRoll,
    postRoll: settings.postRoll,
    minCutSeconds: settings.minCutSeconds,
    mergeGap: settings.mergeGap,
    protectStart: settings.protectStart,
    protectEnd: settings.protectEnd,
    duration
  });

  if (!cuts.length) {
    warnings.push("No removable silence found. Try a higher threshold, lower minimum silence, or confirm the clip has usable audio.");
  }

  return {
    version: "0.4.1",
    meta: {
      clipName: clip.clipName || path.basename(mediaPath),
      mediaPath,
      sequenceName: clip.sequenceName || null,
      createdAt: new Date().toISOString(),
      duration,
      timeBasis: "clip-relative",
      clipSeqStart: numberOr(clip.seqStart, 0),
      clipSeqEnd: numberOr(clip.seqEnd, 0),
      clipSourceIn: numberOr(clip.sourceIn, 0),
      preset: settings.autocutPreset || "custom",
      thresholdDb: numberOr(settings.thresholdDb, -35),
      minSilence: numberOr(settings.minSilence, 0.25),
      totalRemovedSeconds: totalRemoved(cuts)
    },
    cuts,
    captions: [],
    chapters: [],
    viralClips: [],
    brollQueries: [],
    repeatCuts: [],
    bleeps: [],
    zooms: [],
    transitionHints: [],
    podcastCuts: [],
    transcript: null,
    warnings
  };
}

app.get("/api/health", async (req, res) => {
  try {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    ok(res, {
      app: "ZaKo AutoCut",
      version: "0.4.1",
      ffmpegPath,
      outputDir: OUTPUT_DIR,
      features: ["silence-detection", "markers", "ripple-delete-plan"]
    });
  } catch (e) { fail(res, e); }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const plan = await buildPlan(req.body || {});
    ok(res, plan);
  } catch (e) { fail(res, e); }
});

app.post("/api/save-plan", async (req, res) => {
  try {
    const plan = req.body.plan;
    if (!plan) throw new Error("No plan provided.");
    const base = sanitizeFileName(req.body.fileBaseName || (plan.meta && plan.meta.clipName) || "autocut_plan");
    const filePath = path.join(OUTPUT_DIR, `${base}_${Date.now()}_plan.json`);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), "utf8");
    ok(res, { filePath });
  } catch (e) { fail(res, e); }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ZaKo AutoCut worker running at http://127.0.0.1:${PORT}`);
  console.log(`FFmpeg path: ${process.env.FFMPEG_PATH || "ffmpeg"}`);
  console.log(`Output: ${OUTPUT_DIR}`);
});
