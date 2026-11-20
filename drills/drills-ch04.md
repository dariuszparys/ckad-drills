# Chapter 04: Design: drills

Curriculum areas: Jobs and CronJobs, init containers, labels/selectors, resource requests/limits, ResourceQuota/LimitRange, CRDs.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: `minikube addons enable metrics-server` (to watch 4.7 with `k top pod`). `--nodes=2` gives you a real "worker" for nodeSelector experiments (`kubernetes.io/hostname: ckad-m02`). Drill 4.12: with `--cni=calico` you have Calico CRDs (e.g. `ippools.crd.projectcalico.org`); with `--cni=cilium`, the Cilium ones. Drill 4.7 uses `python:3.12-alpine` because the commonly used `vish/stress` image is amd64-only. ResourceQuota/LimitRange work unchanged.

---

### 4.1 Job with completions and parallelism (⏱ 4 min)

In namespace `design-a`, create a Job `sleepy` that runs `busybox:1.36` with `sleep 3`. It must complete **6** times, running **3** pods in parallel. Pods must never be restarted in place.

<details><summary>Solution</summary>

`kubectl create job` has no flags for completions/parallelism, so generate and edit:

```bash
k create ns design-a
k -n design-a create job sleepy --image=busybox:1.36 $do -- sleep 3 > 4.1.yaml
```

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: sleepy
  namespace: design-a
spec:
  completions: 6
  parallelism: 3
  template:
    spec:
      containers:
      - name: sleepy
        image: busybox:1.36
        command: ["sleep", "3"]
      restartPolicy: Never
```

```bash
k apply -f 4.1.yaml
```

**Verify**
```bash
k -n design-a get job sleepy -w        # COMPLETIONS 0/6 -> 6/6
k -n design-a get po -l job-name=sleepy
```
</details>

---

### 4.2 Job with a deadline and backoff limit (⏱ 4 min)

In `design-a`, create Job `deadline` (`busybox:1.36`, `sleep 5`) with completions 10, parallelism 1, `activeDeadlineSeconds: 20` and `backoffLimit: 2`. After it stops, write the `reason` from the Job's `Failed` condition to `/opt/course/4.2/reason.txt`.

<details><summary>Solution</summary>

```bash
k create ns design-a      # skip if it exists from 4.1
k -n design-a create job deadline --image=busybox:1.36 $do -- sleep 5 > 4.2.yaml
```

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: deadline
  namespace: design-a
spec:
  completions: 10
  parallelism: 1
  activeDeadlineSeconds: 20
  backoffLimit: 2
  template:
    spec:
      containers:
      - name: deadline
        image: busybox:1.36
        command: ["sleep", "5"]
      restartPolicy: Never
```

```bash
k apply -f 4.2.yaml
k -n design-a get job deadline -w      # wait ~20 s until it stops
mkdir -p /opt/course/4.2
k -n design-a get job deadline -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}' > /opt/course/4.2/reason.txt
```

**Verify**
```bash
cat /opt/course/4.2/reason.txt        # DeadlineExceeded
```
</details>

---

### 4.3 CronJob every 2 minutes (⏱ 4 min)

In namespace `design-b`, create a CronJob `resting` that runs every 2 minutes, image `busybox:1.36`, command `sleep 3`. Keep 2 successful and 1 failed Job in history.

<details><summary>Solution</summary>

```bash
k create ns design-b
k -n design-b create cronjob resting --image=busybox:1.36 --schedule="*/2 * * * *" $do -- sleep 3 > 4.3.yaml
# add the two history limits under spec
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: resting
  namespace: design-b
spec:
  schedule: "*/2 * * * *"
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: resting
            image: busybox:1.36
            command: ["sleep", "3"]
          restartPolicy: Never
```

```bash
k apply -f 4.3.yaml
```

**Verify**
```bash
k -n design-b get cj resting
k -n design-b create job resting-manual --from=cronjob/resting   # run it now
k -n design-b get jobs
```
</details>

---

### 4.4 CronJob that must not run longer than 10 s (⏱ 4 min)

In `design-b`, create CronJob `limited` (every minute, `busybox:1.36`, `sleep 30`). Each Job must be terminated if it runs longer than 10 seconds, and a new run must not start while the previous one is still running.

<details><summary>Solution</summary>

```bash
k create ns design-b      # skip if it exists from 4.3
k -n design-b create cronjob limited --image=busybox:1.36 --schedule="* * * * *" $do -- sleep 30 > 4.4.yaml
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: limited
  namespace: design-b
spec:
  schedule: "* * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      activeDeadlineSeconds: 10
      template:
        spec:
          containers:
          - name: limited
            image: busybox:1.36
            command: ["sleep", "30"]
          restartPolicy: Never
```

```bash
k apply -f 4.4.yaml
```

`activeDeadlineSeconds` belongs in `jobTemplate.spec` (the Job), not in the CronJob spec.

