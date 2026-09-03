#!/usr/bin/env python3
"""
Audit a DraftKings prebuild before upload.

    python3 tools/prebuild_audit.py entries.csv [projections.csv]
    python3 tools/prebuild_audit.py --selftest [csv_dir]
    python3 tools/prebuild_audit.py --help

entries.csv is the DK bulk-entry export straight out of SimSavant: entry rows
on the left, the draftgroup player pool embedded in columns 15-23 on the right.
projections.csv is optional and only adds field ownership and projections
(needs DFS ID, Proj, Own). Order matters: entries first.

--selftest runs the degenerate-case unit checks always, and adds the recorded
regression values when csv_dir holds the reference exports.

Runs locally. Nothing is uploaded anywhere.
"""
import csv, sys, os
from collections import Counter, defaultdict

SLATE_SLOTS = 10          # MLB classic: P,P,C,1B,2B,3B,SS,OF,OF,OF
N_PITCHERS  = 2
CAP         = 50000
FLOOR       = 49500       # the floor we run; lineups under it get flagged
MAX_STACK   = 5           # DK caps hitters from one team at 5; 6+ is unuploadable
LEV_MIN     = 1.0         # below a point of edge the leverage line prints "+0"


def die(msg):
    sys.exit(f"prebuild_audit: {msg}")


# ---------------------------------------------------------------- parsing

def read_csv(path, what):
    """Rows of a CSV, with a one-line error instead of a traceback."""
    if not os.path.exists(path):
        die(f"{what} file not found: {path}")
    if os.path.isdir(path):
        die(f"{what} path is a directory, not a CSV: {path}")
    try:
        # utf-8-sig: a BOM would otherwise poison the first header name and
        # silently unjoin the whole projections file.
        with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
            return [r for r in csv.reader(fh) if any(c.strip() for c in r)]
    except (OSError, csv.Error) as e:
        die(f"cannot read {what} file {path}: {e}")


def parse_pool(rows, notes):
    """Draftgroup player pool from columns 15-23."""
    pool = {}
    dupes = bad_sal = no_game = 0
    for r in rows:
        if len(r) <= 23 or not r[18].strip().isdigit():
            continue
        pid = r[18].strip()
        try:
            sal = int(r[20].strip().replace("$", "").replace(",", ""))
        except ValueError:
            bad_sal += 1
            continue
        if pid in pool:
            dupes += 1
        game = r[21].split()[0] if r[21].strip() else ""
        if "@" not in game:
            no_game += 1
            game = ""
        pool[pid] = {
            "name": r[17].strip(),
            "rpos": r[19].strip(),
            "sal":  sal,
            "game": game,
            "team": r[22].strip(),
            "proj": 0.0,
            "own":  0.0,
        }
    if dupes:
        notes.append(f"{dupes} duplicate player IDs in the pool; last row of each wins.")
    if bad_sal:
        notes.append(f"{bad_sal} pool rows had a non-numeric salary and were skipped; "
                     f"lineups using them will be reported as unresolved.")
    if no_game:
        notes.append(f"{no_game} pool players have no usable Game Info. "
                     f"The pitcher-vs-batter check cannot run for them.")
    return pool


def parse_lineups(rows, pool, notes):
    """Entry rows from columns 0-13. Rows that cannot be resolved are reported,
    never silently dropped."""
    lineups = []
    entry_ids = Counter()
    unknown = Counter()
    unresolved = partial = dup_slot = blank = 0
    for r in rows:
        if len(r) <= 13 or not r[0].strip().isdigit():
            continue
        entry_ids[r[0].strip()] += 1
        ids = [c.strip() for c in r[4:4 + SLATE_SLOTS]]
        if not any(ids):
            blank += 1                      # reservation with no lineup yet
            continue
        if not all(i.isdigit() for i in ids):
            partial += 1
            continue
        missing = [i for i in ids if i not in pool]
        if missing:
            unresolved += 1
            unknown.update(missing)
            continue
        if len(set(ids)) < SLATE_SLOTS:
            dup_slot += 1
        lineups.append({"contest": r[1].strip(), "cid": r[2].strip(),
                        "fee": r[3].strip(), "ids": ids})

    repeats = sum(c - 1 for c in entry_ids.values() if c > 1)
    if repeats:
        notes.append(f"{repeats} repeated Entry IDs across {len(entry_ids)} distinct IDs. "
                     f"The export is doubled or merged; every average below is skewed.")
    if blank:
        notes.append(f"{blank} entries are reservations with no lineup yet.")
    if partial:
        notes.append(f"{partial} entry rows have a partly filled lineup and were skipped.")
    if unresolved:
        names = ", ".join(sorted(unknown)[:6])
        notes.append(f"{unresolved} entry rows name {len(unknown)} player IDs that are not "
                     f"in this draftgroup's pool ({names}...) and were skipped. "
                     f"Wrong slate, or a stale export?")
    if dup_slot:
        notes.append(f"{dup_slot} lineups roster the same player in two slots. "
                     f"DK will reject them.")
    return lineups


