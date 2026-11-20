# Application Observability and Maintenance (15%)

This domain is about seeing what an application does and repairing it when it misbehaves: health probes, resource usage, events, logs and broken workloads. Most tasks hand you an object that does not run, or that runs without being ready, and ask you to fix it. Others ask for a piece of output, such as a log line or an event reason, written to a file.

## Understand API deprecations

Every object is addressed by group, version and kind. `apiVersion: apps/v1` with `kind: Deployment` means group `apps`, version `v1`. The core group has no name, so Pods and Services use plain `v1`.

APIs mature from alpha through beta to stable. An old version is first deprecated: it still works, and kubectl prints a warning. Later it is removed: the API server no longer knows it, and `k apply` fails with `no matches for kind`. A manifest written for an old cluster can therefore fail on v1.37 without containing a typo.

The cluster tells you what it serves. `k api-resources` lists every kind with its short name, API version and whether it is namespaced. `k api-versions` lists the served group/version pairs. `k explain <kind>` prints group and version at the top, then the fields. A fresh object from a generator shows the current shape to compare against.

Changing `apiVersion` is often not enough, because the schema changed with the version:

| Old API | Removed in | Now | Also change |
|---|---|---|---|
| `extensions/v1beta1` Deployment | v1.16 | `apps/v1` | add `spec.selector` |
| `networking.k8s.io/v1beta1` Ingress | v1.22 | `networking.k8s.io/v1` | `pathType`, nested `service` backend |
| `batch/v1beta1` CronJob | v1.25 | `batch/v1` | nothing |
| `policy/v1beta1` PodDisruptionBudget | v1.25 | `policy/v1` | an empty `selector` now matches all pods |

The Deprecated API Migration Guide lists every removal by release, with the fields that changed.

### What you must be able to do
- Recognise a removed `apiVersion` from the error message.
- Find the served group and version for a kind.
- Rewrite the manifest: the version, then the fields the new schema requires.
- Apply it and check that the workload is ready.

### Commands and YAML to know
```bash
k api-resources | grep -i cronjob        # NAME SHORTNAMES APIVERSION NAMESPACED KIND
k api-versions | grep -E '^apps/|^batch/|^networking'
k explain deployment | head -5           # GROUP, KIND, VERSION
k explain deployment.spec.selector
k create deployment legacy --image=nginx $do    # current shape, to compare
```

```yaml
apiVersion: apps/v1            # was extensions/v1beta1
kind: Deployment
metadata:
  name: legacy
spec:
  replicas: 1
  selector:                    # required in apps/v1
    matchLabels:
      app: legacy              # must equal the template labels
  template:
    metadata:
      labels:
        app: legacy
    spec:
      containers:
      - name: web
        image: nginx
```

```yaml
# one path of a networking.k8s.io/v1 Ingress
- path: /
  pathType: Prefix             # required in v1
  backend:
    service:                   # was serviceName and servicePort
      name: web
      port:
        number: 80
```

### Traps
- Fixing only the `apiVersion` line. `apps/v1` rejects a Deployment without `spec.selector`, and the selector must match the template labels.
- Looking for a kind in `k api-versions`. It lists versions only; `k api-resources` maps kinds to groups.
- Trusting memory or an old blog post for the version. Ask the cluster with `k explain`.
- Writing a new file when the task says to fix the given one. Edit that file in place and apply it.
- Stopping after `k apply` succeeds. Check that the pods become ready.

