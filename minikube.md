# Running the drills on minikube

Notes for a Mac with Apple Silicon and the Docker driver. Every point here
was hit while running all the drills on Kubernetes v1.37.0 (minikube, 2 nodes,
containerd, Calico, Helm 4).

## One-time setup

```bash
brew install minikube kubectl helm bash bash-completion@2 gnu-sed
```

Give Docker Desktop at least 4 CPUs and 8 GB of memory (Settings → Resources).

```bash
minikube start -p ckad --driver=docker --nodes=2 --cni=calico \
  --cpus=2 --memory=3g --kubernetes-version=v1.37.0
minikube profile ckad
minikube addons enable metrics-server
sudo mkdir -p /opt/course && sudo chown $USER /opt/course
```

Why these flags:

- `-p ckad` and `--nodes=2`: the nodes are named `ckad` and `ckad-m02`. Drill
  5.10 pins a pod to `ckad`, and two nodes let you see where pods are placed.
- `--cni=calico`: required for the NetworkPolicy drills (6.9 to 6.11, mock
  task 15). The default CNI on a multi-node Docker cluster accepts policies
  and enforces nothing.
- `--kubernetes-version`: the exam's minor version.

Daily use: `minikube start -p ckad` and `minikube stop -p ckad`. Start over
with `minikube delete -p ckad`.

Practise in the bash shell from the [README](README.md), not in zsh.

## Reaching things from the Mac

The cluster runs inside Docker Desktop's VM. From macOS you **cannot** reach
node IPs, NodePorts, ClusterIPs or pod IPs. Use one of these:

- A throwaway pod, for anything inside the cluster:

  ```bash
  k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>.<ns>
  ```

- From the node, for NodePorts and ClusterIPs:

  ```bash
  minikube ssh -- curl -s localhost:<nodePort>
  ```

- `k port-forward svc/<svc> 8080:80`, then `curl localhost:8080`. Wait a
  second or two after starting it in the background.
- `minikube service <svc> -n <ns> --url` prints a `127.0.0.1` URL. Keep that
  terminal open.

Two traps:

- A command with quotes needs the whole remote command quoted, or the header
  gets split and you get `400 Bad Request`:

  ```bash
  minikube ssh -- "curl -s -H 'Host: www.example.com' <ClusterIP>"
  ```

- busybox `nslookup` ignores the search domains for names that contain a dot.
  Use the full `<svc>.<ns>.svc.cluster.local`.

## LoadBalancer and Ingress

- `minikube tunnel` in a second terminal gives LoadBalancer Services an
  EXTERNAL-IP of `127.0.0.1`. For ports 80 and 443 it asks for your password.
- Ingress controller: use **either** `minikube addons enable ingress` **or**
  the Helm install from drill 7.5, not both. Both create IngressClass `nginx`.
- To test an Ingress, run the tunnel and send the host name as a header to
  `127.0.0.1`:

  ```bash
  curl -s -H "Host: shop.example.com" http://127.0.0.1/api
  ```

- Without the tunnel, port-forward to the controller instead and use that
  port:

  ```bash
  k -n ingress-nginx port-forward svc/ingress-nginx-controller 8080:80
  ```

- The ingress-nginx project was retired upstream in March 2026. It still
  installs; the Gateway API is the maintained path.

## Gateway API (drills 7.9 and 7.10)

minikube has no Gateway API CRDs and no controller. Install both:

```bash
k apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
helm repo add traefik https://traefik.github.io/charts && helm repo update traefik
helm install traefik traefik/traefik -n traefik --create-namespace \
  --set providers.kubernetesGateway.enabled=true
k -n traefik rollout status deploy traefik
k get gatewayclass          # traefik
```

Traefik serves HTTP on port 8000 inside the cluster. Test through a
port-forward:

```bash
k -n traefik port-forward deploy/traefik 8080:8000
```

Remove everything afterwards. The CRDs stay behind unless you delete them:

```bash
helm -n traefik uninstall traefik && k delete ns traefik
k get crd -o name | grep -E 'gateway.networking.k8s.io|traefik.io' | xargs kubectl delete
```

## Images you build yourself (chapter 3)

There is no podman or docker inside the minikube nodes. Build on the Mac with
Docker Desktop, then get the image into the cluster.

| Route | Commands | In the pod spec |
|---|---|---|
| Load the image | `docker build -t app:v1 .` then `minikube image load app:v1` | `image: app:v1`, `imagePullPolicy: IfNotPresent` |
| Registry addon (drill 3.3) | see below | `image: localhost:5000/app:v1` |

A tag of `:latest`, or no tag, defaults to `imagePullPolicy: Always`. The
kubelet then tries Docker Hub and fails with `ErrImagePull`. Use a real tag.

Registry addon:

```bash
minikube addons enable registry
docker run --rm -d --name reg-proxy --network=host alpine ash -c \
  "apk add socat && socat TCP-LISTEN:5000,reuseaddr,fork TCP:$(minikube ip):5000"
export repo=localhost:5000
```

On macOS the AirPlay Receiver owns port 5000, so `curl localhost:5000` from
the Mac returns 403. `docker push` still works. Check the catalog from the
node:

```bash
minikube ssh -- curl -s localhost:5000/v2/_catalog
```

Stop the proxy with `docker rm -f reg-proxy`.

## Images that don't run on Apple Silicon

Images published only for amd64 fail with `exec format error` or
`no matching manifest`. The drills avoid them:

| Often used | Problem | The drills use |
|---|---|---|
| `registry.k8s.io/goproxy:0.1` | amd64 only | `registry.k8s.io/e2e-test-images/agnhost:2.53` with `args: ["netexec","--http-port=8080"]` |
| `vish/stress` | amd64 only | `python:3.12-alpine` allocating memory in a one-liner |
| Bitnami charts | versioned images moved to `bitnamilegacy` | the `podinfo` chart |

`nginx`, `httpd`, `busybox`, `python`, `redis` and `registry.k8s.io/pause` are
multi-arch.

## Storage

- minikube ships a default StorageClass, `standard`. A PVC without
  `storageClassName` is provisioned dynamically.
- To bind a PVC to a PV you wrote yourself, give both the same
  `storageClassName` (the drills use `manual`).
- hostPath data lives on **one node**. Create the directory with
  `minikube ssh -- sudo mkdir -p <dir>` and pin the pod with `nodeName: ckad`.
- There is no NFS server.

## Other differences from a "real" cluster

- `k top` needs the `metrics-server` addon and about a minute of data.
- The control-plane node has no `NoSchedule` taint, so pods run on both nodes.
- Ephemeral containers (`k debug --target=...`) work with containerd,
  including process-namespace sharing.
- Calico installs its own CRDs (`*.crd.projectcalico.org`), which drill 4.12
  uses as its example.

## Cleaning up

Each drill uses its own namespace. Delete a namespace to remove everything in
it:

```bash
k delete ns <namespace>
```

Cluster-wide leftovers to remove by hand: PersistentVolumes (chapter 5),
ClusterRoles and ClusterRoleBindings (chapter 6), Helm releases, IngressClasses
and the Gateway API CRDs (chapter 7).
