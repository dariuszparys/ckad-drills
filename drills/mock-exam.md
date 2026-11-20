# CKAD mock exam (2 hours, 16 tasks, 100 points)

Covers the five domains of the official CKAD curriculum with the same weights. Solutions are in `mock-exam-solutions.md`. Don't open it until the timer has run out.

**Rules**
- 120 minutes. Pass mark: **66 points**.
- Only kubernetes.io/docs, kubernetes.io/blog and helm.sh/docs in the browser (see `../cheatsheet.md`).
- Every task names its namespace. Create the namespace if it doesn't exist.
- Files you're asked to write go under `/opt/course/exam/<task>/`.
- Partial credit counts: score each check box in the scoring sheet separately.
- Triage: skip anything that takes more than ~8 minutes and come back later. Flag it in the table below.

**Practice cluster (minikube, Apple Silicon):** `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g`, then `minikube addons enable ingress metrics-server` (one addon per command on older minikube versions). Task 4 uses Docker Desktop on the Mac (`docker build/save`). Task 15 only scores honestly with Calico. Task 16's curl goes through `minikube tunnel` on `127.0.0.1`. See `../minikube.md`.

**Setup (run once before you start the timer)**
```bash
alias k=kubectl; export do="--dry-run=client -o yaml"   # bash, like the exam; in zsh $do isn't split (use bash --rcfile ckad-env.sh)
for n in mock-1 mock-2 mock-3 mock-5 mock-6 mock-7 mock-8 mock-9 mock-10 mock-11 mock-12 mock-13 mock-14 mock-15 mock-16; do k create ns $n; done
sudo mkdir -p /opt/course/exam && sudo chown $USER /opt/course/exam
mkdir -p /opt/course/exam/{2,4,5,7,10,13,16}     # task directories the answers write into
# Task 9 broken file:
mkdir -p /opt/course/exam/9 && cat > /opt/course/exam/9/broken.yaml <<'X'
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: legacy-api
  namespace: mock-9
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: legacy-api
    spec:
      containers:
      - name: api
        image: nginx:1.27
        ports:
        - containerPort: 80
X
# Task 10 setup:
k -n mock-10 create deployment orders --image=nginx:1.27 --port=80
k -n mock-10 create service clusterip orders --tcp=80:8080
k -n mock-10 run noisy --image=busybox:1.36 -- sh -c 'i=0; while true; do i=$((i+1)); echo "line $i"; [ $((i%5)) -eq 0 ] && echo "ERROR code=$i"; sleep 1; done'
# Task 16 setup:
k -n mock-16 create deployment shop --image=nginx:1.27 --replicas=2 --port=80
k -n mock-16 create deployment shop-api --image=httpd:2.4 --port=80
```

| # | Domain | Points | Suggested time | Done | Flagged |
|---|---|---|---|---|---|
| 1 | Design & Build | 5 | 6 min | [ ] | [ ] |
| 2 | Design & Build | 5 | 6 min | [ ] | [ ] |
| 3 | Design & Build | 4 | 5 min | [ ] | [ ] |
| 4 | Design & Build | 6 | 8 min | [ ] | [ ] |
| 5 | Deployment | 7 | 7 min | [ ] | [ ] |
| 6 | Deployment | 6 | 7 min | [ ] | [ ] |
| 7 | Deployment | 7 | 8 min | [ ] | [ ] |
| 8 | Observability & Maintenance | 6 | 7 min | [ ] | [ ] |
| 9 | Observability & Maintenance | 5 | 6 min | [ ] | [ ] |
| 10 | Observability & Maintenance | 4 | 6 min | [ ] | [ ] |
| 11 | Environment, Config & Security | 7 | 8 min | [ ] | [ ] |
| 12 | Environment, Config & Security | 6 | 7 min | [ ] | [ ] |
| 13 | Environment, Config & Security | 6 | 7 min | [ ] | [ ] |
| 14 | Environment, Config & Security | 6 | 7 min | [ ] | [ ] |
| 15 | Services & Networking | 8 | 9 min | [ ] | [ ] |
| 16 | Services & Networking | 12 | 10 min | [ ] | [ ] |
| | **Total** | **100** | **114 min** | | |

