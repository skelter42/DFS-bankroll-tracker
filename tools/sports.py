#!/usr/bin/env python3
"""
Sport definitions for the prebuild audit: what differs between MLB and NFL.

A sport is a plain dict (see SPORTS at the bottom) holding the roster layout,
salary rules, the roles that make up the correlated core, the anti-correlated
pairs, and two small pure functions -- structure() and violations() -- that turn
one lineup into numbers and then into complaints. Nothing here is a framework;
prebuild_audit.py is expected to pull the pieces it wants out of the dict.

    python3 tools/sports.py [dk_export.csv ...]

with no arguments runs the self-test against the bundled fixture paths plus a
synthetic NFL slate. Standard library only. Runs locally, talks to nothing.
"""
import csv, os, sys
from collections import Counter, defaultdict

# The DK export embeds the draftgroup pool to the right of the entry rows, under
# its own header. The column offset moves with the number of roster slots, so we
# locate that header instead of hardcoding it the way the MLB-only audit did.
POOL_HEADER = ("Position", "Name + ID", "Name", "ID",
               "Roster Position", "Salary", "Game Info", "TeamAbbrev")

MLB_CLASSIC_SLOTS = ("P", "P", "C", "1B", "2B", "3B", "SS", "OF", "OF", "OF")
NFL_CLASSIC_SLOTS = ("QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST")
NFL_SHOWDOWN_SLOTS = ("CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX")

NFL_PASS_CATCHERS = ("WR", "TE")
NFL_OFFENSE = ("QB", "RB", "WR", "TE")


class SportDetectionError(Exception):
    """Raised instead of guessing. A wrong sport silently mis-audits a block."""


# ---------------------------------------------------------------- roles

def mlb_role(p):
    # Roster Position collapses SP/RP to P; everything else is a bat.
    return "P" if p["rpos"].strip().upper() == "P" else "BAT"


def nfl_role(p):
    # Position is the true position (QB/RB/WR/TE/DST); Roster Position is
    # eligibility and reads "WR/FLEX", which is useless for correlation.
    return p["pos"].strip().upper()


# ---------------------------------------------------------------- parsing

def find_pool_header(rows):
    """Column index where the embedded player-pool block starts, or None."""
    for r in rows:
        for j in range(len(r) - len(POOL_HEADER) + 1):
            if all(r[j + k].strip() == POOL_HEADER[k] for k in range(len(POOL_HEADER))):
                return j
    return None


def entry_slots(rows):
    """The slot names off the entry header row, e.g. ('QB','RB',...)."""
    for r in rows:
        if r and r[0].strip() == "Entry ID":
            slots = []
            for c in r[4:]:
                c = c.strip()
                if not c or c == "Instructions":
                    break
                slots.append(c.upper())
            return tuple(slots)
    return None


def detect_sport(rows):
    """Identify the sport from the entry header row. Never guesses."""
    slots = entry_slots(rows)
    if slots is None:
        raise SportDetectionError(
            "no 'Entry ID' header row found -- this is not a DK bulk-entry export.")
    if not slots:
        raise SportDetectionError(
            "entry header row carries no roster slots between 'Entry Fee' and "
            "'Instructions'; cannot identify the sport.")
    for spec in SPORTS.values():
        if slots == spec["slots"]:
            return spec
    known = "; ".join(f"{s['label']}={','.join(s['slots'])}" for s in SPORTS.values())
    raise SportDetectionError(
        f"unrecognised roster layout {','.join(slots)} ({len(slots)} slots). "
        f"Known layouts: {known}. Refusing to guess -- add the layout to SPORTS.")


def load(path):
    """Parse a DK export. Returns (spec, pool, lineups, opp)."""
    rows = list(csv.reader(open(path, encoding="utf-8")))
    spec = detect_sport(rows)

    b = find_pool_header(rows)
    if b is None:
        raise SportDetectionError(
            f"no player pool block found in {path} -- the export must include "
            f"the draftgroup columns ({', '.join(POOL_HEADER)}).")

    pool = {}
    for r in rows:
        if len(r) > b + 7 and r[b + 3].strip().isdigit():
            pool[r[b + 3].strip()] = {
                "name": r[b + 2].strip(),
                "pos":  r[b].strip(),
                "rpos": r[b + 4].strip(),
                "sal":  int(r[b + 5]),
                "game": r[b + 6].split()[0] if r[b + 6].strip() else "",
                "team": r[b + 7].strip(),
                "proj": 0.0,
                "own":  0.0,
            }
    if not pool:
        raise SportDetectionError(f"player pool block in {path} is empty.")

    n = len(spec["slots"])
    lineups = []
    for r in rows:
        if len(r) > 4 + n and r[0].strip().isdigit():
            ids = [c.strip() for c in r[4:4 + n]]
            if all(i in pool for i in ids):
                lineups.append({"contest": r[1].strip(), "fee": r[3].strip(), "ids": ids})

    return spec, pool, lineups, opponents(pool)


