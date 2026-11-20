## 8.1

**What this trains:** Finding out why a pod stays `Pending`, and replacing a pod whose spec can't be corrected in place. You need it whenever a pod never gets a node.

**Why the solution looks like this:**
- A `Pending` pod has no container and no logs, so the only evidence is the scheduler's event: reason `FailedScheduling`, message `Insufficient cpu`. No node has 64 CPUs to offer.
- The task asks for the event reason, so the file holds the single word `FailedScheduling`, not the message. The field selector on `involvedObject.name` returns it without the text around it in `describe`.
- The resources of an existing pod can't be edited in place here; the API server rejects the change. So the manifest is exported, the request is set to `100m`, and `replace --force` deletes the pod and creates it again.
- `Running` in the verify step proves the new request fits on a node.

**On the exam:** Run `describe` first and read the Events at the bottom. Check that the file contains only the reason and that the pod is `Running`.

**Docs:**
- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/#my-pod-stays-pending): what Pending means and how to read the scheduler's message. Search: `debug pods`
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/): how requests decide scheduling. Search: `manage resources containers`

## 8.2

**What this trains:** Recognising an image pull failure from pod status and events, and correcting a Deployment's image without opening an editor.

**Why the solution looks like this:**
- `ErrImagePull` and `ImagePullBackOff` mean the kubelet could not fetch the image. The container never started, so there are no logs; the event message names the image, and the typo is in the tag: `alpne`.
- `describe po -l app=shop` matches two pods, and for several pods kubectl hides the Events section. `--show-events=true` brings it back.
- `set image` needs the container name. `create deployment` named the container after the image, so the pair is `nginx=nginx:1.27-alpine`.
- The fix goes to the Deployment, not to the pods. The changed template starts a new ReplicaSet that replaces the broken pods, and `rollout status` returns once both replicas are ready.

**On the exam:** Read the image reference character by character before suspecting registries or pull secrets. Finish with `rollout status` so you don't leave while the rollout is still in progress.

**Docs:**
- [Images](https://kubernetes.io/docs/concepts/containers/images/#imagepullbackoff): what ImagePullBackOff means and how image names are resolved. Search: `ImagePullBackOff`
- [kubectl set image](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/): syntax `container=image`. Search: `kubectl set image`
- [kubectl describe](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/): the `--show-events` flag. Search: `kubectl describe`

## 8.3

**What this trains:** Getting the output and the exit code of a container that crashes right after start. It is the first step for every `CrashLoopBackOff`.

**Why the solution looks like this:**
- The container prints its error and exits with code 3 at once, and the kubelet restarts it with a growing delay. STATUS therefore alternates between `Error` and `CrashLoopBackOff`.
- `logs --previous` reads the instance before the current one. That works only while STATUS is `CrashLoopBackOff`, when a new instance is waiting. While STATUS is `Error` the finished instance is still the current one: `--previous` fails and plain `logs` has the output.
- `grep FATAL` keeps the error line and drops `starting`. The message was written to stderr, and `logs` returns stdout and stderr together.
- The exit code is not in the logs. It is in the pod status under `lastState.terminated.exitCode`, which jsonpath reads without parsing `describe`.

**On the exam:** Look at STATUS, then choose the command; if `--previous` fails, run plain `logs` instead of waiting. `cat` both files: one `FATAL` line and `3`.

**Docs:**
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#examine-pod-logs): logs of the current and the previous container. Search: `debug running pods`
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-states): container states and restart back-off. Search: `pod lifecycle`

## 8.4

**What this trains:** Tracing a Service that doesn't answer back to its two usual causes: a selector that matches no pod and a `targetPort` nobody listens on.

**Why the solution looks like this:**
- The EndpointSlice is the first check because it shows what the Service really selected. `<unset>` means no pod matches `app: api-server`; `--show-labels` shows the pods carry `app=api`.
- Correcting the selector alone would give endpoints on port 8080, but nginx listens on 80. `targetPort` must be the container's port, while `port` stays 8080 because clients call `api:8080`.
- The JSON patch replaces both fields in one command and leaves the Deployment alone, as the task demands.
- The test runs from a temporary pod, since a Service name only resolves inside the cluster. `wget -T 3` makes a wrong fix fail after three seconds.
- `head` runs inside the pod's shell. On your side of the pipe it could end kubectl before `--rm` deletes the pod, and a leftover `t` would block the next test.

