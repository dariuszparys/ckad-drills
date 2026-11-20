# Chapter 06: Understanding Security: drills

Curriculum areas: SecurityContexts and capabilities, Secrets, ServiceAccounts, RBAC, NetworkPolicies, authentication/authorization basics.

> NetworkPolicy drills need a CNI that enforces policies. On minikube start with `--cni=calico` or `--cni=cilium`; see `../minikube.md`.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: **NetworkPolicy drills 6.9-6.11 need `--cni=calico` (or `--cni=cilium`).** The default multi-node CNI (kindnet) accepts NetworkPolicies but doesn't enforce them, so tests would wrongly "pass". Check: `k -n kube-system get po -l k8s-app=calico-node`. Drill 6.12 NodePort: `minikube ssh -- curl -s localhost:32000`. `capsh` (6.2): `docker run --rm alpine sh -c 'apk add -q libcap && capsh --decode=<hex>'`.

---

### 6.1 Pod and container securityContext (⏱ 4 min)

In namespace `sec-a`, create pod `secondapp` (`busybox:1.36`, `sleep 3600`). At pod level, run as user `1000` and group `3000`, with fsGroup `2000`. At container level, override the user to `2000` and forbid privilege escalation. Confirm the effective UID inside the container.

<details><summary>Solution</summary>

```bash
k create ns sec-a
k -n sec-a run secondapp --image=busybox:1.36 $do -- sleep 3600 > 6.1.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secondapp
  namespace: sec-a
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
  containers:
  - name: busy
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      runAsUser: 2000
      allowPrivilegeEscalation: false
```

**Verify**
```bash
k -n sec-a exec secondapp -- id        # uid=2000 gid=3000 groups=2000,3000
```
</details>

---

### 6.2 Add Linux capabilities (⏱ 3 min)

In `sec-a`, create pod `capapp` (`busybox:1.36`, `sleep 3600`, runs as root) whose container adds the capabilities `NET_ADMIN` and `SYS_TIME` and drops `MKNOD`.

<details><summary>Solution</summary>

Capabilities only show up in the effective set when the process runs as root; a process running as UID 2000 shows an empty effective set.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: capapp
  namespace: sec-a
spec:
  containers:
  - name: busy
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      capabilities:
        add: ["NET_ADMIN", "SYS_TIME"]
        drop: ["MKNOD"]
```

**Verify**
```bash
k -n sec-a exec capapp -- grep CapEff /proc/1/status
capsh --decode=<hex value>      # on a node with libcap2-bin; should list cap_net_admin, cap_sys_time
```
</details>

---

### 6.3 Hardened container (⏱ 5 min)
**Curriculum:** SecurityContexts

In namespace `sec-b`, create Deployment `hardened` (`nginxinc/nginx-unprivileged:1.27`, port 8080) where the container:
- must run as non-root (`runAsNonRoot: true`, user `101`)
- has a read-only root filesystem
- drops ALL capabilities
- disallows privilege escalation
- uses the RuntimeDefault seccomp profile

nginx needs writable `/tmp`, so give it an `emptyDir` there.

<details><summary>Solution</summary>

```bash
k create ns sec-b
k -n sec-b create deployment hardened --image=nginxinc/nginx-unprivileged:1.27 --port=8080 $do > 6.3.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hardened
  namespace: sec-b
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hardened
  template:
    metadata:
      labels:
        app: hardened
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: nginx-unprivileged
        image: nginxinc/nginx-unprivileged:1.27
        ports:
        - containerPort: 8080
        securityContext:
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
```

**Verify**
```bash
k -n sec-b get po -l app=hardened             # Running
k -n sec-b exec deploy/hardened -- touch /etc/x   # Read-only file system
```
</details>

---

### 6.4 Fix a pod that fails because of runAsUser (⏱ 5 min)

In `sec-c`, this pod goes into CrashLoopBackOff. Find out why and fix it **without** removing the securityContext entirely: the nginx process must not run as root. Use the image `nginxinc/nginx-unprivileged` or find the right UID.

```yaml
# snippet: broken on purpose
apiVersion: v1
kind: Pod
metadata:
  name: securityreview
  namespace: sec-c