def opponents(pool):
    """team -> the team it plays, derived from Game Info."""
    by_game = defaultdict(set)
    for p in pool.values():
        if p["game"]:
            by_game[p["game"]].add(p["team"])
    opp = {}
    for teams in by_game.values():
        t = sorted(teams)
        if len(t) == 2:
            opp[t[0]], opp[t[1]] = t[1], t[0]
    return opp


# ---------------------------------------------------------------- anti-correlation

def anti_conflicts(spec, players, opp):
    """Declared anti-correlated pairs present in one lineup.

    Each hit is (rule, source_player, target_player). Driven entirely off
    spec["anti"], so a new sport declares pairs rather than writing code.
    """
    role = spec["role"]
    hits = []
    for rule in spec["anti"]:
        src = [p for p in players if role(p) in rule["from"]]
        dst = [p for p in players if role(p) in rule["to"]]
        for a in src:
            target = opp.get(a["team"]) if rule["rel"] == "opposing" else a["team"]
            if not target:
                continue
            for b in dst:
                if b is not a and b["team"] == target:
                    hits.append((rule, a, b))
    return hits


# ---------------------------------------------------------------- MLB

def mlb_structure(spec, players, opp):
    """Stack shape of one MLB lineup. Semantics match the original audit."""
    bats = [p for p in players if mlb_role(p) == "BAT"]
    counts = Counter(p["team"] for p in bats)
    sizes = sorted(counts.values(), reverse=True)

    hits = anti_conflicts(spec, players, opp)
    return {
        "primary":   sizes[0] if sizes else 0,
        # the histogram the audit prints buckets everything at 5+
        "bucket":    min(sizes[0], 5) if sizes else 0,
        "secondary": sizes[1] if len(sizes) > 1 else 0,
        "teams":     len(counts),            # batters only; pitchers excluded
        "games":     len({p["game"] for p in players if p["game"]}),
        "conflicts": [h for h in hits if h[0]["hard"]],
        "soft_hits": [h for h in hits if not h[0]["hard"]],
    }


def mlb_violations(spec, st):
    out = []
    for _, a, b in st["conflicts"]:
        out.append(("hard", "PVB",
                    f"{a['name']} ({a['team']}) pitching against {b['name']} "
                    f"({b['team']}). Strictly negative, no upside case."))
    if st["primary"] < 5:
        out.append(("soft", "STACK",
                    f"primary stack is {st['primary']}, want 5."))
    if st["secondary"] < 3:
        out.append(("soft", "SECOND",
                    f"secondary stack is {st['secondary']}, want 3."))
    if st["teams"] > spec["max_teams"]:
        out.append(("soft", "SPREAD",
                    f"{st['teams']} batter teams, want <= {spec['max_teams']}."))
    return out


# ---------------------------------------------------------------- NFL

def nfl_structure(spec, players, opp):
    """Stack shape of one NFL lineup (classic or showdown).

    stack   = same-team pass catchers behind the QB (the correlation that pays)
    back    = opposing-side skill players (the run-back / shootout leg)
    games   = distinct games touched; NFL wants this small, unlike MLB's teams
    """
    role = spec["role"]
    qbs = [p for p in players if role(p) == "QB"]
    qb = qbs[0] if qbs else None
    qb_team = qb["team"] if qb else None
    qb_opp = opp.get(qb_team) if qb_team else None

    stack = back = same_rb = 0
    if qb_team:
        stack = sum(1 for p in players
                    if role(p) in NFL_PASS_CATCHERS and p["team"] == qb_team)
        same_rb = sum(1 for p in players
                      if role(p) == "RB" and p["team"] == qb_team)
    if qb_opp:
        # a DST on the QB's opposing side is a conflict, not a run-back
        back = sum(1 for p in players
                   if role(p) in NFL_OFFENSE and p["team"] == qb_opp)

    hits = anti_conflicts(spec, players, opp)
    dupes = [n for n, c in Counter(p["name"] for p in players).items() if c > 1]
    return {
        "qb":        qb["name"] if qb else "",
        "qb_team":   qb_team or "",
        "qbs":       len(qbs),
        "stack":     stack,
        "back":      back,
        "same_rb":   same_rb,
        "teams":     len({p["team"] for p in players}),
        "games":     len({p["game"] for p in players if p["game"]}),
        "dupes":     dupes,
        "conflicts": [h for h in hits if h[0]["hard"]],
        "soft_hits": [h for h in hits if not h[0]["hard"]],
    }


