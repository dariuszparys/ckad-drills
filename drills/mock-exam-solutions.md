# CKAD mock exam: solutions and scoring sheet

`alias k=kubectl; export do="--dry-run=client -o yaml"`

## Scoring sheet

Tick each check that passes. Points per check are in brackets.

| Task | Checks | Max | Yours |
|---|---|---|---|
| 1 | pod exists, 2/2 Running (1) · emptyDir sizeLimit 50Mi (1) · web mount /var/log/nginx (1) · shipper mount /logs readOnly (1) · shipper command correct (1) | 5 | |
| 2 | completions 4 + parallelism 2 (2) · backoffLimit 3 (1) · ttlSecondsAfterFinished 120 (1) · pi.txt has digits (1) | 5 | |
| 3 | schedule `30 * * * *` (1) · activeDeadlineSeconds 40 in jobTemplate (1) · concurrencyPolicy Replace + successfulJobsHistoryLimit 1 (1) · job report-now exists (1) | 4 | |
| 4 | Dockerfile correct (2) · image mock-web:v2 built (2) · tar exists and loadable (2) | 6 | |
| 5 | strategy maxUnavailable 0 / maxSurge 1 (2) · change-cause set (1) · current image nginx:1.27 (2) · revision.txt correct (2) | 7 | |
| 6 | v2 deployment with app=checkout,version=v2 (2) · v1 = 3, v2 = 1 replicas (2) · service unchanged, 4 endpoints (2) | 6 | |
| 7 | release cache deployed (2) · ui.message set + other values kept (2) · releases.txt (1) · broken.txt (2) | 7 | |
| 8 | startupProbe (2) · readinessProbe (2) · livenessProbe (2) | 6 | |
| 9 | file fixed in place: apps/v1 + selector (3) · 2/2 ready (2) | 5 | |
| 10 | errors.txt only ERROR lines (2) · service fixed + endpoints.txt (2) | 4 | |
| 11 | ConfigMap with 3 keys (2) · Secret (1) · envFrom + secretKeyRef (2) · only app.properties mounted at /etc/app/app.properties (2) | 7 | |
| 12 | pod-level user/group/fsGroup (2) · container hardening (3) · emptyDir /data (1) | 6 | |
| 13 | SA (1) · Role verbs correct (2) · RoleBinding (1) · toolbox uses SA (1) · can-delete.txt = no (1) | 6 | |
| 14 | quota (2) · limitrange (2) · worker resources (2) | 6 | |
| 15 | db-policy correct (4) · backend-egress incl. DNS (4) | 8 | |
| 16 | shop-svc (2) · shop-api-svc 8080→80 (2) · shop-np 30808 (2) · ingress host/paths/pathType (4) · test.sh (2) | 12 | |
| | **Total** (pass ≥ 66) | **100** | |

---

## Task 1
```bash
k -n mock-1 run web-logger --image=nginx:1.27 --port=80 $do > t1.yaml   # then edit
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-logger
  namespace: mock-1
spec:
  volumes:
  - name: logs
    emptyDir:
      sizeLimit: 50Mi
  containers:
  - name: web
    image: nginx:1.27
    ports:
    - containerPort: 80
    volumeMounts:
    - name: logs
      mountPath: /var/log/nginx
  - name: shipper
    image: busybox:1.36
    command: ["tail", "-F", "/logs/access.log"]
    volumeMounts:
    - name: logs
      mountPath: /logs
      readOnly: true
```
Verify: `k -n mock-1 get po web-logger` (2/2), `k -n mock-1 exec web-logger -c web -- curl -s localhost >/dev/null; k -n mock-1 logs web-logger -c shipper`.

## Task 2
```bash
k -n mock-2 create job pi --image=perl:5.40 $do -- perl -Mbignum=bpi -wle 'print bpi(200)' > t2.yaml
```
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: pi
  namespace: mock-2
spec:
  completions: 4
  parallelism: 2
  backoffLimit: 3
  ttlSecondsAfterFinished: 120
  template:
    spec:
      containers:
      - name: pi
        image: perl:5.40
        command: ["perl", "-Mbignum=bpi", "-wle", "print bpi(200)"]
      restartPolicy: Never
