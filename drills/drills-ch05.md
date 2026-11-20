# Chapter 05: Deployment Configuration: drills

Curriculum areas: ConfigMaps, Secrets, PersistentVolumes/PVCs, Deployments, rolling updates/rollback, Kustomize.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: minikube ships a default StorageClass `standard` (hostPath provisioner), so PVCs without `storageClassName` bind automatically (drills 5.11, 5.12). There's no NFS server, so the drills use hostPath and dynamic PVCs. Multi-node caveat: hostPath data lives on **one node**. For 5.9/5.10, create the dir with `minikube ssh -- sudo mkdir -p /tmp/weblog` and pin the pod to that node (`nodeName: ckad`), or the pod may land on `ckad-m02` with an empty dir. Kustomize (5.12) is built into kubectl.

---

### 5.1 ConfigMap from literal, file and directory (⏱ 4 min)

In namespace `cfg-a`, create a ConfigMap `shades` from **three sources at once**:
- literal `text=grey`
- file `./favorite` (content `teal`), stored under the key `favorite`
- every file in directory `./tones/` (files `light` = `l`, `dark` = `d`)

<details><summary>Solution</summary>

```bash
k create ns cfg-a
mkdir -p tones && echo l > tones/light && echo d > tones/dark && echo teal > favorite
k -n cfg-a create configmap shades --from-literal=text=grey --from-file=./favorite --from-file=./tones/
```

**Verify**
```bash
k -n cfg-a get cm shades -o yaml       # keys: text, favorite, light, dark
```
</details>

---

### 5.2 Single key as env var, all keys via envFrom (⏱ 5 min)

In `cfg-a`, create Deployment `colorapp` (image `busybox:1.36`, command `sleep 3600`) where the container gets:
- env var `ILIKE` from key `favorite` of ConfigMap `shades`
- every key of ConfigMap `shades` as env vars (envFrom)

<details><summary>Solution</summary>

```bash
k -n cfg-a create deployment colorapp --image=busybox:1.36 $do -- sleep 3600 > 5.2.yaml
# shortcut for the envFrom part (works on an existing deployment):
#   k -n cfg-a set env deploy/colorapp --from=configmap/shades   (note: this copies keys as UPPERCASE env vars, unlike envFrom)
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: colorapp
  namespace: cfg-a
spec:
  replicas: 1
  selector:
    matchLabels:
      app: colorapp
  template:
    metadata:
      labels:
        app: colorapp
    spec:
      containers:
      - name: busybox
        image: busybox:1.36
        command: ["sleep", "3600"]
        env:
        - name: ILIKE
          valueFrom:
            configMapKeyRef:
              name: shades
              key: favorite
        envFrom:
        - configMapRef:
            name: shades
```

**Verify**
```bash
k -n cfg-a exec deploy/colorapp -- env | grep -E 'ILIKE|text|favorite|light|dark'
```
</details>

---

### 5.3 ConfigMap from a manifest, mounted as a volume (⏱ 5 min)

In `cfg-a`, create ConfigMap `fast-bike` from YAML with keys `bike.make=Ducati`, `bike.model=Panigale`, `bike.trim=V4S`. Mount it into pod `bikepod` (`busybox:1.36`, `sleep 3600`) at `/etc/bike`, read-only.

<details><summary>Solution</summary>

```bash
k create ns cfg-a      # skip if it exists from 5.1
k -n cfg-a create cm fast-bike --from-literal=bike.make=Ducati --from-literal=bike.model=Panigale --from-literal=bike.trim=V4S $do > 5.3-cm.yaml
k -n cfg-a run bikepod --image=busybox:1.36 $do -- sleep 3600 > 5.3-pod.yaml   # add volume
```

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fast-bike
  namespace: cfg-a
data:
  bike.make: Ducati
  bike.model: Panigale
  bike.trim: V4S
---
apiVersion: v1
kind: Pod
metadata:
  name: bikepod
  namespace: cfg-a
spec:
  containers:
  - name: bikepod
    image: busybox:1.36
    command: ["sleep", "3600"]
    volumeMounts:
    - name: bike-vol
      mountPath: /etc/bike
      readOnly: true
  volumes:
  - name: bike-vol
    configMap:
      name: fast-bike
```

```bash
k apply -f 5.3-cm.yaml -f 5.3-pod.yaml
```

**Verify**
```bash
k -n cfg-a exec bikepod -- cat /etc/bike/bike.trim      # V4S
```
</details>

---

### 5.4 Secret mounted as a volume (⏱ 4 min)

In namespace `cfg-b`, create a Secret `specialofday` with key `entree=schnitzel`. Create Deployment `foodie` (`nginx`) that mounts the Secret under `/food/`. Verify the file content from inside a pod.

<details><summary>Solution</summary>

```bash
k create ns cfg-b
k -n cfg-b create secret generic specialofday --from-literal=entree=schnitzel
k -n cfg-b create deployment foodie --image=nginx $do > 5.4.yaml    # add volume + mount
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foodie
  namespace: cfg-b
