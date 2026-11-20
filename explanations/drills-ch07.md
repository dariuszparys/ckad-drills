## 7.1

**What this trains:** Putting a ClusterIP Service in front of a Deployment and pointing it at a named container port instead of a number.

**Why the solution looks like this:**
- `create deployment --port=80` writes `containerPort: 80` but cannot name the port. The `name: http` line is added by hand.
- `expose` reads the Deployment from the API server, also with `$do`. It needs the live object to copy the pod labels into the selector, so the Deployment is applied first. Before that, `expose` finds no object to read.
- `--target-port=http` makes the Service look up the port by name in each pod. The container port number can change later without touching the Service.
- The name must match exactly. A Service that targets a name no pod defines gets no endpoints.
- The EndpointSlice check shows two endpoints on port 80: the selector matched both replicas and the name was resolved to a number.

**On the exam:** Apply the workload, then `expose` it, then check the endpoints. That takes seconds and catches both a wrong selector and a wrong port name.

**Docs:**
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#field-spec-ports): port definitions and named target ports. Search: `service`
- [kubectl expose](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_expose/): the flags, including `--target-port` and `--name`. Search: `kubectl expose`

## 7.2

**What this trains:** Repointing an existing Service at another set of pods by changing its selector, and seeing how a named target port can break that.

**Why the solution looks like this:**
- A Service has no link to a Deployment. It sends traffic to whatever pods match its selector, so switching backends is a change of one label value: `app` goes from `secondapp` to `newserver`.
- `--show-labels` comes first to confirm the new pods' label. `create deployment` sets `app=<name>`.
- The Service still targets the named port `http`. The httpd pods define no port with that name, so after the switch the Service would have no endpoints. That is why the target port is patched to the number 80 before the selector, and set back to the name afterwards.
- The port lives in a list, so the JSON patch addresses it by index: `/spec/ports/0/targetPort`. The selector is a plain map and takes a short merge patch.

**On the exam:** `k edit svc` is as fast as patching if you don't know the JSON syntax by heart. After any selector change, check `Endpoints` in `describe svc`.

**Docs:**
- [kubectl patch](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_patch/): examples for both patch forms, including a JSON patch with `op`, `path` and `value`. Search: `kubectl patch`
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service): how selector and `targetPort` work together. Search: `service`

## 7.3

**What this trains:** Exposing the same pods through the other two Service types, NodePort and LoadBalancer, and knowing what each adds.

**Why the solution looks like this:**
- Several Services can select the same pods. `--name` is required here, because `expose` would otherwise reuse the Deployment's name, which is taken.
- `expose` cannot set a specific node port. The NodePort Service is generated with `$do` and `nodePort: 32001` is added under `ports` before applying.
- For the LoadBalancer, `--port=8080` is what clients use and `--target-port=80` is where nginx listens. Leave out the target port and it defaults to 8080, where nothing answers.
- Without a cloud provider nobody assigns an address, so `EXTERNAL-IP` stays `<pending>`. That is expected, not an error. On minikube, `minikube tunnel` plays the provider.
- A LoadBalancer Service also gets a node port, so it is reachable that way while the external IP is pending.

**On the exam:** Use `expose` with `--type`, and go through YAML only when a fixed `nodePort` is required. Check `k get svc` for type, ports and the node port.

**Docs:**
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services-service-types): the Service types and what each one builds on. Search: `service types`
- [kubectl expose](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_expose/): `--type`, `--name`, `--port` and `--target-port`. Search: `kubectl expose`

## 7.4

**What this trains:** Reaching a Service in another namespace through cluster DNS, and knowing the forms a Service name can take.