**Verify**
```bash
k -n design-b get jobs -w | grep limited     # COMPLETIONS stays 0/1; FailureTarget after ~10 s, Failed (DeadlineExceeded) at ~30-40 s once the pod is gone (sleep as PID 1 ignores SIGTERM, so the grace period runs out)
```
</details>

---

### 4.5 Labels and selectors: orphan a pod (⏱ 4 min)

In namespace `design-c`, create Deployment `design2` (`nginx`, 2 replicas). Change the `app` label of **one** of its pods to `orange`. Explain what happens, then delete only the orphaned pod using a label selector.

<details><summary>Solution</summary>

```bash
k create ns design-c
k -n design-c create deployment design2 --image=nginx --replicas=2
P=$(k -n design-c get po -l app=design2 -o name | head -1)
k -n design-c label $P app=orange --overwrite
k -n design-c get po --show-labels    # 3 pods: the ReplicaSet created a replacement
k -n design-c delete po -l app=orange
```

The pod no longer matches the ReplicaSet selector, so the ReplicaSet creates a new pod to keep 2 replicas, and the relabelled pod keeps running as an orphan. Deleting the Deployment would not remove it.

**Verify**
```bash
k -n design-c get po --show-labels   # 2 pods, both app=design2
```
</details>

---

### 4.6 Delete by set-based selector (⏱ 3 min)

In `design-c`, run these pods:
`k -n design-c run p1 --image=nginx -l system=tux,env=dev`, `p2 -l system=tux`, `p3 -l system=penguin`, `p4 -l env=dev`.
Delete only pods that have the label `system=tux`, then list pods that have **any** `env` label.

<details><summary>Solution</summary>

```bash
for p in "p1 system=tux,env=dev" "p2 system=tux" "p3 system=penguin" "p4 env=dev"; do set -- $p; k -n design-c run $1 --image=nginx -l $2; done
k -n design-c delete po -l system=tux
k -n design-c get po -l env --show-labels
k -n design-c get po -l 'system in (tux,penguin)'   # set-based example
```

**Verify**
```bash
k -n design-c get po --show-labels   # p3 and p4 left (+ design2 pods)
```
</details>

---

### 4.7 Requests and limits, and an OOMKilled pod (⏱ 5 min)

In namespace `design-d`, create Deployment `stressmeout` with image `python:3.12-alpine` and command `python -c "b = b'x' * (250*1024*1024); import time; time.sleep(3600)"` (it allocates about 250 MiB). Set requests cpu `250m`/memory `128Mi` and limits cpu `500m`/memory `200Mi`. Observe what happens. Then raise only the memory limit so the pod keeps running.

The image commonly used for this, `vish/stress`, is **amd64-only**, so it won't run on an Apple Silicon minikube. The Python one-liner gives the same OOMKilled behaviour on any architecture.

<details><summary>Solution</summary>

```bash
k create ns design-d
k -n design-d create deployment stressmeout --image=python:3.12-alpine $do -- python -c "b = b'x' * (250*1024*1024); import time; time.sleep(3600)" > 4.7.yaml
k apply -f 4.7.yaml
k -n design-d set resources deploy stressmeout --requests=cpu=250m,memory=128Mi --limits=cpu=500m,memory=200Mi
k -n design-d get po -w           # OOMKilled -> CrashLoopBackOff (250Mi > 200Mi limit)
k -n design-d describe po -l app=stressmeout | grep -A3 'Last State'   # Reason: OOMKilled, Exit Code: 137
k -n design-d set resources deploy stressmeout --limits=cpu=500m,memory=300Mi
```

**Verify**
```bash
k -n design-d get po              # Running, restarts stop
k -n design-d get deploy stressmeout -o jsonpath='{.spec.template.spec.containers[0].resources}{"\n"}'
```
</details>

---

### 4.8 CPU limit exactly twice the request (⏱ 3 min)

Setup (creates the starting pod): save as `4.8-setup.yaml`, then run `k create ns design-d` (skip if it exists from 4.7) and `k apply -f 4.8-setup.yaml`.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: design-pod1
  namespace: design-d
spec:
  containers:
  - name: design-pod1
    image: nginx
    resources:
      requests:
        cpu: 200m
```

Task: find the CPU request of `design-pod1` in `design-d`. Make the CPU limit exactly twice the request, and add a memory request of `64Mi` and a memory limit of `128Mi`.

<details><summary>Solution</summary>

Most pod spec fields are immutable. Recent versions allow in-place resize through the `resize` subresource, but only within limits (for example the QoS class must not change). In the exam, the reliable path is export, edit and force-replace:

```bash
k -n design-d get pod design-pod1 -o jsonpath='{.spec.containers[0].resources}{"\n"}'
k -n design-d get pod design-pod1 -o yaml > 4.8.yaml
vim 4.8.yaml          # set the resources block below
k replace --force -f 4.8.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: design-pod1
  namespace: design-d