**On the exam:** Compare three things: Service selector, pod labels, container port. Test through the Service name before moving on.

**Docs:**
- [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices): the same checks, step by step. Search: `debug services`
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service): `selector`, `port` and `targetPort`. Search: `service targetPort`

## 8.5

**What this trains:** Updating a manifest written for an API version that the cluster no longer serves. Old manifests fail exactly like this.

**Why the solution looks like this:**
- `extensions/v1beta1` Deployments were removed in v1.16. The API server doesn't know the kind in that group any more, so `apply` fails before anything is created.
- Changing `apiVersion` to `apps/v1` is not enough. `apps/v1` requires `spec.selector`, and its `matchLabels` must match the labels in the pod template, here `app: legacy`.
- Generating a fresh Deployment with `$do` gives a known-good structure to compare with, which is faster than recalling the schema. `k explain` confirms a single field.
- `k api-versions` lists the group versions the cluster serves, so you can check instead of guessing.
- The same kind of fix applies to Ingress `networking.k8s.io/v1beta1` (removed in v1.22) and to CronJob `batch/v1beta1` and PodDisruptionBudget `policy/v1beta1` (both removed in v1.25).

**On the exam:** Fix `apiVersion`, apply, read the next error (it names the missing field) and repeat. Confirm that the Deployment shows `1/1`.

**Docs:**
- [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/#v1-16): removed versions per release and what changed. Search: `deprecated api migration guide`
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#selector): the selector rules in `apps/v1`. Search: `deployment selector`

## 8.6

**What this trains:** Debugging a container whose image has no shell by adding an ephemeral container to the running pod.

**Why the solution looks like this:**
- `exec` can only start a binary that exists in the container's image. The pause image has no `sh`, so `exec` fails. An ephemeral container brings its own image with tools and needs no pod restart.
- `--target=distroless` places the debug container in the process namespace of that container. `ps` then shows `/pause` as PID 1, and `/proc/1/root` leads into the target's filesystem.
- The task wants the process list in a file, so the non-interactive form runs `ps aux` as the ephemeral container's command and the output is read with `logs -c`.
- The ephemeral container's name is generated. jsonpath takes the last entry of `spec.ephemeralContainers`, the one just added.
- The short `sleep` lets the ephemeral container start before its logs are read.

**On the exam:** Every `debug` call adds another ephemeral container to the pod, so always read the last one. `cat` the file and check that it lists `/pause`.

**Docs:**
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container): `k debug` with `--target`. Search: `debug running pods`
- [Ephemeral Containers](https://kubernetes.io/docs/concepts/workloads/pods/ephemeral-containers/): what they are and their limits. Search: `ephemeral containers`
- [kubectl debug](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_debug/): all flags. Search: `kubectl debug`

## 8.7

**What this trains:** Seeing that readiness, not labels alone, decides whether a pod receives Service traffic, and repairing a probe condition inside a live container.

**Why the solution looks like this:**
- `0/1 Running` is the clue: the container runs but its readiness probe fails. `describe` shows the probe command and its error, `cat` on a missing `/tmp/ready`.
- A failing readiness probe never restarts the container. It only keeps the pod out of the Service's ready endpoints, so the selector is right and traffic still goes nowhere.
- The pod must not be recreated, so the fix gives the probe what it checks for: `touch` the file through `exec`. With a 5 s period the pod becomes ready about 5 s later.
- The two verify commands show different views. `describe svc` lists only ready endpoints, so it is empty before the fix. The EndpointSlice lists the pod the whole time; its `conditions.ready` changes from `false` to `true`.

**On the exam:** When labels match and the endpoints are empty, check the READY column next. Without `touch` in the image, an ephemeral container can create the file through `/proc/1/root`.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-readiness-probes): readiness probes and their fields. Search: `readiness probe`
- [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions): the `ready` condition of an endpoint. Search: `endpointslices`

## 8.8

**What this trains:** Using `k top` to find the biggest consumer, and shaping the output into the exact format a task asks for.