Domain weights match the CKAD curriculum: Design & Build 20, Deployment 20, Observability & Maintenance 15, Environment/Config/Security 25, Services & Networking 20.

---

## Task 1 (5 points): multi-container pod with a shared volume
Namespace `mock-1`. Create a pod `web-logger`:
- container `web`: image `nginx:1.27`, port 80, mounts volume `logs` at `/var/log/nginx`
- container `shipper`: image `busybox:1.36`, command `tail -F /logs/access.log`, mounts the same volume at `/logs` **read-only**
- volume `logs` is an `emptyDir` limited to `50Mi`

## Task 2 (5 points): Job
Namespace `mock-2`. Create a Job `pi` that runs `perl:5.40` with command `perl -Mbignum=bpi -wle 'print bpi(200)'`. It must complete **4** times with **2** pods in parallel, retry at most **3** times, and be deleted automatically **120 s** after it finishes. Write the output of one of its pods to `/opt/course/exam/2/pi.txt`.

## Task 3 (4 points): CronJob
Namespace `mock-3`. Create a CronJob `report` that runs at minute 30 of every hour, image `busybox:1.36`, command `date`. Each Job must be killed after **40 s**, concurrent runs must be **replaced** by the newer one, and only **1** successful Job is kept in history. Then trigger one run manually as Job `report-now`.

## Task 4 (6 points): build and save an image
On the host: directory `/opt/course/exam/4/` contains nothing yet. Create there a `Dockerfile` based on `docker.io/library/nginx:1.27-alpine` that replaces `/usr/share/nginx/html/index.html` with a file whose content is `CKAD mock v2`. Build it as `mock-web:v2` with docker or podman and save it as an OCI/docker archive to `/opt/course/exam/4/mock-web-v2.tar`.

## Task 5 (7 points): rolling update and rollback
Namespace `mock-5`. Create Deployment `frontend` with image `nginx:1.26`, 4 replicas, and a rolling update strategy that keeps all 4 replicas available (max unavailable 0) and adds at most 1 extra pod. Update the image to `nginx:1.27` with change-cause `upgrade to 1.27`, then update to `nginx:9.99` (it will fail). Roll back to the revision that runs `nginx:1.27`. Write the revision number you rolled back to into `/opt/course/exam/5/revision.txt`.

## Task 6 (6 points): canary
Namespace `mock-6`. Deployment `checkout-v1` (image `nginx:1.27`, 3 replicas) already serves traffic through Service `checkout` (port 80, selector `app=checkout`). Create it first if it doesn't exist; pods must carry `app=checkout,version=v1`. Add a canary Deployment `checkout-v2` (image `nginx:1.28`) so that **25%** of the pods behind `checkout` run v2, **without** changing the service, so that the Service has 4 pods in total (3 v1 + 1 v2).

## Task 7 (7 points): Helm
Namespace `mock-7`. Add the Helm repo `podinfo` (`https://stefanprodan.github.io/podinfo`). Install release `cache` from chart `podinfo/podinfo` (version `6.17.0`) with `replicaCount=2` and `redis.enabled=true`. Then upgrade the release so `ui.message=mock-exam`, keeping the other values. Write the output of `helm list` for the namespace to `/opt/course/exam/7/releases.txt`. Finally, find the release in any namespace whose status is `failed` or `pending-install` (there may be none) and write its name, or `none`, to `/opt/course/exam/7/broken.txt`.

## Task 8 (6 points): probes
Namespace `mock-8`. Create Deployment `api` (image `nginx:1.27`, 2 replicas, port 80) with:
- a startupProbe: HTTP GET `/` on port 80, period 5 s, up to 60 s total
- a readinessProbe: HTTP GET `/` on port 80, period 5 s
- a livenessProbe: TCP 80, initial delay 10 s, period 15 s

## Task 9 (5 points): fix a deprecated manifest
Namespace `mock-9`. `/opt/course/exam/9/broken.yaml` doesn't apply. Fix the file **in place** so it works with the current API, then apply it. Both replicas must be ready.

