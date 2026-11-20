# Chapter 08: Application Troubleshooting: drills

Curriculum areas: debugging in Kubernetes, logs, events, API deprecations, probes, monitoring (`kubectl top`), service/endpoint troubleshooting.

Every drill starts with a setup block that creates the broken state. Run it, start the timer, then fix it.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: `minikube addons enable metrics-server` for 8.8 (wait about 60 s for data). Node-level checks: `minikube ssh -- sudo iptables-save | grep <svc>` and `k -n kube-system logs -l k8s-app=kube-proxy`. Ephemeral containers (8.6, 8.7) work on minikube's containerd runtime, including `--target` process-namespace sharing (tested on v1.37). Drill 8.1's 64-CPU request stays Pending on any laptop, as intended.

---

### 8.1 Pod stuck in Pending (⏱ 4 min)

Setup: create the namespace (8.3 and 8.9 reuse it), save the manifest below as `setup-8.1.yaml` and apply it:

```bash
k create ns debug-a --dry-run=client -o yaml | k apply -f -
k apply -f setup-8.1.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hungry
  namespace: debug-a
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        cpu: "64"
        memory: 1Gi
```

Find out why `hungry` doesn't start, write the scheduler's reason (the event reason) to `/opt/course/8.1/reason.txt`, and fix it so the pod runs (request `100m` CPU).

<details><summary>Solution</summary>

```bash
k -n debug-a describe pod hungry | grep -A5 Events     # FailedScheduling ... Insufficient cpu
mkdir -p /opt/course/8.1
k -n debug-a get events --field-selector involvedObject.name=hungry -o jsonpath='{.items[*].reason}' > /opt/course/8.1/reason.txt
k -n debug-a get pod hungry -o yaml > 8.1.yaml && sed -i 's/cpu: "64"/cpu: 100m/' 8.1.yaml
k replace --force -f 8.1.yaml
```

**Verify**
```bash
cat /opt/course/8.1/reason.txt     # FailedScheduling
k -n debug-a get pod hungry        # Running
```
</details>

---

### 8.2 ImagePullBackOff (⏱ 3 min)

Setup: `k create ns debug-b; k -n debug-b create deployment shop --image=nginx:1.27-alpne --replicas=2`

The deployment never becomes ready. Fix it with one imperative command.

<details><summary>Solution</summary>

```bash
k -n debug-b get po                                   # ErrImagePull / ImagePullBackOff
k -n debug-b describe po -l app=shop --show-events=true | grep -i -A2 'failed'   # describe with -l hides events for multiple pods unless --show-events=true
k -n debug-b set image deploy/shop nginx=nginx:1.27-alpine
```

**Verify**
```bash
k -n debug-b rollout status deploy/shop
```
</details>

---

### 8.3 CrashLoopBackOff: read the previous container's logs (⏱ 4 min)
**Curriculum:** utilize container logs

Setup: create the namespace if it doesn't exist yet (8.1 uses it too), save the manifest below as `setup-8.3.yaml` and apply it:

```bash
k create ns debug-a --dry-run=client -o yaml | k apply -f -
k apply -f setup-8.3.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: crasher
  namespace: debug-a
spec:
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "echo starting; echo 'FATAL: missing env DB_HOST' >&2; exit 3"]
```

Write the error message from the **previous** container instance to `/opt/course/8.3/error.txt` and the container's last exit code to `/opt/course/8.3/exit.txt`.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/8.3
k -n debug-a get pod crasher                  # STATUS alternates between Error and CrashLoopBackOff
k -n debug-a logs crasher --previous | grep FATAL > /opt/course/8.3/error.txt   # works while STATUS is CrashLoopBackOff (a new instance is waiting)
# while STATUS is Error, --previous fails ("unable to retrieve container logs"): the finished instance is still the current one
# k -n debug-a logs crasher | grep FATAL > /opt/course/8.3/error.txt
k -n debug-a get pod crasher -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}' > /opt/course/8.3/exit.txt
```

**Verify**
```bash
cat /opt/course/8.3/error.txt /opt/course/8.3/exit.txt     # FATAL ... / 3
```
</details>

---

### 8.4 Service with no endpoints (⏱ 5 min)

Setup: create the namespace (8.10 reuses it), save the manifest below as `setup-8.4.yaml` and apply it:

```bash
k create ns debug-c --dry-run=client -o yaml | k apply -f -
k apply -f setup-8.4.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: debug-c
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        tier: backend
    spec:
      containers:
      - name: app
        image: nginx
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: debug-c
spec:
  selector:
    app: api-server
  ports:
  - port: 8080
    targetPort: 8080
