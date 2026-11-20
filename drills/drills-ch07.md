# Chapter 07: Exposing Applications: drills

Curriculum areas: Services, Ingress, Helm, deployment strategies (blue/green, canary), Gateway API basics.


> **Run on minikube (Apple Silicon, Docker driver).** One profile covers all drills: 
> `minikube start -p ckad --driver=docker --nodes=2 --cni=calico --cpus=2 --memory=3g && minikube profile ckad`.
> Files the drills write go to `/opt/course/...`. On macOS run `sudo mkdir -p /opt/course && sudo chown $USER /opt/course` once.
> From the Mac you **cannot** reach node IPs, NodePorts, ClusterIPs or pod IPs directly. Test with a temp pod (`k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>`), `minikube ssh -- curl -s <ip-or-localhost:nodePort>`, `minikube service <svc> -n <ns> --url`, or `k port-forward`. Details: `../minikube.md`.
> Chapter setup: ingress controller: `minikube addons enable ingress` (controller Service `ingress-nginx/ingress-nginx-controller`, class `nginx`). **Or** install it with Helm as in drill 7.5, **not both**. To curl through the ingress from the Mac, run `minikube tunnel` in a second terminal (asks for sudo) and use `127.0.0.1` with a `Host:` header. The same tunnel gives LoadBalancer Services (7.3) an EXTERNAL-IP of `127.0.0.1`. NodePorts: `minikube ssh -- curl -s localhost:<nodePort>`. Gateway drills 7.9/7.10: install the Gateway API CRDs and Traefik first (commands in `../minikube.md`, "Gateway API") and test via `k -n traefik port-forward deploy/traefik 8080:8000`.

---

### 7.1 ClusterIP service from YAML with named target port (⏱ 4 min)

In namespace `expose-a`, create Deployment `secondapp` (`nginx`, 2 replicas, container port 80 named `http`). Create a ClusterIP Service `secondapp` on port `80` that targets the **named** port `http`.

<details><summary>Solution</summary>

```bash
k create ns expose-a
k -n expose-a create deployment secondapp --image=nginx --replicas=2 --port=80 $do > 7.1.yaml   # add name: http under ports
k apply -f 7.1.yaml                  # expose reads the Deployment from the API server
k -n expose-a expose deploy secondapp --port=80 --target-port=http $do > 7.1-svc.yaml
k apply -f 7.1-svc.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secondapp
  namespace: expose-a
spec:
  replicas: 2
  selector:
    matchLabels:
      app: secondapp
  template:
    metadata:
      labels:
        app: secondapp
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - name: http
          containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: secondapp
  namespace: expose-a
spec:
  selector:
    app: secondapp
  ports:
  - port: 80
    targetPort: http
```

**Verify**
```bash
k -n expose-a get endpointslices -l kubernetes.io/service-name=secondapp   # 2 endpoints, port 80
k -n expose-a run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- secondapp | head -4
```
</details>

---

### 7.2 Point a service at a different backend (⏱ 4 min)

In `expose-a`, create Deployment `newserver` with image `httpd`. Change the selector of Service `secondapp` so it sends traffic to `newserver`, check you get "It works!", then switch it back.

<details><summary>Solution</summary>

```bash
k -n expose-a create deployment newserver --image=httpd
k -n expose-a get po --show-labels | grep newserver          # app=newserver
k -n expose-a patch svc secondapp --type=json -p='[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'
k -n expose-a patch svc secondapp -p '{"spec":{"selector":{"app":"newserver"}}}'
k -n expose-a run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- secondapp    # It works!
k -n expose-a patch svc secondapp -p '{"spec":{"selector":{"app":"secondapp"}}}'
k -n expose-a patch svc secondapp --type=json -p='[{"op":"replace","path":"/spec/ports/0/targetPort","value":"http"}]'
k -n expose-a delete deploy newserver
```

