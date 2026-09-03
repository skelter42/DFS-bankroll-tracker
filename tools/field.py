#!/usr/bin/env python3
"""
Team-stack and game-level field analysis for a DraftKings MLB prebuild.

    python3 tools/field.py entries.csv projections.csv

prebuild_audit.py compares exposure player by player. In MLB GPPs the unit of
competition is the five-man team stack, so this compares STACK distributions:
his 4+/5 rate per team against an estimate of the field's, ranked by leverage.

We are not given the field's lineups -- only per-player field ownership. The
field's stack rates therefore have to be inferred. See infer_field_stacks() for
the estimator; the short version is that the scale is modelled and the ranking
is close to the raw team-ownership ranking, which the report says out loud.

Runs locally. Nothing is uploaded anywhere.
"""
import sys, os
from collections import Counter, defaultdict
from statistics import median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prebuild_audit import load, N_PITCHERS          # noqa: E402  same parser, same shapes

BAT_SLOTS   = 8           # MLB classic: 10 slots - 2 pitchers
MAX_TEAM_BAT = 5          # DK caps hitters from one team at 5
STACK_MIN   = 4           # what counts as "a stack"

CORE_BATS   = 6           # a 4+ stack only ever uses a team's top of the order
STAR_CAP    = 1.4         # cap the #1 bat at this multiple of the plateau
PHI_LO, PHI_HI = 0.25, 0.90
FIELD_STACK_RATE = 0.85   # share of field lineups running one 4+ stack -- the
                          # single calibration knob; estimates scale linearly in it


# ---------------------------------------------------------------- parsing

def is_batter(p):
    return "P" not in p["rpos"].split("/")


def field_teams(pool):
    """team -> batter field ownerships as fractions, sorted descending."""
    by_team = defaultdict(list)
    for p in pool.values():
        if is_batter(p) and p["team"]:
            by_team[p["team"]].append(p["own"] / 100.0)
    return {t: sorted(v, reverse=True) for t, v in by_team.items()}


def game_map(pool):
    """game -> set of teams, and team -> game."""
    games = defaultdict(set)
    for p in pool.values():
        if p["game"] and p["team"]:
            games[p["game"]].add(p["team"])
    return dict(games), {t: g for g, ts in games.items() for t in ts}


# ---------------------------------------------------------------- estimator

def stack_ceiling(owns, k):
    """PROVABLE upper bound on P(lineup has >= k batters from this team).

    Ownership is a marginal probability, so it sums correctly regardless of how
    correlated the field's picks are. Drop the j most-owned bats: a lineup with
    k from the team still has at least k-j among the rest, so summing marginals
    over the rest gives (k-j) * P(X>=k) <= tail. Minimising over j is tightest.
    j=0 is the familiar sum/k; j=k-1 is a pigeonhole bound that is much sharper
    for teams whose ownership sits on one star. No assumptions, no fitting.
    """
    tail, best = sum(owns), 1.0
    for j in range(k):
        if j:
            tail -= owns[j - 1]
        best = min(best, tail / (k - j))
    return max(0.0, min(best, 1.0))