spec:
  replicas: 1
  selector:
    matchLabels:
      app: foodie
  template:
    metadata:
      labels:
        app: foodie
    spec:
      containers:
      - name: nginx
        image: nginx
        volumeMounts:
        - name: special
          mountPath: /food
          readOnly: true
      volumes:
      - name: special
        secret:
          secretName: specialofday
```

```bash
k apply -f 5.4.yaml
```

**Verify**
```bash
k -n cfg-b exec deploy/foodie -- cat /food/entree      # schnitzel
k -n cfg-b get secret specialofday -o jsonpath='{.data.entree}' | base64 -d; echo
```
</details>

---

### 5.5 Update an image, check history, roll back (⏱ 5 min)

In `cfg-b`, update `foodie` to image `nginx:1.28-alpine`, recording the change cause `"bump to 1.28-alpine"`. Check the rollout history, then roll back to the previous revision and confirm the image.

<details><summary>Solution</summary>

`--record` is deprecated; set the `kubernetes.io/change-cause` annotation instead.

```bash
k -n cfg-b set image deploy/foodie nginx=nginx:1.28-alpine
k -n cfg-b annotate deploy/foodie kubernetes.io/change-cause="bump to 1.28-alpine" --overwrite
k -n cfg-b rollout status deploy/foodie
k -n cfg-b rollout history deploy/foodie
k -n cfg-b rollout history deploy/foodie --revision=2      # shows the template of rev 2
k -n cfg-b rollout undo deploy/foodie                      # or --to-revision=1
```

**Verify**
```bash
k -n cfg-b get deploy foodie -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'   # nginx
k -n cfg-b rollout history deploy/foodie   # revisions 2 and 3: the undo re-used rev 1's template as rev 3, so rev 1 is gone
```
</details>

---

### 5.6 Rolling update strategy (⏱ 4 min)
**Curriculum:** rolling updates

In namespace `cfg-c`, create Deployment `roller` (`nginx:1.27`, 6 replicas) whose updates never drop below 6 available pods and add at most 2 extra pods at a time. Pods are only available after 5 s of readiness. Then update to `nginx:1.28` and watch the rollout.

<details><summary>Solution</summary>

```bash
k create ns cfg-c
k -n cfg-c create deployment roller --image=nginx:1.27 --replicas=6 $do > 5.6.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: roller
  namespace: cfg-c
spec:
  replicas: 6
  minReadySeconds: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 2
  selector:
    matchLabels:
      app: roller
  template:
    metadata:
      labels:
        app: roller
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
```

```bash
k apply -f 5.6.yaml
k -n cfg-c set image deploy/roller nginx=nginx:1.28
k -n cfg-c rollout status deploy/roller
```

**Verify**
```bash
k -n cfg-c get deploy roller -o jsonpath='{.spec.strategy}{"\n"}'
k -n cfg-c get rs -l app=roller        # old RS 0, new RS 6
```
</details>

---

### 5.7 Pause, batch changes, resume (⏱ 4 min)
**Curriculum:** rolling updates

In `cfg-c`, pause `roller`, then change its image to `nginx:1.28-alpine` **and** set env `MODE=prod`, then resume so that only **one** new revision is created.

<details><summary>Solution</summary>

```bash
k -n cfg-c rollout pause deploy/roller
k -n cfg-c set image deploy/roller nginx=nginx:1.28-alpine
k -n cfg-c set env deploy/roller MODE=prod
k -n cfg-c rollout resume deploy/roller
k -n cfg-c rollout status deploy/roller
```

**Verify**
```bash
k -n cfg-c rollout history deploy/roller     # one new revision only
```
</details>

---

### 5.8 Recreate strategy (⏱ 2 min)
**Curriculum:** deployment strategies

Change `roller` in `cfg-c` so that on updates all old pods are killed before new ones start.

<details><summary>Solution</summary>

`rollingUpdate` must be removed when switching to `Recreate`, otherwise the API rejects it:

```bash
k -n cfg-c patch deploy roller --type=json -p='[{"op":"remove","path":"/spec/strategy/rollingUpdate"},{"op":"replace","path":"/spec/strategy/type","value":"Recreate"}]'
```

**Verify**
```bash
k -n cfg-c get deploy roller -o jsonpath='{.spec.strategy.type}{"\n"}'   # Recreate
```
</details>

---

### 5.9 hostPath PV + PVC with a storage class name (⏱ 6 min)

Create a PersistentVolume `weblog-pv` (100Mi, ReadWriteOnce, storageClassName `manual`, hostPath `/tmp/weblog`, reclaim policy Retain). In namespace `cfg-d`, create a PVC `weblog-pvc` that binds to it (request 50Mi).

<details><summary>Solution</summary>

No generator for PV/PVC; copy from the docs page "Configure a Pod to Use a PersistentVolume for Storage".

```bash
k create ns cfg-d
minikube ssh -- sudo mkdir -p /tmp/weblog     # hostPath dir on node ckad
```

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: weblog-pv
spec:
  storageClassName: manual
  capacity:
    storage: 100Mi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/weblog
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: weblog-pvc
  namespace: cfg-d
spec:
  storageClassName: manual
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 50Mi
```