def join_projections(pool, path, notes):
    """Attach Proj/Own by DFS ID. Returns the number of pool players matched."""
    rows = read_csv(path, "projections")
    if not rows:
        die(f"projections file is empty: {path}")
    header = [h.strip().lower() for h in rows[0]]
    idx = {h: k for k, h in enumerate(header)}
    for col in ("dfs id", "proj"):
        if col not in idx:
            die(f"projections file has no '{col}' column (header: {','.join(rows[0])[:80]}). "
                f"Entries file goes first, projections second.")
    i_id, i_proj, i_own = idx["dfs id"], idx["proj"], idx.get("own")

    matched = 0
    for r in rows[1:]:
        if len(r) <= max(i_id, i_proj):
            continue
        pid = r[i_id].strip()
        if pid not in pool:
            continue
        try:
            pool[pid]["proj"] = float(r[i_proj].strip() or 0)
        except ValueError:
            continue
        matched += 1
        if i_own is not None and i_own < len(r):
            try:
                pool[pid]["own"] = float(r[i_own].strip().rstrip("%") or 0)
            except ValueError:
                pass

    if matched == 0:
        notes.append(f"projections file shares no DFS IDs with this pool -- wrong slate. "
                     f"Falling back to structure only.")
    elif matched < len(pool):
        notes.append(f"projections cover {matched} of {len(pool)} pool players; "
                     f"the rest count as 0 proj / 0% owned.")
    return matched


def load(entries_path, proj_path=None):
    notes = []
    rows = read_csv(entries_path, "entries")
    if not rows:
        die(f"entries file is empty: {entries_path}")

    pool = parse_pool(rows, notes)
    if not pool:
        hint = ""
        if any(h.strip().lower() == "dfs id" for h in rows[0]):
            hint = " That looks like a projections file -- entries file goes first."
        die(f"no player pool found in columns 15-23 of {entries_path} -- "
            f"is this the DK export?{hint}")

    if proj_path:
        join_projections(pool, proj_path, notes)

    lineups = parse_lineups(rows, pool, notes)
    return pool, lineups, notes


# ---------------------------------------------------------------- metrics

def effective_n(lineups, exposure):
    """Independent bets in the block.

    Mean pairwise roster overlap falls out of the exposure counts:
    sum over pairs of |A n B| == sum over players of C(count, 2).
    """
    n = len(lineups)
    if n < 2:
        return float(n)
    shared = sum(c * (c - 1) / 2 for c in exposure.values())
    pairs  = n * (n - 1) / 2
    overlap = shared / (pairs * SLATE_SLOTS)
    return n / (1 + (n - 1) * overlap)


def pitcher_vs_batter(pool, ids):
    """(conflict, unchecked) for one lineup.

    Same game + different team *is* the opponent relation, so this needs no
    team->opponent map. A map built only from games with two teams in the pool
    goes quietly incomplete and turns the check off; this cannot, and says so
    when a pitcher has no Game Info to check against.
    """
    bats = [(pool[i]["game"], pool[i]["team"]) for i in ids[N_PITCHERS:]]
    conflict = unchecked = False
    for q in ids[:N_PITCHERS]:
        g, t = pool[q]["game"], pool[q]["team"]
        if not g or not t:
            unchecked = True
            continue
        if any(bg == g and bt and bt != t for bg, bt in bats):
            conflict = True
    return conflict, unchecked


