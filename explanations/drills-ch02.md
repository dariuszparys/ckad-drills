## 2.1

**What this trains:** Creating a pod from a generator and fixing the one thing the generator can't set, the container name. Most pod tasks start this way.

**Why the solution looks like this:**
- `--port` only writes `containerPort: 80` into the spec; it creates no Service. `--labels` sets exactly the two labels the task asks for.
- `k run` has no flag for the container name, which defaults to the pod name. That is why the manifest goes through `$do` into a file instead of straight to the cluster.
- kubectl generators write container fields alphabetically: `- image:` comes first and `name:` is the next line, indented four spaces. The sed pattern matches those four spaces, so it renames the container and leaves `metadata.name` (two spaces) as `webpod`.
- A container name can't be changed on a running pod, so it has to be right before `apply`.
- `get pod` doesn't show container names; the jsonpath line does.

**On the exam:** Generate with `$do`, fix the name in vim, apply. Check the labels with `--show-labels` and the container name before moving on.

**Docs:**
- [kubectl run](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_run/): every flag, including `--port` and `--labels`. Search: `kubectl run`
- [Pods](https://kubernetes.io/docs/concepts/workloads/pods/): a minimal pod manifest to compare with. Search: `pods`

## 2.2

**What this trains:** Writing a Service whose selector you control and proving it reaches the pod. A wrong selector is the usual reason a Service has no endpoints.

**Why the solution looks like this:**
- `k expose pod webpod` copies all pod labels into the selector, here `type=webserver,tier=front`. That works today, but a later pod labelled only `type=webserver` would be left out, and the task asks for all of them.
- `k create service clusterip` builds the port mapping from `--tcp=8080:80` but sets the selector to `app: basicsvc`, which matches nothing. Changing that one line is quicker than typing the whole manifest.
- `port` is what clients call; `targetPort` is the container port. Swapping them is the classic mistake.
- The EndpointSlice shows the pod IP and port 80, so the selector matches. The `wget` from a temporary pod proves DNS and the mapping; the short name resolves because that pod runs in `arch-a` too.

**On the exam:** Use `k expose` only when copying every label is wanted. Otherwise generate, fix the selector, and look at the endpoints before moving on.

**Docs:**
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service): a manifest with selector, `port` and `targetPort`. Search: `service`
- [kubectl create service clusterip](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_service_clusterip/): the `--tcp` syntax. Search: `kubectl create service clusterip`

## 2.3

**What this trains:** Changing a Service's type in place and pinning its node port. A NodePort Service opens the same port on every node.

**Why the solution looks like this:**
- The type of a Service can be changed on the live object, so `patch` or `edit` is enough.
- `nodePort` belongs inside the entry of `spec.ports`, next to `port` and `targetPort`, not directly under `spec`. Leave it out and Kubernetes picks a free port from the 30000-32767 range.
- `nodePort` is only accepted together with a type that uses it, so both changes go into one patch.
- The patch repeats the whole ports entry. Port 8080 identifies which entry is meant, and repeating `targetPort` and `protocol` leaves no doubt about the result.
- `8080:30080/TCP` in the output confirms the pin. The Mac can't reach minikube's node IP, so the request is sent from inside the node; on a cluster with reachable nodes, curl a node IP on port 30080.

**On the exam:** `k edit svc` is the fastest route: change `type`, add the `nodePort` line. Check the PORT(S) column afterwards.

**Docs:**
- [Service: type NodePort](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport): the port range and a manifest with a fixed `nodePort`. Search: `service nodeport`
- [Update API Objects in Place Using kubectl patch](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/): how lists are merged. Search: `kubectl patch`

## 2.4

**What this trains:** Running two containers in one pod. Every sidecar, adapter or proxy pattern builds on this.

**Why the solution looks like this:**
- `k run` generates a single container, so the dry-run YAML is only the start: rename the generated container from `logpod` to `web` and add the second list item by hand.
- busybox has no long-running default process. Without the loop the `logger` container exits, gets restarted again and again, and the pod doesn't stay at `2/2`.
- `command` is an array of three items: `sh`, `-c`, and the whole loop as one string. Split the loop into several items and the shell runs only the first word as its script.
- READY counts containers, so `2/2` means both are up. With more than one container, `k logs` needs `-c logger` to know whose output to print; the date lines prove the loop runs.

