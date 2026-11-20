# About the drills

Hands-on tasks for the CKAD curriculum, grouped into seven chapters and a
two-hour mock exam. The app shows them one at a time; you can also read the
files here directly.

## Format

Each drill has:

- a heading with its number, title and time budget
- the task, sometimes with a setup block that creates a starting state
- a solution, with imperative commands first and YAML only where `kubectl
  create` can't do it
- a **Verify** block with the expected output in comments

Hints are in `../hints/`, explanations in `../explanations/`, and the mapping
to the official curriculum in `../curriculum/map.json`.

## Conventions

- `k` is `kubectl`, `$do` is `--dry-run=client -o yaml`, and `$now` is
  `--force --grace-period 0`. See `../cheatsheet.md`.
- Commands are written for bash with GNU tools, like the exam terminal. On a
  Mac, use the practice shell (`../ckad-env.sh`).
- Files a drill asks you to write go under `/opt/course/...`.
- Every drill uses its own namespace, so you can do them in any order unless
  a drill says it continues an earlier one. Clean up with `k delete ns <ns>`.
- Each file starts with a note on running the chapter on minikube.
  `../minikube.md` has the details.

## Files

| File | Topic | Drills |
|---|---|---|
| drills-ch02.md | Kubernetes Architecture | 11 |
| drills-ch03.md | Build | 10 |
| drills-ch04.md | Design | 12 |
| drills-ch05.md | Deployment Configuration | 12 |
| drills-ch06.md | Understanding Security | 12 |
| drills-ch07.md | Exposing Applications | 13 |
| drills-ch08.md | Application Troubleshooting | 11 |
| mock-exam.md, mock-exam-solutions.md | All domains, 2 hours | 16 tasks |

## How they were tested

Every drill and mock task was run on minikube with Kubernetes v1.37.0 (two
nodes, containerd, Calico, Helm 4). The README in the repository root says
what the run covered and what it could not.
