# Chapter 03: Build: drills

Curriculum areas: define, build and modify container images; probes and health checks; multi-container pod patterns; container logs.

> An image task may be solved with `docker` or `podman`. The commands are the same; the drills show `docker` (what you use on the Mac) with the podman form in comments. If you get podman: it often needs `sudo`, a plain-HTTP registry needs `--tls-verify=false`, and an OCI archive is `podman save --format oci-archive -o <file> <image>`. The curriculum asks you to define, build and modify images, not to write application code, so the drills give you the app script and you write the Dockerfile.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: the drills build with **Docker Desktop on the Mac** (`docker build/tag/save/run`, no sudo). To run a locally built image in minikube without a registry, get it into the cluster with `minikube image load <image>:<tag>` (loads to all nodes) and use `imagePullPolicy: IfNotPresent`. Alternatively build straight into the node with `minikube image build -t <image>:<tag> .` or `eval $(minikube docker-env)`.
> Drill 3.3 (registry): `minikube addons enable registry`, then in a separate terminal `docker run --rm -it --network=host alpine ash -c "apk add socat && socat TCP-LISTEN:5000,reuseaddr,fork TCP:$(minikube ip):5000"` and `export repo=localhost:5000`. Pods pull `localhost:5000/ticker:v1`. On macOS the AirPlay Receiver owns port 5000, so `curl localhost:5000` from the Mac returns 403 (`docker push` still works); check the catalog with `minikube ssh -- curl -s localhost:5000/v2/_catalog`.
> Images in these drills are multi-arch (arm64 OK). Drills 3.6 and 3.9 use `agnhost` as the second container because it is multi-arch.

---

### 3.1 Write a Dockerfile and build an image (⏱ 6 min)