def measure(pool, lineups):
    n = len(lineups)
    if n == 0:
        return None

    exposure = Counter()
    stacks   = Counter()
    proj = own = sal = 0.0
    below = conflicts = secondary = unchecked = over_cap = 0
    teams_per = 0
    min_sal = None

    for lu in lineups:
        ids  = lu["ids"]
        bats = ids[N_PITCHERS:]

        proj += sum(pool[i]["proj"] for i in ids)
        own  += sum(pool[i]["own"]  for i in ids)
        s = sum(pool[i]["sal"] for i in ids)
        sal += s
        min_sal = s if min_sal is None else min(min_sal, s)
        if s < FLOOR:
            below += 1
        if s > CAP:
            over_cap += 1

        counts = Counter(pool[i]["team"] for i in bats)
        sizes  = sorted(counts.values(), reverse=True)
        stacks[sizes[0]] += 1             # true size: 6+ is its own thing, not a 5
        if len(sizes) > 1 and sizes[1] >= 3:
            secondary += 1
        teams_per += len(counts)

        c, u = pitcher_vs_batter(pool, ids)
        conflicts += c
        unchecked += u

        for i in ids:
            exposure[i] += 1

    top_id, top_ct = exposure.most_common(1)[0]
    return {
        "n": n, "proj": proj / n, "own": own / n, "sal": sal / n,
        "min_sal": min_sal, "below": below, "over_cap": over_cap,
        "effn": effective_n(lineups, exposure),
        "five": sum(c for k, c in stacks.items() if k >= MAX_STACK) / n * 100,
        "over_stack": sum(c for k, c in stacks.items() if k > MAX_STACK),
        "stacks": stacks,
        "secondary": secondary / n * 100,
        "teams_per": teams_per / n,
        "conflicts": conflicts, "unchecked": unchecked,
        "unique": len(exposure),
        "max_exp": top_ct / n * 100, "max_name": pool[top_id]["name"],
        "exposure": exposure,
    }


def line(label, m):
    return (f"{label:<34} n={m['n']:3d} proj={m['proj']:6.1f} own={m['own']:6.1f}% "
            f"sal=${m['sal']:>7,.0f} min=${m['min_sal']:,} <floor={m['below']:3d} "
            f"effN={m['effn']:4.1f} 5st={m['five']:3.0f}% 2nd3+={m['secondary']:3.0f}% "
            f"t/LU={m['teams_per']:.2f} PvB={m['conflicts']:2d} uniq={m['unique']:3d} "
            f"maxExp={m['max_exp']:3.0f}% ({m['max_name']})")


# ---------------------------------------------------------------- flags