def infer_field_stacks(by_team, rate=FIELD_STACK_RATE):
    """Estimate the field's 4+ and 5 stack rate per team from player ownership.

    PRINCIPLED. Summed batter ownership S_t is exactly E[batters from team t per
    lineup] -- linearity of expectation, true under any correlation. sum(S_t)
    over teams is 8, the batter slots. stack_ceiling() gives hard upper bounds.

    HEURISTIC, in three places, because S_t alone cannot separate a committed
    stack from scattered one-off exposure:

      1. Stack demand only lives in a team's CORE_BATS most-owned hitters. A
         5-stack does not skip better bats to take the 8th-best one, so mass
         below that rank is one-off exposure and is discarded.
      2. The #1 bat carries one-off star demand on top of its stack share, so
         inside the core it is capped at STAR_CAP x the plateau (the median of
         bats 2-5). Only the excess is discarded; a genuinely flat team loses
         nothing.
      3. The 4-vs-5 split phi_t is read off tail depth: if the 5th bat holds the
         plateau the field is going five deep, if it falls off a cliff the field
         is stopping at four. Real signal, but an eyeballed functional form.

    The remaining core mass C_t is then read as stack-equivalents, C_t / (4+phi),
    and the whole vector is scaled so the rates sum to `rate`. That last step is
    the load-bearing one: almost every GPP lineup runs exactly one 4+ stack, so
    the field's per-team 4+ rates must sum to about 1. Calibrating to it converts
    "how much ownership" into "what share of the field", and absorbs the fact
    that plenty of core mass is really secondary 2-3 man stacks. The calibration
    factor is reported -- far from ~0.5-0.7 means the shape model is off.

    Consequence worth being blunt about: after calibration the ranking is driven
    mostly by S_t, so the field's stack order is close to the team-ownership
    order. What the model actually buys is the SCALE (comparable to his own
    rates), the 4-vs-5 split, and the hard ceilings.
    """
    raw, phi, ceil4, ceil5 = {}, {}, {}, {}
    for t, o in by_team.items():
        core = (o + [0.0] * CORE_BATS)[:CORE_BATS]
        plateau = median(core[1:5]) or 0.0
        capped = [min(core[0], STAR_CAP * plateau) if plateau else core[0]] + core[1:]
        head = median(core[:4]) or 0.0
        phi[t] = min(PHI_HI, max(PHI_LO, core[4] / head)) if head else 0.5
        raw[t] = sum(capped) / (STACK_MIN + phi[t])
        ceil4[t] = stack_ceiling(o, STACK_MIN)
        ceil5[t] = stack_ceiling(o, MAX_TEAM_BAT)

    total = sum(raw.values())
    k = rate / total if total else 0.0

    out = {}
    for t, o in by_team.items():
        f4 = min(raw[t] * k, ceil4[t])
        out[t] = {
            "S": sum(o), "phi": phi[t],
            "f4": f4, "f5": min(f4 * phi[t], ceil5[t]),
            "ceil4": ceil4[t], "ceil5": ceil5[t],
            "naive": sum(o) / (STACK_MIN + phi[t]),   # the first approximation
            "capped": f4 >= ceil4[t] - 1e-9,
        }
    return out, {"calib": k, "raw_total": total, "rate": rate}


# ---------------------------------------------------------------- his side

def my_stacks(pool, lineups):
    """His 4+ and 5 stack rate per team, plus batters-per-lineup by team/game."""
    n = len(lineups)
    s4, s5, bats, gbats = Counter(), Counter(), Counter(), Counter()
    gfive, gfour = Counter(), Counter()
    for lu in lineups:
        counts = Counter(pool[i]["team"] for i in lu["ids"][N_PITCHERS:])
        gcounts = Counter()
        for t, c in counts.items():
            bats[t] += c
            if c >= STACK_MIN:
                s4[t] += 1
            if c >= MAX_TEAM_BAT:
                s5[t] += 1
            gcounts[pool_game(pool, t)] += c
        for g, c in gcounts.items():
            gbats[g] += c
            if c >= 5:
                gfive[g] += 1
            if c >= STACK_MIN:
                gfour[g] += 1
    return {"n": n, "s4": s4, "s5": s5, "bats": bats,
            "gbats": gbats, "gfive": gfive, "gfour": gfour}


_GAME_OF = {}

def pool_game(pool, team):
    if not _GAME_OF:
        for p in pool.values():
            if p["team"] and p["game"]:
                _GAME_OF[p["team"]] = p["game"]
    return _GAME_OF.get(team, "?")


def stack_proj(pool, team):
    """Projection of the team's best five bats -- the only quality signal here.

    Ignores roster-position legality (a real stack has to fit C/1B/2B/3B/SS/OF),
    so it runs a shade optimistic, but uniformly across teams.
    """
    p = sorted((q["proj"] for q in pool.values()
                if is_batter(q) and q["team"] == team), reverse=True)
    return sum(p[:MAX_TEAM_BAT])


# ---------------------------------------------------------------- quality

def verdict(lev, sp, med, dead=2.0):
    """Cross leverage against projection. Contrarian on a bad team is not edge."""
    if abs(lev) < dead:
        return "aligned with field"
    if lev > 0:
        return "CONTRARIAN, defensible" if sp >= med else "CONTRARIAN, chasing a bad team"
    return "underweight good chalk" if sp >= med else "underweight a bad team (fine)"


