# Mobile performance bench

Measures what a phone feels while OpenFox streams: main-thread long tasks,
frame rate, JS heap and React render counts, on a mobile viewport with the CPU
throttled 4×. Complements `scripts/bench` (memory growth under a burst of
frames): here the frames come from the **real server** streaming a **fake
OpenAI-compatible backend** in real time.

```bash
npx playwright install chromium    # once
npm run perf                       # build + 3 runs, median → perf-results/<timestamp>-<branch>.json
npm run perf -- --runs 1 --skip-build --scenarios streaming
npm run perf -- --compare perf-results/baseline-develop.json
npm run perf:compare -- perf-results/a.json perf-results/b.json [--renders]
npm run perf -- --profile existing # theme settings already saved server-side
```

`--profile` sets what the server has saved before the run. `fresh` (default):
nothing, like a new install; the app's first-run writes (theme sync) then happen
during the measurement, and each settings write re-renders every resource
consumer, `App` included. `existing`: the theme settings are saved, like for a
user who already picked a theme. Measure both when a change touches rendering.

## How it works

1. **Build**: server + web bundle, the web bundle **unminified** so React
   component names survive (production React otherwise, same code).
2. **Fake backend** (`mock-openai.ts`): `/v1/models` and streaming
   `/v1/chat/completions` at 100 tokens/s, paced on wall time so a late timer
   catches up instead of stretching the run. The answer is fixed
   (`fixture.ts`): headings, lists, a table, TypeScript/Python/Bash/JSON code
   blocks, repeated until the target size. `ckptNNNN` words mark progress.
3. **App**: `node dist/cli/index.js` with a throwaway `HOME`/`XDG_*`, an
   in-memory DB and `OPENFOX_LLM_URL` pointing at the fake backend. Your real
   `~/.config/openfox` and database are never touched. Restarted for each run.
4. **Browser**: headless Chromium, 390×844 @3x, touch, iPhone user agent,
   service workers blocked, `Emulation.setCPUThrottlingRate(4)`. Each run
   starts with an unrecorded warm-up pass: the first page of a fresh headless
   Chromium scrolls ~5× slower than later ones (cold caches), which would
   otherwise make the first measured scenario an outlier.

Page-side probes (`probes.ts`) record long tasks (`PerformanceObserver`), every
animation frame, the JS heap, and per-component render counts through a minimal
React DevTools hook (only the fibers that did work in each commit are visited).

## Scenarios

| Scenario      | What happens                                                                                                                  | Key metrics                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `streaming`   | One ~2,000-token answer (~20 s) streamed into an open session                                                                 | long tasks, fps avg/min, CDP script/layout/style time, heap, renders         |
| `reconnect`   | A ~4,500-token answer; after 5 s every WebSocket is closed and `fetch` fails for 30 s, then back                              | `reconnectMs` (restore → socket open), `catchUpMs` (restore → UI up to date) |
| `longSession` | A session with 200 messages (the server window of 100 is served, 100 hidden), then 240 frames of scrolling up at 100 px/frame | `initialRenderMs`, load long tasks, scroll fps and long tasks                |

- `streaming.endLagMs`: how long after the backend finished the last token
  appears on screen. Near zero means the UI keeps up.
- `reconnect.catchUpMs`: until the checkpoint the backend had reached at
  restore time is visible, i.e. the UI shows everything that existed when the
  network came back.
- The outage is simulated in the page (`NETWORK_CUT_SOURCE`): live sockets are
  closed, new ones dial a closed port and fail like a dead network, and `fetch`
  rejects. It does not emulate the tab being hidden.

## Reading results

Each result file holds the per-run values and their **median**. `perf:compare`
prints a markdown table (ready for a PR) with a verdict per metric; changes
under 5% are reported as noise. Only `fps.avg`/`fps.min` are higher-is-better.
Absolute values depend on the machine: compare runs made on the same machine,
close in time.