spec:
  containers:
  - name: design-pod1
    image: nginx
    resources:
      requests:
        cpu: 200m
        memory: 64Mi
      limits:
        cpu: 400m
        memory: 128Mi
```

**Verify**
```bash
k -n design-d get pod design-pod1 -o jsonpath='{.spec.containers[0].resources}{"\n"}'
k -n design-d get pod design-pod1 -o jsonpath='{.status.qosClass}{"\n"}'   # Burstable
```
</details>

---

### 4.9 ResourceQuota for a namespace (⏱ 4 min)
**Curriculum:** "Understand requests, limits, quotas"

In namespace `design-q`, create a ResourceQuota `team-quota` that limits the namespace to 5 pods, `requests.cpu=1`, `requests.memory=1Gi`, `limits.cpu=2`, `limits.memory=2Gi`. Then show that a pod **without** resources is rejected.

<details><summary>Solution</summary>

```bash
k create ns design-q
k -n design-q create quota team-quota --hard=pods=5,requests.cpu=1,requests.memory=1Gi,limits.cpu=2,limits.memory=2Gi
k -n design-q run nores --image=nginx        # Error: ... failed quota: team-quota: must specify limits.cpu for: nores; limits.memory ...
k -n design-q run withres --image=nginx $do > 4.9.yaml   # add resources, see YAML
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: withres
  namespace: design-q
spec:
  containers:
  - name: withres
    image: nginx
    resources:
      requests:
        cpu: 100m
        memory: 64Mi
      limits:
        cpu: 200m
        memory: 128Mi
```

```bash
k apply -f 4.9.yaml
```

**Verify**
```bash
k -n design-q describe quota team-quota      # Used: pods 1, requests.cpu 100m, limits.cpu 200m ...
```
</details>

---

### 4.10 LimitRange defaults (⏱ 4 min)

In namespace `design-q`, create a LimitRange `container-defaults` so that containers without resources get default requests cpu `100m`/memory `64Mi` and default limits cpu `200m`/memory `128Mi`, and no container may ask for more than `500m` CPU. Then the `nores` pod from 4.9 can be created.

<details><summary>Solution</summary>

No imperative generator exists, so use YAML:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: container-defaults
  namespace: design-q
spec:
  limits:
  - type: Container
    defaultRequest:
      cpu: 100m
      memory: 64Mi
    default:
      cpu: 200m
      memory: 128Mi
    max:
      cpu: 500m
```

```bash
k apply -f 4.10.yaml
k -n design-q run nores --image=nginx
```

**Verify**
```bash
k -n design-q get pod nores -o jsonpath='{.spec.containers[0].resources}{"\n"}'
```
</details>

---

### 4.11 Init container that must succeed (⏱ 4 min)

In namespace `design-e`, create pod `init-tester` running `nginx`. It needs an init container `wait-for-svc` (`busybox:1.36`) that loops until the DNS name `backend.design-e.svc.cluster.local` resolves. Then create the Service so the pod can start.

<details><summary>Solution</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-tester
  namespace: design-e
  labels:
    app: inittest
spec:
  initContainers:
  - name: wait-for-svc
    image: busybox:1.36
    command: ["sh", "-c", "until nslookup backend.design-e.svc.cluster.local; do echo waiting; sleep 2; done"]
  containers:
  - name: webservice
    image: nginx
```

```bash
k create ns design-e
k apply -f 4.11.yaml
k -n design-e get pod init-tester        # Init:0/1
k -n design-e logs init-tester -c wait-for-svc --tail=2
k -n design-e create service clusterip backend --tcp=80:80
```

**Verify**
```bash
k -n design-e get pod init-tester -w     # PodInitializing -> Running
```
</details>

---

### 4.12 Explore a CRD (⏱ 3 min)

List all CRDs in the cluster. For any CRD (for example `ciliumnetworkpolicies.cilium.io` on a Cilium cluster, or a Calico CRD such as `ippools.crd.projectcalico.org` on minikube), write its **group**, **scope** and **served versions** to `/opt/course/4.12/crd.txt`, and list objects of that kind across all namespaces.

<details><summary>Solution</summary>

```bash
k get crd
C=ippools.crd.projectcalico.org     # pick one that exists (Calico CRD)
mkdir -p /opt/course/4.12
k get crd $C -o jsonpath='{.spec.group}{"\n"}{.spec.scope}{"\n"}{range .spec.versions[?(@.served==true)]}{.name}{" "}{end}{"\n"}' > /opt/course/4.12/crd.txt
k get $(k get crd $C -o jsonpath='{.spec.names.plural}') -A
k explain $(k get crd $C -o jsonpath='{.spec.names.kind}').spec | head
```

**Verify**
```bash
cat /opt/course/4.12/crd.txt
```
</details>

---

Clean up: `k delete ns design-a design-b design-c design-d design-e design-q`