spec:
  securityContext:
    runAsUser: 2100
  containers:
  - name: webguy
    image: nginx:1.27
```

<details><summary>Solution</summary>

```bash
k create ns sec-c
vim 6.4.yaml                          # paste the broken manifest above
k apply -f 6.4.yaml
k -n sec-c get pod securityreview     # Error / CrashLoopBackOff
k -n sec-c logs securityreview
```

The logs show `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)`, plus a warning about the `user` directive. That permission error is the cause: the stock `nginx` image expects to start as root and drop to user `nginx` (UID 101), so its cache dirs aren't writable for UID 2100. Binding port 80 is not the problem: container runtimes set `net.ipv4.ip_unprivileged_port_start=0` in the pod, so non-root can bind low ports.

Option A (clean): switch to the unprivileged image, which listens on 8080 and runs as UID 101.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: securityreview
  namespace: sec-c
spec:
  securityContext:
    runAsUser: 101
    runAsNonRoot: true
  containers:
  - name: webguy
    image: nginxinc/nginx-unprivileged:1.27
    ports:
    - containerPort: 8080
```

Option B: find the nginx UID with `k run tmp --rm -it --image=nginx:1.27 -- id nginx` (UID 101). Note that the stock image still fails as 101 unless its cache and pid paths are writable, which is why option A is the one that works in practice.

```bash
vim 6.4.yaml                          # apply option A
k -n sec-c replace --force -f 6.4.yaml
```

**Verify**
```bash
k -n sec-c get pod securityreview      # Running
k -n sec-c exec securityreview -- id   # uid=101
```
</details>

---

### 6.5 Secret from a file and as environment variables (⏱ 4 min)

In namespace `sec-d`, create Secret `db-cred` with `username=app` and `password=Tr@1nPass`. Create pod `dbclient` (`busybox:1.36`, `sleep 3600`) that receives `DB_USER` and `DB_PASS` from the Secret as env vars, and also mounts the whole Secret read-only at `/mysqlpassword`.

<details><summary>Solution</summary>

```bash
k create ns sec-d
k -n sec-d create secret generic db-cred --from-literal=username=app --from-literal='password=Tr@1nPass'
k -n sec-d run dbclient --image=busybox:1.36 $do -- sleep 3600 > 6.5.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: dbclient
  namespace: sec-d
spec:
  containers:
  - name: dbclient
    image: busybox:1.36
    command: ["sleep", "3600"]
    env:
    - name: DB_USER
      valueFrom:
        secretKeyRef:
          name: db-cred
          key: username
    - name: DB_PASS
      valueFrom:
        secretKeyRef:
          name: db-cred
          key: password
    volumeMounts:
    - name: cred
      mountPath: /mysqlpassword
      readOnly: true
  volumes:
  - name: cred
    secret:
      secretName: db-cred
```

**Verify**
```bash
k -n sec-d exec dbclient -- sh -c 'echo $DB_USER $DB_PASS; cat /mysqlpassword/password; ls -la /mysqlpassword'
# files are symlinks to ..data/
```
</details>

---

### 6.6 ServiceAccount with a namespaced Role (⏱ 5 min)

In namespace `sec-e`, create ServiceAccount `secret-reader`, a Role `secret-access` that allows `get` and `list` on `secrets`, and a RoleBinding `secret-rb` that binds them. Run pod `reader` (`bitnami/kubectl` or `busybox:1.36`, `sleep 3600`) with that ServiceAccount. Prove with `kubectl auth can-i` that the SA can list secrets in `sec-e` but not delete them, and not list them in `default`.

<details><summary>Solution</summary>