def flags(pool, m, has_field):
    """Game-theory checks. Each returns a line only when it fires."""
    out = []
    n, exp = m["n"], m["exposure"]

    if m["over_cap"] or m["over_stack"]:
        bits = []
        if m["over_cap"]:
            bits.append(f"{m['over_cap']} over the ${CAP:,} cap")
        if m["over_stack"]:
            bits.append(f"{m['over_stack']} with more than {MAX_STACK} hitters from one team")
        out.append(f"RULES    {', '.join(bits)}. DK will reject the upload.")

    if m["below"]:
        out.append(f"SALARY   {m['below']} of {n} lineups below ${FLOOR:,} "
                   f"(min ${m['min_sal']:,}). Diversity is being bought with salary "
                   f"slack instead of construction.")

    if m["conflicts"]:
        out.append(f"CORREL   {m['conflicts']} lineups run a pitcher against their own "
                   f"batters. Strictly negative correlation, no upside case.")

    if m["unchecked"]:
        out.append(f"UNKNOWN  {m['unchecked']} pitcher slots had no Game Info, so the "
                   f"pitcher-vs-batter check did not run on them. PvB={m['conflicts']} "
                   f"is a floor, not a count.")

    if m["five"] < 85:
        s = m["stacks"]
        big = "".join(f"{k}:{s[k]} " for k in sorted(s, reverse=True) if k > MAX_STACK)
        out.append(f"STACKS   five-stacks at {m['five']:.0f}%. "
                   f"Profile {big}{5}:{s[5]} {4}:{s[4]} {3}:{s[3]} {2}:{s[2]}. "
                   f"Below ~85% the block stops being a correlated-upside portfolio.")

    if m["teams_per"] > 3.0:
        out.append(f"SPREAD   {m['teams_per']:.2f} teams per lineup. Rosters are scattered; "
                   f"tail outcomes need concentration.")

    if n >= 3:
        for i, c in exp.most_common():
            if c / n < 0.8:
                break
            out.append(f"CONCENT  {pool[i]['name']} in {c} of {n} lineups ({c/n*100:.0f}%). "
                       f"A block this small cannot afford a shared point of failure.")

    target = max(3.0, n * 0.09)
    if n >= 10 and m["effn"] < target:
        out.append(f"EFFN     {m['effn']:.1f} independent bets out of {n} entries "
                   f"(want >{target:.1f}). You are paying {n} fees for {m['effn']:.1f} shots.")

    if not has_field:
        return out

    # leverage: exposure against field ownership
    chalk_over = []
    dead = []
    for i, c in exp.items():
        mine, field = c / n * 100, pool[i]["own"]
        if field >= 35 and mine - field >= LEV_MIN:
            chalk_over.append((mine - field, pool[i]["name"], mine, field))
        if mine >= 20 and field >= 15 and abs(mine - field) < 3:
            dead.append((mine, pool[i]["name"], mine, field))

    for d, name, mine, field in sorted(chalk_over, reverse=True)[:3]:
        out.append(f"LEVERAGE over the field on chalk: {name} {mine:.0f}% vs {field:.0f}% field "
                   f"({d:+.0f}). Duplicated lineups do not win top 1%.")

    for _, name, mine, field in sorted(dead, reverse=True)[:3]:
        out.append(f"NEUTRAL  {name} {mine:.0f}% vs {field:.0f}% field. Heavy exposure buying "
                   f"no differentiation -- spend it or cut it.")

    return out


# ---------------------------------------------------------------- report

def report(pool, lineups, notes):
    has_field = any(p["own"] for p in pool.values())

    print(f"\n{len(lineups)} lineups | {len(pool)} players | "
          f"{'projections joined' if has_field else 'NO projections -- structure only'}\n")
    for note in notes:
        print(f"  WARN  {note}")
    if notes:
        print()

    overall = measure(pool, lineups)
    if overall is None:
        print("no complete lineups to audit -- nothing was scored.\n")
        return 1
    print(line("OVERALL", overall))

    # keyed by contest ID: two contests can share a display name
    by_contest = defaultdict(list)
    label = {}
    for lu in lineups:
        by_contest[lu["cid"]].append(lu)
        label[lu["cid"]] = lu["contest"]
    order = sorted(by_contest, key=lambda c: (label[c], c))
    if len(by_contest) > 1:
        print()
        for cid in order:
            print(line("  " + label[cid][:32], measure(pool, by_contest[cid])))

    print("\n--- flags ---")
    fired = flags(pool, overall, has_field)
    for cid in order:
        block = by_contest[cid]
        if len(block) < 3:
            continue
        for f in flags(pool, measure(pool, block), has_field):
            if f.startswith(("EFFN", "STACKS", "CONCENT", "RULES")):
                fired.append(f"[{label[cid][:24]}] {f}")
    print("\n".join("  " + f for f in fired) if fired else "  none")

    if has_field:
        print("\n--- exposure vs field (top 15) ---")
        exp = overall["exposure"]
        rows = sorted(((c / overall["n"] * 100, pool[i]["own"], pool[i])
                       for i, c in exp.items()), key=lambda r: -r[0])[:15]
        for mine, field, p in rows:
            print(f"  {p['name']:<22}{p['team']:>4} ${p['sal']:>6,} proj{p['proj']:6.1f}  "
                  f"mine{mine:5.0f}%  field{field:5.1f}%  lev{mine - field:+6.1f}")
    print()
    return 0


# ---------------------------------------------------------------- selftest

