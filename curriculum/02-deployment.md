# Application Deployment (20%)

This domain is about releasing new versions without breaking the running one: Deployment rollouts and rollbacks, blue/green and canary set-ups built from plain Deployments and Services, and the two packaging tools, Helm and Kustomize. Tasks give you a running application and ask you to update it, roll it back, split its traffic, or install and upgrade a chart.

## Use Kubernetes primitives to implement common deployment strategies (e.g. blue/green or canary)

A Deployment has two built-in strategies, set in `spec.strategy.type`:
- `RollingUpdate` (default) replaces Pods step by step. Old and new versions serve side by side for a while.
- `Recreate` deletes all old Pods, then starts the new ones. There is a short outage, but two versions never run together.

Blue/green and canary are not fields. You build them from two Deployments and one Service, and labels do the work.

**Blue/green:** both versions run at full size. The Service selector names one of them, for example `color: blue`. Once green is ready, change the selector to `color: green`. All traffic moves in one step, and going back is the same change in reverse.

**Canary:** both Deployments give their Pods a common label (`app: myapp`) and one of their own (`version: v1`, `version: v2`). The Service selects only the common label, so it spreads requests over the Pods of both. The traffic share follows the Pod share: 4 Pods of v1 and 1 of v2 send about 20% to v2. Promote the canary by scaling v2 up and v1 to zero.

Each Deployment's own `selector` must include the label that tells the versions apart, so that neither claims the other's Pods.

An HTTPRoute can also split traffic by `weight`, independent of replica counts. That belongs to the Gateway API competency.

### What you must be able to do
- Switch a Deployment to `Recreate`.
- Run two versions side by side with distinct labels.
- Move a Service to another version by changing its selector.
- Size a canary for a requested percentage.
- Prove the result from the Service's endpoints.

### Commands and YAML to know

```bash
k patch svc bg -p '{"spec":{"selector":{"color":"green"}}}'
k scale deploy app-v2 --replicas=4
k get po -l app=myapp -L version
k get endpointslices -l kubernetes.io/service-name=myapp
k describe svc bg | grep -E 'Selector|Endpoints'
```

```yaml
kind: Deployment               # the canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
      version: v2
  template:
    metadata:
      labels:
        app: myapp             # the Service selects this
        version: v2            # this separates the versions
---
kind: Service
spec:
  selector:
    app: myapp                 # no version: both get traffic
```

### Traps
- `k create deployment` labels Pods `app=<name>`. For a shared label, edit both `selector.matchLabels` and the template labels. They must agree or the API rejects the Deployment.
- A canary needs the Service unchanged. Adding `version` to its selector cuts one version off.
- `k patch` replaces only the keys you name. If blue and green differ in another key, the old key stays in the selector and the Service has no endpoints.
- Switching to `Recreate` while `strategy.rollingUpdate` is still set is rejected. Remove that block in the same change.

### Docs
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy): `Recreate` and `RollingUpdate`. Search: `deployment strategy`
- [Managing Workloads](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments): canary with a shared label and a `track` label. Search: `canary deployments`
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/): how selectors choose Pods. Search: `service`

## Understand Deployments and how to perform rolling updates

A Deployment does not manage Pods directly. For every version of its Pod template it creates a ReplicaSet, and a rollout scales the new ReplicaSet up while it scales the old one down. Only a change to `spec.template` (image, env, resources) starts a rollout and creates a revision. Scaling does not.

Two fields under `spec.strategy.rollingUpdate` set the pace. Each takes a number or a percentage of `replicas` and defaults to 25%:
- `maxSurge`: how many Pods above `replicas` may exist during the update.
- `maxUnavailable`: how many Pods below `replicas` may be missing.

`maxUnavailable: 0` means a new Pod must be ready before an old one is removed. If the new image is broken, the rollout stalls and the old Pods keep serving. `minReadySeconds` makes a new Pod count as available only after it has been ready that long.

Old ReplicaSets stay at 0 replicas as the history that `rollout undo` uses. Undo does not rewind. It copies the old template forward as a new revision: undo from revision 3 to 2 and the history shows 1, 3 and 4. Revision 2 is gone, and 4 carries its template.

The `kubernetes.io/change-cause` annotation on the Deployment fills the CHANGE-CAUSE column of the history; the `--record` flag is deprecated. The annotation is copied to every new ReplicaSet, so a later change without a new annotation shows the old cause.

`rollout pause` lets you make several template changes that roll out as one revision after `rollout resume`.

### What you must be able to do
- Translate "never below 6, at most 2 extra" into `maxUnavailable` and `maxSurge`.
- Update an image and wait for the rollout to finish.
- Record a change cause.
- Find the revision that runs a given image and roll back to it.
- Batch several changes with pause and resume.

### Commands and YAML to know

```bash
k set image deploy/web nginx=nginx:1.28   # container=image
k annotate deploy/web --overwrite \
  kubernetes.io/change-cause="bump to 1.28"
k rollout status deploy/web
k rollout history deploy/web
k rollout history deploy/web --revision=2 # shows the template
k rollout undo deploy/web --to-revision=2 # no flag: previous
k rollout pause deploy/web
k rollout resume deploy/web
```

```yaml
spec:
  replicas: 6
  minReadySeconds: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0        # never below 6
      maxSurge: 2              # at most 8 during the update
```

### Traps
- `set image` takes the container name, not the Deployment name. `k get deploy web -o wide` shows it.
- Do not choose a rollback target by CHANGE-CAUSE. Check the image with `--revision=N`.
- Revision numbers change after an undo, so note the target revision before you undo.
- `rollout status` blocks on a stalled rollout. Stop it with Ctrl-C and look at the Pods.
- A paused Deployment accepts changes but rolls out nothing until you resume it.