```bash
k create ns sec-e
k -n sec-e create sa secret-reader
k -n sec-e create role secret-access --verb=get,list --resource=secrets
k -n sec-e create rolebinding secret-rb --role=secret-access --serviceaccount=sec-e:secret-reader
k -n sec-e run reader --image=busybox:1.36 $do -- sleep 3600 > 6.6.yaml
# add serviceAccountName (there's no --serviceaccount flag on kubectl run anymore)
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: reader
  namespace: sec-e
spec:
  serviceAccountName: secret-reader
  containers:
  - name: reader
    image: busybox:1.36
    command: ["sleep", "3600"]
```

**Verify**
```bash
k auth can-i list secrets   -n sec-e   --as=system:serviceaccount:sec-e:secret-reader   # yes
k auth can-i delete secrets -n sec-e   --as=system:serviceaccount:sec-e:secret-reader   # no
k auth can-i list secrets   -n default --as=system:serviceaccount:sec-e:secret-reader   # no
k -n sec-e get pod reader -o jsonpath='{.spec.serviceAccountName}{"\n"}'
```
</details>

---

### 6.7 ClusterRole bound with a RoleBinding vs ClusterRoleBinding (⏱ 5 min)

Create ServiceAccount `securityaccount` in `sec-e` and a ClusterRole `secrole` that allows only `create`, `delete` and `list` on `pods` (all API groups). Bind it so the SA has these rights **in every namespace**. Then answer: what changes if you used a RoleBinding in `sec-e` instead?

<details><summary>Solution</summary>

```bash
k -n sec-e create sa securityaccount
k create clusterrole secrole --verb=create,delete,list --resource=pods
k create clusterrolebinding secrole-crb --clusterrole=secrole --serviceaccount=sec-e:securityaccount
```

`--resource=pods` produces `apiGroups: [""]`. The task says "all API groups", which needs YAML with `apiGroups: ["*"]`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secrole
rules:
- apiGroups: ["*"]
  resources: ["pods"]
  verbs: ["create", "delete", "list"]
```

A RoleBinding that references a ClusterRole grants those rights **only in the RoleBinding's namespace**. This is a common pattern: define the rules once as a ClusterRole and grant them namespace by namespace.

**Verify**
```bash
k auth can-i list pods -n kube-system --as=system:serviceaccount:sec-e:securityaccount   # yes
k auth can-i get pods  -n kube-system --as=system:serviceaccount:sec-e:securityaccount   # no (get not granted)
```
</details>

---

### 6.8 Create a ServiceAccount token into a file (⏱ 3 min)

Create a token for `securityaccount` in `sec-e` valid for 1 hour and write **only the token** to `/tmp/securitytoken`.

<details><summary>Solution</summary>

Since v1.24 no long-lived token Secret is created automatically. Use the TokenRequest API:

```bash
k -n sec-e create token securityaccount --duration=1h > /tmp/securitytoken
```

If a long-lived token is explicitly required, create a Secret of type `kubernetes.io/service-account-token`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: securityaccount-token
  namespace: sec-e
  annotations:
    kubernetes.io/service-account.name: securityaccount
type: kubernetes.io/service-account-token
```

```bash
k -n sec-e get secret securityaccount-token -o jsonpath='{.data.token}' | base64 -d > /tmp/securitytoken
```

**Verify**
```bash
head -c 40 /tmp/securitytoken; echo     # eyJhbGciOi...
```
</details>

---

### 6.9 Default-deny all traffic in a namespace (⏱ 3 min)

In namespace `net-a`, create NetworkPolicy `deny-default` that denies all ingress **and** egress for every pod in the namespace.

<details><summary>Solution</summary>

```bash
k create ns net-a
vim 6.9.yaml          # policy below
k apply -f 6.9.yaml
```

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-default
  namespace: net-a
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

**Verify**
```bash
k -n net-a describe netpol deny-default
k -n net-a run t --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- http://kubernetes.default   # wget: bad address 'kubernetes.default' (DNS egress blocked)
```
</details>

---

### 6.10 Allow only TCP 80 from a labelled client (⏱ 6 min)