def nfl_violations(spec, st):
    out = []
    if spec["require_qb"] and st["qbs"] == 0:
        out.append(("hard", "NOQB", "no QB in the lineup."))
    if st["dupes"]:
        out.append(("hard", "DUPE",
                    f"same player rostered twice: {', '.join(st['dupes'])}."))
    for _, a, b in st["conflicts"]:
        out.append(("hard", "DSTvOWN",
                    f"{a['name']} DST is playing against your own {b['name']} "
                    f"({b['team']}). Your DST scoring means that offense did not."))
    if st["qbs"] and st["stack"] == 0:
        # a naked QB is the single most common structural leak in NFL GPPs
        sev = "hard" if spec["require_qb"] else "soft"
        out.append((sev, "NAKED",
                    f"{st['qb']} has no same-team pass catcher. "
                    f"Nothing in the lineup shares his upside."))
    if st["qbs"] and st["back"] == 0:
        out.append(("soft", "NOBACK",
                    f"no run-back from {st['qb']}'s opponent. "
                    f"The shootout branch pays nothing."))
    for _, a, b in st["soft_hits"]:
        out.append(("soft", "QBRB",
                    f"{a['name']} with own RB {b['name']}. Weak and contested "
                    f"-- flagged for review, not a violation."))
    if spec["max_games"] and st["games"] > spec["max_games"]:
        out.append(("soft", "SPREAD",
                    f"{st['games']} games touched, want <= {spec['max_games']}. "
                    f"Scattered rosters have no correlated ceiling."))
    return out


# ---------------------------------------------------------------- rendering

def format_structure(spec, st):
    """One-line structure summary, so callers stay sport-agnostic."""
    return " ".join(f"{k}={st[k]}" for k in spec["summary"])


# ---------------------------------------------------------------- registry

SPORTS = {
    "MLB_CLASSIC": {
        "key": "MLB_CLASSIC",
        "label": "MLB classic",
        "slots": MLB_CLASSIC_SLOTS,
        "cap": 50000,
        "floor": 49500,
        "role": mlb_role,
        # the roles that are supposed to move together
        "core": ("BAT",),
        "anti": (
            {"from": ("P",), "to": ("BAT",), "rel": "opposing", "hard": True,
             "why": "your pitcher suppressing the offense you rostered"},
        ),
        "max_teams": 3,
        "max_games": None,
        "require_qb": False,
        "structure": mlb_structure,
        "violations": mlb_violations,
        "summary": ("primary", "secondary", "teams"),
    },
    "NFL_CLASSIC": {
        "key": "NFL_CLASSIC",
        "label": "NFL classic",
        "slots": NFL_CLASSIC_SLOTS,
        "cap": 50000,
        "floor": 49000,          # placeholder: confirm the floor actually run
        "role": nfl_role,
        "core": ("QB",) + NFL_PASS_CATCHERS,
        "anti": (
            {"from": ("DST",), "to": NFL_OFFENSE, "rel": "opposing", "hard": True,
             "why": "DST points come from the offense failing"},
            # Contested. The older 'QB-RB is negative' line does not survive the
            # data: published splits put QB-RB1 mildly positive. Soft flag only.
            {"from": ("QB",), "to": ("RB",), "rel": "same", "hard": False,
             "why": "QB with own RB -- weak and contested, not a violation"},
        ),
        "max_teams": None,
        "max_games": 4,          # QB + stack + run-back should dominate the roster
        "require_qb": True,
        "structure": nfl_structure,
        "violations": nfl_violations,
        "summary": ("stack", "back", "games", "teams"),
    },
    "NFL_SHOWDOWN": {
        "key": "NFL_SHOWDOWN",
        "label": "NFL showdown",
        "slots": NFL_SHOWDOWN_SLOTS,
        "cap": 50000,
        "floor": 49400,          # placeholder
        "role": nfl_role,
        "core": ("QB",) + NFL_PASS_CATCHERS,
        "anti": (
            {"from": ("DST",), "to": NFL_OFFENSE, "rel": "opposing", "hard": True,
             "why": "DST points come from the offense failing"},
            {"from": ("QB",), "to": ("RB",), "rel": "same", "hard": False,
             "why": "QB with own RB -- weak and contested, not a violation"},
        ),
        "max_teams": None,
        "max_games": None,       # single game by construction
        "require_qb": False,     # QB-less showdown builds are legitimate
        "structure": nfl_structure,
        "violations": nfl_violations,
        "summary": ("stack", "back", "teams"),
    },
}