Why the targetPort patch comes first: Service `secondapp` from 7.1 uses the **named** targetPort `http`. The httpd pods have no port named `http`, so after the selector switch the endpoints would stay empty. Numeric 80 works for both backends; restore `http` once you switch back.

**Verify**
```bash
k -n expose-a describe svc secondapp | grep -E 'Selector|Endpoints'
```
</details>

---

### 7.3 NodePort and LoadBalancer (⏱ 4 min)

In `expose-a`, expose `secondapp` a second time as Service `secondapp-np` of type NodePort with node port `32001`, and a third time as `secondapp-lb` of type LoadBalancer on port 8080 → 80.

<details><summary>Solution</summary>

```bash
k -n expose-a expose deploy secondapp --name=secondapp-np --type=NodePort --port=80 $do > 7.3.yaml
# add nodePort: 32001 under ports, then apply
k -n expose-a expose deploy secondapp --name=secondapp-lb --type=LoadBalancer --port=8080 --target-port=80
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: secondapp-np
  namespace: expose-a
spec:
  type: NodePort
  selector:
    app: secondapp
  ports:
  - port: 80
    targetPort: 80
    nodePort: 32001
```

Without a cloud provider, `EXTERNAL-IP` stays `<pending>`. A LoadBalancer service also gets a NodePort. On minikube run `minikube tunnel` to get an external IP.

**Verify**
```bash
k -n expose-a get svc
minikube ssh -- curl -s localhost:32001 | head -4
k -n expose-a get svc secondapp-lb      # with `minikube tunnel` running: EXTERNAL-IP 127.0.0.1 -> curl 127.0.0.1:8080
```
</details>

---

### 7.4 Cross-namespace DNS (⏱ 4 min)

Create namespace `multitenant` with Deployment `mainapp` (`nginx`) exposed as Service `shopping` on port 80. From a pod in `expose-a`, reach it using (a) the short cross-namespace name and (b) the FQDN. Write the FQDN to `/opt/course/7.4/fqdn.txt`.

<details><summary>Solution</summary>

```bash
k create ns multitenant
k -n multitenant create deployment mainapp --image=nginx
k -n multitenant expose deployment mainapp --name=shopping --port=80
k -n expose-a run t --rm -it --restart=Never --image=busybox:1.36 -- sh -c 'wget -qO- shopping.multitenant | head -2; wget -qO- shopping.multitenant.svc.cluster.local | head -2'
mkdir -p /opt/course/7.4 && echo shopping.multitenant.svc.cluster.local > /opt/course/7.4/fqdn.txt
```

**Verify**
```bash
k -n expose-a run d --rm -it --restart=Never --image=busybox:1.36 -- nslookup shopping.multitenant.svc.cluster.local   # busybox nslookup ignores search domains, so use the full name
```
</details>

---

### 7.5 Install an ingress controller with Helm (⏱ 6 min)

Add the `ingress-nginx` Helm repo and install release `myingress` of chart `ingress-nginx/ingress-nginx` into namespace `ingress-nginx` (create it), running the controller as a **DaemonSet**. List the release and the chart's default values for `controller.kind`.

<details><summary>Solution</summary>

Note: the ingress-nginx project was retired upstream in March 2026. The chart still installs but gets no further fixes; Gateway API (7.9/7.10) is the maintained path.

You could also download the chart (`helm fetch --untar`) and edit `values.yaml`. Setting the value on the command line is faster:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm show values ingress-nginx/ingress-nginx | grep -n '^  kind:'     # default: Deployment
helm install myingress ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace --set controller.kind=DaemonSet
helm list -n ingress-nginx
```

On minikube, `minikube addons enable ingress` is the simpler option. If the addon is already enabled, **don't** also install the chart: both create IngressClass `nginx`. Do this drill on a fresh profile or `minikube addons disable ingress` first. Expose the Helm controller to the Mac with `minikube tunnel` (its Service is type LoadBalancer).

**Verify**
```bash
k -n ingress-nginx get ds,svc
k get ingressclass            # nginx
```
</details>

---

### 7.6 Helm: upgrade, history, rollback, uninstall (⏱ 5 min)
**Curriculum:** "Use the Helm package manager to deploy existing packages"

Add repo `podinfo` (`https://stefanprodan.github.io/podinfo`). In namespace `helm-a`, install release `web` from chart `podinfo/podinfo` with `replicaCount=2` and service type `ClusterIP`. Upgrade it to 3 replicas, keeping the other values. Roll back to revision 1. Finally find all releases in all namespaces, including failed or pending ones.