# label -> (entries csv, projections csv, expected report values)
REGRESSION = [
    ("de05dd84-mlbdkmain20260903.csv", "c02c0512-SimSavantProjections09032026DraftKingsMain.csv",
     dict(n=67, proj="99.5", own="152.9", sal="49,836", below=0, effn="4.7", five="96",
          secondary="46", teams_per="2.58", conflicts=0, unique=88, max_exp="67")),
    ("ebdedfb2-mlbdkmain20260903_2.csv", "c02c0512-SimSavantProjections09032026DraftKingsMain.csv",
     dict(n=67, proj="95.1", own="128.2", sal="49,452", below=28, effn="6.7", five="58",
          secondary="18", teams_per="3.60", conflicts=0, unique=106, max_exp="42")),
    ("69bc4ef0-mlbdkmain20260903_3.csv", "c02c0512-SimSavantProjections09032026DraftKingsMain.csv",
     dict(n=67, proj="95.9", own="129.6", sal="49,757", below=0, effn="6.2", five="100",
          secondary="79", teams_per="2.22", conflicts=0, unique=101, max_exp="39")),
    ("d1cbcfe0-mlbdkmain20260903_4.csv", "c02c0512-SimSavantProjections09032026DraftKingsMain.csv",
     dict(n=67, proj="98.4", own="142.5", sal="49,821", below=0, effn="5.0", five="82",
          secondary="52", teams_per="2.64", conflicts=0, unique=87, max_exp="43")),
]

FMT = dict(proj="{:.1f}", own="{:.1f}", sal="{:,.0f}", effn="{:.1f}", five="{:.0f}",
           secondary="{:.0f}", teams_per="{:.2f}", max_exp="{:.0f}")


def fake_pool(spec):
    """spec: id -> (team, game, salary). Proj/own default to 0."""
    return {i: {"name": i, "rpos": "OF", "sal": s, "game": g, "team": t,
                "proj": 0.0, "own": 0.0} for i, (t, g, s) in spec.items()}


def brute_effn(lineups):
    """O(n^2) reference for the closed-form effective_n."""
    n = len(lineups)
    if n < 2:
        return float(n)
    sets = [set(lu["ids"]) for lu in lineups]
    tot = sum(len(sets[a] & sets[b]) for a in range(n) for b in range(a + 1, n))
    overlap = tot / (n * (n - 1) / 2 * SLATE_SLOTS)
    return n / (1 + (n - 1) * overlap)


def unit_checks():
    """Degenerate cases. No CSVs needed."""
    fails = []

    def ck(name, got, want):
        if got != want:
            fails.append(f"{name}: got {got!r}, want {want!r}")

    # a 4-team pool: two games, ten slots
    spec = {}
    for k, (t, g) in enumerate([("AAA", "AAA@BBB"), ("BBB", "AAA@BBB"),
                                ("CCC", "CCC@DDD"), ("DDD", "CCC@DDD")]):
        for j in range(10):
            spec[f"{k}{j}"] = (t, g, 4000)
    pool = fake_pool(spec)
    lu = lambda ids: {"contest": "c", "cid": "1", "fee": "$1", "ids": ids}

    ck("empty block", measure(pool, []), None)

    # n=1: no pairs to divide by
    one = [lu(["00", "10", "20", "21", "22", "23", "24", "30", "31", "32"])]
    m = measure(pool, one)
    ck("n=1 effn", round(m["effn"], 6), 1.0)
    ck("n=1 maxexp", m["max_exp"], 100.0)
    ck("n=1 min_sal", m["min_sal"], 40000)

    # n=2 identical -> 1 bet; n=2 disjoint -> 2 bets
    a = lu(["00", "10", "20", "21", "22", "23", "24", "30", "31", "32"])
    b = lu(["01", "11", "25", "26", "27", "28", "29", "33", "34", "35"])
    ck("n=2 same effn", round(measure(pool, [a, a])["effn"], 6), 1.0)
    ck("n=2 disjoint effn", round(measure(pool, [a, b])["effn"], 6), 2.0)

    # closed form == brute force on a lumpy block
    block = [lu(["00", "10", "20", "21", "22", "23", "24", "30", "31", f"3{2 + j % 6}"])
             for j in range(9)] + [a, b]
    m = measure(pool, block)
    ck("effn identity", round(m["effn"], 9), round(brute_effn(block), 9))

    # every batter on one team: no second stack, no zero-division on sizes[1]
    solid = lu(["00", "10", "20", "21", "22", "23", "24", "25", "26", "27"])
    m = measure(pool, [solid])
    ck("one-team secondary", m["secondary"], 0.0)
    ck("one-team teams_per", m["teams_per"], 1.0)
    ck("one-team stack size", m["stacks"][8], 1)
    ck("one-team five", m["five"], 100.0)
    ck("one-team over_stack", m["over_stack"], 1)

    # 6-stack is counted as a 6, still counts toward 5st, and trips RULES
    six = lu(["00", "10", "20", "21", "22", "23", "24", "25", "30", "31"])
    m = measure(pool, [six])
    ck("six bucket", m["stacks"][6], 1)
    ck("six not a five", m["stacks"][5], 0)
    ck("six counts as 5st", m["five"], 100.0)
    ck("six trips rules", any(f.startswith("RULES") for f in flags(pool, m, False)), True)

    # pitcher vs his own opponents' batters
    ck("pvb fires", measure(pool, [lu(["00", "30", "10", "11", "12", "13", "14",
                                       "20", "21", "22"])])["conflicts"], 1)
    # same team as the pitcher is not a conflict, and neither is another game
    ck("pvb quiet", measure(pool, [lu(["00", "01", "02", "03", "04",
                                       "20", "21", "22", "23", "24"])])["conflicts"], 0)

    # a pitcher with no Game Info must be reported, never silently passed
    blind = fake_pool(spec)
    blind["00"]["game"] = ""
    m = measure(blind, [lu(["00", "30", "10", "11", "12", "13", "14", "20", "21", "22"])])
    ck("pvb unchecked", m["unchecked"], 1)
    ck("pvb unchecked flagged", any(f.startswith("UNKNOWN") for f in flags(blind, m, False)), True)

    # over the cap
    rich = fake_pool({k: (t, g, 6000) for k, (t, g, _) in spec.items()})
    ck("over cap", measure(rich, [a])["over_cap"], 1)

    return fails


