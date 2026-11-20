# Foundations and extras

These two topics are not bullets in the official CKAD curriculum. The first, kubectl fluency, underlies every task in every domain: you cannot solve anything quickly without it. The second, Gateway API, is covered by the drills, so it is explained here as well.

## kubectl fluency: Pods, namespaces, labels and selectors, kubectl explain

Almost every task starts the same way: generate a manifest, adjust it, apply it. `k run` creates a Pod and `k create` most other kinds. With `$do` the command prints YAML instead of creating the object, so you redirect it to a file, add what the generator cannot set, and run `k apply -f`. This is faster than typing YAML and avoids indentation mistakes.

Generated YAML lists fields alphabetically. A container therefore starts with `- image:`, and its `name:` is the indented line below. `k run` names the container after the pod and labels the pod `run=<name>` unless you pass `-l`.

Namespaces separate objects by name. Every task names one, and a command without `-n` works in the wrong place. `-A` lists across all namespaces.

Labels are key-value pairs in `metadata.labels`. Selectors are how Services, Deployments and NetworkPolicies find their pods, and how you filter with `-l`:

- Equality: `-l app=web,env!=prod`. A comma means AND.
- Set-based: `-l 'env in (dev,test)'`, or `-l env` for "has the key".

`--show-labels` prints all labels and `-L <key>` adds one label as a column. A pod whose label you change so that it no longer matches its ReplicaSet is replaced by a new pod and keeps running as an orphan.

`k explain` is the schema reference in the terminal. Give it a field path to read the type and meaning of a field; add `--recursive` to print the whole tree of field names below it. `k api-resources` adds short names, API versions and whether a kind is namespaced.

For answers that go into a file, shape the output with `-o jsonpath` or `-o custom-columns` rather than cutting text.

Most pod fields cannot change after creation. `image` can, so `k set image` works on a running pod. For everything else, export the pod, edit the file and run `k replace --force -f`.

### What you must be able to do
- Generate Pods, Deployments and Services imperatively and finish them in an editor.
- Work in the right namespace and list across all of them.
- Add, change and remove labels, and select objects by label.
- Find any field's path and type with `k explain`.
- Extract single values with jsonpath or custom columns.

### Commands and YAML to know
```bash
export do="--dry-run=client -o yaml"
k create ns shop
k -n shop run web --image=nginx:1.27 --port=80 -l app=web,tier=front $do > web.yaml
k -n shop create deployment api --image=nginx --replicas=2 --port=80 $do > api.yaml
k get po -A -o wide
k get po -l 'env in (dev,test)' --show-labels
k get po -l app=myapp -L version
k label po web tier=backend --overwrite      # change an existing label
k label po web tier-                         # remove it
k delete po -l system=tux
k explain pod.spec.containers.securityContext --recursive | less
k explain pod.spec.containers.securityContext.runAsUser | head -5
k api-resources | grep -i networkpol
k get po web -o jsonpath='{.spec.containers[0].image}{"\n"}'
k get po -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'
k get po -A --no-headers -o custom-columns=NAME:.metadata.name
k set image pod/web web=nginx:1.28-alpine    # container=image
k replace --force -f web.yaml                # delete and recreate
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: shop
  labels:
    app: web
    tier: front
spec:
  containers:
  - name: web                  # generated YAML puts "- image:" first, name below
    image: nginx:1.27
    ports:
    - containerPort: 80
```

### Traps
- Renaming a generated container: change the `name:` under `- image:`, not `metadata.name`.
- Leaving out `-n`. The object lands in `default`, not in the namespace the task names.
- `k label` refuses to change an existing key without `--overwrite`.
- Set-based selectors contain spaces and brackets. Put them in quotes.
- jsonpath output ends without a newline. Append `{"\n"}` when the result goes into a file.
- Changing or replacing a pod that a Deployment owns does not last. Change the Deployment.

### Docs
- [kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/): generators, output formats, labels, patching. Search: `kubectl quick reference`
- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/): equality and set-based syntax. Search: `labels and selectors`
- [JSONPath Support](https://kubernetes.io/docs/reference/kubectl/jsonpath/): `range`, filters and quoting. Search: `jsonpath`

## Gateway API

Gateway API is the newer way to route traffic into a cluster and the successor to Ingress. It is not part of the core API: its kinds are CustomResourceDefinitions in the group `gateway.networking.k8s.io`, installed together with a controller that implements them. `k api-resources` shows whether a cluster has them.

Where Ingress puts everything into one object, Gateway API splits the work over three kinds:

| Kind | Scope | Role |
|---|---|---|
| GatewayClass | Cluster | Names the controller, like an IngressClass. |
| Gateway | Namespace | An entry point: listeners with a name, port and protocol. |
| HTTPRoute | Namespace | Routing rules that attach to a Gateway and point to Services. |

A Gateway refers to its class with `gatewayClassName`. Each listener can limit which routes may attach through `allowedRoutes.namespaces.from`: `Same` (the default) accepts routes from the Gateway's own namespace only, `All` from every namespace.

An HTTPRoute has four parts:

- `parentRefs`: the Gateway it attaches to.
- `hostnames`: optional, the host names it serves.
- `rules[].matches`: what to match, for example a path with type `PathPrefix` or `Exact`.
- `rules[].backendRefs`: the Services and ports that receive the traffic.

Each backend can carry a `weight`. Traffic is split in proportion to the weights, so 90 and 10 send about one request in ten to the second Service. That makes a canary release a small change to one route, with no need to scale Deployments to a ratio.

A request therefore flows from the Gateway's listener through the matching HTTPRoute to a Service and its pods. Nothing reports an error when a link is missing; the route is just not accepted. Check the status: a Gateway shows `PROGRAMMED True`, and `k describe httproute` shows whether the parent accepted the route.

Gateway API is not a bullet in the CKAD curriculum, and the project's own documentation site is not among the sites the CKAD allows. The Gateway API concept page on kubernetes.io/docs is allowed and has a Gateway and an HTTPRoute example.

### What you must be able to do
- Check that the CRDs and a GatewayClass exist.
- Write a Gateway with one HTTP listener.
- Write an HTTPRoute that attaches to it and sends a path to a Service.
- Split traffic between two Services with weights.
- Read the status of both objects to confirm the route is accepted.

### Commands and YAML to know
There is no generator. Copy the examples from the concept page.

```bash
k api-resources | grep gateway
k get gatewayclass
k -n shop get gateway,httproute
k -n shop describe httproute web-route
k explain httproute.spec.rules.backendRefs
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: shop
spec:
  gatewayClassName: traefik    # from: k get gatewayclass
  listeners:
  - name: http
    port: 8000                 # a port the controller's proxy listens on
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: Same
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: shop
spec:
  parentRefs:
  - name: my-gateway
  hostnames:                   # optional
  - shop.local
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: web                # Service name
      port: 80
      weight: 90
    - name: web-v2
      port: 80
      weight: 10
```

### Traps
- The `apiVersion` is `gateway.networking.k8s.io/v1`, not the `networking.k8s.io/v1` of Ingress.
- A route in another namespace does not attach while the listener says `from: Same`.
- A wrong name in `parentRefs` or `backendRefs` is accepted by `k apply` and routes nothing. Read the status.
- The listener port must be one the controller serves. Traefik's Helm chart serves HTTP on 8000 by default.
- A weighted split is statistical. Send 20 or more requests and count before you judge it.

### Docs
- [Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/): the resource model with a Gateway and an HTTPRoute example. Search: `gateway api`
- [Ingress NGINX Retirement: What You Need to Know](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/): why Gateway API is the suggested path after ingress-nginx. Search: `ingress nginx retirement`
