## mock-1

**What this trains:** Building a two-container pod that shares data through an `emptyDir`: one container writes, a helper reads. It is the sidecar pattern in its smallest form.

**Why the solution looks like this:**
- No generator writes two containers. `k run … $do` supplies the skeleton for `web`; the second container and the volume are added by hand.
- One volume, two mounts, two paths. nginx writes its logs to `/var/log/nginx`, and the shipper sees the same files under `/logs`.
- `readOnly` belongs to the shipper's mount, not to the volume, because the writer needs the same volume writable. `sizeLimit` belongs to the `emptyDir`.
- The command is a list of separate words, since no shell splits a string for you. `tail -F` keeps retrying until nginx has created the file.
- The verify step sends one request to nginx and reads the shipper's logs. The access line there proves both mounts share the volume.

**On the exam:** Five checks, one point each, so every field scores on its own. Get the pod to `2/2` first, then confirm the size limit and the read-only mount.

**Docs:**
- [Volumes](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir): `emptyDir` and `sizeLimit`. Search: `emptyDir`
- [Communicate Between Containers in the Same Pod Using a Shared Volume](https://kubernetes.io/docs/tasks/access-application-cluster/communicate-containers-same-pod-shared-volume/): a complete two-container example. Search: `shared volume`

## mock-2

**What this trains:** Setting a Job's completion count, parallelism, retries and cleanup, and collecting its output before it disappears.

**Why the solution looks like this:**
- `k create job … $do` writes the skeleton and splits the command into list items, including the quoted Perl expression. The four batch settings have no flags and are added to `spec`.
- `completions: 4` with `parallelism: 2` means four successful pods in total, at most two at a time. `backoffLimit: 3` caps the retries before the Job counts as failed.
- `ttlSecondsAfterFinished: 120` deletes the Job and its pods two minutes after it finishes. That is why the solution waits for the `complete` condition and saves the logs at once.
- `logs job/pi` reads one of the Job's pods, which is all the task asks for.
- A Job's pods need `restartPolicy` `Never` or `OnFailure`; the pod default `Always` is rejected.

**On the exam:** Four of the five points are spec fields, so apply the manifest first. Then write the file before the TTL removes the pods; if you are too late, apply the manifest again and wait.

**Docs:**
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/#parallel-jobs): `completions`, `parallelism` and `backoffLimit`. Search: `jobs`
- [Automatic Cleanup for Finished Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/ttlafterfinished/): the TTL field. Search: `ttlSecondsAfterFinished`

## mock-3

**What this trains:** Writing a CronJob with its schedule and run policies, and starting one run by hand.

**Why the solution looks like this:**
- The generator covers name, image, schedule and command. In cron syntax the minute comes first, so "minute 30 of every hour" is `30 * * * *`.
- The remaining fields sit on two levels. `concurrencyPolicy` and `successfulJobsHistoryLimit` describe the CronJob and go in its `spec`. `activeDeadlineSeconds` limits a single run, so it goes under `jobTemplate.spec`; the scoring sheet checks that position.
- `Replace` stops a Job that is still running and starts the new one. The default `Allow` would run both side by side.
- `create job --from=cronjob/report` copies the job template into a Job that starts now. You don't wait for minute 30, and the run shows that the template works.

**On the exam:** One point per check. With little time left, create the CronJob from the generator and trigger `report-now`: that is half the points in two commands. Then check the indentation of the added fields with `-o yaml`.

**Docs:**
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#concurrency-policy): schedule syntax, concurrency policy and history limits. Search: `cronjob`
- [Running Automated Tasks with a CronJob](https://kubernetes.io/docs/tasks/job/automated-tasks-with-cron-jobs/): a manifest to copy. Search: `automated tasks cronjob`

## mock-4

**What this trains:** Writing a minimal Dockerfile, building a tagged image and exporting it as an archive. All of it happens on the host, without the cluster.

**Why the solution looks like this:**
- Two instructions are enough: `FROM` with the full base reference from the task, and `COPY` to overwrite the default page. The content file is created first, next to the Dockerfile, because `COPY` reads from the build context, the `.` at the end of the build command.
- `-t mock-web:v2` names the image at build time. `save` then refers to it by that name, so the archive carries the tag.
- `save -o` writes the image with all its layers into one tar file that `load` restores elsewhere.
- Loading the archive and running the container proves all three checks at once: the page prints `CKAD mock v2`.
- podman uses the same subcommands.

**On the exam:** Dockerfile, image and archive are two points each, so a correct Dockerfile scores even if the build fails. No allowed site documents Dockerfile syntax (the Dockerfile reference is on Docker's own site), so know `FROM`, `COPY`, `RUN`, `CMD` and `ENTRYPOINT` by heart.

**Docs:**
- [Images](https://kubernetes.io/docs/concepts/containers/images/): image names, tags and registries as Kubernetes uses them. Search: `images`

## mock-5

**What this trains:** Controlling a rolling update with `maxUnavailable` and `maxSurge`, reading the rollout history and rolling back to a chosen revision.

**Why the solution looks like this:**
- The strategy has no generator flag, so it is added to the dry-run YAML. `maxUnavailable: 0` with `maxSurge: 1` adds one new pod and removes an old one only when the new one is ready. That is why the failed `nginx:9.99` update leaves all four old pods serving.
- The change-cause is the annotation `kubernetes.io/change-cause` on the Deployment. It is copied to every new ReplicaSet, so revision 3 with the broken image also shows `upgrade to 1.27`.
- The CHANGE-CAUSE column therefore can't identify the target. `rollout history --revision=N` prints the pod template, and the image settles it: revision 2.
- After the undo, that template becomes revision 4 and revision 2 leaves the history. The task asks for the revision you rolled back to, so the file holds `2`.

**On the exam:** Strategy, running image and the file are two points each. Find the revision by image before the undo, write the number down then, and finish by checking the image.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment): history, change-cause and undo. Search: `rolling back a deployment`
- [kubectl rollout history](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_history/): the `--revision` flag. Search: `kubectl rollout history`

## mock-6

**What this trains:** A canary release with plain Kubernetes objects: two Deployments behind one Service, with the share set by replica counts.

**Why the solution looks like this:**
- The Service selects `app=checkout` only. Every ready pod with that label becomes an endpoint, whatever its `version` label says, so the canary joins without a Service change.
- A Service spreads connections roughly evenly over its endpoints. One v2 pod next to three v1 pods is one of four, which is 25 %. Only the replica counts set the ratio.
- Each Deployment's selector contains `version` as well as `app`. With `app=checkout` alone both selectors would match all four pods, and controllers with overlapping selectors conflict.
- The template labels carry both labels, because a Deployment's selector must match its own template.
- `get po -L version` shows the 3:1 split, and four endpoints in the EndpointSlice prove that all of them are behind `checkout`.

**On the exam:** Three checks, two points each. Work out the replica count from the percentage first, and leave the Service untouched: changing it loses points even if the traffic split is right.

**Docs:**
- [Managing Workloads](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments): canary with a shared label and a track label. Search: `canary deployments`
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/): how selectors pick endpoints. Search: `service selector`

## mock-7

**What this trains:** The Helm lifecycle for an existing chart: add a repo, install a pinned version with values, upgrade without losing them, and list releases by state.

**Why the solution looks like this:**
- `--version 6.17.0` pins the chart on install and again on upgrade, so the upgrade changes one value and not the chart.
- `--reuse-values` keeps `replicaCount` and `redis.enabled` from the install and merges `ui.message` on top. `helm get values` shows all three afterwards, and the release is at revision 2.
- `helm list` is namespaced like kubectl: `-n mock-7` for the first file, `-A` for the search.
- Helm 4 has no `helm list -a`; `-A` already lists every state. `--failed --pending` narrows it to broken releases, and `-q` prints only names.
- With no match the output is empty, but the task wants the word `none`. The size test after the command writes it.

**On the exam:** The install is two points and everything else in the namespace builds on it, so do it first. `broken.txt` is two more points and independent of your release. `helm upgrade -h` lists the flags faster than the browser does.

**Docs:**
- [helm upgrade](https://helm.sh/docs/helm/helm_upgrade/): `--reuse-values`, `--version` and `--set`. Search: `helm upgrade`
- [helm list](https://helm.sh/docs/helm/helm_list/): the status filters and `-A`. Search: `helm list`

## mock-8

**What this trains:** Declaring startup, readiness and liveness probes on one container, and turning a time budget into probe fields.

**Why the solution looks like this:**
- No generator writes probes. The skeleton comes from `$do`, and the three blocks are added to the container at the level of `image`.
- "Up to 60 s total" is not a field. The startup budget is `periodSeconds` times `failureThreshold`, so a period of 5 needs `failureThreshold: 12`.
- While the startup probe has not succeeded, the other two probes don't run. A slow start therefore can't cause a liveness restart.
- Readiness uses the same HTTP check with period 5. Failing it takes the pod out of the Service endpoints and restarts nothing.
- Liveness is a `tcpSocket` check as asked: it only tests that port 80 accepts a connection. `initialDelaySeconds: 10` and `periodSeconds: 15` belong to this probe alone.

**On the exam:** Each probe is two points and scored separately. Copy a probe block from the docs page, paste it three times and adjust. Confirm the Deployment reaches `2/2`.

**Docs:**
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#define-startup-probes): examples for every probe type and all timing fields. Search: `startup probe`
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/): what each probe is for. Search: `liveness readiness startup probes`

## mock-9

**What this trains:** Repairing a manifest that targets a removed API version, in the file the task names.

**Why the solution looks like this:**
- `extensions/v1beta1` no longer serves Deployments, so the file can't be applied at all. Deployments live in `apps/v1`.
- Changing the `apiVersion` is half the fix. `apps/v1` requires `spec.selector`, and its `matchLabels` must equal the pod template's labels, here `app: legacy-api`. Without it the API server rejects the object.
- "In place" matters: the check reads `/opt/course/exam/9/broken.yaml`, not only the cluster. A Deployment created from a new file or imperatively would run and still miss the three points for the file.
- Everything else stays as it is: name, namespace, replicas, image and port. Rewriting more than needed only invites typos.
- If you forget the structure, `k explain deploy.spec.selector` or a Deployment generated with `$do` shows it.

**On the exam:** Three of the five points are in the file, two in the running state. Edit, apply that same path, read the error if there is one, then confirm `2/2`.

**Docs:**
- [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/): removed API versions per release and their replacements. Search: `deprecated api migration guide`
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#selector): the selector rules in `apps/v1`. Search: `deployment selector`

## mock-10

**What this trains:** Filtering container logs with shell tools, and finding out why a Service that has endpoints still doesn't reach its pods.

**Why the solution looks like this:**
- The order of the pipeline matters. `grep ERROR` first and `tail -10` second gives the last ten ERROR lines. The other way round keeps only the errors among the last ten log lines.
- The Service has endpoints, so its selector is right. The endpoint port shows the bug: 8080, while nginx listens on 80. In `--tcp=80:8080` the second number is the `targetPort`.
- Only `targetPort` is patched. `port` stays 80 because clients call that, and the task forbids touching the Deployment.
- The ENDPOINTS column already has the `IP:port` form the task asks for, so `awk` takes column 2. The file is written after the patch and therefore shows port 80.
- `get ep` still works on v1.37; `v1 Endpoints` is deprecated since v1.33 and kubectl prints a warning.

**On the exam:** Two points per part, and the parts are independent. The log part is one pipeline, so do it first. Then check that the endpoints file shows `:80`.

**Docs:**
- [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/): endpoints, selectors and ports, step by step. Search: `debug services`
- [kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/): `--tail`, `--since` and `-c`. Search: `kubectl logs`

## mock-11

**What this trains:** Creating a ConfigMap from literals and a file, creating a Secret, and using them three ways: all keys as env vars, one key as an env var, one key as a file.

**Why the solution looks like this:**
- `--from-file=app.properties` takes the file name as the key and the content as the value, which gives the third key.
- The Secret literal is in single quotes so the shell passes its last character through unchanged.
- `envFrom` imports every key. Since v1.34 an env var name may be any printable ASCII except `=`, so `app.properties` is imported as well; older clusters skipped it. The task asks for all keys, so that is correct.
- `DB_PASSWORD` uses `env` with `secretKeyRef`, since exactly one key of the Secret is wanted.
- A ConfigMap volume without `items` creates one file per key. `items` with key and path limits it to `app.properties`, so `ls /etc/app` shows a single file.

**On the exam:** ConfigMap, env wiring and the mount are two points each, the Secret one. Create both objects imperatively, then the pod. Verify with `env` and `ls` inside the container.

**Docs:**
- [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#add-configmap-data-to-a-specific-path-in-the-volume): `envFrom`, and volumes with `items`. Search: `configure pod configmap`
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/): creating Secrets and `secretKeyRef`. Search: `secrets`

## mock-12

**What this trains:** Splitting security settings between pod level and container level, and keeping a hardened container able to write where it must.

**Why the solution looks like this:**
- `runAsUser`, `runAsGroup` and `fsGroup` go in the pod's `securityContext` and apply to every container. `fsGroup` exists only there; it sets the group of mounted volumes.
- `capabilities`, `readOnlyRootFilesystem` and `allowPrivilegeEscalation` exist only at container level. The pod-level block does not accept them.
- `runAsNonRoot: true` doesn't choose a user. It makes the kubelet refuse to start the container as UID 0, and with `runAsUser: 1001` the check passes.
- `drop: ["ALL"]` followed by `add` leaves exactly one capability, named without the `CAP_` prefix.
- With a read-only root filesystem the `emptyDir` at `/data` is the one writable path. The verify line shows it: `uid=1001`, a write to `/data` that works and a write to `/` that is refused.

**On the exam:** The container block is three of the six points, the pod-level block two. Copy a `securityContext` example from the docs page and check that the pod is `Running`.

**Docs:**
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/): every field used here, with examples. Search: `security context`
- [Set capabilities for a Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#set-capabilities-for-a-container): the `add` and `drop` syntax. Search: `set capabilities container`

## mock-13

**What this trains:** Granting a ServiceAccount namespaced permissions with a Role and RoleBinding, running a workload under it and testing the result by impersonation.

**Why the solution looks like this:**
- "Only in `mock-13`" means Role and RoleBinding, not the Cluster variants. Both are created in the namespace.
- Deployments are in the `apps` group, hence `deployments.apps`; pods are in the core group. The verbs differ per resource, so there are two rules: two Roles with two bindings, or one Role written as YAML.
- `--serviceaccount` takes `namespace:name`. That binds the ServiceAccount, not a user with the same name.
- The Deployment uses the account only if `serviceAccountName` is in the pod template; otherwise its pods run as `default`. `set serviceaccount` adds the field without an editor.
- `delete` was never granted, so `auth can-i` prints `no` and exits with status 1. That is the expected answer, and the redirect still writes it to the file.

**On the exam:** The Role's verbs are two points, the other four checks one each. Everything except the Deployment is a one-line command. Also test a granted verb with `auth can-i --as`.

**Docs:**
- [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#kubectl-create-role): Role, RoleBinding and the `k create role` examples. Search: `rbac`
- [kubectl auth can-i](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/): `--as` and the exit code. Search: `kubectl auth can-i`

## mock-14

**What this trains:** How a ResourceQuota, a LimitRange and a workload's own resources interact in one namespace.

**Why the solution looks like this:**
- A quota on `requests.*` and `limits.*` makes those values mandatory. A pod without them is refused, so the Deployment exists but its first ReplicaSet reports `FailedCreate` and has no pods.
- Two things lift the block. `set resources` writes requests and limits into the template, and the new ReplicaSet's pods are admitted. Or a LimitRange supplies defaults to containers that declare none, which is why applying it before the Deployment avoids the error.
- In a LimitRange, `defaultRequest` is the default request and `default` is the default limit. `type: Container` applies them per container.
- ResourceQuota has a generator with `--hard`; LimitRange has none and is written as YAML.
- The worker's explicit values take precedence over the defaults. Three replicas request 600m CPU, well inside the quota, and `describe quota` shows what is used.

**On the exam:** Three checks, two points each, and they score independently. Create quota, LimitRange and Deployment in that order, then confirm `3/3`.

**Docs:**
- [Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/): the quota keys, and why pods then need requests and limits. Search: `resource quotas`
- [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/): `default` and `defaultRequest`. Search: `limit range`

## mock-15

**What this trains:** Writing ingress and egress NetworkPolicies with pod and namespace selectors, including the DNS rule an egress policy needs.

**Why the solution looks like this:**
- `create deployment` labels the pods `app=<name>`, which the policies select. NetworkPolicy has no generator, so both are YAML.
- The top-level `podSelector` says which pods the policy applies to; `from` and `to` name the peers. Once a pod is selected for a direction, everything not listed for that direction is dropped.
- In `db-policy`, `from` and `ports` sit in one rule, so both must hold: backend pods and TCP 6379. The frontend times out.
- `backend-egress` has two rules, and either may match. The first allows the db pods on 6379. The second allows port 53 over UDP and TCP in any namespace (`namespaceSelector: {}`), because the DNS pods run outside `mock-15`. Without it the backend can't resolve any name.
- The verify step needs a CNI that enforces policies.

**On the exam:** Four points per policy. Copy the example from the docs page and cut it down. Count the dashes under `egress`: each `-` starts a new rule.

**Docs:**
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/): the full example and selector combinations. Search: `network policies`
- [Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/): testing a policy from a temporary pod. Search: `declare network policy`

## mock-16

**What this trains:** The whole exposure chain: ClusterIP Services, a NodePort with a fixed port, a host and path based Ingress, and a routing test.

**Why the solution looks like this:**
- `expose` copies the Deployment's selector, so both ClusterIP Services find their pods. `--port=8080 --target-port=80` separates the Service port from the container port.
- The NodePort uses `create service nodeport` because that generator has `--node-port`. It sets the selector to `app=shop-np`, which matches no pod, so `sed` rewrites it to `app: shop`. Two endpoints confirm it.
- In `create ingress`, the trailing `*` in a rule produces `pathType: Prefix`, and `--class=nginx` sets `ingressClassName`.
- The rule is host based, so the test sends a `Host` header to the controller.
- The Ingress does no rewrite, so httpd is asked for `/api`, a page it doesn't have. Its own Apache-style 404 means the route works; an nginx 404 means the request fell through to `shop-svc`, and a 503 means no endpoints.

**On the exam:** The Ingress is four points, each Service and the script two. The Services are one command each: take those six points first.

**Docs:**
- [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/#path-types): rules, hosts and path types. Search: `ingress`
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport): NodePort and its port fields. Search: `nodeport`
- [kubectl create ingress](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/): the `--rule` syntax. Search: `kubectl create ingress`
