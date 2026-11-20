#!/usr/bin/env python3
"""Build app/data.js from the drill, hint, explanation and curriculum sources.

  drills/*.md          split into task / solution / verify per drill
  hints/*.json         two hints per drill
  explanations/*.md    one "## <id>" section per drill: why the solution works
  curriculum/map.json  exam domains, competencies and the drill -> competency map
  curriculum/NN-*.md   one page per domain, one "## <competency>" section each

The build fails if any drill lacks hints, an explanation or a competency, or
if a curriculum page doesn't match map.json.

Run from anywhere:  python3 tools/build.py
Set CKAD_ALLOW_MISSING=1 to build while explanations or curriculum pages are
still being written (missing parts become warnings).
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRILLS = ROOT / "drills"
HINTS = ROOT / "hints"
EXPLANATIONS = ROOT / "explanations"
CURRICULUM = ROOT / "curriculum"
ALLOW_MISSING = os.environ.get("CKAD_ALLOW_MISSING") == "1"
OUT = ROOT / "app" / "data.js"
# Reference docs the drills point to. They are embedded so the page can show
# them rendered instead of sending the browser to a raw .md file.
DOCS = ["README.md", "cheatsheet.md", "minikube.md", "drills/README.md"]

CHAPTER_FILES = [f"drills-ch0{n}.md" for n in range(2, 9)]
EXPECTED = {"drills-ch02.md": 11, "drills-ch03.md": 10, "drills-ch04.md": 12,
            "drills-ch05.md": 12, "drills-ch06.md": 12, "drills-ch07.md": 13,
            "drills-ch08.md": 11, "mock-exam.md": 16}

DRILL_RE = re.compile(r"^### (\d+\.\d+) (.*?)(?: \(⏱ (\d+) min\))?\s*$")
TASK_RE = re.compile(r"^## Task (\d+) \((\d+) points?\):\s*(.*)$")
SOL_TASK_RE = re.compile(r"^## Task (\d+)\s*$")
SOURCE_RE = re.compile(r"^\*\*(Based on|Curriculum[^*]*?):?\*\*:?\s*(.*)$")
DETAILS_OPEN = "<details><summary>Solution</summary>"


def fail(msg):
    sys.exit(f"build failed: {msg}")


def missing(msg):
    """A gap in explanations/curriculum: fatal unless CKAD_ALLOW_MISSING=1."""
    if not ALLOW_MISSING:
        fail(msg)
    print(f"warning: {msg}", file=sys.stderr)


def fence_flags(lines):
    """For each line, True if it is inside (or opens/closes) a ``` code fence."""
    flags, inside = [], False
    for line in lines:
        if line.lstrip().startswith("```"):
            flags.append(True)
            inside = not inside
        else:
            flags.append(inside)
    return flags


def split_sections(lines, heading_re):
    """Split into (preamble, [(match, body_lines)]) on headings outside fences."""
    flags = fence_flags(lines)
    preamble, sections = [], []
    for line, fenced in zip(lines, flags):
        m = None if fenced else heading_re.match(line)
        if m:
            sections.append((m, []))
        elif sections:
            sections[-1][1].append(line)
        else:
            preamble.append(line)
    return preamble, sections


def clean(lines):
    """Join lines, dropping trailing --- separators and blank edges."""
    lines = list(lines)
    while lines and lines[-1].strip() in ("", "---"):
        lines.pop()
    while lines and not lines[0].strip():
        lines.pop(0)
    return "\n".join(lines)


def parse_chapter(name):
    lines = (DRILLS / name).read_text(encoding="utf-8").splitlines()
    preamble, sections = split_sections(lines, DRILL_RE)
    title = next((l[2:].strip() for l in preamble if l.startswith("# ")), name)
    title = re.sub(r":\s*drills$", "", title)
    intro = clean(l for l in preamble if not l.startswith("# "))
    drills = []
    for m, body in sections:
        did, dtitle, minutes = m.group(1), m.group(2), m.group(3)
        flags = fence_flags(body)
        try:
            start = next(i for i, (l, f) in enumerate(zip(body, flags))
                         if not f and l.strip() == DETAILS_OPEN)
            end = max(i for i, (l, f) in enumerate(zip(body, flags))
                      if not f and l.strip() == "</details>")
        except (StopIteration, ValueError):
            fail(f"{name} {did}: no <details> solution block")
        task = body[:start]
        source = ""
        for i, l in enumerate(task):
            sm = SOURCE_RE.match(l)
            if sm:
                source = f"{sm.group(1)}: {sm.group(2)}".strip()
                task = task[:i] + task[i + 1:]
                break
        inner, inner_flags = body[start + 1:end], flags[start + 1:end]
        vi = next((i for i, (l, f) in enumerate(zip(inner, inner_flags))
                   if not f and l.strip() == "**Verify**"), None)
        solution = inner if vi is None else inner[:vi]
        verify = [] if vi is None else inner[vi + 1:]
        drills.append({
            "id": did, "title": dtitle,
            "minutes": int(minutes) if minutes else None,
            "source": source, "task": clean(task),
            "solution": clean(solution), "verify": clean(verify),
        })
    return {"file": name, "title": title, "intro": intro, "drills": drills}


