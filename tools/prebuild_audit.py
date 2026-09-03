#!/usr/bin/env python3
"""
Audit a DraftKings prebuild before upload.

    python3 tools/prebuild_audit.py entries.csv [projections.csv]

entries.csv is the DK bulk-entry export straight out of SimSavant: entry rows
on the left, the draftgroup player pool embedded in columns 15-23 on the right.
projections.csv is optional and only adds field ownership and projections
(needs DFS ID, Proj, Own).

Runs locally. Nothing is uploaded anywhere.
"""
import csv, sys, math
from collections import Counter, defaultdict

SLATE_SLOTS = 10          # MLB classic: P,P,C,1B,2B,3B,SS,OF,OF,OF
N_PITCHERS  = 2
CAP         = 50000
FLOOR       = 49500       # the floor we run; lineups under it get flagged


# ---------------------------------------------------------------- parsing

def load(entries_path, proj_path=None):
    rows = list(csv.reader(open(entries_path, encoding="utf-8")))

    pool = {}
    for r in rows:
        if len(r) > 23 and r[18].strip().isdigit():
            pool[r[18].strip()] = {
                "name": r[17].strip(),
                "rpos": r[19].strip(),
                "sal":  int(r[20]),
                "game": r[21].split()[0] if r[21].strip() else "",
                "team": r[22].strip(),
                "proj": 0.0,
                "own":  0.0,
            }
    if not pool:
        sys.exit("no player pool found in columns 15-23 -- is this the DK export?")

    if proj_path:
        for r in csv.DictReader(open(proj_path, encoding="utf-8")):
            i = (r.get("DFS ID") or "").strip()
            if i in pool:
                try:
                    pool[i]["proj"] = float(r["Proj"])
                    pool[i]["own"]  = float(r["Own"]) if r.get("Own", "").strip() else 0.0
                except (ValueError, KeyError):
                    pass

    lineups = []
    for r in rows:
        if len(r) > 13 and r[0].strip().isdigit() and r[4].strip().isdigit():
            ids = [c.strip() for c in r[4:4 + SLATE_SLOTS]]
            if all(i in pool for i in ids):
                lineups.append({"contest": r[1].strip(), "fee": r[3].strip(), "ids": ids})

    # opponent map, for pitcher-vs-batter conflicts
    by_game = defaultdict(set)
    for p in pool.values():
        by_game[p["game"]].add(p["team"])
    opp = {}
    for teams in by_game.values():
        t = list(teams)
        if len(t) == 2:
            opp[t[0]], opp[t[1]] = t[1], t[0]

    return pool, lineups, opp


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


def measure(pool, lineups, opp):
    n = len(lineups)
    if n == 0:
        return None

    exposure = Counter()
    stacks   = Counter()
    proj = own = sal = 0.0
    below = conflicts = secondary = 0
    teams_per = 0
    min_sal = CAP

    for lu in lineups:
        ids  = lu["ids"]
        bats = ids[N_PITCHERS:]
        pits = ids[:N_PITCHERS]

        proj += sum(pool[i]["proj"] for i in ids)
        own  += sum(pool[i]["own"]  for i in ids)
        s = sum(pool[i]["sal"] for i in ids)
        sal += s
        min_sal = min(min_sal, s)
        if s < FLOOR:
            below += 1

        counts = Counter(pool[i]["team"] for i in bats)
        sizes  = sorted(counts.values(), reverse=True)
        stacks[min(sizes[0], 5)] += 1
        if len(sizes) > 1 and sizes[1] >= 3:
            secondary += 1
        teams_per += len(counts)

        bat_teams = {pool[i]["team"] for i in bats}
        if any(opp.get(pool[q]["team"]) in bat_teams for q in pits):
            conflicts += 1

        for i in ids:
            exposure[i] += 1

    top_id, top_ct = exposure.most_common(1)[0]
    return {
        "n": n, "proj": proj / n, "own": own / n, "sal": sal / n,
        "min_sal": min_sal, "below": below,
        "effn": effective_n(lineups, exposure),
        "five": stacks[5] / n * 100, "stacks": stacks,
        "secondary": secondary / n * 100,
        "teams_per": teams_per / n,
        "conflicts": conflicts,
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

    if m["below"]:
        out.append(f"SALARY   {m['below']} of {n} lineups below ${FLOOR:,} "
                   f"(min ${m['min_sal']:,}). Diversity is being bought with salary "
                   f"slack instead of construction.")

    if m["conflicts"]:
        out.append(f"CORREL   {m['conflicts']} lineups run a pitcher against their own "
                   f"batters. Strictly negative correlation, no upside case.")

    if m["five"] < 85:
        s = m["stacks"]
        out.append(f"STACKS   five-stacks at {m['five']:.0f}%. "
                   f"Profile {5}:{s[5]} {4}:{s[4]} {3}:{s[3]} {2}:{s[2]}. "
                   f"Below ~85% the block stops being a correlated-upside portfolio.")

    if m["teams_per"] > 3.0:
        out.append(f"SPREAD   {m['teams_per']:.2f} teams per lineup. Rosters are scattered; "
                   f"tail outcomes need concentration.")

    for i, c in exp.items():
        if n >= 3 and c / n >= 0.8:
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
        if field >= 35 and mine > field:
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

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pool, lineups, opp = load(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    has_field = any(p["own"] for p in pool.values())

    overall = measure(pool, lineups, opp)
    print(f"\n{len(lineups)} lineups | {len(pool)} players | "
          f"{'projections joined' if has_field else 'NO projections -- structure only'}\n")
    print(line("OVERALL", overall))

    by_contest = defaultdict(list)
    for lu in lineups:
        by_contest[lu["contest"]].append(lu)
    if len(by_contest) > 1:
        print()
        for name in sorted(by_contest):
            m = measure(pool, by_contest[name], opp)
            print(line("  " + name[:32], m))

    print("\n--- flags ---")
    fired = flags(pool, overall, has_field)
    for name in sorted(by_contest):
        block = by_contest[name]
        if len(block) < 3:
            continue
        for f in flags(pool, measure(pool, block, opp), has_field):
            if f.startswith(("EFFN", "STACKS", "CONCENT")):
                fired.append(f"[{name[:24]}] {f}")
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


if __name__ == "__main__":
    main()