### Docs
- [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/): removed APIs by release and what to change. Search: `deprecated api migration guide`
- [API Overview](https://kubernetes.io/docs/reference/using-api/#api-groups): API groups and versioning. Search: `api groups`

## Implement probes and health checks

The kubelet checks each container with up to three probes. They differ in what a failure causes:

| Probe | Question | On failure |
|---|---|---|
| `startupProbe` | Has the app finished starting? | The container is killed and restarted. Until it succeeds, the other two probes do not run. |
| `readinessProbe` | Can it take requests now? | The pod is marked not ready and gets no Service traffic. No restart. |
| `livenessProbe` | Is it still working? | The container is killed and restarted. |

Each probe uses one handler:

- `httpGet`: an HTTP request to a path and port. Status 200 to 399 passes; a 404 fails.
- `tcpSocket`: passes when the port accepts a connection.
- `exec`: runs a command in the container; exit code 0 passes.
- `grpc`: calls the gRPC health service on a port.

Timing fields tune every probe: `initialDelaySeconds` (default 0), `periodSeconds` (10), `timeoutSeconds` (1), `failureThreshold` (3) and `successThreshold` (1). A startup probe gives a slow app `failureThreshold` times `periodSeconds` to come up, for example 12 times 5 s for 60 s, and liveness waits for it.

Network probes go to the pod IP and the given port. Containers in one pod share that IP, so a probe on one container passes if any container listens on the port. Check the path and port against what the app really serves.

Readiness shows in the `READY` column: `0/1` with status `Running` means the probe fails. A failing liveness probe shows as a growing `RESTARTS` count. `k describe pod` prints the probe settings and `Unhealthy` events with the reason.

### What you must be able to do
- Add startup, readiness and liveness probes with given handler and timing.
- Tell from `k get pod` which probe fails.
- Find the reason in the events and correct the path, port or command.
- Make a pod ready without recreating it when the probe checks for a file.

### Commands and YAML to know
There is no generator for probes. Generate the workload with `$do`, then add the probes under the container.

```bash
k create deployment api --image=nginx:1.27 --port=80 $do > api.yaml
k describe pod web | grep -E 'Liveness|Readiness|Startup|Unhealthy'
k describe po -l app=web --show-events=true | grep -E 'Unhealthy|Killing'
k explain pod.spec.containers.readinessProbe
k exec web -- touch /tmp/ready           # satisfy an exec probe on a file
```

```yaml
spec:
  containers:
  - name: web
    image: nginx:1.27
    ports:
    - containerPort: 80
    startupProbe:              # up to 12 x 5 s to start
      httpGet:
        path: /
        port: 80
      periodSeconds: 5
      failureThreshold: 12
    readinessProbe:            # failing: no traffic, no restart
      exec:
        command: ["cat", "/tmp/ready"]
      initialDelaySeconds: 3
      periodSeconds: 5
    livenessProbe:             # failing: restart
      tcpSocket:
        port: 80
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3
```

### Traps
- Probing a path the app does not have. Stock nginx answers `/healthz` with 404, so the probe fails. Use a path that exists.
- `failureThreshold: 1` on a liveness probe restarts the container on the first miss.
- Covering a slow start with a long liveness `initialDelaySeconds`. Use a startup probe.
- Putting the probe under the pod spec. Probes belong to the container.
- Reading `Running` as healthy. Look at `READY` and `RESTARTS`.
- `k describe` with `-l` hides events for several pods. Add `--show-events=true`.

### Docs
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/): YAML to copy for every handler, and all timing fields. Search: `liveness readiness startup probes`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/): when to use which probe. Search: `probes`

## Use built-in CLI tools to monitor Kubernetes applications

The built-in tools are kubectl subcommands: `get`, `describe`, `events` and `top`. They answer three questions: what state is the object in, what happened to it, and how much does it use.

`k get` gives the state. For pods, `READY`, `STATUS` and `RESTARTS` tell most of the story. `-o wide` adds the pod IP and node, `-w` keeps watching for changes, and `-A` covers all namespaces.

`k describe` adds the detail for one object: container state and last state, exit codes, conditions and, at the bottom, the events. When a label selector matches several pods, the events are hidden unless you add `--show-events=true`.

Events are the cluster's record of what happened: scheduling, image pulls, probe failures, kills. They are namespaced and have a type, `Normal` or `Warning`. There are two ways to list them:

- `k events` sorts by time, newest last, and filters with `--types=Warning` or `--for pod/<name>`.
- `k get events` is unsorted. Add `--sort-by=.metadata.creationTimestamp`, and filter with `--field-selector`.