def csv_checks(csv_dir):
    fails = []
    for entries, proj, want in REGRESSION:
        ep, pp = os.path.join(csv_dir, entries), os.path.join(csv_dir, proj)
        if not (os.path.exists(ep) and os.path.exists(pp)):
            print(f"  skip {entries} (not in {csv_dir})")
            continue
        pool, lineups, _ = load(ep, pp)
        m = measure(pool, lineups)
        bad = []
        for key, expect in want.items():
            got = FMT[key].format(m[key]) if key in FMT else m[key]
            if got != expect:
                bad.append(f"{key}={got} (want {expect})")
        print(f"  {'FAIL' if bad else 'ok  '} {entries}" + ("  " + ", ".join(bad) if bad else ""))
        fails += bad
    return fails


def selftest(csv_dir):
    print("\nunit checks (no CSVs needed)")
    fails = unit_checks()
    print(f"  {'FAIL: ' + '; '.join(fails) if fails else 'ok'}")

    print("\nregression values")
    if csv_dir is None:
        print("  skipped -- pass a directory of the reference exports: "
              "--selftest /path/to/csvs")
    elif not os.path.isdir(csv_dir):
        die(f"--selftest wants a directory of CSVs, not {csv_dir}")
    else:
        fails += csv_checks(csv_dir)

    print(f"\n{'FAILED' if fails else 'PASSED'}\n")
    return 1 if fails else 0


# ---------------------------------------------------------------- entry point

def main(argv):
    opts = [a for a in argv if a.startswith("-") and a != "-"]
    args = [a for a in argv if a not in opts]
    for o in opts:
        if o not in ("-h", "--help", "--selftest"):
            die(f"unknown option {o}\n{__doc__}")

    if "-h" in opts or "--help" in opts:
        print(__doc__.strip())
        return 0
    if "--selftest" in opts:
        if len(args) > 1:
            die(f"--selftest takes at most one directory, got {len(args)}\n{__doc__}")
        return selftest(args[0] if args else None)
    if not args:
        die(f"no entries file given.\n{__doc__}")
    if len(args) > 2:
        die(f"expected 1 or 2 files, got {len(args)}: {', '.join(args)}\n{__doc__}")

    pool, lineups, notes = load(args[0], args[1] if len(args) > 1 else None)
    return report(pool, lineups, notes)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