assert len({s["slots"] for s in SPORTS.values()}) == len(SPORTS), \
    "two sports share a roster layout; detection would be ambiguous"


def analyse(spec, ids, pool, opp):
    """Convenience: ids -> (structure, violations)."""
    players = [pool[i] for i in ids]
    st = spec["structure"](spec, players, opp)
    return st, spec["violations"](spec, st)


# ---------------------------------------------------------------- self-test

FIXTURES = [
    "/root/.claude/uploads/00b0b19f-2cd3-55fc-8a03-b5aeb308103a/de05dd84-mlbdkmain20260903.csv",
    "/root/.claude/uploads/00b0b19f-2cd3-55fc-8a03-b5aeb308103a/69bc4ef0-mlbdkmain20260903_3.csv",
    "/root/.claude/uploads/00b0b19f-2cd3-55fc-8a03-b5aeb308103a/9c91410c-mlbdkearly20260903_2.csv",
    "/root/.claude/uploads/00b0b19f-2cd3-55fc-8a03-b5aeb308103a/22be3f5f-nfldkpreseason20260814_4.csv",
]


def _mlb_oracle(pool, opp, ids):
    """The original prebuild_audit.py logic, reimplemented as a reference.

    Positional (first two ids are the pitchers) rather than role-based, so a
    match proves the abstraction did not move any MLB number.
    """
    pits, bats = ids[:2], ids[2:]
    counts = Counter(pool[i]["team"] for i in bats)
    sizes = sorted(counts.values(), reverse=True)
    bat_teams = {pool[i]["team"] for i in bats}
    return (min(sizes[0], 5),
            sizes[1] if len(sizes) > 1 else 0,
            len(counts),
            any(opp.get(pool[q]["team"]) in bat_teams for q in pits))


def _synthetic_nfl():
    """Hand-built NFL slate: two games, known correlation structure."""
    def pl(name, pos, team, game, sal=5000):
        return {"name": name, "pos": pos, "rpos": pos, "sal": sal,
                "game": game, "team": team, "proj": 0.0, "own": 0.0}

    # five games, so a DST can be rostered with its opponent absent and the
    # game-count flag can be pushed over the line
    games = {"BUF": "BUF@KC", "KC": "BUF@KC", "CIN": "CIN@NYG", "NYG": "CIN@NYG",
             "SEA": "SEA@LAR", "LAR": "SEA@LAR", "DEN": "DEN@LV", "LV": "DEN@LV",
             "MIA": "MIA@NYJ", "NYJ": "MIA@NYJ"}
    roster = [
        ("qb_a", "Allen", "QB", "BUF"), ("wr_a1", "Shakir", "WR", "BUF"),
        ("wr_a2", "Coleman", "WR", "BUF"), ("te_a", "Kincaid", "TE", "BUF"),
        ("rb_a", "Cook", "RB", "BUF"), ("dst_a", "Bills", "DST", "BUF"),
        ("qb_b", "Mahomes", "QB", "KC"), ("wr_b1", "Worthy", "WR", "KC"),
        ("te_b", "Kelce", "TE", "KC"), ("rb_b", "Pacheco", "RB", "KC"),
        ("dst_b", "Chiefs", "DST", "KC"),
        ("qb_c", "Burrow", "QB", "CIN"), ("wr_c1", "Chase", "WR", "CIN"),
        ("wr_c2", "Higgins", "WR", "CIN"), ("rb_c", "Brown", "RB", "CIN"),
        ("dst_c", "Bengals", "DST", "CIN"),
        ("wr_d1", "Nabers", "WR", "NYG"), ("rb_d", "Tracy", "RB", "NYG"),
        ("te_d", "Johnson", "TE", "NYG"), ("dst_d", "Giants", "DST", "NYG"),
        ("dst_e", "Seahawks", "DST", "SEA"), ("wr_e1", "Smith-Njigba", "WR", "SEA"),
        ("wr_f1", "Nacua", "WR", "LAR"),
        ("wr_g1", "Sutton", "WR", "DEN"), ("rb_g", "White", "RB", "LV"),
        ("wr_h1", "Waddle", "WR", "MIA"), ("rb_h", "Hall", "RB", "NYJ"),
    ]
    pool = {pid: pl(name, pos, team, games[team]) for pid, name, pos, team in roster}
    return pool, opponents(pool)