**On the exam:** Generate, copy the container block in vim, then edit the copy. Wait a few seconds before trusting `2/2`, because a container that exits shows up late.

**Docs:**
- [Pods: how Pods manage multiple containers](https://kubernetes.io/docs/concepts/workloads/pods/#how-pods-manage-multiple-containers): what containers in a pod share. Search: `pods`
- [Define a Command and Arguments for a Container](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#run-a-command-in-a-shell): the `sh -c` array form. Search: `define command arguments container`

## 2.5

**What this trains:** The native sidecar: a helper that starts before the app and runs for the whole life of the pod. It is stable since Kubernetes v1.33.

**Why the solution looks like this:**
- A native sidecar is an init container with `restartPolicy: Always`. That one field tells the kubelet not to wait for the container to finish: it starts it, then moves on to `app`.
- Without the field, `tail -F` is an ordinary init container that never completes, and `app` never starts.
- The sidecar starts first, so `app.log` doesn't exist yet. `tail -F` (capital F) keeps retrying until the file appears; `tail -f` would fail on the missing file.
- An `emptyDir` mounted in both containers is how they see the same file. It lives as long as the pod.
- READY shows `2/2`: a sidecar counts as a running container, which a normal init container never does.

**On the exam:** No generator writes `initContainers`, so generate a pod with `$do` and add the volume and the init block by hand. Check `2/2` and that the sidecar's log shows the app's lines.

**Docs:**
- [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/): a full example and the start and stop order. Search: `sidecar containers`
- [Kubernetes v1.33 release](https://kubernetes.io/blog/2025/04/23/kubernetes-v1-33-release/#stable-sidecar-containers): the graduation to stable. Search: `v1.33 sidecar containers`

## 2.6

**What this trains:** Creating a Deployment from the command line and reading the chain it produces: Deployment, ReplicaSet, pods.

**Why the solution looks like this:**
- `k create deployment` accepts `--replicas` and `--port`, so no YAML is needed. It labels the Deployment and its pod template `app=firstdeploy`.
- A Deployment doesn't create pods itself. It creates a ReplicaSet, and the ReplicaSet creates the pods. The ReplicaSet's name ends in a generated hash, so it is found by the label it inherits from the pod template, not by name.
- `-o name` would print the name with a `replicaset.apps/` prefix. The file must hold the bare name, so jsonpath reads `.metadata.name`. A label query returns a list even for one match, hence `.items[0]`.
- `get deploy,rs,po` with the same label shows all three levels at once and confirms three ready pods.

**On the exam:** One imperative command, one jsonpath query. `cat` the file: one line, no prefix.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#creating-a-deployment): how Deployment, ReplicaSet and pods relate. Search: `deployment`
- [kubectl create deployment](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_deployment/): the flags. Search: `kubectl create deployment`
- [JSONPath Support](https://kubernetes.io/docs/reference/kubectl/jsonpath/): the query syntax. Search: `jsonpath`

## 2.7

**What this trains:** Reconciliation. A controller compares the desired state with what exists and repairs the difference, so deleting a managed object doesn't get rid of it.

**Why the solution looks like this:**
- The Deployment owns the ReplicaSet. Once the ReplicaSet is deleted, the Deployment controller sees that it is missing and recreates it within seconds. The AGE column is the evidence that it is a new object.
- Deleting a ReplicaSet deletes its pods as well, so the new one starts three fresh pods.
- The ReplicaSet owns the pods. Delete one and it creates a replacement to get back to three.
- Selecting by label avoids typing generated names. `-o name` prints `pod/<name>`, a form `k delete` takes as is, and `head -1` picks a single pod.

**On the exam:** To remove or change the pods of a Deployment, change the Deployment itself (scale, edit or delete it); deleting pods or ReplicaSets only causes a restart. Check for READY `3/3` at the end.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/): the Deployment as owner of its ReplicaSets. Search: `deployment`
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/#deleting-a-replicaset-and-its-pods): what deleting a ReplicaSet does to its pods. Search: `replicaset`
- [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/): desired versus current state. Search: `controllers`

## 2.8

**What this trains:** Knowing what can be changed on a running pod. Only a few pod fields can be updated in place, and the container image is among them.

**Why the solution looks like this:**
- The API server accepts the new image, and the kubelet restarts just that container with it. The pod itself is not replaced: same name, same pod object, `RESTARTS` goes to 1.
- `set image` takes `<container>=<image>`. It needs the container name `webcont`, not the pod name, which is why the rename in the first drill matters here.
- For most other fields, such as `command` or `ports`, the same kind of update is rejected and the pod has to be deleted and created again.
- The first check reads the image from the spec. The second shows that the kubelet acted on it: one restart, pod still `Running`.

**On the exam:** `k set image` or `k edit pod` both work. Read the task for "without deleting"; if the field is not one of the few that can change, export the YAML, delete and recreate.

**Docs:**
- [Pods: pod update and replacement](https://kubernetes.io/docs/concepts/workloads/pods/#pod-update-and-replacement): which fields can change in place. Search: `pod update and replacement`
- [kubectl set image](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/): syntax for pods and workloads. Search: `kubectl set image`

## 2.9

**What this trains:** Looking up API facts from the cluster itself instead of from memory or the docs: short names, API versions, scope and field types.

**Why the solution looks like this:**
- `k api-resources` prints one row per resource type with the columns NAME, SHORTNAMES, APIVERSION, NAMESPACED and KIND. Three of the four answers are read straight from those columns.
- The `grep` anchors on the lowercase plural name at the start of the row, because that is what the NAME column holds; the Kind (`CronJob`) is in the last column.
- `k explain` takes a dotted path and prints the field with its type. The path goes through `containers` without an index. `head -5` cuts off the long description.
- The heredoc writes the four answers in the order the task lists them, one per line. The delimiter is quoted so the shell changes nothing in the text.

**On the exam:** Both commands answer in a second and always match the cluster's version. `k explain <path> --recursive` prints the field tree when you forget where a field belongs.

**Docs:**
- [kubectl explain](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_explain/): path syntax and `--recursive`. Search: `kubectl explain`
- [kubectl api-resources](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_api-resources/): filters such as `--namespaced` and `--api-group`. Search: `kubectl api-resources`

## 2.10

**What this trains:** Debugging a pod with stacked faults, where the second one only shows after the first is fixed.

**Why the solution looks like this:**
- The Events at the end of `describe` name the first fault: the tag has a typo, so the pull fails with `ErrImagePull`, then `ImagePullBackOff`.
- The second fault stays hidden until the image can be pulled. `command` replaces the image's own start command, and `daemon on;` makes nginx fork into the background. PID 1 exits, the container counts as finished, and the restarts end in `CrashLoopBackOff`. A container lives only as long as its first process.
- Removing `command` brings back the image default, which keeps nginx in the foreground.
- The pod is deleted and applied again because a pod's `command` can't be changed in place. `--force --grace-period 0` skips the wait.

**On the exam:** After finding one error, read the rest of the manifest before applying. Fix everything in the file, delete, apply, and check that `1/1 Running` holds for a few seconds.

**Docs:**
- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/#my-pod-stays-waiting): what to check per pod state. Search: `debug pods`
- [Images: ImagePullBackOff](https://kubernetes.io/docs/concepts/containers/images/#imagepullbackoff): what the status means. Search: `imagepullbackoff`
- [Define a Command and Arguments for a Container](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/): how `command` overrides the image. Search: `define command arguments container`

## 2.11

**What this trains:** Listing across namespaces and shaping the output so a file holds exactly what was asked for: names only, one per line.

**Why the solution looks like this:**
- `-A` queries every namespace. In the default output it also puts a NAMESPACE column in front, so the pod name is no longer the first field of the row.
- `-o custom-columns` with only `.metadata.name` reduces each row to the name, and `--no-headers` drops the header line. Nothing else can end up in the file.
- `-o name` would be shorter but prefixes every line with `pod/`.
- `grep '^coredns'` is anchored at the start, so a pod that merely contains the word doesn't match. The filter runs on the client because the task defines the set by a name prefix, which selectors can't express.

**On the exam:** The pattern get, reduce the columns, filter, redirect answers most "write the names to a file" tasks. `cat` the file and look for a header line or a prefix before moving on.

**Docs:**
- [kubectl reference: custom columns](https://kubernetes.io/docs/reference/kubectl/#custom-columns): the `custom-columns` syntax. Search: `kubectl custom-columns`
- [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/): which objects are namespaced and how to set the namespace. Search: `namespaces`