`k top` shows current CPU and memory use for pods or nodes. The numbers come from metrics-server; without it the command fails. `--sort-by` takes `cpu` or `memory`, `-A` covers all namespaces, and `--containers` splits a pod into its containers. `top` reports use only. Requests and limits are in the pod spec.

### What you must be able to do
- Watch a pod or rollout change state.
- Find the events of one object, or all warnings of a namespace, in time order.
- Find the pod or node that uses the most CPU or memory.
- Write any of these results to a file in the format the task asks for.

### Commands and YAML to know
```bash
k get po -o wide                         # pod IP and node
k get po -w                              # watch; Ctrl-C stops
k describe po -l app=shop --show-events=true
k events -n shop --types=Warning         # sorted, newest last
k events -n shop --for pod/web
k get events -n shop --sort-by=.metadata.creationTimestamp
k get events -n shop --field-selector type=Warning
k get events -n shop --field-selector involvedObject.name=web -o jsonpath='{.items[*].reason}'
k top node
k top pod -A --sort-by=memory
k top pod web --containers
k top pod -A --sort-by=memory --no-headers | head -1 | awk '{print $1"/"$2}'
```

This competency needs no YAML.

### Traps
- Sorting events by `.lastTimestamp`. Some events leave that field empty and sort out of order. Use `.metadata.creationTimestamp` or `k events`.
- Forgetting `-n`. Events live in the namespace of their object.
- `-A` adds a `NAMESPACE` column in front, which shifts the column numbers for `awk` or `cut`.
- Right after metrics-server or a pod starts, `k top` has no data yet. Wait about a minute.
- Reading the events of a Deployment to learn why a pod fails. Describe the pod; scheduling and image events are recorded there.