# ---------------------------------------------------------------- report

def report(pool, lineups, label=""):
    by_team = field_teams(pool)
    field, diag = infer_field_stacks(by_team)
    mine = my_stacks(pool, lineups)
    n = mine["n"]
    games, team_game = game_map(pool)
    sp = {t: stack_proj(pool, t) for t in by_team}
    med = median(sp.values())

    print(f"\n=== {label} ===" if label else "")
    print(f"{n} lineups | {len(pool)} players | {len(by_team)} teams / {len(games)} games | "
          f"field model: {diag['rate']*100:.0f}% of lineups run one 4+ stack")

    print("\n--- team stacks: mine vs field, ranked by leverage ---")
    print(f"  {'tm':<4}{'mine4+':>8}{'mine5':>8}{'field4+':>9}{'field5':>8}"
          f"{'lev':>8}{'ceil':>7}{'proj5':>7}  verdict")
    rows = []
    for t in by_team:
        f = field[t]
        m4, m5 = mine["s4"][t] / n * 100, mine["s5"][t] / n * 100
        rows.append((m4 - f["f4"] * 100, t, m4, m5, f, sp[t]))
    for lev, t, m4, m5, f, q in sorted(rows, reverse=True):
        mark = "*" if f["capped"] else " "
        print(f"  {t:<4}{m4:7.1f}%{m5:7.1f}%{f['f4']*100:8.1f}%{f['f5']*100:7.1f}%"
              f"{lev:+8.1f}{f['ceil4']*100:6.0f}%{mark}{q:7.1f}  {verdict(lev, q, med)}")
    print(f"  ceil = provable upper bound on the field rate; * = estimate sits on it")

    print("\n--- game concentration ---")
    print(f"  {'game':<10}{'mine b/LU':>11}{'field b/LU':>12}{'lev':>7}"
          f"{'my 4+':>8}{'my 5+':>8}{'field 4+':>10}{'proj10':>8}")
    grows = []
    for g, teams in games.items():
        fb = sum(field[t]["S"] for t in teams if t in field)
        mb = mine["gbats"][g] / n
        ff = sum(field[t]["f4"] for t in teams if t in field)
        grows.append((mb - fb, g, mb, fb, ff, sum(sp.get(t, 0) for t in teams)))
    for lev, g, mb, fb, ff, q in sorted(grows, reverse=True):
        print(f"  {g:<10}{mb:11.2f}{fb:12.2f}{lev:+7.2f}"
              f"{mine['gfour'][g]/n*100:7.0f}%{mine['gfive'][g]/n*100:7.0f}%"
              f"{ff*100:9.0f}%{q:8.1f}")
    print("  batters/LU is exact on both sides (linearity of expectation, no model).")
    print("  field 4+ is a LOWER bound: it counts single-team stacks only, not 3+2 or 2+2.")

    print("\n--- flags ---")
    for f in stack_flags(rows, grows, field, mine, med, n):
        print("  " + f)

    print("\n--- model diagnostics ---")
    tot = sum(field[t]["f4"] for t in by_team)
    worst = max(field.values(), key=lambda f: f["f4"])
    print(f"  field 4+ rates sum to {tot*100:.0f}% (target {diag['rate']*100:.0f}%, "
          f"one primary stack per lineup); max team {worst['f4']*100:.0f}% -- both coherent"
          if tot <= 1.05 and worst["f4"] < 1 else "  INCOHERENT: check the estimator")
    print(f"  calibration factor {diag['calib']:.2f} -- {(1-diag['calib'])*100:.0f}% of core "
          f"plateau mass read as secondary/one-off rather than primary stack")
    print(f"  batter ownership sums to {sum(f['S'] for f in field.values()):.2f} "
          f"(should be {BAT_SLOTS}); {sum(1 for f in field.values() if f['capped'])} "
          f"teams pinned to their provable ceiling")
    print(f"  best-5 projection spans {min(sp.values()):.1f}-{max(sp.values()):.1f}; "
          f"projection is the same signal the field prices, so a high-proj team the "
          f"field ignores is either a blind spot or a disagreement with the market.")