def parse_mock():
    lines = (DRILLS / "mock-exam.md").read_text(encoding="utf-8").splitlines()
    preamble, sections = split_sections(lines, TASK_RE)
    title = next((l[2:].strip() for l in preamble if l.startswith("# ")), "Mock exam")
    times = {}
    for l in preamble:
        tm = re.match(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*\d+\s*\|\s*(\d+) min", l)
        if tm:
            times[tm.group(1)] = (int(tm.group(3)), tm.group(2))
    intro = clean(l for l in preamble if not l.startswith("# "))

    sol_lines = (DRILLS / "mock-exam-solutions.md").read_text(encoding="utf-8").splitlines()
    sol_pre, sol_sections = split_sections(sol_lines, SOL_TASK_RE)
    scoring = {}
    for l in sol_pre:
        sm = re.match(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|", l)
        if sm:
            checks = []
            for part in sm.group(2).split("·"):
                cm = re.match(r"^(.*?)\s*\((\d+)\)\s*$", part.strip())
                if not cm:
                    fail(f"mock scoring row {sm.group(1)}: can't parse check {part!r}")
                checks.append({"text": cm.group(1), "points": int(cm.group(2))})
            scoring[sm.group(1)] = {"checks": checks, "max": int(sm.group(3))}
    solutions = {}
    for m, body in sol_sections:
        flags = fence_flags(body)
        sol, ver = [], []
        for l, f in zip(body, flags):
            (ver if not f and l.startswith("Verify") else sol).append(l)
        solutions[m.group(1)] = (clean(sol), clean(ver))

    drills = []
    for m, body in sections:
        n = m.group(1)
        if n not in solutions or n not in scoring:
            fail(f"mock task {n}: missing solution or scoring row")
        minutes, domain = times.get(n, (None, ""))
        sol, ver = solutions[n]
        drills.append({
            "id": f"mock-{n}", "title": m.group(3), "minutes": minutes,
            "points": int(m.group(2)), "source": domain,
            "task": clean(body), "solution": sol, "verify": ver,
            "scoring": scoring[n],
        })
    return {"file": "mock-exam.md", "title": title, "intro": intro,
            "drills": drills, "mock": True, "minutes": 120, "passMark": 66}


def parse_explanations(name, ids):
    """Return {id: markdown} from explanations/<name>, one '## <id>' section each."""
    path = EXPLANATIONS / name
    if not path.exists():
        missing(f"missing {path.relative_to(ROOT)}")
        return {}
    lines = path.read_text(encoding="utf-8").splitlines()
    _, sections = split_sections(lines, re.compile(r"^## (\S+)\s*$"))
    found = {m.group(1): clean(body) for m, body in sections}
    for i in ids:
        if not found.get(i, "").strip():
            missing(f"{path.relative_to(ROOT)}: no explanation for {i}")
    extra = [i for i in found if i not in ids]
    if extra:
        fail(f"{path.relative_to(ROOT)}: explanations for unknown ids {extra}")
    return found


def parse_curriculum(all_ids):
    """Read curriculum/map.json and the domain pages; return (curriculum, drill -> competencies)."""
    cmap = json.loads((CURRICULUM / "map.json").read_text(encoding="utf-8"))
    where = {}  # competency slug -> domain slug
    for dom in cmap["domains"]:
        for comp in dom["competencies"]:
            if comp["slug"] in where:
                fail(f"map.json: competency slug {comp['slug']} used twice")
            where[comp["slug"]] = dom["slug"]
            comp["drills"] = []
    drill_map = cmap["drills"]
    unmapped = [i for i in all_ids if not drill_map.get(i)]
    if unmapped:
        fail(f"map.json: no competency for drills {unmapped}")
    unknown = [i for i in drill_map if i not in all_ids]
    if unknown:
        fail(f"map.json: unknown drill ids {unknown}")
    by_slug = {c["slug"]: c for dom in cmap["domains"] for c in dom["competencies"]}
    for i in all_ids:  # keep drill order
        for slug in drill_map[i]:
            if slug not in by_slug:
                fail(f"map.json: drill {i} names unknown competency {slug}")
            by_slug[slug]["drills"].append(i)
    for slug, comp in by_slug.items():
        if not comp["drills"]:
            fail(f"map.json: competency {slug} has no drills")

    for dom in cmap["domains"]:
        path = CURRICULUM / dom["file"]
        dom["intro"] = ""
        for comp in dom["competencies"]:
            comp["body"] = ""
        if not path.exists():
            missing(f"missing {path.relative_to(ROOT)}")
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        preamble, sections = split_sections(lines, re.compile(r"^## (.+?)\s*$"))
        dom["intro"] = clean(l for l in preamble if not l.startswith("# "))
        titles = [m.group(1) for m, _ in sections]
        want = [c["title"] for c in dom["competencies"]]
        if titles != want:
            fail(f"{path.relative_to(ROOT)}: '## ' headings must be exactly {want}, found {titles}")
        for comp, (_, body) in zip(dom["competencies"], sections):
            comp["body"] = clean(body)
            if not comp["body"].strip():
                missing(f"{path.relative_to(ROOT)}: empty section '{comp['title']}'")
    exam = CURRICULUM / "00-exam.md"
    exam_lines = exam.read_text(encoding="utf-8").splitlines()
    curriculum = {
        "source": cmap["source"],
        "examTitle": next(l[2:].strip() for l in exam_lines if l.startswith("# ")),
        "exam": clean(l for l in exam_lines if not l.startswith("# ")),
        "domains": cmap["domains"],
    }
    return curriculum, {i: [{"slug": s, "domain": where[s]} for s in drill_map[i]] for i in all_ids}


def main():
    chapters = [parse_chapter(f) for f in CHAPTER_FILES] + [parse_mock()]
    total = 0
    for ch in chapters:
        want = EXPECTED[ch["file"]]
        if len(ch["drills"]) != want:
            fail(f"{ch['file']}: expected {want} drills, parsed {len(ch['drills'])}")
        hint_file = HINTS / ch["file"].replace(".md", ".json")
        if not hint_file.exists():
            fail(f"missing {hint_file.relative_to(ROOT)}")
        hints = json.loads(hint_file.read_text(encoding="utf-8"))
        for d in ch["drills"]:
            for key in ("task", "solution"):
                if not d[key].strip():
                    fail(f"{ch['file']} {d['id']}: empty {key}")
            h = hints.get(d["id"])
            if not h or not all(isinstance(x, str) and x.strip() for x in h):
                fail(f"{hint_file.name}: no hints for {d['id']}")
            d["hints"] = h
        explanations = parse_explanations(ch["file"], [d["id"] for d in ch["drills"]])
        for d in ch["drills"]:
            d["explanation"] = explanations.get(d["id"], "")
        extra = set(hints) - {d["id"] for d in ch["drills"]}
        if extra:
            fail(f"{hint_file.name}: hints for unknown ids {sorted(extra)}")
        total += len(ch["drills"])

    all_ids = [d["id"] for ch in chapters for d in ch["drills"]]
    curriculum, competencies = parse_curriculum(all_ids)
    for ch in chapters:
        for d in ch["drills"]:
            d["competencies"] = competencies[d["id"]]

    OUT.parent.mkdir(exist_ok=True)
    docs = {p: (ROOT / p).read_text(encoding="utf-8") for p in DOCS}
    payload = json.dumps({"chapters": chapters, "docs": docs, "curriculum": curriculum},
                         ensure_ascii=False, indent=1)
    # Keep "</script>" sequences from ever closing the tag early.
    payload = payload.replace("</", "<\\/")
    OUT.write_text("// Generated by tools/build.py. Do not edit.\n"
                   f"window.DRILL_DATA = {payload};\n", encoding="utf-8")
    comps = sum(len(dom["competencies"]) for dom in curriculum["domains"])
    print(f"wrote {OUT.relative_to(ROOT)}: {len(chapters)} sections, {total} drills, "
          f"{len(curriculum['domains'])} curriculum domains, {comps} competencies")


if __name__ == "__main__":
    main()
