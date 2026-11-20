# CKAD drills

Interactive practice for the Certified Kubernetes Application Developer (CKAD)
exam: 81 hands-on drills, a two-hour mock exam, and a read-through curriculum,
all tested on Kubernetes v1.37. The page shows only the task at first. You
reveal help step by step: hint 1, then hint 2, then the full solution, then an
explanation of why it works.

This is an independent study project. It is not affiliated with, endorsed by
or sponsored by the Linux Foundation or the CNCF, and it contains no questions
from the real exam. See the Disclaimer section at the end.

## Getting started

### Once

1. Install the tools. Homebrew's bash gives you kubectl tab completion, and
   `gnu-sed` makes `sed -i` behave as it does on the exam's Linux:

   ```bash
   brew install minikube kubectl helm bash bash-completion@2 gnu-sed
   ```

2. Create the practice cluster the drills expect: profile `ckad`, 2 nodes,
   Calico for NetworkPolicies.

   ```bash
   minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad
   ```

   ```bash
   minikube addons enable metrics-server
   ```

3. Create the folder the drills write their answer files to. This asks for
   your password:

   ```bash
   sudo mkdir -p /opt/course && sudo chown $USER /opt/course
   ```

### Each practice session

1. Start the cluster if it's stopped:

   ```bash
   minikube start -p ckad
   ```

2. Open the drills in your browser:

   ```bash
   open index.html
   ```

3. In a terminal, open the practice shell from this folder (see below):

   ```bash
   "$(brew --prefix)/bin/bash" --rcfile ckad-env.sh
   ```

4. When you're done, type `exit` to leave the shell and stop the cluster:

   ```bash
   minikube stop -p ckad
   ```

If your browser blocks the page from a local file, serve the folder with
`python3 -m http.server 8765` and open http://localhost:8765.

## Practice shell

The exam terminal runs bash on Linux, and the drills are written for it. On
your Mac, the default zsh treats `$do` as one word, so kubectl rejects it. macOS
`sed -i` also needs an extra argument. [ckad-env.sh](ckad-env.sh) gives you a
bash shell that behaves like the exam terminal:

- `k`, `$do` and `$now`, as you'd set them up in the exam's first minute
- `sed` runs GNU `gsed`
- vim indentation from the cheatsheet
- kubectl completion for `k` (needs Homebrew's bash; macOS's own bash 3.2
  starts the shell without it)

You can't bring this file to the exam. Type the `export do=...` line from
memory there, as the [cheatsheet](cheatsheet.md) explains.

## How a drill works

1. Read the task and start the timer. It counts down from the drill's time
   budget and turns red when you run over.
2. Solve it in your cluster (minikube; see the **Chapter setup** box and
   [minikube.md](minikube.md)).
3. Stuck? Click **Show hint 1**. Hint 2 only appears after hint 1.
4. Still stuck? Click **Show solution**.
5. Click **Show verify commands** to check your work. You can open these at any
   time without seeing the solution.
6. Click **Mark as solved**. The sidebar shows ✓ in green if you solved it
   without help and in amber if you used hints or the solution.
7. Open **Show explanation: why it works**. It unlocks once you've solved the
   drill or opened the solution. It says why the solution is what it is, what
   to remember for the exam, and where the allowed docs cover it, with a
   search term for each page.

## Curriculum and Read mode

The **Curriculum** section at the top of the sidebar follows the official CKAD
curriculum (v1.37):

- **The CKAD exam** covers the format, the tools on the exam hosts, and what
  you may read during the exam.
- One page per exam domain explains every competency in plain words and lists
  the drills that practise it. Each drill links back to its competencies.
- Every documentation link points to a site the exam allows
  (kubernetes.io/docs, kubernetes.io/blog, helm.sh/docs).

How this text was checked: the drills themselves were run on a cluster (see
"How the drills were tested"). The curriculum pages and explanations were
written from those drills and checked differently:

- Every link was fetched and its anchor confirmed (`tools/check_links.py`).
- Every kubectl and helm command in them was checked against the kubectl
  v1.37 and Helm 4 clients for valid subcommands and flags, and every YAML
  block for syntax.
- The explanations for the drills that the cluster run changed were read in
  full; the rest were sampled.

- Every YAML example in the curriculum pages was validated on the cluster
  with a strict server-side dry run (Kubernetes v1.37.0). Complete manifests
  were applied as written. Excerpts were wrapped in the minimal surrounding
  object first. The CronTab and Gateway API examples were checked with their
  CRDs installed, and the Kustomize example was rendered with
  `kubectl kustomize`.

A dry run confirms that the API server accepts each object; it doesn't run
the pods. The suggested search terms were not tried in the kubernetes.io
search box.

To read through everything without practising, click the **Practice** button at
the top of the sidebar to switch to **Read** mode. It shows every hint,
solution and explanation at once and doesn't record anything, so your progress
stays as it is.

The **Mock exam** section has one 120-minute clock for all 16 tasks and a
**Score this task** checklist per task. The total score appears on the mock
exam overview, and you need 66 of 100 points to pass.

Keyboard: `n` next drill, `p` previous drill, `h` next hint, `t` start or pause
the timer.