**Why the solution looks like this:**
- The DNS name comes from the Service, not from the Deployment. `--name=shopping` on `expose` is what makes the name `shopping`; `mainapp` resolves to nothing.
- A bare `shopping` only resolves inside `multitenant`. From `expose-a` the name needs at least the namespace: `shopping.multitenant`. The pod's DNS search list completes the rest.
- The full name is `<svc>.<ns>.svc.cluster.local`. It works from every namespace and is what belongs in the answer file.
- `wget` accepts both forms. busybox `nslookup` ignores the search list for names that contain a dot, so the short form fails there even though DNS is fine. The check uses the full name for that reason.
- `mkdir -p` runs before the redirect, because the shell does not create missing directories.

**On the exam:** Test a cross-namespace Service with `wget` from a temporary pod. If a task asks for the FQDN, write all five parts.

**Docs:**
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#namespaces-of-services): name forms and how the search list resolves them. Search: `dns for services and pods`
- [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/): checks when a name does not resolve. Search: `debugging dns resolution`

## 7.5

**What this trains:** Installing an existing chart with Helm: adding a repository, finding the value to override, and installing into a new namespace.

**Why the solution looks like this:**
- `helm show values` prints the chart's defaults. It shows that the key is `controller.kind` and that its default is `Deployment`, which answers the last part of the task.
- `--set controller.kind=DaemonSet` overrides one value at install time. Downloading the chart and editing `values.yaml` gives the same result; `--set` is faster.
- `--create-namespace` together with `-n` creates the namespace in the same step. Without it the install fails because the namespace is missing.
- ingress-nginx was retired upstream in March 2026. The chart still installs, which is enough for practice, but it gets no further fixes.
- On minikube, don't install the chart next to the ingress addon. Both create the IngressClass `nginx`.

**On the exam:** Read `helm show values` before guessing a key name. Afterwards check `helm list -n` with the namespace and the workload it created.

