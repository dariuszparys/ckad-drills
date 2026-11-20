#!/usr/bin/env python3
"""Check the documentation links in curriculum/ and explanations/.

Every link must
  * point to a site the CKAD exam allows (kubernetes.io/docs, kubernetes.io/blog,
    helm.sh/docs),
  * answer with HTTP 200 after redirects, and
  * if it has a #fragment, name an id that exists in the page.

Usage:  python3 tools/check_links.py [file ...]      (default: all sources)
Exit code 1 if any link fails. Needs internet access.
"""
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urldefrag

ROOT = Path(__file__).resolve().parent.parent
ALLOWED = ("https://kubernetes.io/docs/", "https://kubernetes.io/blog/", "https://helm.sh/docs/")
# The exam overview cites where its facts come from. Those pages are sources,
# not exam reading, so they are accepted in that one file only.
SOURCES_FILE = "00-exam.md"
SOURCE_SITES = ("https://docs.linuxfoundation.org/", "https://training.linuxfoundation.org/",
                "https://github.com/cncf/curriculum")
LINK = re.compile(r"\]\((https?://[^)\s]+)\)|<(https?://[^>\s]+)>|(?<![(<\w])(https?://[^\s)>`]+)")


def sources(args):
    if args:
        return [Path(a).resolve() for a in args]
    return sorted((ROOT / "curriculum").glob("*.md")) + sorted((ROOT / "explanations").glob("*.md"))


def fetch(page):
    req = urllib.request.Request(page, headers={"User-Agent": "link-check"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001 - report every failure the same way
        return getattr(e, "code", 0), page, str(e)


def main():
    uses = {}  # url -> [(file, line)]
    for f in sources(sys.argv[1:]):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            for m in LINK.finditer(line):
                url = next(g for g in m.groups() if g).rstrip(".,;:")
                uses.setdefault(url, []).append((f.relative_to(ROOT), n))
    problems = []
    def allowed(url):
        return url.startswith(ALLOWED) or url.rstrip("/") + "/" in ALLOWED

    sources_only = set()
    for url, where in uses.items():
        if allowed(url):
            continue
        if url.startswith(SOURCE_SITES) and all(f.name == SOURCES_FILE for f, _ in where):
            sources_only.add(url)
        else:
            problems.append((url, "not on an exam-allowed site"))
    rejected = {u for u, _ in problems}
    pages = sorted({urldefrag(u)[0] for u in uses if u not in rejected})
    with ThreadPoolExecutor(8) as pool:
        fetched = dict(zip(pages, pool.map(fetch, pages)))
    for url in uses:
        page, frag = urldefrag(url)
        if page not in fetched:
            continue
        status, final, body = fetched[page]
        if status != 200:
            problems.append((url, f"HTTP {status or 'error'}: {body[:80] if not status else ''}".strip()))
        elif url not in sources_only and not final.startswith(ALLOWED):
            problems.append((url, f"redirects off the allowed sites to {final}"))
        elif frag:
            frag = unquote(frag)
            # kubernetes.io serves minified HTML with unquoted attributes (id=foo).
            if not re.search(r'(?:id|name)=["\']?%s(?=["\'\s>])' % re.escape(frag), body):
                problems.append((url, f"no element with id '{frag}' on the page"))
    for url, why in problems:
        where = ", ".join(f"{f}:{n}" for f, n in uses[url][:3])
        print(f"FAIL {url}\n     {why}\n     used in {where}")
    print(f"{len(uses)} distinct links in {len(sources(sys.argv[1:]))} files, {len(problems)} failing")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