The button at the top of the sidebar switches the colour theme: **Auto**
follows your operating system, or pick **Light** or **Dark**. The choice is
remembered, and **Reset all progress** leaves it alone.

Progress is stored in the browser's `localStorage`. Each browser and each way
of opening the page (`file://` or `localhost`) keeps its own progress.

To start over:

- **Reset drill** (next to **Mark as solved**) hides the hints and solution
  again and clears the solved mark for that drill.
- **Reset this chapter** on a chapter page clears every drill in it. On the
  mock exam page it also clears the scores and the exam clock.
- **Reset all progress** at the bottom of the sidebar and on the start page
  clears everything.

## Layout

| Path | What it is |
|---|---|
| `drills/` | The drill markdown: task, solution and verify commands |
| `hints/` | Two hints per drill, one JSON file per drill file |
| `explanations/` | Why each solution works, one `## <id>` section per drill |
| `curriculum/` | `map.json` (exam domains, competencies, and which drills practise them), `00-exam.md`, and one page per domain |
| `CONTENT-GUIDE.md` | Rules and templates for explanations and curriculum pages |
| `tools/build.py` | Combines all of the above into `app/data.js` and checks nothing is missing |
| `tools/check_links.py` | Checks that every docs link is on an exam-allowed site, loads, and has a real anchor |
| `app/` | The page: `app.js`, `style.css` and the generated `data.js` |
| `ckad-env.sh` | Bash practice shell with the exam aliases and GNU sed |
| `cheatsheet.md`, `minikube.md` | Reference docs the drills link to. They are embedded in `app/data.js` and open rendered inside the page |

## How the drills were tested

All 97 drills and mock tasks were run on minikube (profile `ckad`, Kubernetes
v1.37.0, 2 nodes, Calico, Helm 4) on 2026-11-20. Each run checked that the
broken starting state really fails, that the solution works as written, and
that the Verify output matches its comments. The run led to fixes that reading
alone had missed, for example:

- describe with `-l` needs `--show-events=true` (8.2, 8.11).
- busybox `nslookup` needs full names (7.4, 8.10).
- Helm 4 has no `helm list -a`.
- ingress-nginx ignores an Ingress's default backend for other hosts, so
  7.8 now adds a separate catch-all Ingress.

The mock exam scored 100/100 against its own scoring sheet.

What the run could not cover:

- Steps that need a TTY (`-it`, `k edit`, vim) were run with their
  non-interactive equivalents.
- `/opt/course` was mapped to a scratch folder.
- Ingress checks went through a port-forward, because `minikube tunnel` asks
  for sudo on ports 80/443.

## Update the drills

1. Edit or add the drill in `drills/`. Keep the format described in
   [drills/README.md](drills/README.md); the build depends on it.
2. Add or update hints in `hints/<file>.json` for any new or changed drill.
3. Add or update its explanation in `explanations/<file>.md`, following
   [CONTENT-GUIDE.md](CONTENT-GUIDE.md), and map a new drill to its
   competencies in `curriculum/map.json`.
4. Check the documentation links (needs internet):

   ```bash
   python3 tools/check_links.py
   ```

5. Rebuild the data file:

   ```bash
   python3 tools/build.py
   ```

The build fails if a drill has no hints, no explanation or no competency, if a
curriculum page doesn't match `map.json`, or if the drill count of a file
changes. Update `EXPECTED` in `tools/build.py` when you add drills.

When the exam moves to a new Kubernetes version, re-read the pages listed under
Sources in `curriculum/00-exam.md` and update that file and `map.json`.

## How this project was made

The drills, hints, explanations and curriculum pages were written with the help
of an AI assistant (Claude) and then checked as described above: the drills by
running them on a cluster, the rest by link checks, command checks and reading.
Mistakes are still possible. If something disagrees with the Kubernetes
documentation or with your cluster, trust those and open an issue.

## Disclaimer

- This project is not affiliated with, endorsed by or sponsored by the Linux
  Foundation, the Cloud Native Computing Foundation (CNCF) or the Kubernetes
  project. "Kubernetes", "CKAD" and "Certified Kubernetes Application
  Developer" are trademarks of the Linux Foundation and are used here only to
  describe what the material is for.
- Nothing here comes from the real exam. The mock exam is an original set of
  tasks built from the public curriculum. Exam candidates agree not to share
  exam content; please don't contribute any.
- Exam facts in `curriculum/00-exam.md` were read from the official pages on
  the date shown there and will go out of date. Check the official pages
  before your exam.
- The material is provided as is, without warranty. Passing the exam is not
  guaranteed.

## Credits

- Competency titles are quoted from the official CKAD curriculum published by
  the CNCF at <https://github.com/cncf/curriculum>.
- The `CronTab` custom resource example follows the Kubernetes documentation,
  which is licensed under CC BY 4.0.
- Two drills install the [podinfo](https://github.com/stefanprodan/podinfo)
  Helm chart (Apache 2.0).

## License

- Code (`app/`, `tools/`, `index.html`, `ckad-env.sh`): MIT, see
  [LICENSE](LICENSE).
- Text (drills, hints, explanations, curriculum, cheatsheet and other
  documentation): Creative Commons Attribution 4.0 International, see
  [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