```

`wget api.debug-c:8080` from another pod fails. Fix the **Service only**.

<details><summary>Solution</summary>

Two bugs: the selector (`api-server` vs `api`) and the targetPort (nginx listens on 80, not 8080).

```bash
k -n debug-c get endpointslices -l kubernetes.io/service-name=api   # ENDPOINTS <unset>
k -n debug-c get po --show-labels
k -n debug-c patch svc api --type=json -p='[{"op":"replace","path":"/spec/selector","value":{"app":"api"}},{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'
```

**Verify**
```bash
k -n debug-c get endpointslices -l kubernetes.io/service-name=api   # two IPs, port 80
k -n debug-c run t --rm -it --restart=Never --image=busybox:1.36 -- sh -c 'wget -T 3 -qO- api:8080 | head -3'   # head inside the pod, so --rm still cleans up
```
</details>

---

### 8.5 Fix a manifest that uses removed APIs (⏱ 5 min)

Create the namespace first (`k create ns debug-d`), then save this file and apply it with `k apply -f`. It fails. Update it for the current API and make the pod run.

```yaml
# snippet: broken on purpose (old API)
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: legacy
  namespace: debug-d
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: legacy
    spec:
      containers:
      - name: web
        image: nginx
```

<details><summary>Solution</summary>

`extensions/v1beta1` Deployments were removed in v1.16. `apps/v1` also **requires** `spec.selector`, which must match the template labels. A quick way to see the current shape is to generate a fresh object and compare:

```bash
k -n debug-d create deployment legacy --image=nginx $do     # compare structure
k explain deployment.spec.selector
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legacy
  namespace: debug-d
spec:
  replicas: 1
  selector:
    matchLabels:
      app: legacy
  template:
    metadata:
      labels:
        app: legacy
    spec:
      containers:
      - name: web
        image: nginx
```

Other removals to know: `networking.k8s.io/v1beta1` Ingress (removed v1.22, use `networking.k8s.io/v1` with `pathType` and `service.name/port.number`), `batch/v1beta1` CronJob (removed v1.25, use `batch/v1`), `policy/v1beta1` PodDisruptionBudget (removed v1.25).

**Verify**
```bash
k -n debug-d get deploy legacy       # 1/1
k api-versions | grep -E '^apps/|^batch/|^networking'
```
</details>

---

### 8.6 Debug a distroless pod with an ephemeral container (⏱ 5 min)

Setup: `k create ns debug-e --dry-run=client -o yaml | k apply -f -; k -n debug-e run distroless --image=registry.k8s.io/pause:3.10`

The image has no shell (`k exec ... -- sh` fails). Attach an ephemeral `busybox:1.36` container that shares the process namespace of container `distroless`, and write the list of processes it sees to `/opt/course/8.6/ps.txt`.

<details><summary>Solution</summary>

```bash
k -n debug-e exec distroless -- sh           # exec: "sh": executable file not found in $PATH
mkdir -p /opt/course/8.6
k -n debug-e debug distroless -it --image=busybox:1.36 --target=distroless -- sh
#   / # ps aux                                 # shows /pause as PID 1
#   / # ls /proc/1/root/                       # target's filesystem (you can write files there via /proc/1/root)
k -n debug-e debug distroless --image=busybox:1.36 --target=distroless -- ps aux    # non-interactive variant
sleep 3                                       # let the ephemeral container start before reading its logs
k -n debug-e logs distroless -c $(k -n debug-e get pod distroless -o jsonpath='{.spec.ephemeralContainers[-1].name}') > /opt/course/8.6/ps.txt
```

**Verify**
```bash
cat /opt/course/8.6/ps.txt                     # contains /pause
k -n debug-e get pod distroless -o jsonpath='{.spec.ephemeralContainers[*].name}{"\n"}'
```
</details>

---

### 8.7 Readiness probe keeps a pod out of the Service (⏱ 5 min)

Setup: create the namespace if it doesn't exist yet (8.6 uses it too), save the manifest below as `setup-8.7.yaml` and apply it:

```bash
k create ns debug-e --dry-run=client -o yaml | k apply -f -
k apply -f setup-8.7.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-debug-pod
  namespace: debug-e
  labels:
    app: nginx-debug
spec:
  containers:
  - name: nginx
    image: nginx
    readinessProbe:
      exec:
        command: ["cat", "/tmp/ready"]
      periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-debug-svc
  namespace: debug-e
spec:
  selector:
    app: nginx-debug
  ports:
  - port: 80