<details><summary>Solution</summary>

```bash
helm repo add podinfo https://stefanprodan.github.io/podinfo && helm repo update
helm search repo podinfo/podinfo      # chart 6.17.0
helm show values podinfo/podinfo | grep -E '^replicaCount|^  type:'   # defaults: 1, ClusterIP
helm -n helm-a install web podinfo/podinfo --create-namespace --set replicaCount=2 --set service.type=ClusterIP
helm -n helm-a upgrade web podinfo/podinfo --reuse-values --set replicaCount=3
helm -n helm-a history web
helm -n helm-a rollback web 1
helm list -A                          # Helm 4 lists every state (failed, pending-install, ...) by default; Helm 3: helm list -A -a
helm -n helm-a get values web         # user-supplied values of current revision
# helm -n helm-a uninstall web
```

**Verify**
```bash
k -n helm-a get deploy web-podinfo    # 2/2 after rollback
k -n helm-a get svc web-podinfo       # ClusterIP, port 9898
helm -n helm-a history web            # rev 3 = "Rollback to 1"
helm -n helm-a get values web --revision 2   # replicaCount: 3, service.type still ClusterIP
```
</details>

---

### 7.7 Host-based Ingress for two services (⏱ 7 min)

In namespace `expose-b`:
- pod `webone` (`nginx`) with Service `webone-svc` (ClusterIP, 80)
- pod `webtwo` (`httpd`) with Service `webtwo-svc` (ClusterIP, 80)

Create Ingress `ingress-test` (class `nginx`) so `webone.com` goes to `webone-svc` and `webtwo.org` goes to `webtwo-svc`, both for path `/` (Prefix).

<details><summary>Solution</summary>

```bash
k create ns expose-b
k -n expose-b run webone --image=nginx --port=80
k -n expose-b expose pod webone --name=webone-svc --port=80
k -n expose-b run webtwo --image=httpd --port=80
k -n expose-b expose pod webtwo --name=webtwo-svc --port=80
k -n expose-b create ingress ingress-test --class=nginx \
  --rule="webone.com/*=webone-svc:80" --rule="webtwo.org/*=webtwo-svc:80" $do > 7.7.yaml
k apply -f 7.7.yaml
```

The `/*` suffix makes `create ingress` use `pathType: Prefix`; without it you get `Exact`.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-test
  namespace: expose-b
spec:
  ingressClassName: nginx
  rules:
  - host: webone.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: webone-svc
            port:
              number: 80
  - host: webtwo.org
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: webtwo-svc
            port:
              number: 80
```

**Verify**
```bash
k -n expose-b get ingress ingress-test
IP=127.0.0.1     # minikube: with `minikube tunnel` running in another terminal
# on a cluster where you can reach ClusterIPs: IP=$(k -n ingress-nginx get svc myingress-ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')  (Helm) or ingress-nginx-controller (addon)
curl -s -H "Host: webone.com" http://$IP | grep title     # Welcome to nginx!
curl -s -H "Host: webtwo.org" http://$IP                  # It works!
curl -s -o /dev/null -w '%{http_code}\n' http://$IP       # 404
```
</details>

---

### 7.8 Path-based Ingress with a default backend (⏱ 5 min)
**Curriculum:** "Use Ingress rules to expose applications"

In `expose-b`, create Ingress `paths` (class `nginx`, host `shop.local`) so `/api` (Prefix) goes to `webtwo-svc:80`, `/` (Prefix) goes to `webone-svc:80`, and requests for any other host go to `webone-svc:80` (default backend).

<details><summary>Solution</summary>

```bash
k -n expose-b create ingress paths --class=nginx \
  --rule="shop.local/api*=webtwo-svc:80" --rule="shop.local/*=webone-svc:80" \
  --default-backend=webone-svc:80 $do > 7.8.yaml
