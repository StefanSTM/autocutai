# ZaKo AutoCut for Premiere Pro 2026 — v0.4.1

A simplified Premiere panel focused on one stable feature: **AutoCut Silences**.

Captions, AutoZoom, Google/OpenAI/Whisper, and experimental keyframe tools are removed from the UI for now.

## What is new

- Cleaner professional Premiere-style UI.
- Top black **ZaKo AutoCut** banner with a faint timeline/sequence pattern.
- Tabs: **Setup**, **Cut**, **Result**, **Log**.
- Slider-based AutoCut controls instead of manual typing.
- Preset buttons:
  - Snappy
  - Balanced
  - Smooth
  - Podcast
- Lightweight worker: only FFmpeg silence analysis, no AI packages.

## Install

Replace your old Premiere extension folder:

```text
com.zako.autocutai
```

Replace the old `worker` folder too.

Then restart Premiere.

## Start worker

Double-click:

```text
start-autocut-worker.bat
```

Keep the terminal window open while using AutoCut.

## Use AutoCut

1. Start `start-autocut-worker.bat`.
2. Open Premiere and select one timeline clip.
3. Go to **Setup** → **Load selected clip**.
4. Go to **Cut**.
5. Pick a preset or move the sliders.
6. Click **Analyze silence**.
7. Click **Add markers** first.
8. If markers look good, click **Cut + ripple delete**.

Duplicate your sequence before destructive cutting.

## Slider guide

- **Silence threshold**: higher/aggressive values cut more. Start at `-35 dB`.
- **Minimum silence**: how long a quiet section must be before it becomes a cut.
- **Keep before cut**: leaves a little silence before the jump cut.
- **Keep after cut**: leaves a little silence after the jump cut.
- **Minimum removed gap**: skips tiny cuts that would feel jittery.
- **Merge nearby gaps**: combines cuts that are very close together.

## Recommended starting point

Use **Balanced** first.

If it cuts words, use **Smooth** or lower the threshold toward `-40 dB`.
If it misses too many pauses, use **Snappy** or raise the threshold toward `-32 dB`.
"# autocutai" 