```
```bash
mkdir -p /opt/course/exam/2
k -n mock-2 wait --for=condition=complete job/pi --timeout=180s
k -n mock-2 logs job/pi > /opt/course/exam/2/pi.txt     # logs from one of the job's pods
```
Watch out: with `ttlSecondsAfterFinished: 120` the Job and its pods disappear 2 minutes after completion, so grab the logs first.

## Task 3
```bash
k -n mock-3 create cronjob report --image=busybox:1.36 --schedule="30 * * * *" $do -- date > t3.yaml
```
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
  namespace: mock-3
spec:
  schedule: "30 * * * *"
  concurrencyPolicy: Replace
  successfulJobsHistoryLimit: 1
  jobTemplate:
    spec:
      activeDeadlineSeconds: 40
      template:
        spec:
          containers:
          - name: report
            image: busybox:1.36
            command: ["date"]
          restartPolicy: OnFailure
```
```bash
k apply -f t3.yaml
k -n mock-3 create job report-now --from=cronjob/report
```

## Task 4
```bash
cd /opt/course/exam/4
echo 'CKAD mock v2' > index.html
cat > Dockerfile <<'X'
FROM docker.io/library/nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
X
docker build -t mock-web:v2 .                  # podman: sudo podman build -t mock-web:v2 .
docker save -o mock-web-v2.tar mock-web:v2     # podman: sudo podman save -o mock-web-v2.tar mock-web:v2
```
Verify: `tar tf mock-web-v2.tar | head`, `docker load -i mock-web-v2.tar`, `docker run --rm -d -p 8088:80 --name mw mock-web:v2 && curl -s localhost:8088; docker rm -f mw` (prints `CKAD mock v2`).

## Task 5
```bash
k -n mock-5 create deployment frontend --image=nginx:1.26 --replicas=4 $do > t5.yaml
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: mock-5
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:1.26
```
```bash
k apply -f t5.yaml
k -n mock-5 set image deploy/frontend nginx=nginx:1.27
k -n mock-5 annotate deploy/frontend kubernetes.io/change-cause="upgrade to 1.27" --overwrite
k -n mock-5 rollout status deploy/frontend
k -n mock-5 set image deploy/frontend nginx=nginx:9.99      # ImagePullBackOff; with maxUnavailable 0 old pods keep serving
k -n mock-5 rollout history deploy/frontend                  # 1 = <none>, 2 = upgrade to 1.27, 3 = upgrade to 1.27 too (see note)
k -n mock-5 rollout history deploy/frontend --revision=2 | grep Image    # nginx:1.27, so 2 is the target
k -n mock-5 rollout undo deploy/frontend --to-revision=2
mkdir -p /opt/course/exam/5 && echo 2 > /opt/course/exam/5/revision.txt
```
Note: the deployment's `kubernetes.io/change-cause` annotation is copied to every new ReplicaSet, so revision 3 (nginx:9.99) also shows `upgrade to 1.27`. Don't pick the revision by change-cause; check the image with `--revision=N` (or annotate the 9.99 change with its own change-cause).

Note: after the undo, the 1.27 template becomes revision **4** (revision 2 disappears from the history). The task asks for the revision you rolled back **to**, which is 2.

## Task 6
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-v1
  namespace: mock-6
spec:
  replicas: 3
  selector:
    matchLabels:
      app: checkout
      version: v1
  template:
    metadata:
      labels:
        app: checkout
        version: v1
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-v2
  namespace: mock-6
spec:
  replicas: 1
  selector:
    matchLabels:
      app: checkout
      version: v2
  template:
    metadata:
      labels:
        app: checkout
        version: v2
    spec:
      containers:
      - name: nginx
        image: nginx:1.28
---
apiVersion: v1
kind: Service
metadata:
  name: checkout
  namespace: mock-6
spec:
  selector:
    app: checkout
  ports:
  - port: 80
    targetPort: 80
