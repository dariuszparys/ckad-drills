# The CKAD exam

Facts on this page were read from the Linux Foundation's own pages on
2026-11-20 (listed under Sources). They change, so read those pages again in
the week before your exam. Where the official pages say nothing, this page
says "not stated" and doesn't guess.

## Format

| | |
|---|---|
| Length | 2 hours |
| Tasks | 15 to 20 performance-based tasks, solved on the command line |
| Pass mark | 66% |
| Kubernetes version | v1.37 |
| Where | A remote Linux desktop, shown inside the PSI Secure Browser on your computer |
| Screens | One active monitor; dual monitors are not supported |

## What the exam is about

The curriculum has five domains. The percentage is the domain's share of the
score. Each domain has its own page here with an explanation of every
competency and the drills that practise it.

| Domain | Weight |
|---|---|
| [Application Design and Build](#/cur/design-build) | 20% |
| [Application Deployment](#/cur/deployment) | 20% |
| [Application Observability and Maintenance](#/cur/observability) | 15% |
| [Application Environment, Configuration and Security](#/cur/config-security) | 25% |
| [Services and Networking](#/cur/networking) | 20% |

[Foundations and extras](#/cur/extras) covers two topics that are not bullets
in the official curriculum: kubectl fluency, which every task needs, and the
Gateway API, which the drills include.

## How a task works

- Every task must be solved on a designated host. An infobox at the start of
  the task gives the `ssh` command. Connect, do the work, then `exit`.
- Nested ssh is not supported. Return to the base host before the next task.
- `sudo -i` is available on the hosts.
- The base host you start on has none of the tools below preinstalled.

## What is preinstalled on the task hosts

- `kubectl`, with the alias `k` and Bash autocompletion
- `yq` for YAML processing
- `curl` and `wget`
- `man` and the man pages

Not stated on the official pages: whether `helm`, `vim`, `jq` or `tmux` are
there. You may install distribution packages if something is missing. The
remote desktop also offers a terminal emulator, the Firefox browser and
VSCodium (installing extensions is prohibited).

What you set up yourself, from memory, is short. See the
[cheatsheet](../cheatsheet.md), "First 60 seconds".

## What you may read during the exam

Through the Firefox browser inside the remote desktop:

- Kubernetes documentation: `https://kubernetes.io/docs`
- Kubernetes blog: `https://kubernetes.io/blog/`
- Helm documentation: `https://helm.sh/docs`

Also allowed:

- The **Quick Reference** box of each task, which links to the documentation
  that task may need.
- The search box on kubernetes.io. You must not open search results that lead
  to other sites.
- Translations of the Kubernetes docs. English is the most up to date.
- The exam instructions, documents under `/usr/share`, and man pages.

Not allowed in the CKAD: the Gateway API site (`gateway-api.sigs.k8s.io`). It
is listed for the CKA only. Docker's and Podman's own documentation are not on
the list either, so know the Dockerfile instructions by heart.

### Bookmarks

The official pages don't mention bookmarks. The browser runs inside the remote
desktop, not on your computer, so your own bookmarks aren't there. Plan on two
ways to reach a page: the task's Quick Reference links, and the search box on
kubernetes.io. Every explanation in this app gives a search term for that
reason. Practise finding these pages by search:

- [kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/): the one page worth knowing best. Search: `kubectl quick reference`
- [Tasks](https://kubernetes.io/docs/tasks/): step-by-step pages with YAML you can copy. Search by what you need to do, such as `configure liveness probe`.
- [Concepts](https://kubernetes.io/docs/concepts/): explanations with complete example manifests.
- [Kubernetes API reference](https://kubernetes.io/docs/reference/kubernetes-api/): every field of every object. In the terminal, `kubectl explain` is faster.
- [Helm commands](https://helm.sh/docs/helm/): one page per `helm` subcommand.

## Copy and paste

| Where | Copy | Paste |
|---|---|---|
| Terminal | Ctrl+Shift+C | Ctrl+Shift+V |
| Other apps in the remote desktop | Ctrl+C | Ctrl+V |

The right-click menu works too. Copy names, paths and image tags from the task
text. Don't retype them.

## Before exam day

- An exam simulator is included with most registrations: two attempts, each
  with 36 hours of access. It is not included in the "SINGLE" registrations.
- Practise in bash, not zsh. The exam terminal is bash on Linux. See the
  practice shell in the [README](../README.md).

## How to use this app with the curriculum

1. Read a domain page. It explains each competency before you touch a drill.
2. Do that competency's drills, listed under each section.
3. After each drill, open its explanation. It says why the solution is what it
   is and where the docs cover it.
4. Finish with the mock exam under exam conditions.

To read everything without practising, switch the app to **Read** mode with
the button at the top of the sidebar. It shows hints, solutions and
explanations at once and leaves your progress untouched.

## Sources

- Linux Foundation, "Important Instructions: CKA and CKAD": <https://docs.linuxfoundation.org/tc-docs/certification/tips-cka-and-ckad>
- Linux Foundation, "Resources Allowed": <https://docs.linuxfoundation.org/tc-docs/certification/certification-resources-allowed>
- Linux Foundation, "Frequently Asked Questions: CKA and CKAD": <https://docs.linuxfoundation.org/tc-docs/certification/faq-cka-ckad>
- Linux Foundation, "Exam User Interface": <https://docs.linuxfoundation.org/tc-docs/certification/lf-handbook2/exam-user-interface>
- CNCF curriculum, `CKAD_Curriculum_v1.37.pdf`: <https://github.com/cncf/curriculum>
- Linux Foundation CKAD page, "Domains & Competencies": <https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/>
