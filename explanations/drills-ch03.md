## 3.1

**What this trains:** Writing a minimal Dockerfile for a given script and building a tagged image. The app is provided; you write four instructions.

**Why the solution looks like this:**
- `FROM` uses the fully qualified name from the task, so docker and podman pull from the same registry.
- `RUN mkdir -p /data` is there because the script appends to `/data/ticks.out`. Python creates the file but not the directory, and would crash at once. `COPY` creates `/app` itself.
- `CMD` in the JSON array form starts `python` directly, with no shell around it, so python is PID 1 in the container.
- The build context `.` must be the directory that holds both `Dockerfile` and `ticker.py`, because `COPY` reads from the context.
- The test run proves what a successful build doesn't: after 11 s the file has two or three lines.

**On the exam:** Podman takes the same syntax and often needs `sudo`. The Dockerfile reference is not on an exam-allowed site, so know `FROM`, `RUN`, `COPY` and `CMD` by heart, and run the image once before moving on.

**Docs:**
- [Images](https://kubernetes.io/docs/concepts/containers/images/#image-names): how registry, name and tag form an image name. Search: `images`
- [Define a Command and Arguments for a Container](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/): how the image's `CMD` relates to `command` and `args`. Search: `define command arguments container`

## 3.2

**What this trains:** Giving an image a second tag and exporting it to a tar file, the way an image travels when there is no registry.

**Why the solution looks like this:**
- A tag is another name for the same image. `tag` builds nothing, which the listing proves: `v1` and `v1.0.1` share one IMAGE ID.
- `save` writes the image to the file named with `-o`. Save it by name and tag, as the task states them, so the archive carries that name.
- `save` doesn't create missing directories, hence `mkdir -p` first.
- Podman uses the same two subcommands, often with `sudo`. Add `--format oci-archive` only when the task asks for an OCI archive in so many words.
- `ls -lh` and `tar tf` show that the file exists, has a size and is a readable archive, not an empty file left behind by a failed command.

**On the exam:** Copy the path and file name from the task exactly, then list the file. The docker and podman command references are not on an exam-allowed site; `docker save --help` or `podman save --help` in the terminal is the reference you have.

**Docs:**
- [Images](https://kubernetes.io/docs/concepts/containers/images/#image-names): how image names and tags are written. Search: `images`

## 3.3

**What this trains:** The full path from a local image to running pods: tag for a registry, push, check the registry, deploy from it.

**Why the solution looks like this:**
- The registry is part of the image name. Tagging `ticker:v1` as `$repo/ticker:v1` is what tells `push` where to send it.
- Podman expects HTTPS, so a plain-HTTP registry needs `--tls-verify=false`, and usually `sudo`.
- `/v2/_catalog` is the registry's own API and lists its repositories; `ticker` in the answer proves the push arrived.
- On macOS the AirPlay Receiver owns port 5000. `curl localhost:5000` from the Mac returns 403 although `docker push` works, so the catalog is queried from inside minikube.
- The Deployment uses the full `$repo/ticker:v1` name because the nodes pull from the registry; they can't see the image store of the machine that built it. The jsonpath check prints that name once per pod.

**On the exam:** Tag, push, deploy, then check that the pods are `Running` and not stuck pulling the image. The docker and podman references are not on an exam-allowed site, so use `--help`.

**Docs:**
- [Images](https://kubernetes.io/docs/concepts/containers/images/#image-names): registry host and port as part of the image name. Search: `images`
- [kubectl create deployment](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_deployment/): `--image` and `--replicas`. Search: `kubectl create deployment`

## 3.4

**What this trains:** A readiness probe with the exec handler, and what "not ready" means: the container runs but gets no traffic.

**Why the solution looks like this:**
- The generator accepts the container command after `--`, so only the probe block is written by hand.
- An exec probe passes when the command exits with 0. `cat /tmp/healthy` fails until the file exists, so the pods are `Running` but `0/1`.
- A failing readiness probe never restarts a container; the pod just receives no Service traffic.
- `periodSeconds: 5` is why the pods turn ready within about five seconds of the `touch`.
- Each pod has its own filesystem, so the loop runs `touch` in every pod. Do it in one and the Deployment stays at `1/2`, because its READY column counts pods that pass readiness.

**On the exam:** The probe goes inside the container entry, at the same level as `image`. Check both the pods and the Deployment's READY column.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-readiness-probes): probe YAML to copy. Search: `configure liveness readiness startup probes`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/#readiness-probe): what each probe type decides. Search: `readiness probe`

## 3.5

**What this trains:** Combining a readiness and a liveness probe with the HTTP handler and setting their timing fields.

**Why the solution looks like this:**
- The two probes answer different questions. Readiness decides whether the pod gets Service traffic; liveness decides whether the kubelet restarts the container. The check is the same here, the consequence is not.
- An `httpGet` probe passes on any status from 200 to 399. nginx serves `/` on port 80, so both pass.
- Liveness starts later and runs less often than readiness because a restart is the costly reaction. With a period of 10 s and `failureThreshold: 3`, it takes 30 s of failures before a restart.
- Each probe is its own block under the container. The timing fields belong to the probe, next to `httpGet`, not inside it.
- `describe` prints each probe as one line with delay, period and failure count, so you see that the values landed.

**On the exam:** Generate the pod with `$do`, copy a probe block from the docs and adjust it. Then check `1/1` and RESTARTS 0.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-a-liveness-http-request): HTTP probe YAML to copy. Search: `configure liveness readiness startup probes`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/#configure-probes): every timing field and its default. Search: `configure probes`

## 3.6

**What this trains:** A two-container Deployment where only the sidecar is probed, using the TCP handler.

**Why the solution looks like this:**
- `k create deployment` names the generated container after the image (`nginx`), so it is renamed to `app` before `proxy` is added by hand.
- `proxy` uses `args`, not `command`. The agnhost image has its own entrypoint, and `args` hands it `netexec --http-port=8080`. `command` would replace that entrypoint.
- A `tcpSocket` probe passes when the kubelet can open a connection to the port. That suits a process that listens but offers no health URL.
- Probes belong to one container. `app` has none and counts as ready once it runs; `2/2` needs both containers ready.
- agnhost is multi-arch, unlike the often-used goproxy image, which is amd64-only. It listens on 8080, so the probes are the same.

**On the exam:** In a Deployment the container list sits deeper than in a Pod; keep the second container aligned with the first. Check for `2/2` on every replica.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-a-tcp-liveness-probe): TCP probe YAML to copy. Search: `configure liveness readiness startup probes`
- [Define a Command and Arguments for a Container](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/): `command` versus `args`. Search: `define command arguments container`

## 3.7

**What this trains:** Protecting a slow-starting container with a startup probe, so the liveness probe can stay strict.

**Why the solution looks like this:**
- Until the startup probe has passed, the liveness and readiness probes don't run. A slow start can't be mistaken for a hang.
- The start budget is `periodSeconds` times `failureThreshold`: 5 x 12 = 60 s, enough for the 20 s start. After the first success the startup probe is done and liveness takes over.
- With liveness alone, this app uses up two of the three allowed failures before it is up. A slightly slower start gets restarted, sleeps again, and loops.
- A long `initialDelaySeconds` on the liveness probe is a fixed guess; the startup probe ends as soon as the app is up.
- The watch shows the proof: `0/1` for about 20 s, then `1/1` with RESTARTS 0.

**On the exam:** There is no generator for probes, so add them to a `k run ... $do` manifest. Check that period times threshold covers the slowest start the task mentions.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-startup-probes): startup probe YAML and the budget formula. Search: `configure liveness readiness startup probes`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/#startup-probe): when to use a startup probe. Search: `startup probe`