In `net-a` (default deny from 6.9 still applies), deployment `web` (`nginx`, label `app=web`) must accept traffic **only** on TCP 80 and **only** from pods labelled `role=frontend` in the same namespace. Clients with `role=frontend` must also be allowed to send DNS queries and reach `app=web` on 80.

<details><summary>Solution</summary>

```bash
k -n net-a create deployment web --image=nginx --port=80
k -n net-a expose deploy web --port=80
```

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-frontend
  namespace: net-a
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: frontend
    ports:
    - protocol: TCP
      port: 80
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-egress
  namespace: net-a
spec:
  podSelector:
    matchLabels:
      role: frontend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: web
    ports:
    - protocol: TCP
      port: 80
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

**Verify**
```bash
k -n net-a run fe --rm -it --restart=Never --image=busybox:1.36 -l role=frontend -- wget -T 3 -qO- web | head -3   # works
k -n net-a run other --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- web                         # wget: bad address 'web' (no DNS egress)
```
</details>

---

### 6.11 Allow ingress from another namespace and a CIDR (⏱ 5 min)

In namespace `net-b`, pods labelled `app=api` must accept ingress on TCP 8080 only from (a) any pod in namespaces labelled `team=frontend`, or (b) the IP range `10.0.0.0/16` except `10.0.5.0/24`. All other ingress to `app=api` is denied; egress is not restricted.

<details><summary>Solution</summary>

```bash
k create ns net-b
vim 6.11.yaml         # policy below
k apply -f 6.11.yaml
```

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-ingress
  namespace: net-b
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          team: frontend
    - ipBlock:
        cidr: 10.0.0.0/16
        except:
        - 10.0.5.0/24
    ports:
    - protocol: TCP
      port: 8080
```

Two entries in one `from` list are OR'd. Putting `namespaceSelector` and `podSelector` in the **same** list item (no dash before `podSelector`) would AND them instead. That's a classic exam trap.

**Verify**
```bash
k -n net-b get netpol api-ingress -o yaml | grep -A12 'ingress:'
# test backend on 8080 and a frontend namespace (the ipBlock part isn't tested here)
k -n net-b run api --image=nginxinc/nginx-unprivileged:1.27 -l app=api --port=8080 && k -n net-b expose pod api --port=8080
k create ns net-fe && k label ns net-fe team=frontend
k -n net-fe run t --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- api.net-b:8080 | head -3   # works
k -n default run t --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- api.net-b:8080           # download timed out
```
</details>

---

### 6.12 Expose a pod whose service selects nothing (⏱ 4 min)

In `sec-f`, pod `secondapp` (`nginx`) has **no labels**. `kubectl expose pod secondapp --port=80` fails. Make a NodePort Service `secondapp` on node port `32000` that reaches the pod, without recreating the pod.

<details><summary>Solution</summary>

```bash
k create ns sec-f
# setup: kubectl run always adds run=secondapp, so remove it to reproduce the situation
k -n sec-f run secondapp --image=nginx --port=80 && k -n sec-f label pod secondapp run-
k -n sec-f expose pod secondapp --port=80          # error: couldn't retrieve selectors ... the pod has no labels and cannot be exposed
k -n sec-f label pod secondapp example=second
k -n sec-f create service nodeport secondapp --tcp=80:80 --node-port=32000 $do > 6.12.yaml
# change selector app: secondapp -> example: second
k apply -f 6.12.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: secondapp
  namespace: sec-f
spec:
  type: NodePort
  selector:
    example: second
  ports:
  - port: 80
    targetPort: 80
    nodePort: 32000
```

**Verify**
```bash
k -n sec-f get endpointslices -l kubernetes.io/service-name=secondapp     # one endpoint
minikube ssh -- curl -s localhost:32000 | head -4     # or: minikube service secondapp -n sec-f --url
```
</details>

---

Clean up: `k delete ns sec-a sec-b sec-c sec-d sec-e sec-f net-a net-b net-fe; k delete clusterrole secrole; k delete clusterrolebinding secrole-crb`