## Task 10 (4 points): logs, events, endpoints
Namespace `mock-10`.
1. Write the last 10 lines of logs of pod `noisy` that contain `ERROR` to `/opt/course/exam/10/errors.txt`.
2. Service `orders` doesn't reach its pods. Fix it (without touching the Deployment) and write the endpoint IP:port list to `/opt/course/exam/10/endpoints.txt`.

## Task 11 (7 points): ConfigMap and Secret
Namespace `mock-11`.
- Create ConfigMap `app-config` with `APP_MODE=production` and `APP_PORT=8080`, and a key `app.properties` loaded from a file with the content `cache.size=256`.
- Create Secret `app-secret` with `DB_PASSWORD=s3cr3t!`.
- Create pod `app` (image `busybox:1.36`, command `sleep 3600`) that receives **all** keys of `app-config` as env vars, `DB_PASSWORD` as env var from the Secret, and mounts **only** `app.properties` as file `/etc/app/app.properties`.

## Task 12 (6 points): SecurityContext
Namespace `mock-12`. Create pod `secure` (image `busybox:1.36`, command `sleep 3600`) that:
- runs as user `1001`, group `1001`, with `fsGroup` `2001` (pod level)
- container: non-root enforced, read-only root filesystem, no privilege escalation, drops all capabilities and adds only `NET_BIND_SERVICE`
- has a writable `emptyDir` at `/data`

## Task 13 (6 points): ServiceAccount and RBAC
Namespace `mock-13`. Create ServiceAccount `deployer`. It must be able to `get`, `list`, `watch`, `create`, `update` and `patch` Deployments **only in `mock-13`**, and `list` pods in `mock-13`. Run Deployment `toolbox` (image `bitnami/kubectl:latest`, command `sleep 3600`) with this ServiceAccount. Write the output of `kubectl auth can-i delete deployments -n mock-13 --as=system:serviceaccount:mock-13:deployer` to `/opt/course/exam/13/can-delete.txt`.

## Task 14 (6 points): resources, quota and limits
Namespace `mock-14`.
- Create a ResourceQuota `mem-cpu` with `requests.cpu=2`, `requests.memory=2Gi`, `limits.cpu=4`, `limits.memory=4Gi`, `pods=10`.
- Create a LimitRange `defaults` that gives containers a default request of `100m`/`128Mi` and a default limit of `250m`/`256Mi`.
- Create Deployment `worker` (`busybox:1.36`, `sleep 3600`, 3 replicas) where the container requests `200m`/`256Mi` and is limited to `500m`/`512Mi`.

## Task 15 (8 points): NetworkPolicy
Namespace `mock-15` contains (create them): Deployment `db` (image `redis:7`, label `app=db`, port 6379), Deployment `backend` (image `busybox:1.36`, `sleep 3600`, label `app=backend`), and Deployment `frontend` (image `busybox:1.36`, `sleep 3600`, label `app=frontend`).
- Create NetworkPolicy `db-policy`: `app=db` pods accept ingress **only** from `app=backend` pods on TCP 6379.
- Create NetworkPolicy `backend-egress`: `app=backend` pods may send traffic **only** to `app=db` on TCP 6379 and to DNS (UDP/TCP 53) in any namespace.

## Task 16 (12 points): Services and Ingress
Namespace `mock-16`. Deployments `shop` (nginx) and `shop-api` (httpd) exist.
1. Expose `shop` as ClusterIP Service `shop-svc` on port 80.
2. Expose `shop-api` as ClusterIP Service `shop-api-svc` on port **8080** targeting container port 80.
3. Expose `shop` additionally as NodePort Service `shop-np` on node port **30808**.
4. Create Ingress `shop-ingress` (class `nginx`) for host `shop.example.com`: path `/api` (Prefix) → `shop-api-svc:8080`, path `/` (Prefix) → `shop-svc:80`.
5. Write a `curl` command that tests the `/api` route through the ingress controller to `/opt/course/exam/16/test.sh`.