### Docs
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment): update, history, rollback, pause. Search: `deployments`
- [kubectl rollout](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/): every subcommand with examples. Search: `kubectl rollout`

## Use the Helm package manager to deploy existing packages

Helm installs applications that someone else has packaged. Three terms carry everything:
- **Chart:** a package of templated manifests with a `values.yaml` of defaults.
- **Repository:** a place to download charts from, added locally under a short name.
- **Release:** one installed instance of a chart. It has a name and lives in a namespace.

You do not write charts here. You install and manage existing ones, and you adapt them by overriding values: `--set key=value` for single values, with dots for nesting (`controller.kind=DaemonSet`), or `-f file.yaml` for many. `helm show values` prints a chart's defaults, which is how you find the key names. `helm get values` prints what a release overrides.

Every install, upgrade and rollback creates a numbered revision of the release. `helm history` lists them. `helm rollback` applies an old revision again as a new one, described as "Rollback to 1".

When an upgrade passes new values, Helm starts again from the chart defaults. Add `--reuse-values` to keep the values of the last revision and change only what you set.

Helm is namespaced like kubectl: pass `-n` on every command, or `-A` to list across namespaces. In Helm 4, `helm list` shows releases in every state, including failed and pending ones. The old `-a` flag is gone; `--failed` and `--pending` filter.

### What you must be able to do
- Add a repository and find a chart and its version.
- Look up a value's name and default.
- Install a release into a namespace with chosen values and a pinned chart version.
- Upgrade a release and keep its earlier values.
- Read the history, roll back and uninstall.
- Find releases in all namespaces, including broken ones.

### Commands and YAML to know

```bash
helm repo add <repo> <repo-url>
helm repo update
helm search repo <repo>/<chart>
helm show values <repo>/<chart> | less
helm -n <ns> install web <repo>/<chart> --create-namespace \
  --version 6.17.0 --set replicaCount=2
helm -n <ns> upgrade web <repo>/<chart> --version 6.17.0 \
  --reuse-values --set replicaCount=3
helm -n <ns> history web
helm -n <ns> rollback web 1
helm -n <ns> get values web        # add --revision 2 for an old one
helm list -A                       # add --failed --pending to filter
helm -n <ns> uninstall web
```

### Traps
- Argument order: release name first, chart second.
- Without `-n` the release lands in `default`, and later commands with `-n` do not find it.
- An upgrade with `--set` but without `--reuse-values` drops the values you set earlier.
- Repeat `--version` on upgrade. Without it Helm moves to the newest chart version.
- Object names usually combine release and chart (`web-podinfo`); the chart decides. Look with `k -n <ns> get deploy,svc`.

### Docs
- [Using Helm](https://helm.sh/docs/intro/using_helm/): search, install, values, upgrade, rollback and repositories on one page. Search: `using helm`
- [helm upgrade](https://helm.sh/docs/helm/helm_upgrade/): all flags, including `--reuse-values`. Search: `helm upgrade`
- [helm list](https://helm.sh/docs/helm/helm_list/): the state filters. Search: `helm list`

## Kustomize

Kustomize changes plain YAML manifests without templates. A directory holds a `kustomization.yaml` that lists the manifests and the changes to make to them. It is built into kubectl: `k kustomize <dir>` prints the result and `k apply -k <dir>` applies it.

The usual layout is a base with overlays. The **base** directory holds the manifests and a kustomization that lists them under `resources`. An **overlay**, one per environment, has its own kustomization whose `resources` points at `../base` and adds what differs. The base files stay untouched.

| Field | Effect |
|---|---|
| `resources` | Files or directories to include |
| `namespace` | Sets the namespace of every object |
| `namePrefix` | Put in front of every object name |
| `labels` | Adds labels to every object |
| `images` | Replaces an image name or tag |
| `replicas` | Sets the replica count of a named workload |
| `configMapGenerator` | Creates a ConfigMap from literals or files |
| `patches` | Changes any other field of chosen objects |

A generated ConfigMap gets a hash of its content added to its name, such as `api-config-<hash>`, and Kustomize rewrites the references to it in the workloads. New content gives a new name, and that triggers a rollout.

### What you must be able to do
- Write a kustomization that lists existing manifests.
- Build an overlay on a given base: namespace, prefix, image tag, replicas.
- Generate a ConfigMap.
- Patch a field that has no key of its own.
- Preview, apply and delete with `-k`.

### Commands and YAML to know

```bash
k kustomize prod/      # render only
k apply -k prod/
k delete -k prod/
```

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../base                  # a base lists files: - deployment.yaml
namespace: cfg-prod
namePrefix: prod-
images:
- name: nginx              # image name as written in the base
  newTag: "1.28"
replicas:
- name: api                # name in the base, without the prefix
  count: 3
configMapGenerator:
- name: api-config
  literals:
  - LOG_LEVEL=warn
patches:
- target:
    kind: Deployment
    name: api
  patch: |-
    - op: add
      path: /spec/minReadySeconds
      value: 5
```

### Traps
- Name the file `kustomization.yaml`. `-k` takes the directory, not the file.
- `namespace` sets the field but does not create the Namespace. Create it first.
- Quote the tag. An unquoted `newTag: 1.28` is a number and the build fails.
- `replicas` and `patches` refer to the name in the base (`api`), not the prefixed `prod-api`.
- The objects you verify carry prefix and hash: `prod-api`, `prod-api-config-<hash>`.

### Docs
- [Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#bases-and-overlays): generators, cross-cutting fields, patches, bases and overlays. Search: `kustomize`
- [kubectl kustomize](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_kustomize/): the render command and its flags. Search: `kubectl kustomize`