**Docs:**
- [Using Helm](https://helm.sh/docs/intro/using_helm/#customizing-the-chart-before-installing): `show values`, `--set` and `--values`. Search: `using helm`
- [helm install](https://helm.sh/docs/helm/helm_install/): all install flags. Search: `helm install`
- [Ingress NGINX Retirement: What You Need to Know](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/): the retirement notice. Search: `ingress nginx retirement`

## 7.6

**What this trains:** The life cycle of a Helm release: install with values, upgrade, read the history, roll back, and list releases across namespaces.

**Why the solution looks like this:**
- `--reuse-values` keeps the previous revision's values and merges the new `--set` on top. Without it, an upgrade with `--set` starts again from the chart defaults.
- `helm history` shows one revision per install, upgrade or rollback. A rollback does not delete anything: it creates revision 3 with the description "Rollback to 1", and the Deployment is back at 2 replicas.
- `helm get values` shows only the values you supplied, not the chart defaults. With `--revision 2` it proves that the upgrade kept the service type.
- Helm 4 removed `helm list -a`. `helm list -A` covers all namespaces and shows releases in every state, including failed and pending ones.
- Every command needs `-n helm-a`, because releases are namespaced.

**On the exam:** Run `helm history` before a rollback to pick the revision, and again afterwards. Confirm the result on the Kubernetes side with `k get deploy`.

**Docs:**
- [Using Helm](https://helm.sh/docs/intro/using_helm/#helm-upgrade-and-helm-rollback-upgrading-a-release-and-recovering-on-failure): upgrade and rollback explained. Search: `using helm`
- [helm upgrade](https://helm.sh/docs/helm/helm_upgrade/): `--reuse-values` and related flags. Search: `helm upgrade`
- [helm list](https://helm.sh/docs/helm/helm_list/): the list filters and `-A`. Search: `helm list`

## 7.7

**What this trains:** Routing by host name: one Ingress that sends two hosts to two Services, built with the `create ingress` generator.

**Why the solution looks like this:**
- `expose pod` works here because `kubectl run` labels each pod `run=<name>`. The Services get that as their selector.
- Each `--rule` has the form `host/path=service:port`. The generator writes the nested YAML, which is slow and error-prone to type.
- A trailing `*` on the path gives `pathType: Prefix`. Without it the generator writes `Exact`, and then only `/` itself matches, not `/index.html`.
- `--class=nginx` sets `ingressClassName`. A controller only serves Ingresses of its class, so an Ingress without one can sit there unused.
- The curl checks send a `Host:` header to the controller's address, because the host names don't resolve anywhere. A request without a matching host gets the controller's own 404, which shows that only the listed hosts are routed.

**On the exam:** Generate with `$do`, check `pathType` and the backend ports in the file, then apply. In `describe ingress`, each rule must show a backend with endpoints.

**Docs:**
- [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/#name-based-virtual-hosting): host-based rules with a full manifest. Search: `ingress`
- [kubectl create ingress](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/): the `--rule` syntax with examples. Search: `kubectl create ingress`

## 7.8

**What this trains:** Routing by path under one host, and what a default backend does and does not catch with ingress-nginx.

**Why the solution looks like this:**
- Two rules for the same host end up as two paths under one `host` entry. With `Prefix` the longest matching path wins, so `/api` goes to `webtwo-svc` and everything else under `/` to `webone-svc`.
- `--default-backend` becomes `spec.defaultBackend`. The Ingress API describes it as the target for requests that match no rule.
- ingress-nginx is narrower: for an Ingress that has rules, it uses the default backend only for that Ingress's own hosts. A request for `other.local` still gets the controller's 404. Catching every other host takes a second Ingress with no rules, only a default backend: the `catchall` object.
- The path reaches the backend unchanged. httpd has no `/api`, so its own 404 is expected and proves the request arrived at `webtwo-svc`.
- Once `catchall` exists, unknown hosts no longer get a 404.

**On the exam:** Test one request per rule and one for a host that is not listed. Read which server answered, not only the status code.

**Docs:**
- [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/#default-backend): default backend, path types and fanout examples. Search: `ingress`
- [kubectl create ingress](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/): `--default-backend` and rule examples. Search: `kubectl create ingress`

## 7.9

**What this trains:** The two Gateway API objects an application developer writes: a Gateway that opens a listener and an HTTPRoute that attaches to it.

**Why the solution looks like this:**
- The work is split across objects. The GatewayClass names the controller, the Gateway defines where traffic enters, and the HTTPRoute holds the routing rules. An Ingress puts all of that in one object.
- `gatewayClassName: traefik` hands the Gateway to the installed controller. The listener uses port 8000 because that is Traefik's HTTP entrypoint.
- `allowedRoutes.namespaces.from: Same` lets only routes from `gw-a` attach.
- The HTTPRoute joins the Gateway through `parentRefs` and sends traffic to the Service through `backendRefs`. A wrong Gateway name there leaves the route unattached.
- The status columns are the first check: the Gateway shows `PROGRAMMED True` and the route is accepted. The port-forward to Traefik then tests the path without an external address.

**On the exam:** There is no generator, so copy both manifests from the kubernetes.io Gateway API page and fill gaps with `k explain gateway.spec.listeners`. The project's own site, gateway-api.sigs.k8s.io, is not allowed.

**Docs:**
- [Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/#api-kind-gateway): Gateway and HTTPRoute examples to copy. Search: `gateway api`

## 7.10

**What this trains:** A canary release with Gateway API: one HTTPRoute rule that splits requests between two Services by weight.

**Why the solution looks like this:**
- Both Services go into the same rule's `backendRefs`, each with a `weight`. The weights are proportions of their sum, so 90 and 10 give a 90/10 split.
- The split happens per request in the gateway and does not depend on replica counts. One pod per version is enough, and any ratio is possible, which the replica-ratio canary cannot offer.
- The route keeps its name and `parentRefs`. Applying the manifest updates the existing object; the Gateway needs no change.
- Each backend needs its own Service, because `backendRefs` point at Services, not at Deployments or pods.
- The loop counts which server answered 20 requests. Expect roughly 18 to 2. The split is statistical, so 17/3 or 19/1 is also fine. If one side gets nothing, run the loop again and re-check the route.

**On the exam:** The Gateway API page on kubernetes.io mentions traffic weighting but shows no `weight` example, and the project's own site is not allowed. Get the field from the cluster with `k explain httproute.spec.rules.backendRefs`.

**Docs:**
- [Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/#api-kind-httproute): the HTTPRoute manifest to start from. Search: `gateway api`

## 7.11

**What this trains:** A canary release with nothing but Deployments, labels and one Service: the replica ratio sets the traffic share.

**Why the solution looks like this:**
- The Service selects only `app=myapp`. Both Deployments' pods carry that label, so all five become endpoints of one Service. Traffic is spread across endpoints, and one of five is about 20%.
- Each Deployment adds `version` to its own selector. Without it the two selectors would be identical and both Deployments would claim the same pods.
- The labels are changed in the generated YAML before the first apply. A Deployment's selector is immutable, and it must match the template labels or the API server rejects the object.
- The EndpointSlice check lists five pod names, and `-L version` shows the 4:1 split. Together they prove the ratio without sending requests.
- Promoting is two `scale` commands: v2 up, v1 down to zero.

**On the exam:** Generate both Deployments with `$do`, edit the labels in the selector and the template, and check the endpoint count of the Service before moving on.

**Docs:**
- [Managing Workloads](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments): the canary pattern with a shared label and a `track` label. Search: `canary deployments`
- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors): how selectors match. Search: `labels and selectors`

## 7.12

**What this trains:** A blue/green release: two complete versions run side by side and the Service selector decides which one receives traffic.

**Why the solution looks like this:**
- Both Deployments run at full size before the switch. Green can be checked while blue still serves, and the change moves all traffic at once, with no mixed phase as in a canary.
- The generators label everything `app=<name>`. The `sed` step rewrites that to `color` in the Deployment's labels, selector and template in one pass, so the three stay consistent. For the Service it rewrites the selector that `create service` sets to `app=bg`.
- The switch is one patch that changes the value of the selector key `color` from `blue` to `green`. The endpoints update right away.
- Blue is deleted last. While it exists, rolling back is the same patch with the old value.
- `describe svc` shows the new selector and two endpoints, which proves green's pods were ready and matched.

**On the exam:** Check that the green pods are Ready before patching. Confirm the endpoints afterwards, and only then delete blue.

**Docs:**
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service): how a Service's selector picks its pods. Search: `service`
- [Update API Objects in Place Using kubectl patch](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/): merge patch examples and the patch types compared. Search: `kubectl patch`

## 7.13

**What this trains:** Reaching a pod from your own shell with `port-forward`, without creating a Service, and capturing only the HTTP status code.

**Why the solution looks like this:**
- `port-forward` opens a tunnel from a local port through the API server to the pod. It needs no Service and no route to the pod network, which makes it the quickest test of a single pod.
- The mapping is `local:remote`. `8081:80` listens on 8081 locally and connects to port 80 in the pod.
- The command blocks, so it runs in the background with `&`. `kill %1` stops it afterwards and frees the port.
- `sleep 2` gives the tunnel time to start listening. A curl sent right away gets "connection refused", and the file would hold `000` instead of a real status.
- `-o /dev/null` discards the body and `-w '%{http_code}'` prints only the code. With `-s` nothing else reaches the file.

**On the exam:** Background the forward, wait a moment, test, kill it. Then `cat` the file to confirm it holds `200` and nothing else.

**Docs:**
- [Use Port Forwarding to Access Applications in a Cluster](https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/#forward-a-local-port-to-a-port-on-the-pod): the command forms for pods, Deployments and Services. Search: `port forwarding`
- [kubectl port-forward](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/): flags and examples. Search: `kubectl port-forward`