Setup: create the app script (given, like on the exam; you don't need to write Python):

```bash
mkdir -p /opt/course/3.1 && cd /opt/course/3.1
cat > ticker.py <<'PY'
#!/usr/bin/env python3
import socket, time
while True:
    with open("/data/ticks.out", "a") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S") + " " + socket.gethostname() + "\n")
    time.sleep(5)
PY
```

The script appends the date and hostname to `/data/ticks.out` every 5 seconds. In `/opt/course/3.1/`, write a `Dockerfile` based on `docker.io/library/python:3.12-slim` that copies the script to `/app/ticker.py`, creates `/data`, and starts the script with `python /app/ticker.py`. Build it as `ticker:v1`.

<details><summary>Solution</summary>

```bash
cd /opt/course/3.1
cat > Dockerfile <<'DF'
FROM docker.io/library/python:3.12-slim
RUN mkdir -p /data
COPY ticker.py /app/ticker.py
CMD ["python", "/app/ticker.py"]
DF
docker build -t ticker:v1 .             # podman: sudo podman build -t ticker:v1 .
```

**Verify**
```bash
docker images | grep ticker
docker run -d --name t1 ticker:v1 && sleep 11 && docker exec t1 cat /data/ticks.out && docker rm -f t1   # 2-3 lines
```
</details>

---

### 3.2 Save an image as an OCI/tar archive (⏱ 3 min)
**Curriculum:** "Define, build and modify container images"

Export image `ticker:v1` to `/opt/course/3.2/ticker-v1.tar`. Then tag the same image as `ticker:v1.0.1` without rebuilding.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/3.2
docker tag ticker:v1 ticker:v1.0.1
docker save -o /opt/course/3.2/ticker-v1.tar ticker:v1
# podman: sudo podman tag ticker:v1 ticker:v1.0.1; sudo podman save -o /opt/course/3.2/ticker-v1.tar ticker:v1
#         (add --format oci-archive if the task asks for an OCI archive explicitly)
```

**Verify**
```bash
ls -lh /opt/course/3.2/ticker-v1.tar
docker images | grep ticker           # both v1 and v1.0.1, same IMAGE ID
tar tf /opt/course/3.2/ticker-v1.tar | head -3
```
</details>

---

### 3.3 Push to a local registry and deploy from it (⏱ 6 min)

A registry runs at `$repo` (for example `10.97.40.62:5000`, or `localhost:5000` on minikube). Tag `ticker:v1` as `$repo/ticker:v1`, push it, confirm it is listed in the catalog, then create Deployment `ticker` in namespace `build-a` with 3 replicas from that image.

<details><summary>Solution</summary>

```bash
docker tag ticker:v1 $repo/ticker:v1
docker push $repo/ticker:v1               # podman: sudo podman push --tls-verify=false $repo/ticker:v1 (plain-HTTP registry)
curl -s $repo/v2/_catalog                 # {"repositories":["ticker",...]}
# minikube on macOS: minikube ssh -- curl -s localhost:5000/v2/_catalog
k create ns build-a
k -n build-a create deployment ticker --image=$repo/ticker:v1 --replicas=3
```

**Verify**
```bash
k -n build-a get deploy ticker
k -n build-a get po -l app=ticker -o jsonpath='{.items[*].spec.containers[0].image}{"\n"}'
```
</details>

---

### 3.4 Readiness probe with exec (⏱ 4 min)

In namespace `build-b`, create Deployment `try2` (image `busybox:1.36`, 2 replicas, command `sleep 3600`) with a readiness probe that runs `cat /tmp/healthy` every 5 seconds. Pods must show `0/1` until you create the file, then make **all** pods ready.

<details><summary>Solution</summary>

```bash
k create ns build-b
k -n build-b create deployment try2 --image=busybox:1.36 --replicas=2 $do -- sleep 3600 > 3.4.yaml
# add the readinessProbe under the container
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: try2
  namespace: build-b
  labels:
    app: try2
spec:
  replicas: 2
  selector:
    matchLabels:
      app: try2
  template:
    metadata:
      labels:
        app: try2
    spec:
      containers:
      - name: busybox
        image: busybox:1.36
        command: ["sleep", "3600"]
        readinessProbe:
          periodSeconds: 5
          exec:
            command: ["cat", "/tmp/healthy"]
```

```bash
k apply -f 3.4.yaml
for p in $(k -n build-b get po -l app=try2 -o name); do k -n build-b exec $p -- touch /tmp/healthy; done
```

**Verify**
```bash
k -n build-b get po -l app=try2      # 1/1 each after ~5 s
k -n build-b get deploy try2         # READY 2/2
```
</details>

---

### 3.5 HTTP liveness + readiness probes on nginx (⏱ 4 min)

In namespace `build-c`, create a pod `probed-web` (image `nginx:1.27`) with:
- readinessProbe: HTTP GET `/` on port 80, initial delay 3 s, period 5 s
- livenessProbe: HTTP GET `/` on port 80, initial delay 10 s, period 10 s, failureThreshold 3

<details><summary>Solution</summary>

```bash
k create ns build-c
k -n build-c run probed-web --image=nginx:1.27 --port=80 $do > 3.5.yaml   # add probes
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: probed-web
  namespace: build-c
spec:
  containers:
  - name: probed-web
    image: nginx:1.27
    ports:
    - containerPort: 80
    readinessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 3
      periodSeconds: 5
    livenessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 10
      periodSeconds: 10
      failureThreshold: 3
```

**Verify**
```bash
k -n build-c get pod probed-web            # 1/1 Running, RESTARTS 0
k -n build-c describe pod probed-web | grep -E 'Liveness|Readiness'
```
</details>

---

### 3.6 Sidecar proxy with TCP probes (⏱ 6 min)

This drill uses `agnhost netexec` as the proxy container: it is multi-arch, listens on 8080 and runs on an Apple Silicon minikube. (`registry.k8s.io/goproxy:0.1`, often used for this, is **amd64-only**.)

In namespace `build-d`, create Deployment `proxied` with 2 replicas and two containers:
- `app`: `nginx:1.27`, port 80
- `proxy`: `registry.k8s.io/e2e-test-images/agnhost:2.53` with args `netexec --http-port=8080`, port 8080, with readinessProbe tcpSocket 8080 (initial delay 5 s, period 10 s) and livenessProbe tcpSocket 8080 (initial delay 15 s, period 20 s)

<details><summary>Solution</summary>

```bash
k create ns build-d
k -n build-d create deployment proxied --image=nginx:1.27 --port=80 --replicas=2 $do > 3.6.yaml
# rename container, add second container
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proxied
  namespace: build-d
spec:
  replicas: 2
  selector:
    matchLabels:
      app: proxied
  template:
    metadata:
      labels:
        app: proxied
    spec:
      containers:
      - name: app
        image: nginx:1.27
        ports:
        - containerPort: 80
      - name: proxy
        image: registry.k8s.io/e2e-test-images/agnhost:2.53
        args: ["netexec", "--http-port=8080"]
        ports:
        - containerPort: 8080
        readinessProbe:
          tcpSocket:
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          tcpSocket:
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
```

**Verify**
```bash
k -n build-d get po -l app=proxied           # 2/2 Running
k -n build-d describe po -l app=proxied | grep -E 'State|Ready' | head
```
</details>

---

### 3.7 Startup probe for a slow app (⏱ 4 min)
**Curriculum:** probes

In namespace `build-e`, create pod `slowstart` (image `busybox:1.36`, command `sh -c 'sleep 20; touch /tmp/started; sleep 3600'`). Add a startupProbe `cat /tmp/started` with periodSeconds 5 and failureThreshold 12 (up to 60 s), and a livenessProbe `cat /tmp/started` every 10 s. The pod must not be restarted while starting.

<details><summary>Solution</summary>

```bash
k create ns build-e
```

Save as `3.7.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: slowstart
  namespace: build-e
spec:
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "sleep 20; touch /tmp/started; sleep 3600"]
    startupProbe:
      exec:
        command: ["cat", "/tmp/started"]
      periodSeconds: 5
      failureThreshold: 12
    livenessProbe:
      exec:
        command: ["cat", "/tmp/started"]
      periodSeconds: 10