**Why the solution looks like this:**
- `top` reads current usage from the metrics API, which metrics-server provides. Without metrics-server the command fails, and after enabling it the first data takes about a minute.
- `-A` covers all namespaces and adds the namespace column that the `<namespace>/<pod>` format needs.
- `--sort-by=memory` puts the highest value first and `--no-headers` removes the title row, so `head -1` is the answer.
- `awk` joins columns 1 and 2 with a slash. The raw `top` line would not match a check that expects exactly `<namespace>/<pod>`.
- `k top node` is the companion command. It shows whether a node as a whole is short of CPU or memory.

**On the exam:** `top` shows usage at this moment, not requests or limits; those are in the pod spec. `cat` the file and compare its format with the task, character by character.

**Docs:**
- [Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/): the metrics API and metrics-server. Search: `resource metrics pipeline`
- [kubectl top pod](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/kubectl_top_pod/): flags such as `--sort-by` and `--containers`. Search: `kubectl top pod`

## 8.9

**What this trains:** Listing events filtered by type and in a reliable time order. Events are the first source for everything that fails before a container writes logs.

**Why the solution looks like this:**
- `k events` is the dedicated command. It orders events by time with the newest last, which is what the task asks for, and `--types=Warning` filters without a field selector.
- `k get events` does not sort by time on its own. The alternative therefore filters with `--field-selector type=Warning` and sorts by `.metadata.creationTimestamp`, a field every object has.
- Sorting by `.lastTimestamp` is the habit to drop. Events written through `events.k8s.io/v1` may leave that field null, and those rows then land in the wrong place.
- The output is redirected as it is. The task asks for the events, not for one column, so no further shaping is needed.

**On the exam:** `k events` is the shortest correct answer; `--for pod/<name>` narrows it to one object when a task asks for that. Check that the file has only `Warning` rows and that the newest is at the bottom.

**Docs:**
- [kubectl events](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_events/): `--types`, `--for` and `--watch`. Search: `kubectl events`
- [Event](https://kubernetes.io/docs/reference/kubernetes-api/core/event-v1/): the fields of an event, including the timestamps. Search: `event v1`

## 8.10

**What this trains:** Testing DNS and TCP reachability from inside the cluster, and telling a name resolution problem from a connectivity problem.

**Why the solution looks like this:**
- The test pod runs in `debug-c` because DNS settings and NetworkPolicies apply per pod. Your workstation sees none of that.
- `/etc/resolv.conf` shows the cluster DNS server and the search list that starts with `debug-c.svc.cluster.local`. That list is why short names work for most clients.
- busybox `nslookup` skips the search list for a name that contains a dot, so a partial name fails although DNS is healthy. The full `<svc>.<ns>.svc.cluster.local` name avoids that.
- The `kubernetes` Service in `default` is the control: it always exists. If it resolves and `api` does not, the fault is the Service, not DNS.
- `nc -zv -w 3` only opens a TCP connection to the ClusterIP, with a timeout. `open` proves the Service reaches a listening pod without involving DNS.

**On the exam:** If the IP works but names fail, check the pod's `resolv.conf`, then the CoreDNS pods and their logs in `kube-system`, then a NetworkPolicy that blocks egress to port 53.

**Docs:**
- [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/): the checks in order. Search: `debugging dns resolution`
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/): record names and the search list. Search: `dns for services and pods`

## 8.11

**What this trains:** Spotting a liveness probe that is wrong while the application is fine. A bad probe keeps a healthy container restarting forever.

**Why the solution looks like this:**
- The events tell the story: `Unhealthy` with the status the probe received, then `Killing`. The describe uses a label selector, so `--show-events=true` keeps the events visible.
- nginx serves `/` but has no `/healthz`, so the probe gets a 404, which counts as a failure.
- `failureThreshold: 1` turns one failed check into a restart. Setting it to 3 tolerates a short hiccup.
- The probe must still check HTTP on port 80, so removing it or switching to TCP would miss the task. Only the path changes.
- The patch goes to the Deployment template, which rolls out a new pod. RESTARTS staying at 0 proves the fix.

**On the exam:** `Unhealthy` events with a 404 point at the probe, not at the app. Watch the new pod for longer than a few probe periods before leaving.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-a-liveness-http-request): HTTP probes and which status codes pass. Search: `liveness probe`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/): what each probe type is for. Search: `liveness readiness startup probes`