def stack_flags(rows, grows, field, mine, med, n):
    """Each fires only when it has something to say."""
    out = []
    for lev, t, m4, m5, f, q in sorted(rows, reverse=True)[:2]:
        if lev >= 5 and q >= med:
            out.append(f"EDGE     {t} {m4:.0f}% vs {f['f4']*100:.0f}% field ({lev:+.0f}) and "
                       f"proj5 {q:.1f} is above slate median {med:.1f}. Defensible overweight.")
        elif lev >= 5:
            out.append(f"CHASING  {t} {m4:.0f}% vs {f['f4']*100:.0f}% field ({lev:+.0f}) but "
                       f"proj5 {q:.1f} is below median {med:.1f}. The field is off it for a "
                       f"reason -- contrarian and wrong is still wrong.")
    for lev, t, m4, m5, f, q in sorted(rows)[:2]:
        if lev <= -4 and q >= med:
            out.append(f"BLINDSIDE {t} {m4:.0f}% vs {f['f4']*100:.0f}% field ({lev:+.0f}) on a "
                       f"top-half projection. Duplicating nothing, but ceding a live stack.")
    top = max(rows)
    if top[2] >= 30:
        out.append(f"CONCENT  {top[1]} in {top[2]:.0f}% of lineups. One team's weather, lineup "
                   f"card or starter now decides the whole block.")
    covered = sum(1 for lev, t, m4, m5, f, q in rows if m4 > 0)
    if covered <= 4:
        out.append(f"NARROW   only {covered} teams stacked across {n} lineups. Top 1% needs the "
                   f"right stack to land, not the same stack {n} times.")
    glev, g, mb, fb, ff, q = max(grows)
    if glev >= 1.0:
        out.append(f"GAME     {g} at {mb:.2f} batters/LU vs {fb:.2f} field ({glev:+.2f}). "
                   f"Correlated upside is concentrated there -- intentional or not.")
    return out or ["none"]


# ---------------------------------------------------------------- self-test

UP = "/root/.claude/uploads/00b0b19f-2cd3-55fc-8a03-b5aeb308103a/"
BUILDS = ["de05dd84-mlbdkmain20260903.csv",
          "69bc4ef0-mlbdkmain20260903_3.csv",
          "d1cbcfe0-mlbdkmain20260903_4.csv"]
PROJ = "c02c0512-SimSavantProjections09032026DraftKingsMain.csv"

# his 4+ rates for build _3, rounded, from the DK export -- parser check
TRUTH = {"MIA": 21, "BOS": 15, "TB": 13, "MIL": 10, "KC": 10, "SEA": 9,
         "LAD": 7, "STL": 4, "CHC": 4, "BAL": 3, "TEX": 1}


def selftest():
    pool, lus, _ = load(UP + BUILDS[1], UP + PROJ)
    mine = my_stacks(pool, lus)
    bad = [f"{t} {round(mine['s4'][t]/len(lus)*100)}!={v}"
           for t, v in TRUTH.items() if round(mine["s4"][t] / len(lus) * 100) != v]
    assert not bad, "stack counts do not match ground truth: " + ", ".join(bad)

    by_team = field_teams(pool)
    field, diag = infer_field_stacks(by_team)
    assert abs(sum(f["S"] for f in field.values()) - BAT_SLOTS) < 0.1, "ownership not normalised"
    assert all(f["f4"] <= 1.0 for f in field.values()), "a field rate exceeded 100%"
    assert all(f["f4"] <= f["ceil4"] + 1e-9 for f in field.values()), "estimate broke its bound"
    assert abs(sum(f["f4"] for f in field.values()) - diag["rate"]) < 0.02, "rates do not sum"
    for t, o in by_team.items():
        assert stack_ceiling(o, 4) >= stack_ceiling(o, 5) - 1e-9, f"{t} bounds not monotone"
    print("selftest OK: ground truth matched, bounds hold, rates coherent\n")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        report(*load(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)[:2])
    else:
        selftest()
        for b in BUILDS:
            _GAME_OF.clear()
            pool, lus, _ = load(UP + b, UP + PROJ)
            report(pool, lus, b)
        print()