```
Verify: `k -n mock-6 get po -l app=checkout -L version` (3×v1, 1×v2), `k -n mock-6 get endpointslices -l kubernetes.io/service-name=checkout` (4 endpoints).

## Task 7
```bash
helm repo add podinfo https://stefanprodan.github.io/podinfo && helm repo update
helm -n mock-7 install cache podinfo/podinfo --version 6.17.0 --set replicaCount=2 --set redis.enabled=true
helm -n mock-7 upgrade cache podinfo/podinfo --version 6.17.0 --reuse-values --set ui.message=mock-exam
mkdir -p /opt/course/exam/7
helm -n mock-7 list > /opt/course/exam/7/releases.txt
helm list -A --failed --pending        # or: helm list -A | grep -E 'failed|pending'   (Helm 4 lists all states; Helm 3: helm list -A -a)
helm list -A --failed --pending -q > /opt/course/exam/7/broken.txt; [ -s /opt/course/exam/7/broken.txt ] || echo none > /opt/course/exam/7/broken.txt
```
Verify: `helm -n mock-7 get values cache` shows `replicaCount: 2`, `redis.enabled: true` and `ui.message: mock-exam`; `helm -n mock-7 list` shows `cache` as deployed, revision 2; `k -n mock-7 get deploy,po` shows the podinfo Deployment 2/2 and the redis Deployment 1/1.

## Task 8
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: mock-8
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
        startupProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 5
          failureThreshold: 12
        readinessProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 5
        livenessProbe:
          tcpSocket:
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 15
```

## Task 9
```bash
vim /opt/course/exam/9/broken.yaml     # apiVersion apps/v1 + add selector
k apply -f /opt/course/exam/9/broken.yaml
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legacy-api
  namespace: mock-9
spec:
  replicas: 2
  selector:
    matchLabels:
      app: legacy-api
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
```

## Task 10
```bash
mkdir -p /opt/course/exam/10
k -n mock-10 logs noisy | grep ERROR | tail -10 > /opt/course/exam/10/errors.txt
k -n mock-10 get ep orders                    # endpoint port 8080 but nginx listens on 80
k -n mock-10 patch svc orders --type=json -p='[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'
k -n mock-10 get ep orders -o jsonpath='{range .subsets[*]}{range .addresses[*]}{.ip}{"\n"}{end}{end}'   # IPs
k -n mock-10 get ep orders --no-headers | awk '{print $2}' > /opt/course/exam/10/endpoints.txt
```
`create service clusterip orders --tcp=80:8080` targets port 8080, which is the bug. The selector `app=orders` is already correct.

## Task 11
```bash
echo 'cache.size=256' > app.properties
k -n mock-11 create configmap app-config --from-literal=APP_MODE=production --from-literal=APP_PORT=8080 --from-file=app.properties
k -n mock-11 create secret generic app-secret --from-literal='DB_PASSWORD=s3cr3t!'
k -n mock-11 run app --image=busybox:1.36 $do -- sleep 3600 > t11.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
  namespace: mock-11
spec:
  containers:
  - name: app
    image: busybox:1.36
    command: ["sleep", "3600"]
    envFrom:
    - configMapRef:
        name: app-config
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: app-secret
          key: DB_PASSWORD
    volumeMounts:
    - name: cfg
      mountPath: /etc/app
  volumes:
  - name: cfg
    configMap:
      name: app-config
      items:
      - key: app.properties
        path: app.properties
```
Since Kubernetes v1.34 (relaxed environment variable validation, GA) env var names may contain any printable ASCII except `=`, so `envFrom` also imports `app.properties` as an env var. Older clusters skipped it with an `InvalidEnvironmentVariableNames` event.

Verify: `k -n mock-11 exec app -- sh -c 'env | grep -E "APP_|DB_|app.properties"; ls /etc/app; cat /etc/app/app.properties'` (`ls` shows only `app.properties`).

## Task 12
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure
  namespace: mock-12