```

The service has no endpoints although the labels match. Make it serve traffic **without** recreating the pod.

<details><summary>Solution</summary>

```bash
k -n debug-e get pod nginx-debug-pod              # 0/1 Running
k -n debug-e describe pod nginx-debug-pod | grep -A3 Readiness   # cat: /tmp/ready: No such file
k -n debug-e exec nginx-debug-pod -- touch /tmp/ready
# if the image had no shell/touch, use an ephemeral container as in drill 8.6:
# k -n debug-e debug nginx-debug-pod -it --image=busybox:1.36 --target=nginx -- touch /proc/1/root/tmp/ready
```

**Verify**
```bash
k -n debug-e describe svc nginx-debug-svc | grep Endpoints     # empty before the fix, <pod-ip>:80 after ~5 s
# EndpointSlices also list not-ready pods; check readiness with:
k -n debug-e get endpointslices -l kubernetes.io/service-name=nginx-debug-svc -o jsonpath='{.items[*].endpoints[*].conditions.ready}{"\n"}'   # false -> true
```
</details>

---

### 8.8 Find the pod using the most memory (⏱ 3 min)
**Curriculum:** "Use built-in CLI tools to monitor Kubernetes applications" (needs metrics-server; `minikube addons enable metrics-server`)

Write the name of the pod using the most memory in **all** namespaces to `/opt/course/8.8/top.txt`, formatted `<namespace>/<pod>`.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/8.8
k top pod -A --sort-by=memory --no-headers | head -1 | awk '{print $1"/"$2}' > /opt/course/8.8/top.txt
k top node
```

**Verify**
```bash
cat /opt/course/8.8/top.txt
```
</details>

---

### 8.9 Events, sorted (⏱ 2 min)

Write all **Warning** events from namespace `debug-a`, sorted by time (newest last), to `/opt/course/8.9/warnings.txt`.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/8.9
k events -n debug-a --types=Warning > /opt/course/8.9/warnings.txt     # k events orders by time, newest last
# alternative: k -n debug-a get events --field-selector type=Warning --sort-by=.metadata.creationTimestamp
# avoid --sort-by=.lastTimestamp: events written through events.k8s.io/v1 may leave it null and then sort out of order
```

**Verify**
```bash
cat /opt/course/8.9/warnings.txt
```
</details>

---

### 8.10 DNS and connectivity tests from inside a pod (⏱ 4 min)

Uses the `api` Service from 8.4 (run its setup and fix first). From a temporary `busybox:1.36` pod in `debug-c`: (1) resolve `api.debug-c.svc.cluster.local`, (2) resolve `kubernetes.default.svc.cluster.local`, (3) test TCP to the `api` service's ClusterIP on port 8080 with `nc`. If name resolution fails but the IP works, what do you check next?

<details><summary>Solution</summary>

```bash
k -n debug-c run net --rm -it --restart=Never --image=busybox:1.36 -- sh -c '
  cat /etc/resolv.conf     # search debug-c.svc.cluster.local ... nameserver 10.96.0.10
  nslookup api.debug-c.svc.cluster.local
  nslookup kubernetes.default.svc.cluster.local     # busybox nslookup skips the search list for names with a dot
  nc -zv -w 3 $(nslookup api.debug-c.svc.cluster.local | awk "/Address/ {a=\$2} END {print a}") 8080'
```

If the IP works but names fail: check the `/etc/resolv.conf` inside the pod, CoreDNS pods (`k -n kube-system get po -l k8s-app=kube-dns`) and their logs, and whether a NetworkPolicy blocks egress to port 53 (see 6.10).

**Verify**
Output shows `Address: 10.x.x.x` for both names and `open` from nc.
</details>

---

### 8.11 Liveness probe kills a healthy app (⏱ 5 min)

Setup: create the namespace, save the manifest below as `setup-8.11.yaml` and apply it:

```bash
k create ns debug-f
k apply -f setup-8.11.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: igottrouble
  namespace: debug-f
spec:
  replicas: 1
  selector:
    matchLabels:
      app: igottrouble
  template:
    metadata:
      labels:
        app: igottrouble
    spec:
      containers:
      - name: web
        image: nginx
        livenessProbe:
          httpGet:
            path: /healthz
            port: 80
          initialDelaySeconds: 2
          periodSeconds: 3
          failureThreshold: 1
```

The pod restarts every few seconds. Find the cause from events and fix it so the probe still checks HTTP on port 80.

<details><summary>Solution</summary>

nginx has no `/healthz`, so it returns 404 and the probe fails. With `failureThreshold: 1` the container restarts at once.

```bash
k -n debug-f describe po -l app=igottrouble --show-events=true | grep -E 'Liveness|Unhealthy|Killing'
k -n debug-f patch deploy igottrouble --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/path","value":"/"},{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/failureThreshold","value":3}]'
```

**Verify**
```bash
k -n debug-f get po -l app=igottrouble -w     # new pod, RESTARTS stays 0
```
</details>

---

Clean up: `k delete ns debug-a debug-b debug-c debug-d debug-e debug-f`
