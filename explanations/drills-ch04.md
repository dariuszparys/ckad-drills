## 4.1

**What this trains:** Running a batch task a fixed number of times with a Job and controlling how many pods work at once. You need it whenever a task asks for "N successful runs" instead of a long-running service.

**Why the solution looks like this:**
- `kubectl create job` has no flags for completions or parallelism, so the generator only gives the skeleton. Both fields go under the Job `spec`, next to `template`, not inside it.
- `completions: 6` is the number of pods that must exit 0. `parallelism: 3` caps how many run at the same time, so the Job finishes in two waves of three.
- `restartPolicy: Never` makes a failed container produce a new pod instead of an in-place restart. A Job template accepts only `Never` or `OnFailure`; the pod default `Always` is rejected.
- The Job controller labels its pods with `job-name=sleepy`, which is why the verify selector finds exactly these six pods.

**On the exam:** Generate with `$do`, add the two lines, apply, and wait until `COMPLETIONS` reads `6/6`. Check the indentation of the new fields before applying.

**Docs:**
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/#parallel-jobs): completions, parallelism and a full Job manifest. Search: `job parallelism`
- [kubectl create job](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_job/): what the generator can and cannot set. Search: `kubectl create job`

## 4.2

**What this trains:** Bounding a Job in time and in retries, and reading the outcome from `status.conditions`. Use it when a batch task must not run forever.

**Why the solution looks like this:**
- `activeDeadlineSeconds: 20` is a wall-clock limit for the whole Job, counted from its start, however many pods it has created. Ten sequential 5-second runs need about 50 s, so the deadline hits after a few completions.
- `backoffLimit: 2` counts failed pods. Every pod here succeeds, so it never triggers; if it had, the reason would be `BackoffLimitExceeded`. The deadline wins: once it is reached, no more pods start even if retries remain.
- Both fields sit in the Job `spec`. A pod spec has its own `activeDeadlineSeconds`, which limits one pod, not the Job.
- The JSONPath filter selects the condition by `type`, because the list also holds a `FailureTarget` entry and an index would be a guess.

**On the exam:** Wait until the Job shows `Failed` before writing the file: the condition is added only after the running pod has terminated, and an empty file means you were too early. `cat` the file.

**Docs:**
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/#job-termination-and-cleanup): deadline, backoff limit and the terminal conditions. Search: `job activeDeadlineSeconds`
- [JSONPath Support](https://kubernetes.io/docs/reference/kubectl/jsonpath/): filter syntax `?(@.type=="...")`. Search: `jsonpath`

## 4.3

**What this trains:** Scheduling a recurring Job with a CronJob and limiting how many finished Jobs it keeps.

**Why the solution looks like this:**
- `create cronjob` takes the schedule and the command; only the two history limits are added by hand.
- `*/2` in the minute field means every second minute. Keep the quotes around the schedule: an unquoted value that starts with `*` is read as a YAML alias and does not parse.
- The history limits are CronJob fields, beside `schedule`, not Job fields. The defaults are 3 successful and 1 failed, so only the first one changes behaviour, but the task names both, so write both.
- A CronJob nests three specs: CronJob, `jobTemplate` (the Job) and `template` (the pod). `restartPolicy` belongs to the innermost one.
- Creating a Job `--from` the CronJob runs the template now, which proves the pod works without waiting for the next even minute.

**On the exam:** Generate, add the limits, apply, then read the `SCHEDULE` column of `k get cj`. Trigger a manual Job if you need proof that it runs.

**Docs:**
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#schedule-syntax): cron fields and the history limits. Search: `cronjob schedule syntax`
- [Running Automated Tasks with a CronJob](https://kubernetes.io/docs/tasks/job/automated-tasks-with-cron-jobs/): a manifest to copy. Search: `automated tasks cronjob`

## 4.4

**What this trains:** Two independent CronJob controls: how long a single run may take, and whether runs may overlap.

**Why the solution looks like this:**
- `activeDeadlineSeconds: 10` goes in `jobTemplate.spec` because it is a Job field. The CronJob spec has the similar `startingDeadlineSeconds`, which only limits how late a missed run may still start.
- `concurrencyPolicy: Forbid` is a CronJob field. The default `Allow` starts a new Job regardless, `Forbid` skips the run while the previous Job is active, and `Replace` kills the old Job instead.
- At about 10 s the Job gets the `FailureTarget` condition and its pod is deleted. `sleep` runs as PID 1 and ignores SIGTERM, so the pod lasts the full 30 s grace period. Only when it is gone, at roughly 30 to 40 s, does the Job show `Failed` with reason `DeadlineExceeded`.
- `COMPLETIONS` stays at `0/1`: a Job stopped by its deadline never counts as complete.

**On the exam:** Decide for each requirement whether it is a CronJob, Job or pod field. Watch one run to its end; at 15 s the Job still looks unfinished.

**Docs:**
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#concurrency-policy): `Allow`, `Forbid`, `Replace`. Search: `cronjob concurrencyPolicy`
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/#job-termination-and-cleanup): the deadline and when `Failed` is set. Search: `job activeDeadlineSeconds`

## 4.5

**What this trains:** A ReplicaSet owns pods purely through its label selector. Changing a label takes one pod out of a workload without deleting it, for example to debug a misbehaving replica.

**Why the solution looks like this:**
- The Deployment's ReplicaSet selects `app=design2` plus a `pod-template-hash`. Overwriting `app` makes the pod stop matching, the ReplicaSet counts one pod too few and creates a replacement. That is why three pods are listed.
- The relabelled pod keeps running. The controller releases it and removes its `ownerReferences` entry, so garbage collection no longer ties it to the Deployment: deleting the Deployment would leave it behind.
- `--overwrite` is required because the key already exists; without it kubectl refuses to change the value.
- Deleting with `-l app=orange` can only hit the orphan. A selector on the new value never touches a managed pod.

**On the exam:** Use `--show-labels` before and after. Finish by checking that the pod count equals the replica count and every remaining pod carries the original label.

**Docs:**
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/#isolating-pods-from-a-replicaset): removing a pod from a ReplicaSet by changing labels. Search: `replicaset isolating pods`
- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/): label syntax and selectors. Search: `labels selectors`
- [Owners and Dependents](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/): what `ownerReferences` means. Search: `owners dependents`

## 4.6

**What this trains:** Selecting objects by label in three ways: equality (`key=value`), existence (`key`) and set-based (`key in (...)`).

**Why the solution looks like this:**
- Labels are set at creation with `-l` on `k run`, which saves four separate label commands.
- `-l system=tux` matches p1 and p2. p1 is deleted although it also carries `env=dev`: a selector tests only the keys it names.
- `-l env` without a value matches every pod that has the key, whatever the value. After the delete only p4 qualifies; p3 and the Deployment pods have no `env` label.
- The set-based expression is quoted because it contains spaces and parentheses that the shell would otherwise interpret.
- A comma between requirements means AND. There is no OR across different keys; `in` gives OR over the values of one key, and a quoted `'!env'` selects objects without the key.

**On the exam:** Run the selector with `get` first and switch to `delete` only when the list is right. Then list with `--show-labels` to confirm what is left.

**Docs:**
- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors): equality-based and set-based requirements with kubectl examples. Search: `label selectors`