k apply -f 7.8.yaml
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: paths
  namespace: expose-b
spec:
  ingressClassName: nginx
  defaultBackend:
    service:
      name: webone-svc
      port:
        number: 80
  rules:
  - host: shop.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: webtwo-svc
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: webone-svc
            port:
              number: 80
```

Gotcha: ingress-nginx uses `spec.defaultBackend` of an Ingress that has rules only for that Ingress's own hosts; requests for other hosts still get the controller's 404. To catch **any other host**, add an Ingress with no rules, only a default backend:

```bash
k -n expose-b create ingress catchall --class=nginx --default-backend=webone-svc:80
```

Once `catchall` exists, 7.7's "404 for unknown host" check no longer holds.

**Verify**
```bash
IP=127.0.0.1     # minikube: with `minikube tunnel` running in another terminal
k -n expose-b describe ingress paths
curl -s -H "Host: shop.local" http://$IP/api      # httpd answers (path is passed through as /api -> 404 from httpd is fine; it proves routing)
curl -s -H "Host: shop.local" http://$IP | grep title     # Welcome to nginx!
curl -s -H "Host: other.local" http://$IP | grep title    # Welcome to nginx! (catchall -> webone-svc; without catchall: 404)
```
</details>

---

### 7.9 Gateway API: Gateway + HTTPRoute (⏱ 6 min)

Gateway API CRDs and a controller with GatewayClass `traefik` are installed. In namespace `gw-a`:
- Deployment `webserver` (`nginx`), ClusterIP Service `webserver` on 80
- Gateway `my-gateway` (class `traefik`, listener `http`, port `8000`, HTTP, routes only from the same namespace)
- HTTPRoute `webserver-route` attached to `my-gateway` sending `PathPrefix /` to `webserver:80`

<details><summary>Solution</summary>

```bash
k create ns gw-a
k -n gw-a create deployment webserver --image=nginx --port=80
k -n gw-a expose deployment webserver --port=80 --target-port=80
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: gw-a
spec:
  gatewayClassName: traefik
  listeners:
  - name: http
    port: 8000
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: Same
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: webserver-route
  namespace: gw-a
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: webserver
      port: 80
```

Traefik's HTTP entrypoint is 8000, which is why the listener uses that port.

**Verify**
```bash
k -n gw-a get gateway,httproute           # PROGRAMMED True, route Accepted
k -n traefik port-forward deploy/traefik 8080:8000 &
sleep 2
curl -s localhost:8080 | grep title; kill %1
```
</details>

---

### 7.10 Gateway API: weighted canary split (⏱ 6 min)
**Curriculum:** canary deployments with the Gateway API

In `gw-a`, add Deployment `webserver-v2` (`httpd`) with Service `webserver-v2:80`. Change `webserver-route` so 90% of requests go to `webserver` and 10% to `webserver-v2`.

<details><summary>Solution</summary>

```bash
k -n gw-a create deployment webserver-v2 --image=httpd --port=80
k -n gw-a expose deployment webserver-v2 --port=80
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: webserver-route
  namespace: gw-a
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: webserver
      port: 80
      weight: 90
    - name: webserver-v2
      port: 80
      weight: 10
