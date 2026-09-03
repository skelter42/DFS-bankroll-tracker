# Working notes

Two things live here: a DFS bankroll tracker (React/TS/Vite SPA) and a set of
local analysis tools. Read this before changing either, and before giving
strategy advice — a lot of ground has already been covered and several
plausible-sounding conclusions have already been tested and killed.

Owner plays DraftKings tournaments, primarily MLB, and builds through
SimSavant.

## Hard constraints

- **All CSV parsing is client-side.** PapaParse in the browser, no backend,
  contest data never leaves the machine. The local Python tools in `tools/`
  hold to the same rule: stdlib only, no network calls, ever. This is the
  product's selling point, not a preference.
- **`tools/` is stdlib-only Python 3.** No numpy, no pandas.
- Development happens on `claude/preview-html-file-Nw14L`.
- Build is `vite-plugin-singlefile` → a self-contained `index.html`. Pushes to
  `claude/**` auto-deploy.

## The decision framework

**Top-1% finish rate is the decision metric. ROI is reported, never decided
on.** This was tested, not assumed:

- Top-1% rate correlates with realized ROI at **r = +0.51** across slices.
- ROI at the slice level is unusable — deleting a single winning entry moved
  slices by up to **36 points**. Top-1% rate moved by 0.06.
- The tail-conversion ratio (top-0.1% ÷ top-1%) was proposed as a decision
  metric and **rejected**: it correlates with ROI at only **+0.089**. Do not
  revive it. The related claim "everything above top 1% is noise" was also
  tested and rejected (chi-square 40.7 on 13 df) — the tail is real, it just
  isn't decision-useful.

**Benchmark against his own baseline, not against random.** His overall
top-1% rate is **1.38x** the random rate. Rake is ~15%, so beating random
(1.0x) is not the bar — an early version of the engine benchmarked against
1.0x and labelled almost everything "play." The `rel` metric is a slice's
top-1% rate divided by his own overall rate.

**Cluster confidence intervals on `contestId`.** Entries inside one contest
share a slate and are not independent. Unclustered CIs understate variance by
roughly **4x**. Ratio estimator:
`se = sqrt((K/(K-1)) * Σ(hits_i − rate·n_i)²) / N`.

**"Unknown" is a first-class verdict.** Below `MIN_N = 300` entries or above
`MAX_CI_WIDTH = 0.60`, say so rather than guessing.

## Established findings about his results

Do not re-derive these; do challenge them if new data arrives.

- Trajectory is **down**: top-1% rate 1.52x (2024) → 1.40x (2025) → 1.24x
  (2026). 2026 is **−$2,419**, which erased 79% of lifetime profit; lifetime
  now **+$631**.
- **The cause is the field, not him.** His scores held flat or improved
  (best-lineup 126.0 → 140.8; ceiling separation 1.431 → 1.543). The top-1%
  score bar rose **153.5 → 166.9 (+8.7%)**. He didn't get worse; the field got
  better. Not a tool problem and not a construction problem.
- **MLB specifically is the leak**: 1.56x → 1.32x → **1.11x**, CI [0.97, 1.26]
  touching random. MLB Classic is **−$1,293** over two seasons. MLB Showdown is
  the exception: **+7.4%, 1.38x** over 60 days.

## SimSavant settings — settled

- **Salary floor $49,500. Always.** Not a diversity knob. Want more
  differentiation, raise the diversity setting; want less, lower it. The floor
  does not move.
- **Maximum diversity + the floor** on 6+ game slates, not just the 2–3 game
  defaults. Verified on two slates the same day (9/3/2026): five-stacks held at
  100%, ownership fell 23pp, effective N rose 4.7 → 6.2.
- Rank by **Top 1%**, not ROI — ROI is the noisiest column in the tool.
- Selection Mode: **Top 1% coverage** (the tool's own recommendation).
- **Sims as high as patience allows.** At 1,000 sims, top-0.1% reliability is
  0%; at 10,000 it is 78%. "Fast" mode was tested across 3 runs and does **not**
  diversify — ownership came out 112.4% vs Balanced's 109.6%.
- Diversity in SimSavant is an **exclusion radius**, not a lineup count:
  simulate, rank by finish frequency, take the best, discard everything within
  the top-X% band, repeat.
- **Winner's curse is real here.** At 10,000 sims roughly **22%** of a top-20
  lineup's apparent tail edge is simulation noise.

### The salary-floor mechanism, corrected

First explanation was wrong and the data killed it. Dropping the floor to
$48,500 did **not** cause punting into non-stack lineups — the non-five-stack
lineups came out at *higher* salary ($49,550–$49,618) than the five-stacks
($49,359). What the floor actually prevents is the optimizer buying **cheaper
pieces inside the stack**. Same recommendation, different mechanism.

## MLB construction rules

5 batters primary team, 3 secondary. Never a pitcher against your own batters.
Teams per lineup ≤ 2.8. Slots: P,P,C,1B,2B,3B,SS,OF,OF,OF, $50,000 cap.

## The prebuild workflow

He sends a SimSavant bulk-entry export (DK upload file — the player pool is
embedded in columns 15–23 of the entry rows) plus the slate's projections CSV.
Return: what is structurally broken, what is a game-theory problem, and
specific fixes to try — **settings first, manual overrides only when settings
cannot get there.**

`tools/prebuild_audit.py` runs this. Use it rather than hand-rolling the checks,
which drifted across four runs before it existed.

Manual overrides are usually worse than the setting that achieves the same
thing. Hand-fading a chalk pitcher from 67% to 43% dropped five-stacks from 96%
to 82%, while Maximum diversity got the same player to 39% with five-stacks at
100% and 13pp less ownership.

### Thresholds are priors, not evidence

The audit's cutoffs — 85% five-stacks, effective N at 9% of entries — are
judgment, not measured. **His contest history records finish position and fees
but no lineup composition**, so there is no way to check whether his
five-stacks convert to top-1% better than his four-stacks. Say this whenever a
flag fires on one of them.

## Method notes

- **Effective N** = `n / (1 + (n−1) × mean pairwise overlap)`. Summed pairwise
  roster overlap equals `Σ_p C(exposure_p, 2)`, which makes it O(P) rather than
  O(n²) — exact, not an approximation. Verified against brute force on four
  builds.
- **Edge vs field** = ROI + rake. Zero means exactly average against the humans.
- **Overlay** = prize pool > fees collected. Satellites distort this badly.

## Mistakes worth not repeating

- **Run a placebo test before believing a date-based effect.** A "significant"
  post-June-5 decline (when he switched from SaberSim to SimSavant) evaporated:
  5 of 10 arbitrary cutoffs showed the same significant drop, including May 1.
  It was a 2026-vs-2025 level difference, not a tool switch.
- **Roster overlap alone does not identify a build mode.** Called two blind
  comparisons backwards (tennis, NFL preseason) by reading concentration and
  missing the barbell shape — a heavy core plus one-off darts.
- **Do not generalize from one slate.** Claimed "Savant is perfect, nothing to
  fix" off a single narrow construction test. It wasn't supported.
- **Check whether a constraint binds before applying it.** Applied an effective-N
  target of 5 from a 10-game slate to a 3-game slate whose ceiling was 5.0 even
  ignoring projection entirely.
- Verify what he actually did before analysing it — he corrects errors of fact
  quickly and it wastes both parties' time.