spec:
  securityContext:
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 2001
  containers:
  - name: secure
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop: ["ALL"]
        add: ["NET_BIND_SERVICE"]
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    emptyDir: {}
```
Verify: `k -n mock-12 exec secure -- sh -c 'id; touch /data/ok && echo data-ok; touch /x'` (uid=1001, data-ok, Read-only file system).

## Task 13
```bash
k -n mock-13 create sa deployer
k -n mock-13 create role deployer --verb=get,list,watch,create,update,patch --resource=deployments.apps
k -n mock-13 create role pod-lister --verb=list --resource=pods
k -n mock-13 create rolebinding deployer --role=deployer --serviceaccount=mock-13:deployer
k -n mock-13 create rolebinding pod-lister --role=pod-lister --serviceaccount=mock-13:deployer
k -n mock-13 create deployment toolbox --image=bitnami/kubectl:latest $do -- sleep 3600 > t13.yaml
# add serviceAccountName: deployer under spec.template.spec
k apply -f t13.yaml
mkdir -p /opt/course/exam/13
k auth can-i delete deployments -n mock-13 --as=system:serviceaccount:mock-13:deployer > /opt/course/exam/13/can-delete.txt
```
Shortcut for the SA: `k -n mock-13 set serviceaccount deploy toolbox deployer`.

A single Role with two rules works too:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: mock-13
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["list"]
```
`can-i` prints `no` and exits with status 1. The file must still contain `no`.

## Task 14
```bash
k -n mock-14 create quota mem-cpu --hard=requests.cpu=2,requests.memory=2Gi,limits.cpu=4,limits.memory=4Gi,pods=10
k -n mock-14 create deployment worker --image=busybox:1.36 --replicas=3 $do -- sleep 3600 > t14.yaml
k apply -f t14.yaml       # first ReplicaSet shows FailedCreate (quota needs limits) until set resources below; apply the LimitRange first to avoid that
k -n mock-14 set resources deploy worker --requests=cpu=200m,memory=256Mi --limits=cpu=500m,memory=512Mi
```
```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: mock-14
spec:
  limits:
  - type: Container
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    default:
      cpu: 250m
      memory: 256Mi
```
Check: 3 × 200m = 600m requests, under the quota. `k -n mock-14 describe quota mem-cpu`.

## Task 15
```bash
k -n mock-15 create deployment db --image=redis:7 --port=6379
k -n mock-15 create deployment backend --image=busybox:1.36 -- sleep 3600
k -n mock-15 create deployment frontend --image=busybox:1.36 -- sleep 3600
```
`create deployment` labels pods `app=<name>`, which matches the task.
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-policy
  namespace: mock-15
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 6379
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-egress
  namespace: mock-15
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: db
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```
Verify (needs a policy-enforcing CNI): `k -n mock-15 exec deploy/backend -- nc -zv -w 3 <db-pod-ip> 6379` works, the same from `deploy/frontend` times out.

## Task 16
```bash
k -n mock-16 expose deploy shop --name=shop-svc --port=80
k -n mock-16 expose deploy shop-api --name=shop-api-svc --port=8080 --target-port=80
k -n mock-16 create service nodeport shop-np --tcp=80:80 --node-port=30808 $do | sed 's/app: shop-np/app: shop/' | k apply -f -
k -n mock-16 create ingress shop-ingress --class=nginx \
  --rule="shop.example.com/api*=shop-api-svc:8080" --rule="shop.example.com/*=shop-svc:80"
mkdir -p /opt/course/exam/16
echo 'curl -s -H "Host: shop.example.com" http://127.0.0.1/api' > /opt/course/exam/16/test.sh   # minikube: needs `minikube tunnel`; exam: use the IP/port the task gives
```
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop-ingress
  namespace: mock-16
spec:
  ingressClassName: nginx
  rules:
  - host: shop.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: shop-api-svc
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: shop-svc
            port:
              number: 80
```
The Ingress does no path rewrite, so httpd receives `/api`, a page it doesn't have. An **Apache-style 404** therefore means the `/api` route works: the body reads `The requested URL was not found on this server.` and, when the controller passes the backend's `Server` header, `curl -s -o /dev/null -w '%{http_code} %header{server}\n' -H "Host: shop.example.com" http://127.0.0.1/api` prints `404 Apache/2.4...` (ingress-nginx strips that header unless `allow-backend-server-header` is enabled, so then only the 404 shows). A 404 page that says `nginx` means the request fell through to `shop-svc`; a 503 means the backend Service has no endpoints.

Verify: `k -n mock-16 get svc,ing`, `k -n mock-16 get endpointslices -l kubernetes.io/service-name=shop-np` (2 endpoints, the selector was fixed via sed), `bash /opt/course/exam/16/test.sh` (Apache 404 page = route works).
