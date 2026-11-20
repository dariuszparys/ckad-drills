# Content guide: explanations and curriculum pages

Rules for the prose in `explanations/` and `curriculum/`. The build
(`tools/build.py`) and the link checker (`tools/check_links.py`) enforce the
parts they can.

## Ground rules

1. **The drill text is the source of truth.** The files in `drills/` were run
   on Kubernetes v1.37 (minikube, containerd, Calico, Helm 4). Explain what
   they do; never contradict them. If memory disagrees with a drill, the drill
   wins.
2. **Explain why, don't repeat how.** The reader has the solution next to the
   explanation. Say why each choice was made, what would go wrong otherwise,
   and what to remember.
3. **Link only to sites the exam allows:** `https://kubernetes.io/docs/...`,
   `https://kubernetes.io/blog/...` and `https://helm.sh/docs/...`. Nothing
   else, not even other official sites. The Gateway API site
   (`gateway-api.sigs.k8s.io`) is not allowed in the CKAD, and neither is the
   Dockerfile reference. Where no allowed page exists, say so in words.
4. **Don't write URLs from memory without checking.** Run
   `python3 tools/check_links.py <your file>` and fix every failure. It checks
   the site, HTTP 200, and that a `#anchor` exists on the page. Drop the
   anchor if you can't find a real one.
5. **No exam logistics.** Duration, pass mark, tools and rules live in
   `curriculum/00-exam.md` only.
6. **Target Kubernetes v1.37.** Facts the live run confirmed, which older
   material gets wrong:
   - `kubectl describe` with `-l` hides events for several pods unless you add
     `--show-events=true`.
   - `kubectl logs --previous` only works while the pod shows
     `CrashLoopBackOff`; while it shows `Error`, plain `logs` has the output.
   - busybox `nslookup` ignores search domains for names that contain a dot;
     use the full `<svc>.<ns>.svc.cluster.local`.
   - EndpointSlices list not-ready pods too (`conditions.ready: false`);
     `kubectl describe svc` shows only ready endpoints. `v1 Endpoints` is
     deprecated since v1.33 and prints a warning.
   - Env var names may be any printable ASCII except `=` since v1.34, so
     `envFrom` imports keys like `app.properties`.
   - Native sidecars (init container with `restartPolicy: Always`) are stable
     since v1.33.
   - Helm 4 removed `helm list -a`; `helm list -A` shows every state.
   - ingress-nginx uses an Ingress's `spec.defaultBackend` only for that
     Ingress's own hosts. The project was retired upstream in March 2026.
   - kubectl generators write container fields alphabetically (`- image:`
     first, `name:` on the next line).
   - A container whose PID 1 ignores SIGTERM (`sleep`, a plain `python`
     script) takes the full 30 s grace period to terminate.

## Formatting

- Markdown, rendered by the app's own small renderer: paragraphs, `-` lists,
  numbered lists, tables, fenced code blocks, `**bold**`, `` `code` ``, links.
  No HTML, no images, no nested blockquotes.
- Put any command or snippet longer than about 45 characters in a fenced
  block (```` ```bash ```` or ```` ```yaml ````), not inline.
- Use the drills' conventions in commands: `k` for kubectl and
  `$do` for `--dry-run=client -o yaml`.
- Plain, direct sentences. No filler, no "simply", no exclamation marks.
- Don't refer to drills by number in curriculum pages; the app lists each
  competency's drills automatically from `curriculum/map.json`.

## Explanation (`explanations/<drill file>.md`)

One section per drill or mock task, in the same order as the drill file. The
heading is the id only: `## 2.1`, `## mock-7`. 120 to 220 words each.

```markdown
## 4.2

**What this trains:** One or two sentences: the concept and when you need it.

**Why the solution looks like this:**
- A reason per bullet, 2 to 5 bullets. Why this field, flag or order; what
  breaks without it; what the output proves.

**On the exam:** One or two sentences: the fastest route and what to
double-check before moving on.

**Docs:**
- [Page title](https://kubernetes.io/docs/...): what you find there. Search: `term to type into the kubernetes.io search box`
```

One to three docs links per explanation. The "Search:" term matters: there are
no bookmarks in the exam browser, so the reader finds pages by searching.

## Curriculum page (`curriculum/NN-<domain>.md`)

One file per exam domain. The `# ` title and the `## ` headings must match
`curriculum/map.json` exactly (the build checks the `## ` headings).

```markdown
# Application Design and Build (20%)

Two or three sentences: what the domain covers and what its tasks look like.

## Define, build and modify container images

Three to six short paragraphs or lists explaining the concepts in plain words,
for someone who reads this before touching the drills.

### What you must be able to do
- Concrete skills, as verbs.

### Commands and YAML to know
Fenced blocks with the minimal commands and a commented YAML skeleton.

### Traps
- The mistakes that cost points, each with the fix.

### Docs
- [Page title](https://kubernetes.io/docs/...): what you find there. Search: `term`
```

300 to 500 words per competency.