```

**Verify**
```bash
k -n traefik port-forward deploy/traefik 8080:8000 &     # 7.9 killed the earlier one
sleep 2
for i in $(seq 1 20); do curl -s localhost:8080 | grep -o -E 'nginx|It works' | head -1; done | sort | uniq -c   # roughly 18/2
kill %1
```
</details>

---

### 7.11 Canary with plain Deployments and one Service (⏱ 6 min)
**Curriculum:** "Use Kubernetes primitives to implement common deployment strategies (e.g. blue/green or canary)"

In namespace `strat-a`, run 4 replicas of `app-v1` (`nginx:1.27`) and 1 replica of `app-v2` (`nginx:1.28`). Both Deployments label their pods `app=myapp` plus `version=v1`/`v2`. Create Service `myapp` (80) selecting only `app=myapp`, so about 20% of traffic hits v2.

<details><summary>Solution</summary>

```bash
k create ns strat-a
k -n strat-a create deployment app-v1 --image=nginx:1.27 --replicas=4 $do > v1.yaml
k -n strat-a create deployment app-v2 --image=nginx:1.28 --replicas=1 $do > v2.yaml
# edit both: selector + template labels app: myapp, version: v1|v2
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-v1
  namespace: strat-a
spec:
  replicas: 4
  selector:
    matchLabels:
      app: myapp
      version: v1
  template:
    metadata:
      labels:
        app: myapp
        version: v1
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-v2
  namespace: strat-a
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
      version: v2
  template:
    metadata:
      labels:
        app: myapp
        version: v2
    spec:
      containers:
      - name: nginx
        image: nginx:1.28
---
apiVersion: v1
kind: Service
metadata:
  name: myapp
  namespace: strat-a
spec:
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 80
```

Promote the canary: `k -n strat-a scale deploy app-v2 --replicas=4 && k -n strat-a scale deploy app-v1 --replicas=0`.

**Verify**
```bash
k -n strat-a get endpointslices -l kubernetes.io/service-name=myapp -o jsonpath='{range .items[*].endpoints[*]}{.targetRef.name}{"\n"}{end}'   # 5 pods
k -n strat-a get po -l app=myapp -L version
```
</details>

---

### 7.12 Blue/green switch (⏱ 4 min)
**Curriculum:** deployment strategies

In `strat-a`, Deployments `blue` (`nginx:1.27`, label `color=blue`) and `green` (`nginx:1.28`, label `color=green`) both run 2 replicas. Service `bg` currently selects `color=blue`. Switch all traffic to green in one step, then delete blue.

<details><summary>Solution</summary>

```bash
k -n strat-a create deployment blue --image=nginx:1.27 --replicas=2 $do | sed 's/app: blue/color: blue/' | k apply -f -
k -n strat-a create deployment green --image=nginx:1.28 --replicas=2 $do | sed 's/app: green/color: green/' | k apply -f -
k -n strat-a create service clusterip bg --tcp=80:80 $do | sed 's/app: bg/color: blue/' | k apply -f -
# the switch:
k -n strat-a patch svc bg -p '{"spec":{"selector":{"color":"green"}}}'
k -n strat-a delete deploy blue
```

**Verify**
```bash
k -n strat-a describe svc bg | grep -E 'Selector|Endpoints'    # color=green, 2 endpoints
```
</details>

---

### 7.13 Port-forward for a quick test (⏱ 2 min)

Without creating any Service, reach pod `webone` in `expose-b` on `localhost:8081`, and write the HTTP status code to `/opt/course/7.13/code.txt`.

<details><summary>Solution</summary>

```bash
k -n expose-b port-forward pod/webone 8081:80 &
sleep 2
mkdir -p /opt/course/7.13
curl -s -o /dev/null -w '%{http_code}' localhost:8081 > /opt/course/7.13/code.txt
kill %1
```

**Verify**
```bash
cat /opt/course/7.13/code.txt     # 200
```
</details>

---

Clean up:

```bash
helm -n helm-a uninstall web; helm -n ingress-nginx uninstall myingress; helm -n traefik uninstall traefik
k delete ns expose-a expose-b multitenant helm-a gw-a strat-a ingress-nginx traefik
k get crd -o name | grep -E 'gateway.networking.k8s.io|traefik.io' | xargs kubectl delete   # Gateway API + Traefik CRDs stay behind otherwise
```