### Docs
- [kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/#viewing-and-finding-resources): `get`, `describe`, sorting and output formats. Search: `kubectl quick reference`
- [Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/): where the `k top` numbers come from. Search: `resource metrics pipeline`
- [kubectl events](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_events/): all flags of the command. Search: `kubectl events`

## Utilize container logs

A container's log is what its process writes to stdout and stderr. The container runtime stores it on the node and `k logs` reads it. An app that logs only to a file inside the container shows nothing here. The log belongs to the pod: delete the pod and it is gone.

`k logs <pod>` prints one container. In a pod with several containers, name the one you want with `-c`, or ask for all of them.

| Flag | Effect |
|---|---|
| `-c <name>` | One container; also init and ephemeral containers. |
| `--all-containers` | Every container in the pod. |
| `-f` | Follow the log until you press Ctrl-C. |
| `--tail=20` | The last 20 lines only. |
| `--since=5m` | Lines from the last five minutes only. |
| `--previous` | The instance of the container that ran before the last restart. |
| `-l app=web` | All pods that match the selector. |
| `--prefix` | Start every line with the pod and container name. |

You can also name a workload, as in `k logs deploy/web` or `k logs job/load`, and kubectl picks one of its pods.

`--previous` matters for crashing containers, and it has a catch. It works while the pod shows `CrashLoopBackOff`, when a new instance is waiting to start. While the status is `Error`, the finished instance is still the current one: plain `k logs` has its output, and `--previous` fails.

Tasks often want log lines in a file. `k logs` has no filter of its own, so pipe through `grep`, `head` or `tail` and redirect with `>`. Order matters: "the last 10 lines that contain ERROR" means `grep` first, then `tail`.

### What you must be able to do
- Read the log of a chosen container in a multi-container pod.
- Limit the output by line count or by time.
- Get the output of a container that has crashed.
- Write filtered log lines to a given file.

### Commands and YAML to know
```bash
k logs web                               # the default container
k logs web -c proxy --tail=20
k logs web --all-containers --prefix
k logs -l app=web --tail=-1              # with -l, only 10 lines per pod by default
k logs deploy/web -f
k logs crasher --previous                # needs STATUS CrashLoopBackOff
mkdir -p /opt/course/logs
k logs web --since=5m | grep 'GET /' > /opt/course/logs/access.log
k logs noisy | grep ERROR | tail -10 > /opt/course/logs/errors.txt
k get pod crasher -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
```

This competency needs no YAML.

### Traps
- `--previous` on a pod in status `Error` returns an error. Use plain `k logs`, or wait for `CrashLoopBackOff`.
- `--tail=10` before `grep` filters only the last 10 lines. Filter first, then cut.
- With `-l`, kubectl prints 10 lines per pod unless you set `--tail`.
- Without `-c`, you get one container's log, which may not be the one the task means.
- Writing to a directory that does not exist. Run `mkdir -p` first, and use the exact path from the task.
- The kubelet's HTTP probes appear in access logs as requests from `kube-probe`. Do not mistake them for client traffic.

### Docs
- [kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/): every flag, with examples. Search: `kubectl logs`
- [Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/): how container output becomes a log, and the sidecar pattern for apps that log to files. Search: `logging architecture`

## Debugging in Kubernetes

Work from the outside in, and stop when you know the cause:

1. `k get pod`: read `STATUS`, `READY` and `RESTARTS`.
2. `k describe pod`: read the state, the last state and the events.
3. `k logs`: read what the process said, with `--previous` after a crash.
4. `k exec` or `k debug`: look around inside the pod.

The status points to the step that has the answer:

| Symptom | Usual cause | Where it shows |
|---|---|---|
| `Pending` | No node fits, for example a CPU request that is too large. | Event `FailedScheduling`. |
| `ErrImagePull`, `ImagePullBackOff` | Wrong image name or tag. | Events. |
| `Error`, `CrashLoopBackOff` | The process exits: bad command, missing setting, no permission. | Logs and the exit code. |
| `OOMKilled`, exit code 137 | Memory use above the limit. | `Last State` in describe. |
| `Running` but `0/1` | The readiness probe fails. | `Unhealthy` events. |

`k exec` needs a shell or tool in the image. When there is none, `k debug` adds an ephemeral container with its own image to the running pod. With `--target=<container>` it shares that container's process namespace, so `ps` shows its processes and `/proc/1/root/` is its filesystem.

For the fix, a Deployment takes `k set image`, `k edit` or `k patch` and rolls out new pods. Most fields of a bare pod are immutable: export the YAML, edit it, and run `k replace --force -f`, which deletes and recreates the pod.

To test connectivity, use `k port-forward` from your terminal, or a temporary pod inside the cluster.

### What you must be able to do
- Name the cause of a pod that is not running from its status and events.
- Fix a wrong image, command, resource request, probe or security setting.
- Inspect a container that has no shell.
- Test a pod or Service from inside and from outside the cluster.

### Commands and YAML to know
```bash
k get pod web -o wide
k describe pod web | grep -A10 Events
k describe pod web | grep -A3 'Last State'       # Reason: OOMKilled, Exit Code: 137
k logs web --previous                            # needs STATUS CrashLoopBackOff
k exec -it web -c app -- sh
k debug web -it --image=busybox:1.36 --target=app -- sh
k set image deploy/shop nginx=nginx:1.27-alpine  # container=image
k get pod web -o yaml > web.yaml                 # edit, then:
k replace --force -f web.yaml
k port-forward pod/web 8081:80 &                 # local:remote; stop with kill %1
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081
k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- web:80
```

This competency needs no YAML of its own.

### Traps
- Stopping after the first fix. A pod can have two faults, such as an image typo and then a bad command. Check the status again.
- Editing a pod that a Deployment owns. The next rollout discards the change. Fix the Deployment.
- `k debug` without `--target` cannot see the other container's processes.
- Piping a temporary pod's output into `head` on your side can stop `--rm` from cleaning up. Pipe inside the pod with `sh -c '...'`.
- A container whose main process ignores SIGTERM takes 30 seconds to stop. Delete or replace such a pod with `--force --grace-period 0`.
- A pod that is `Running` is not necessarily `Ready`. Verify with `READY` and one real request.

### Docs
- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/): what to check for Pending, waiting and crashing pods. Search: `debug pods`
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container): logs, exec and `kubectl debug` with ephemeral containers. Search: `debug running pods`
- [Determine the Reason for Pod Failure](https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/): reading the last state and exit code. Search: `pod failure`