```bash
k apply -f 5.9.yaml      # YAML above saved as 5.9.yaml (PV + PVC)
```

**Verify**
```bash
k get pv weblog-pv                  # STATUS Bound, CLAIM cfg-d/weblog-pvc
k -n cfg-d get pvc weblog-pvc       # Bound, CAPACITY 100Mi (the whole PV)
```
</details>

---

### 5.10 Shared PVC between two containers (⏱ 6 min)

In `cfg-d`, create pod `basicpod` with:
- container `webcont` (`nginx`) writing its logs to `/var/log/nginx`
- container `tailer` (`busybox:1.36`) running `tail -F /var/log/nginx/access.log`, with the same volume mounted at `/var/log/nginx`
- the volume is PVC `weblog-pvc`

<details><summary>Solution</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: basicpod
  namespace: cfg-d
  labels:
    type: webserver
spec:
  nodeName: ckad      # hostPath PV data lives on this node
  volumes:
  - name: weblog
    persistentVolumeClaim:
      claimName: weblog-pvc
  containers:
  - name: webcont
    image: nginx
    ports:
    - containerPort: 80
    volumeMounts:
    - name: weblog
      mountPath: /var/log/nginx
  - name: tailer
    image: busybox:1.36
    command: ["tail", "-F", "/var/log/nginx/access.log"]
    volumeMounts:
    - name: weblog
      mountPath: /var/log/nginx
```

```bash
k apply -f 5.10.yaml      # YAML above saved as 5.10.yaml
```

Note: the official nginx image symlinks `access.log` to stdout. Mounting a volume over `/var/log/nginx` hides that symlink, so nginx writes a real file (that's what this drill relies on).

**Verify**
```bash
k -n cfg-d exec basicpod -c tailer -- wget -qO- localhost >/dev/null
k -n cfg-d logs basicpod -c tailer --tail=2      # GET / line
```
</details>

---

### 5.11 PVC mounted into an existing Deployment (⏱ 5 min)

In `cfg-b`, create PVC `reviewpvc` (ReadWriteOnce, 200Mi, default StorageClass). Edit Deployment `foodie` so the PVC is mounted at `/newvol` in the `nginx` container, keeping the existing secret mount.

<details><summary>Solution</summary>

On minikube the default StorageClass `standard` provisions the volume dynamically, so no PV is needed. On a cluster without a default StorageClass you would create a matching PV first.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: reviewpvc
  namespace: cfg-b
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 200Mi
```

```bash
k apply -f 5.11-pvc.yaml
k -n cfg-b edit deploy foodie      # plain kubectl has no 'set volume' (that's OpenShift's oc)
```

Add:

```yaml
# snippet: append to the existing volumeMounts list of the nginx container
        - name: newvol
          mountPath: /newvol
# snippet: append to the existing spec.template.spec.volumes list
      - name: newvol
        persistentVolumeClaim:
          claimName: reviewpvc
```

**Verify**
```bash
k -n cfg-b exec deploy/foodie -- df -h /newvol
k -n cfg-b get pvc reviewpvc        # Bound
```
</details>

---

### 5.12 Kustomize: overlay with namespace, prefix and image tag (⏱ 6 min)
**Curriculum:** "Use Kustomize to deploy applications"

Directory `/opt/course/5.12/base` contains `deployment.yaml` (Deployment `api`, image `nginx:1.27`) and `kustomization.yaml`. Create an overlay in `/opt/course/5.12/prod` that:
- deploys into namespace `cfg-prod`
- prefixes all names with `prod-`
- sets the image to `nginx:1.28`
- sets replicas to 3
- generates a ConfigMap `api-config` with `LOG_LEVEL=warn`

Apply it.

<details><summary>Solution</summary>

```bash
mkdir -p /opt/course/5.12/{base,prod} && cd /opt/course/5.12
k create deployment api --image=nginx:1.27 $do > base/deployment.yaml
```

```yaml
# kustomize: base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
```

```yaml
# kustomize: prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: cfg-prod
namePrefix: prod-
resources:
- ../base
images:
- name: nginx
  newTag: "1.28"
replicas:
- name: api
  count: 3
configMapGenerator:
- name: api-config
  literals:
  - LOG_LEVEL=warn
```

```bash
k create ns cfg-prod
k kustomize prod/            # preview
k apply -k prod/
```

**Verify**
```bash
k -n cfg-prod get deploy,cm     # prod-api (3/3), prod-api-config-<hash>
k -n cfg-prod get deploy prod-api -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```
</details>

---

Clean up: `k delete ns cfg-a cfg-b cfg-c cfg-d cfg-prod; k delete pv weblog-pv`
