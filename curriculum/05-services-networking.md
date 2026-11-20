# Services and Networking (20%)

This domain covers how traffic reaches pods. Services give a group of pods one stable name and IP, Ingress routes HTTP requests by host and path to Services, and NetworkPolicies decide which connections are allowed at all. Tasks ask you to expose a workload, repair a Service that reaches nothing, write an Ingress from a list of routes, or turn a sentence such as "only the backend may reach the database" into a policy.

## Demonstrate basic understanding of NetworkPolicies

Without any policy, every pod can reach every other pod. A NetworkPolicy picks pods in its own namespace with `spec.podSelector` and lists the traffic they may receive (`ingress`) or send (`egress`). Once a policy selects a pod for a direction, everything in that direction that no policy allows is dropped.

Policies are additive allow-lists. There are no deny rules and no order: the union of all policies selecting a pod applies. A default deny is a policy with `podSelector: {}` (every pod in the namespace), the directions in `policyTypes` and no rules.

Each rule combines peers (`from` or `to`) with `ports`. A peer is one of:

- `podSelector`: pods in the policy's own namespace.
- `namespaceSelector`: all pods in the matching namespaces; `{}` means every namespace. Each namespace carries the label `kubernetes.io/metadata.name`.
- `ipBlock`: a CIDR, with optional `except` ranges.

Items in a `from` list are OR'd. A single item that holds both a `namespaceSelector` and a `podSelector` is an AND: those pods in those namespaces. The only difference in the YAML is one dash.

A connection needs both ends to agree: the client's egress and the server's ingress. A pod with restricted egress also loses DNS until you allow UDP and TCP 53.

The CNI plugin enforces policies. Calico and Cilium do; a plugin without policy support accepts the object and does nothing. Blocked traffic is dropped silently, so a test runs into its timeout. When DNS is blocked, the error is `bad address` instead, because the name never resolves.

### What you must be able to do
- Write a default deny for ingress, egress or both.
- Allow traffic by pod label, namespace label or CIDR, limited to a port.
- Tell an AND rule from an OR rule.
- Add the DNS exception to an egress policy.
- Test with one allowed and one blocked client.

### Commands and YAML to know
There is no generator. Copy an example from the docs and edit it.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-policy
  namespace: shop
spec:
  podSelector:                 # the pods this policy protects; {} = all
    matchLabels:
      app: db
  policyTypes:                 # default deny: podSelector {} + policyTypes, no rules
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:             # item 1
        matchLabels:
          app: backend
    - namespaceSelector:       # item 2: OR
        matchLabels:
          team: frontend
      podSelector:             # no dash: AND with the namespaceSelector above
        matchLabels:
          role: client
    - ipBlock:                 # item 3: OR
        cidr: 10.0.0.0/16
        except:
        - 10.0.5.0/24
    ports:
    - protocol: TCP
      port: 6379
  egress:
  - to:
    - namespaceSelector: {}    # DNS, in any namespace
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

```bash
k -n shop describe netpol db-policy      # readable summary of the rules
k get ns --show-labels                   # labels for namespaceSelector
k -n shop get po --show-labels -o wide
# an allowed client, then one without the label; -w 3 sets a timeout
k -n shop run t1 --rm -it --restart=Never --image=busybox:1.36 -l app=backend -- nc -zv -w 3 db 6379
k -n shop run t2 --rm -it --restart=Never --image=busybox:1.36 -- nc -zv -w 3 db 6379
```

### Traps
- A dash too many turns AND into OR and opens the pod to a whole namespace. Read the rule back with `k describe netpol`.
- A `podSelector` peer never matches pods in other namespaces. Use a `namespaceSelector` for those.
- An egress policy without the port 53 rule breaks every lookup by name. Test with the Service name, not only the IP.
- Without `policyTypes`, a policy that has no egress rules does not restrict egress. Always write the field.
- A test without a timeout hangs. Use `wget -T 3` or `nc -w 3`.

### Docs
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/): a full example to copy, the AND and OR selector forms, and the default deny policies. Search: `network policies`
- [Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/): a walk-through that tests a policy from a temporary busybox pod. Search: `declare network policy`

## Provide and troubleshoot access to applications via services

Pod IPs change whenever pods are replaced. A Service gives a set of pods one stable virtual IP and DNS name. Its `selector` picks pods by label, and the matching pod IPs are recorded in EndpointSlices. Only ready pods receive traffic.

| Type | What you get |
|---|---|
| `ClusterIP` | The default: a virtual IP that works only inside the cluster. |
| `NodePort` | A ClusterIP plus a port from 30000 to 32767 on every node. |
| `LoadBalancer` | A NodePort plus an external load balancer. With no cloud provider, `EXTERNAL-IP` stays `<pending>`. |
| `ExternalName` | A DNS alias for an external name. No selector, no proxying. |
| Headless | `clusterIP: None`: no virtual IP, DNS returns the pod IPs. |

`port` is where the Service listens. `targetPort` is the container port, as a number or as the name of a `containerPort`; it defaults to `port`. `nodePort` is the port opened on every node. A named `targetPort` is resolved per pod, so pods without a port of that name never become endpoints.

The two generators choose selectors differently. `k expose` reads a live object and copies its selector: the Deployment's selector, or all labels of a pod. `k create service` always writes `app=<service name>`; if the pods carry other labels, the Service stays empty until you edit it. Only its `nodeport` form has a `--node-port` flag.

A Service answers to `<svc>` in its own namespace, to `<svc>.<ns>` from other namespaces, and to the full `<svc>.<ns>.svc.cluster.local`. busybox `nslookup` ignores the search domains for names that contain a dot, so give it the full name.