def _check(label, got, want):
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'} {label}" + ("" if ok else f"  got {got!r} want {want!r}"))
    return ok


def selftest(paths):
    ok = True

    print("detection")
    for path in paths:
        if not os.path.exists(path):
            print(f"  skip {os.path.basename(path)} (missing)")
            continue
        rows = list(csv.reader(open(path, encoding="utf-8")))
        spec = detect_sport(rows)
        expect = "NFL_CLASSIC" if "nfl" in os.path.basename(path).lower() else "MLB_CLASSIC"
        ok &= _check(f"{os.path.basename(path)} -> {spec['key']}", spec["key"], expect)

    print("detection failure modes")
    for label, rows in [
        ("empty file", []),
        ("no Entry ID row", [["a", "b"]]),
        ("no slots", [["Entry ID", "Contest Name", "Contest ID", "Entry Fee", "", "Instructions"]]),
        ("unknown layout", [["Entry ID", "C", "C", "C", "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"]]),
        ("truncated MLB", [["Entry ID", "C", "C", "C", "P", "P", "C", "1B"]]),
    ]:
        try:
            detect_sport(rows)
            ok &= _check(f"{label} raises", False, True)
        except SportDetectionError:
            ok &= _check(f"{label} raises", True, True)

    print("MLB structure vs original audit logic")
    for path in paths:
        if not os.path.exists(path) or "mlb" not in os.path.basename(path).lower():
            continue
        spec, pool, lineups, opp = load(path)
        if not lineups:
            print(f"  skip {os.path.basename(path)} (no lineups)")
            continue
        mism = 0
        for lu in lineups:
            st, _ = analyse(spec, lu["ids"], pool, opp)
            want = _mlb_oracle(pool, opp, lu["ids"])
            got = (st["bucket"], st["secondary"], st["teams"], bool(st["conflicts"]))
            mism += got != want
        ok &= _check(f"{os.path.basename(path)}: {len(lineups)} lineups match oracle", mism, 0)

    print("NFL structure on the real preseason export")
    for path in paths:
        if not os.path.exists(path) or "nfl" not in os.path.basename(path).lower():
            continue
        spec, pool, lineups, opp = load(path)
        ok &= _check("parsed lineups", len(lineups) > 0, True)
        ok &= _check("slot count", len(spec["slots"]), 9)
        bad = [lu for lu in lineups
               if len({pool[i]["pos"] for i in lu["ids"]} - set(NFL_OFFENSE) - {"DST"})]
        ok &= _check("every rostered player has a known position", len(bad), 0)
        ok &= _check("one QB per lineup",
                     {sum(1 for i in lu["ids"] if pool[i]["pos"] == "QB") for lu in lineups}, {1})
        ok &= _check("one DST per lineup",
                     {sum(1 for i in lu["ids"] if pool[i]["pos"] == "DST") for lu in lineups}, {1})
        agg = Counter()
        for lu in lineups:
            st, vs = analyse(spec, lu["ids"], pool, opp)
            agg["stack" + str(st["stack"])] += 1
            agg["back" + str(st["back"])] += 1
            agg["games" + str(st["games"])] += 1
            for sev, code, _ in vs:
                agg[sev + ":" + code] += 1
        ok &= _check("structure computed for every lineup",
                     sum(v for k, v in agg.items() if k.startswith("stack")), len(lineups))
        print(f"    {os.path.basename(path)}: {len(lineups)} lineups {dict(sorted(agg.items()))}")

    print("NFL correlation rules on the synthetic slate")
    pool, opp = _synthetic_nfl()
    spec = SPORTS["NFL_CLASSIC"]
    ok &= _check("opponent map", (opp["BUF"], opp["KC"], opp["CIN"]), ("KC", "BUF", "NYG"))

    cases = [
        # (label, ids, expected structure subset, expected violation codes)
        # dst_e is SEA; LAR is never rostered, so the DST rule stays quiet
        ("QB + 3 pass catchers + run-back",
         ["qb_a", "rb_c", "rb_d", "wr_a1", "wr_a2", "wr_b1", "te_a", "rb_b", "dst_e"],
         {"stack": 3, "back": 2, "games": 3, "same_rb": 0}, set()),
        ("naked QB",
         ["qb_a", "rb_c", "rb_d", "wr_c1", "wr_c2", "wr_d1", "te_d", "rb_b", "dst_e"],
         {"stack": 0, "back": 1}, {"NAKED"}),
        ("no run-back",
         ["qb_a", "rb_c", "rb_d", "wr_a1", "wr_a2", "wr_c1", "te_a", "wr_d1", "dst_e"],
         {"stack": 3, "back": 0}, {"NOBACK"}),
        ("DST against own bring-back",
         ["qb_a", "rb_c", "rb_d", "wr_a1", "wr_a2", "wr_b1", "te_a", "te_b", "dst_a"],
         {"stack": 3, "back": 2, "games": 2}, {"DSTvOWN"}),
        ("QB with own RB",
         ["qb_a", "rb_a", "rb_c", "wr_a1", "wr_a2", "wr_b1", "te_a", "rb_d", "dst_e"],
         {"stack": 3, "back": 1, "same_rb": 1}, {"QBRB"}),
        ("four games is still fine",
         ["qb_a", "wr_a1", "te_a", "wr_b1", "rb_b", "rb_c", "rb_d", "wr_g1", "dst_e"],
         {"stack": 2, "back": 2, "games": 4}, set()),
        ("five games is too scattered",
         ["qb_a", "wr_a1", "te_a", "wr_b1", "rb_c", "rb_d", "wr_g1", "wr_h1", "dst_e"],
         {"stack": 2, "back": 1, "games": 5}, {"SPREAD"}),
    ]
    for label, ids, want_st, want_codes in cases:
        st, vs = analyse(spec, ids, pool, opp)
        ok &= _check(f"{label}: structure",
                     {k: st[k] for k in want_st}, want_st)
        ok &= _check(f"{label}: flags", {c for _, c, _ in vs}, want_codes)

    # DST against own offense must be hard, QB-RB must not be
    st, vs = analyse(spec, ["qb_a", "rb_a", "rb_c", "wr_a1", "wr_a2", "wr_b1",
                            "te_a", "te_b", "dst_a"], pool, opp)
    sev = {c: s for s, c, _ in vs}
    ok &= _check("DSTvOWN is hard", sev.get("DSTvOWN"), "hard")
    ok &= _check("QBRB is soft", sev.get("QBRB"), "soft")

    print("NFL showdown")
    sd = SPORTS["NFL_SHOWDOWN"]
    ok &= _check("layout detected",
                 detect_sport([["Entry ID", "Contest Name", "Contest ID", "Entry Fee",
                                "CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX", "",
                                "Instructions"]])["key"], "NFL_SHOWDOWN")
    st, vs = analyse(sd, ["qb_a", "wr_a1", "te_a", "wr_b1", "te_b", "rb_b"], pool, opp)
    ok &= _check("showdown stack/back", (st["stack"], st["back"], st["games"]), (2, 3, 1))
    ok &= _check("showdown QB-less build is legal",
                 {c for _, c, _ in analyse(sd, ["wr_a1", "te_a", "rb_a", "wr_b1",
                                                "te_b", "rb_b"], pool, opp)[1]}, set())
    ok &= _check("showdown naked QB is soft not hard",
                 [s for s, c, _ in analyse(sd, ["qb_a", "wr_b1", "te_b", "rb_b",
                                                "wr_c1", "rb_c"], pool, opp)[1] if c == "NAKED"],
                 ["soft"])
    dup = analyse(sd, ["qb_a", "wr_a1", "wr_a1", "wr_b1", "te_b", "rb_b"], pool, opp)[1]
    ok &= _check("showdown duplicate player", "DUPE" in {c for _, c, _ in dup}, True)

    print("MLB rules on the synthetic path (role-based, no pitcher in teams count)")
    mlb = SPORTS["MLB_CLASSIC"]
    ok &= _check("MLB core is bats only", mlb["core"], ("BAT",))
    ok &= _check("MLB cap/floor", (mlb["cap"], mlb["floor"]), (50000, 49500))
    ok &= _check("MLB slot count", len(mlb["slots"]), 10)

    print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(selftest(sys.argv[1:] or FIXTURES))
