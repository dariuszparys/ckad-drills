# Chapter 02: Kubernetes Architecture: drills

Curriculum areas: pods, multi-container/sidecar pods, Deployments, namespaces, labels/selectors, Services (NodePort), `kubectl explain`.

Setup once: `alias k=kubectl; export do="--dry-run=client -o yaml"`


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: nothing beyond the profile. `--nodes=2` lets you see pods spread over `ckad` and `ckad-m02` in `-o wide`. Drill 2.3 (NodePort): test with `minikube ssh -- curl -s localhost:30080`.

---

### 2.1 Single-container pod with a port and labels (⏱ 3 min)

In namespace `arch-a` (create it if it doesn't exist), create a pod named `webpod` using image `nginx:1.27`. The container must be named `webcont`, declare `containerPort: 80`, and the pod must carry the labels `type=webserver` and `tier=front`.

<details><summary>Solution</summary>

```bash
k create ns arch-a
k -n arch-a run webpod --image=nginx:1.27 --port=80 --labels=type=webserver,tier=front $do > 2.1.yaml
# rename the container from "webpod" to "webcont": the generator writes "- image:" first,
# so the container's name is the indented line below it (metadata.name stays webpod)
sed -i 's/^    name: webpod$/    name: webcont/' 2.1.yaml   # or edit in vim
k apply -f 2.1.yaml
```

Resulting manifest:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: webpod
  namespace: arch-a
  labels:
    type: webserver
    tier: front
spec:
  containers:
  - name: webcont
    image: nginx:1.27
    ports:
    - containerPort: 80
```

**Verify**
```bash
k -n arch-a get pod webpod --show-labels -o wide
k -n arch-a get pod webpod -o jsonpath='{.spec.containers[0].name}{"\n"}'
```
</details>

---

### 2.2 Expose a pod with a ClusterIP service from YAML (⏱ 4 min)

In namespace `arch-a`, create a Service named `basicsvc` of type ClusterIP that sends TCP port `8080` to port `80` of all pods labelled `type=webserver`. Then test it from a temporary pod.

<details><summary>Solution</summary>

`kubectl expose` copies **all** pod labels into the selector, so with two labels on `webpod` it would select `type=webserver,tier=front`. That still works here, but the task asks for exactly `type=webserver`, so use `create service` and fix the selector, or write YAML:

```bash
k -n arch-a create service clusterip basicsvc --tcp=8080:80 $do > 2.2.yaml
# change selector "app: basicsvc" to "type: webserver"
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: basicsvc
  namespace: arch-a
spec:
  type: ClusterIP
  selector:
    type: webserver
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 80
```

**Verify**
```bash
k -n arch-a get endpointslices -l kubernetes.io/service-name=basicsvc
k -n arch-a run tmp --rm -it --restart=Never --image=busybox -- wget -qO- basicsvc:8080 | head -4
```
</details>

---

### 2.3 Change the service to NodePort with a fixed port (⏱ 3 min)

Change `basicsvc` in `arch-a` to type NodePort, keeping port 8080, and pin the node port to `30080`.

<details><summary>Solution</summary>

```bash
k -n arch-a patch svc basicsvc -p '{"spec":{"type":"NodePort","ports":[{"port":8080,"targetPort":80,"nodePort":30080,"protocol":"TCP"}]}}'
# or: k -n arch-a edit svc basicsvc   -> type: NodePort, add nodePort: 30080
```

**Verify**
```bash
k -n arch-a get svc basicsvc     # TYPE NodePort, PORT(S) 8080:30080/TCP
minikube ssh -- curl -s localhost:30080 | head -4     # on a cluster with reachable nodes: curl http://<node-ip>:30080
```
</details>

---

### 2.4 Two-container pod (sidecar logger) (⏱ 4 min)

In namespace `arch-b`, create a pod `logpod` with two containers:
- `web` running `nginx`, port 80
- `logger` running `busybox:1.36` with command `sh -c 'while true; do date; sleep 10; done'`

Both must be running (READY `2/2`).

<details><summary>Solution</summary>

```bash
k create ns arch-b
k -n arch-b run logpod --image=nginx --port=80 $do > 2.4.yaml
# rename container to web, then append the second container
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: logpod
  namespace: arch-b
spec:
  containers:
  - name: web
    image: nginx
    ports:
    - containerPort: 80
  - name: logger
    image: busybox:1.36
    command: ["sh", "-c", "while true; do date; sleep 10; done"]
```

**Verify**
```bash
k -n arch-b get pod logpod          # READY 2/2
k -n arch-b logs logpod -c logger --tail=3
```
</details>

---

### 2.5 Native sidecar container (⏱ 5 min)
**Curriculum:** multi-container design. Native sidecars (`restartPolicy: Always` on an init container) are stable since Kubernetes v1.33.

In namespace `arch-b`, create a pod `native-sidecar` where:
- an init container `log-shipper` (`busybox:1.36`) runs for the whole life of the pod as a **native sidecar**, running `sh -c 'tail -F /var/log/app/app.log'`
- the main container `app` (`busybox:1.36`) runs `sh -c 'while true; do echo "$(date) hello" >> /var/log/app/app.log; sleep 5; done'`
- both share an `emptyDir` volume `logs` mounted at `/var/log/app`

<details><summary>Solution</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: native-sidecar
  namespace: arch-b
spec:
  volumes:
  - name: logs
    emptyDir: {}
  initContainers:
  - name: log-shipper
    image: busybox:1.36
    restartPolicy: Always          # this makes it a native sidecar
    command: ["sh", "-c", "tail -F /var/log/app/app.log"]
    volumeMounts:
    - name: logs
      mountPath: /var/log/app
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "while true; do echo \"$(date) hello\" >> /var/log/app/app.log; sleep 5; done"]
    volumeMounts:
    - name: logs
      mountPath: /var/log/app
```

**Verify**
```bash
k -n arch-b get pod native-sidecar        # READY 2/2
k -n arch-b logs native-sidecar -c log-shipper --tail=3
```
</details>

---

### 2.6 Deployment from the command line (⏱ 3 min)

In namespace `arch-c`, create a Deployment `firstdeploy` with image `nginx:1.27`, 3 replicas, and container port 80. Record the name of the ReplicaSet it created into `/tmp/firstdeploy-rs.txt`.

<details><summary>Solution</summary>

```bash
k create ns arch-c
k -n arch-c create deployment firstdeploy --image=nginx:1.27 --replicas=3 --port=80
k -n arch-c get rs -l app=firstdeploy -o jsonpath='{.items[0].metadata.name}' > /tmp/firstdeploy-rs.txt
```

**Verify**
```bash
k -n arch-c get deploy,rs,po -l app=firstdeploy
cat /tmp/firstdeploy-rs.txt
```
</details>

---

### 2.7 Self-healing: delete the ReplicaSet (⏱ 2 min)

Delete the ReplicaSet of `firstdeploy` in `arch-c`. Confirm that the Deployment recreates it. Then delete one pod and confirm the replica count returns to 3.

<details><summary>Solution</summary>

```bash
k -n arch-c delete rs -l app=firstdeploy
k -n arch-c get rs -l app=firstdeploy         # new RS, AGE a few seconds
k -n arch-c delete $(k -n arch-c get po -l app=firstdeploy -o name | head -1)
```

**Verify**
```bash
k -n arch-c get deploy firstdeploy   # READY 3/3
```
</details>

---

### 2.8 Update a pod's image in place (⏱ 3 min)

In namespace `arch-a`, change the image of pod `webpod` (container `webcont`) to `nginx:1.28-alpine` **without deleting the pod**. Confirm the container restarted with the new image.

<details><summary>Solution</summary>

`image` is one of the few mutable pod fields.

```bash
k -n arch-a set image pod/webpod webcont=nginx:1.28-alpine
```

**Verify**
```bash
k -n arch-a get pod webpod -o jsonpath='{.spec.containers[0].image}{"\n"}'
k -n arch-a get pod webpod     # RESTARTS 1
```
</details>

---

### 2.9 Find things fast with `kubectl explain` and `api-resources` (⏱ 3 min)

Write to `/tmp/arch-answers.txt`, one per line:
1. the short name of `persistentvolumeclaims`
2. the API group/version of `CronJob`
3. whether `NetworkPolicy` is namespaced (`true`/`false`)
4. the field type of `pod.spec.containers.securityContext.runAsUser`

<details><summary>Solution</summary>

```bash
k api-resources | grep -E '^persistentvolumeclaims|^cronjobs|^networkpolicies'
k explain pod.spec.containers.securityContext.runAsUser | head -5
cat > /tmp/arch-answers.txt <<'X'
pvc
batch/v1
true
integer
X
```

**Verify**
```bash
cat /tmp/arch-answers.txt
```
</details>

---

### 2.10 Fix a broken pod (⏱ 5 min)

Create this pod in namespace `arch-d`. It doesn't run. Find and fix every problem so the pod reaches `Running` with `1/1` ready.

```yaml
# snippet: broken on purpose
apiVersion: v1
kind: Pod
metadata:
  name: brokenweb
  namespace: arch-d
spec:
  containers:
  - name: web
    image: nginx:1.27-alpne
    ports:
    - containerPort: 80
    command: ["nginx", "-g", "daemon on;"]
```

<details><summary>Solution</summary>

Two problems:
1. Image tag typo `1.27-alpne` → `ErrImagePull`/`ImagePullBackOff` (see `k describe pod`, Events).
2. `daemon on;` makes nginx fork into the background, PID 1 exits, the container completes → `CrashLoopBackOff`. Use `daemon off;` or drop `command` entirely.

```bash
k create ns arch-d
k -n arch-d apply -f brokenweb.yaml
k -n arch-d describe pod brokenweb | tail -10
k -n arch-d delete pod brokenweb --force --grace-period 0
# edit file: image nginx:1.27-alpine, remove command
k -n arch-d apply -f brokenweb.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: brokenweb
  namespace: arch-d
spec:
  containers:
  - name: web
    image: nginx:1.27-alpine
    ports:
    - containerPort: 80
```

**Verify**
```bash
k -n arch-d get pod brokenweb     # 1/1 Running
```
</details>

---

### 2.11 Namespaces and cross-namespace listing (⏱ 2 min)

Write the names of all pods in **all** namespaces whose name starts with `coredns` to `/tmp/coredns-pods.txt` (one per line, names only).

<details><summary>Solution</summary>

```bash
k get pods -A --no-headers -o custom-columns=NAME:.metadata.name | grep '^coredns' > /tmp/coredns-pods.txt
```

**Verify**
```bash
cat /tmp/coredns-pods.txt
```
</details>

---

Clean up: `k delete ns arch-a arch-b arch-c arch-d`