When a Service does not answer, read its EndpointSlices:

- No endpoints: the selector does not match the pod labels, or the named `targetPort` does not exist.
- Endpoints with `ready: false`: the readiness probe fails. `k describe svc` lists ready endpoints only.
- Endpoints look right but connections fail: `targetPort` is not the port the app listens on.
- The IP works but the name does not: check CoreDNS and egress NetworkPolicies.

### What you must be able to do
- Expose a Deployment or pod with a given type, port and target port.
- Pin a node port and use a named target port.
- Point a Service at other pods by changing its selector.
- Reach a Service in another namespace by name.
- Find out why a Service has no endpoints and fix it.

### Commands and YAML to know
```bash
k expose deploy web --name=web-svc --port=8080 --target-port=80
k expose deploy web --name=web-np --type=NodePort --port=80 $do > np.yaml   # add nodePort by hand
k create service clusterip web --tcp=8080:80 $do          # port:targetPort, selector app=web
k create service nodeport web --tcp=80:80 --node-port=30080 $do
k get endpointslices -l kubernetes.io/service-name=web
k describe svc web | grep -E 'Selector|Endpoints'
k get po --show-labels -o wide
k patch svc web -p '{"spec":{"selector":{"app":"web"}}}'
k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -T 3 -qO- web.shop:8080
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  type: NodePort               # leave out for ClusterIP
  selector:
    app: web                   # must equal the pod labels
  ports:
  - port: 8080                 # the Service's own port
    targetPort: 80             # container port: number or port name
    nodePort: 30080            # NodePort and LoadBalancer only
```

### Traps
- `k expose pod` copies every pod label into the selector and fails for a pod without labels. Label the pod first.
- `--tcp=8080:80` means port 8080, target port 80. Swapped, the endpoints exist but refuse connections.
- After you point a Service at another backend, a named `targetPort` may match nothing. A number works for both.
- `k get endpoints` reads `v1 Endpoints`, deprecated since v1.33, and prints a warning. Use EndpointSlices.

### Docs
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/): types, port fields, headless Services, ExternalName. Search: `service`
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/): the names a Service gets. Search: `dns for services and pods`
- [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/): a checklist from DNS to endpoints to pods. Search: `debug services`

## Use Ingress rules to expose applications

An Ingress is a set of HTTP routing rules: requests for this host and path go to that Service and port. The rules do nothing by themselves. An ingress controller, a proxy running in the cluster, watches Ingress objects and configures itself from them. Without a controller the object is accepted and no traffic flows.

An IngressClass names a controller, and `spec.ingressClassName` says which class handles the Ingress. List the classes with `k get ingressclass`.

Each rule has an optional `host` and a list of paths; without a host it applies to every host. Every path needs a `pathType`: `Prefix` matches the path and everything below it, `Exact` matches that one path only. The backend is `service.name` plus `service.port.number`. It names the Service's `port`, not the container port, and the Service must be in the Ingress's namespace. When several Prefix paths match, the longest wins, so `/api` and `/` can share a host.

`spec.defaultBackend` receives requests that match no rule. ingress-nginx uses the default backend of an Ingress that has rules only for that Ingress's own hosts; other hosts still get the controller's 404. To catch every other host, create a second Ingress with a default backend and no rules.

The generator's rule format is `host/path=service:port`. A trailing `*` on the path produces `pathType: Prefix`; without it you get `Exact`.

To test, send a request to the controller's address with the right `Host` header. The path reaches the backend unchanged, so a 404 page from the backend's own server still proves the route. A 503 means the Service has no endpoints.

The ingress-nginx project was retired upstream in March 2026 and gets no further fixes. The Ingress API itself is still served; new routing features go into Gateway API.

### What you must be able to do
- Find the IngressClass and set it on a new Ingress.
- Route several hosts, or several paths of one host, to different Services.
- Add a default backend and know which requests it catches.
- Test a route with `curl` and a `Host` header.

### Commands and YAML to know
```bash
k get ingressclass
k create ingress shop --class=nginx \
  --rule="shop.local/api*=api-svc:8080" \
  --rule="shop.local/*=web-svc:80" \
  --default-backend=web-svc:80 $do > ing.yaml
k create ingress catchall --class=nginx --default-backend=web-svc:80
k get ingress                              # CLASS, HOSTS, ADDRESS
k describe ingress shop                    # rules with their backends
curl -s -H "Host: shop.local" $IP/api      # IP = address of the ingress controller
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: shop.local" $IP
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  namespace: shop
spec:
  ingressClassName: nginx
  defaultBackend:              # optional
    service:
      name: web-svc
      port:
        number: 80
  rules:
  - host: shop.local           # leave out to match every host
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 8080     # the Service's port
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-svc
            port:
              number: 80
```

### Traps
- A rule without the trailing `*` creates an `Exact` path, so `/api/users` returns 404. Check `pathType` in the generated YAML.
- Quote the `--rule` value, or the shell may expand the `*`.
- Without `ingressClassName`, and with no default class in the cluster, no controller picks the Ingress up.
- A request without the `Host` header matches no host rule and returns the controller's 404.
- Old manifests use `serviceName` and `servicePort`. The v1 API needs the nested `service` block and a `pathType`.

### Docs
- [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/): the resource, path types, fanout and virtual host examples. Search: `ingress`
- [Ingress Controllers](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/): why a controller is needed and which ones exist. Search: `ingress controllers`
- [Ingress NGINX Retirement: What You Need to Know](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/): the announcement and the suggested move to Gateway API. Search: `ingress nginx retirement`