```

```bash
k apply -f 3.7.yaml
```

**Verify**
```bash
k -n build-e get pod slowstart -w     # 0/1 for ~20 s, then 1/1, RESTARTS 0
```
</details>

---

### 3.8 Container logs (⏱ 3 min)

Using `probed-web` in `build-c`: send one request to the pod, then write **only** the log lines containing `GET /` from the last 5 minutes to `/opt/course/3.8/access.log`.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/3.8
k -n build-c run curl --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- $(k -n build-c get pod probed-web -o jsonpath='{.status.podIP}') >/dev/null
k -n build-c logs probed-web --since=5m | grep 'GET /' > /opt/course/3.8/access.log
```

Note: the kubelet's own probes also show up as `GET /` lines with user agent `kube-probe/1.x`.

**Verify**
```bash
cat /opt/course/3.8/access.log
```
</details>

---

### 3.9 Fix a two-container deployment (⏱ 6 min)

Apply this Deployment in `build-f`. Fix it so both containers are running and READY. The web server listens on 80, the proxy on 8080.

```yaml
# snippet: broken on purpose
apiVersion: apps/v1
kind: Deployment
metadata:
  name: review3
  namespace: build-f
spec:
  replicas: 1
  selector:
    matchLabels:
      app: review3
  template:
    metadata:
      labels:
        app: review3
    spec:
      containers:
      - name: web
        image: nginx:1.27
        readinessProbe:
          httpGet:
            path: /healthz
            port: 80
      - name: proxy
        image: registry.k8s.io/e2e-test-images/agnhost:2.53
        args: ["netexec", "--http-port=8080"]
        livenessProbe:
          tcpSocket:
            port: 9090
```

<details><summary>Solution</summary>

Two probe bugs. `web`'s readiness asks nginx for `/healthz`, which the default nginx config answers with 404, so `web` is never ready. `proxy`'s liveness opens TCP 9090, where nothing listens, so the kubelet kills and restarts `proxy` over and over. Both containers share the pod network namespace and the kubelet probes `podIP:port`, so a probe aimed at the *other* container's port (80 or 8080) would still pass. The bug is the wrong path and port, not which container owns them. Fix: readiness `/` on 80, liveness tcpSocket 8080.

```bash
k create ns build-f
k apply -f review3.yaml      # the manifest above, saved as review3.yaml
k -n build-f get po -l app=review3 -w     # READY 1/2 (web never ready), RESTARTS climbing (proxy)
k -n build-f describe po -l app=review3 | grep -E 'Readiness|Liveness|Unhealthy'
k -n build-f edit deploy review3
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: review3
  namespace: build-f
spec:
  replicas: 1
  selector:
    matchLabels:
      app: review3
  template:
    metadata:
      labels:
        app: review3
    spec:
      containers:
      - name: web
        image: nginx:1.27
        ports:
        - containerPort: 80
        readinessProbe:
          httpGet:
            path: /
            port: 80
      - name: proxy
        image: registry.k8s.io/e2e-test-images/agnhost:2.53
        args: ["netexec", "--http-port=8080"]
        ports:
        - containerPort: 8080
        livenessProbe:
          tcpSocket:
            port: 8080
```

**Verify**
```bash
k -n build-f get po -l app=review3      # new pod 2/2 Running, RESTARTS stay 0
k -n build-f get po -l app=review3 -o jsonpath='{range .items[*].status.containerStatuses[*]}{.name} ready={.ready} restarts={.restartCount}{"\n"}{end}'
```
</details>

---

### 3.10 Scale to zero and back (⏱ 2 min)

Scale `ticker` in `build-a` to 0, confirm no pods remain, then scale it to 4.

<details><summary>Solution</summary>

```bash
k -n build-a scale deploy ticker --replicas=0
k -n build-a get po -l app=ticker          # Terminating for up to ~30 s (python as PID 1 ignores SIGTERM), then No resources found
k -n build-a scale deploy ticker --replicas=4
```

**Verify**
```bash
k -n build-a get deploy ticker             # 4/4
```
</details>

---

Clean up: `k delete ns build-a build-b build-c build-d build-e build-f`