## 3.8

**What this trains:** Reading container logs with a time limit and writing a filtered part of them to a file.

**Why the solution looks like this:**
- `k logs` returns what the container wrote to stdout and stderr. The nginx image sends its access log there, so every request shows up.
- The request comes from a temporary pod and goes to the pod IP: `probed-web` has no Service, and a pod IP can't be reached from outside the cluster. The IP is read from `.status.podIP`.
- `>/dev/null` throws away the HTML answer. Only the log entry that the request leaves behind matters.
- `--since=5m` limits by time and `grep 'GET /'` by content. The "only" in the task is the `grep`.
- The file holds more than one line. The kubelet's probes are `GET /` requests too, with user agent `kube-probe`, and they match the filter. That is expected.

**On the exam:** Create the target directory first and `cat` the result. `--since`, `--tail` and `-c` are the `logs` flags worth knowing by heart.

**Docs:**
- [kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/): all flags with examples. Search: `kubectl logs`
- [Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/#basic-logging-in-kubernetes): why stdout and stderr are what `logs` shows. Search: `logging architecture`

## 3.9

**What this trains:** Telling a readiness failure from a liveness failure by its symptoms and finding the cause in the events.

**Why the solution looks like this:**
- `web` runs but is never ready and never restarts: a readiness failure. `proxy` restarts over and over: a liveness failure. Together: READY `1/2`, RESTARTS climbing.
- The `Unhealthy` events name the cause. The readiness GET for `/healthz` gets a 404: the default nginx config serves no such path. The liveness probe can't connect to 9090, where nothing listens.
- Containers in a pod share one network namespace, and the kubelet probes the pod IP and port, so a probe aimed at the other container's port would pass. The fault is the wrong path and the wrong port, not which container owns the probe.
- `k edit deploy` changes the pod template, so a new pod replaces the old one and RESTARTS is back at 0.

**On the exam:** Describe, read the `Unhealthy` lines (with several pods behind the selector, `describe -l` needs `--show-events=true`), then edit the Deployment. Watch longer than one liveness period to see RESTARTS stay at 0.

**Docs:**
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/#check-mechanisms): what counts as success for each handler. Search: `liveness readiness startup probes`
- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/#my-pod-is-crashing-or-otherwise-unhealthy): where to look when a pod is unhealthy. Search: `debug pods`

## 3.10

**What this trains:** Scaling a Deployment, including to zero, and reading what happens while pods shut down.

**Why the solution looks like this:**
- `scale` changes only `spec.replicas`. The Deployment, its ReplicaSet and the pod template stay, so zero replicas stops an app without losing its definition.
- The pods don't vanish at once. On deletion the kubelet sends SIGTERM, waits for the grace period (30 s by default), then kills the container. Python running as PID 1 ignores SIGTERM, so these pods stay `Terminating` for the full 30 s.
- The task asks to confirm that no pods remain. That means waiting for `No resources found` before scaling up, not just seeing `0` on the Deployment.
- Scaling to 4 makes the ReplicaSet create four new pods; `4/4` confirms they are ready.

**On the exam:** `k scale` is faster than editing. A pod in `Terminating` for half a minute is not an error and needs no `--force`; wait, or do another task meanwhile.

**Docs:**
- [Pod Lifecycle: termination of Pods](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination): SIGTERM, the grace period and the final kill. Search: `pod termination`
- [kubectl scale](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_scale/): the flags and the resource types it accepts. Search: `kubectl scale`
- [Deployments: scaling](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#scaling-a-deployment): scaling a Deployment. Search: `scaling a deployment`