## 4.7

**What this trains:** The difference between requests and limits, and how to recognise a container that was killed for exceeding its memory limit.

**Why the solution looks like this:**
- Requests are what the scheduler reserves when it picks a node. Limits are enforced on the running container: CPU above the limit is throttled, memory above the limit gets the container killed.
- The process allocates about 250 MiB against a 200Mi limit, so the kernel ends it with SIGKILL. That gives exit code 137 (128 + 9) and reason `OOMKilled` under `Last State`. The kubelet restarts the container, it dies again, and the pod ends in `CrashLoopBackOff`.
- `set resources` edits the pod template, so each call rolls out new pods without YAML editing.
- The fix raises only the memory limit, to 300Mi. The request stays at 128Mi: a request below real usage is valid.

**On the exam:** Read `Last State` in `k describe po`. Exit code 137 with `OOMKilled` means the memory limit is too low for the process, not a probe or image problem.

**Docs:**
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#requests-and-limits): requests, limits and units. Search: `resource management pods containers`
- [Assign Memory Resources to Containers and Pods](https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/#exceed-a-container-s-memory-limit): a worked OOMKilled example. Search: `assign memory resources`

## 4.8

**What this trains:** Changing the resources of a bare pod and deriving limit values from an existing request.

**Why the solution looks like this:**
- The first command reads the current request, 200m, so "exactly twice" means a CPU limit of 400m.
- Most pod spec fields are immutable, so a plain `k edit` of the resources is refused. In-place resize through the `resize` subresource exists, but with restrictions such as an unchanged QoS class. Export, edit and force-replace always works.
- `replace --force` deletes the pod and creates it again from the file. A bare pod has no controller to bring it back, so the exported file is the only copy: write it before you change anything.
- The result is QoS class `Burstable`, because requests are set but lower than the limits. `Guaranteed` needs requests equal to limits for CPU and memory in every container.

**On the exam:** Print the `resources` block with JSONPath before and after, and check that the pod is Running again.

**Docs:**
- [Resize CPU and Memory Resources assigned to Containers](https://kubernetes.io/docs/tasks/configure-pod-container/resize-container-resources/): in-place resize and its limitations. Search: `resize container resources`
- [Pod Quality of Service Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/): Guaranteed, Burstable, BestEffort. Search: `pod qos`

## 4.9

**What this trains:** Capping the total consumption of a namespace with a ResourceQuota, and its side effect on pods that declare no resources.

**Why the solution looks like this:**
- `create quota` with `--hard` builds the object imperatively. `pods=5` is an object count; the other four keys are sums of requests and limits over all pods in the namespace.
- Once a quota tracks `requests.*` or `limits.*`, admission must add each new pod's values to the total. A pod without them cannot be accounted for, so the API server rejects it with `must specify limits.cpu for: nores; ...`. That is why `nores` fails and `withres` is accepted.
- The check happens when a pod is created. For a Deployment the kubectl command succeeds and the rejection shows up only in the ReplicaSet's events, so look there when replicas stay at 0.
- `describe quota` prints Used against Hard, which proves the accepted pod was counted.

**On the exam:** When pods are refused or never appear in a namespace, run `k get quota` first.

**Docs:**
- [Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/#compute-resource-quota): the resource names a quota accepts. Search: `resource quotas`
- [Configure Memory and CPU Quotas for a Namespace](https://kubernetes.io/docs/tasks/administer-cluster/manage-resources/quota-memory-cpu-namespace/): quota manifest and a pod that exceeds it. Search: `memory cpu quotas namespace`

## 4.10

**What this trains:** Giving containers default requests and limits per namespace with a LimitRange, and capping what a single container may ask for.

**Why the solution looks like this:**
- No generator exists, so the manifest comes from the docs.
- The field names are the trap: `defaultRequest` fills in requests, `default` fills in limits. `max` is an upper bound per container and is also checked against values a pod sets itself.
- The LimitRange admission step changes the pod at creation, before the quota check. The unchanged `k run nores` therefore arrives with requests and limits, and the quota from 4.9 accepts it.
- The defaults are written into the pod spec, which the verify output shows. Pods that existed before the LimitRange keep what they had.
- `type: Container` applies per container. A pod with two containers gets the defaults twice and counts twice against the quota.

**On the exam:** Copy the example from the Limit Ranges page and adjust the values. Then create a pod without resources and print its `resources` block to confirm the defaults.

**Docs:**
- [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/): fields, admission behaviour and an example. Search: `limit range`
- [Configure Default Memory Requests and Limits for a Namespace](https://kubernetes.io/docs/tasks/administer-cluster/manage-resources/memory-default-namespace/): defaults step by step. Search: `default memory requests limits namespace`

## 4.11

**What this trains:** Holding back an application with an init container until something it depends on exists.

**Why the solution looks like this:**
- Init containers run one at a time before the app containers, and each must exit 0. Until then the pod shows `Init:0/1` and nginx is not started.
- The `until` loop retries inside one container run. A failing init container would be restarted too, but with a growing back-off.
- The lookup uses the full name ending in `.svc.cluster.local`. busybox `nslookup` ignores the search domains for names that contain a dot, so a shortened `backend.design-e` would never resolve.
- Creating the Service is enough. The DNS record of a ClusterIP Service exists as soon as the Service does; no backing pods are needed.
- `logs` needs `-c wait-for-svc`; by default kubectl picks the app container, which has not started.

**On the exam:** `initContainers` is a sibling of `containers` in the pod spec; copy a container block and rename it. Confirm the pod reaches Running after the dependency is created.

**Docs:**
- [Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/#init-containers-in-use): a wait-for-service example to copy. Search: `init containers`
- [Debug Init Containers](https://kubernetes.io/docs/tasks/debug/debug-application/debug-init-containers/): the `Init:` statuses and init container logs. Search: `debug init containers`

## 4.12

**What this trains:** Finding out which custom resources a cluster offers and reading the key properties of a CRD.

**Why the solution looks like this:**
- A CRD is a cluster-scoped object named `<plural>.<group>`. Its `spec.group`, `spec.scope` (`Namespaced` or `Cluster`) and `spec.versions` define the API path of the custom objects.
- A version is reachable only while `served` is true, hence the JSONPath filter instead of printing every version name.
- The example is Calico's `ippools.crd.projectcalico.org` because the minikube profile runs Calico and has no Gateway API CRDs; a Cilium cluster has Cilium's instead. The steps are the same for any CRD.
- Reading the plural and the kind from the CRD avoids guessing the resource name. `-A` is harmless if the kind turns out to be cluster-scoped.
- `k explain` works because the CRD publishes its schema.

**On the exam:** Start with `k get crd`, filtered with `grep`. No exam-allowed docs page describes third-party kinds such as Calico or Gateway API resources, so `k explain` is your field reference for them.

**Docs:**
- [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/#customresourcedefinitions): what CRDs and custom resources are. Search: `custom resources`
- [Extend the Kubernetes API with CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#create-a-customresourcedefinition): a CRD manifest with group, scope and versions. Search: `customresourcedefinition`
