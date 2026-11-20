## 5.1

**What this trains:** Building one ConfigMap from several kinds of sources and predicting the key names that result.

**Why the solution looks like this:**
- The source flags can be repeated and mixed in a single command, so there is no YAML to merge.
- `--from-literal` gives key and value directly. `--from-file` with a file uses the file name as key and the whole content as value. With a directory it adds one key per regular file and skips subdirectories.
- The task wants the key `favorite`, which already is the file name. For a different key the form is `--from-file=<key>=<path>`.
- File content is stored byte for byte, including the trailing newline that `echo` writes; a literal has none. That matters when the value later lands in an environment variable.
- `--from-env-file` is a different mode: it parses `KEY=value` lines into separate keys.

**On the exam:** One command, then `-o yaml` to count the keys: `text`, `favorite`, `light`, `dark`.

**Docs:**
- [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#create-configmaps-from-files): creating ConfigMaps from directories, files and literals. Search: `configure pod configmap`
- [kubectl create configmap](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_configmap/): all source flags. Search: `kubectl create configmap`

## 5.2

**What this trains:** The two ways to inject ConfigMap data as environment variables: one chosen key under a name you pick, or every key at once.

**Why the solution looks like this:**
- `env` with `valueFrom.configMapKeyRef` maps one key to the name `ILIKE`. `envFrom` with `configMapRef` imports every key under its own name.
- `envFrom` keeps the key names exactly, so the container sees lowercase `text` and `light`. The `set env --from` shortcut uppercases them, which gives a different result than the task describes.
- Since v1.34 a variable name may be any printable ASCII except `=`, so keys with dots are imported too.
- If the same name comes from both, `env` wins over `envFrom`.
- Variables are read once at container start. A later ConfigMap change needs new pods, and a ConfigMap that does not exist leaves the container in `CreateContainerConfigError`.

**On the exam:** Generate the Deployment, add both blocks at container level, and check with `exec ... -- env`. Create the ConfigMap before the workload.

**Docs:**
- [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#define-container-environment-variables-using-configmap-data): `configMapKeyRef` and `envFrom` snippets. Search: `configure pod configmap`
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/#using-configmaps-as-environment-variables): how env vars from ConfigMaps behave. Search: `configmaps`

## 5.3

**What this trains:** Writing a ConfigMap as a manifest and consuming it as files instead of environment variables.

**Why the solution looks like this:**
- The task says "from YAML", so the generator output is saved to a file and applied, not created directly. `data` holds plain strings.
- A volume has two halves joined by a name: `volumes` in the pod spec points at the ConfigMap, `volumeMounts` in the container gives the path. If the names differ, the pod is rejected.
- Each key becomes one file under `/etc/bike`, so dotted keys such as `bike.trim` are ordinary file names.
- `readOnly: true` belongs on the mount. The mount covers whatever the image had at that path, so use a directory of its own.
- Unlike environment variables, mounted files follow later ConfigMap changes after a short delay.

**On the exam:** Generate both objects with `$do`, add the volume and the mount, apply, and `cat` one key. A ConfigMap volume refers to its source with `configMap.name`.

**Docs:**
- [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#add-configmap-data-to-a-volume): volume and mount snippets. Search: `configure pod configmap`
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/#using-configmaps-as-files-from-a-pod): files from a ConfigMap and automatic updates. Search: `configmaps`

## 5.4

**What this trains:** Creating a Secret imperatively and mounting it as files into the pods of a Deployment.

**Why the solution looks like this:**
- `create secret generic` base64-encodes the literal for you. In a manifest you would encode it yourself under `data` or write plain text under `stringData`.
- A Secret volume names its source with `secretName`; a ConfigMap volume uses `name`. Mixing them up is the usual validation error.
- In a Deployment, `volumes` and `volumeMounts` belong to the pod template under `spec.template.spec`, not to the Deployment spec.
- The mounted file holds the decoded value, so `cat /food/entree` prints plain text. The API object shows base64, which the second verify command decodes. base64 is an encoding, not encryption.
- `exec deploy/foodie` lets kubectl choose a pod of the Deployment, so no pod name lookup is needed.

**On the exam:** Create the Secret first, generate the Deployment, add the volume and the mount, then read the file from inside the pod. The file name is the Secret key.

**Docs:**
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod): Secret volumes. Search: `secrets`
- [Distribute Credentials Securely Using Secrets](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/#create-a-pod-that-has-access-to-the-secret-data-through-a-volume): a pod manifest with a Secret volume. Search: `distribute credentials secrets`

## 5.5

**What this trains:** Changing a Deployment's image, reading the rollout history and returning to the previous version.

**Why the solution looks like this:**
- `set image` needs the container name left of the `=`; here it is `nginx`, derived from the image by the generator. The command changes the pod template and so creates revision 2.
- `--record` is deprecated. The change cause is the `kubernetes.io/change-cause` annotation on the Deployment. Annotating does not touch the pod template, so it adds no revision.
- `rollout history --revision=2` prints that revision's template. Use it to see what a revision contains before going back.
- `rollout undo` does not step a counter back. It applies the template of revision 1 again as a new revision. The history then lists 2 and 3: revision 1 is gone because it was renumbered to 3.

**On the exam:** After an undo, confirm the image with JSONPath. Read the history again before you choose a number for `--to-revision`; the old numbers may no longer exist.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment): history, change cause and rollback. Search: `deployment rolling back`
- [kubectl rollout undo](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/): flags such as `--to-revision`. Search: `kubectl rollout undo`

## 5.6

**What this trains:** Tuning a rolling update so that capacity never drops, and knowing which field controls which guarantee.

**Why the solution looks like this:**
- `maxUnavailable: 0` forbids removing an old pod before a new one is available, so the available count never falls below 6.
- `maxSurge: 2` allows up to 8 pods during the update, so the rollout moves in steps of two. Setting both to 0 is invalid because nothing could move.
- `minReadySeconds: 5` is a Deployment field, not part of the pod template. A new pod counts as available only after it has been ready for 5 s, which keeps a pod that crashes right after start from replacing a healthy one.
- Both rolling-update values accept numbers or percentages; the default for each is 25%.
- `set image` changes the template and starts the rollout. The old ReplicaSet stays at 0 replicas as the rollback target.

**On the exam:** "Never below N" means `maxUnavailable: 0`; "at most N extra" is `maxSurge`. Print `.spec.strategy` afterwards and wait for `rollout status` to finish.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment): `maxUnavailable` and `maxSurge`. Search: `deployment rolling update`
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#min-ready-seconds): what `minReadySeconds` does. Search: `deployment minReadySeconds`

## 5.7

**What this trains:** Batching several changes to a Deployment into one rollout by pausing it first.

**Why the solution looks like this:**
- Every change to the pod template of a running Deployment starts a rollout and creates a revision. Two `set` commands would mean two rollouts and two revisions.
- While paused, the Deployment stores template changes but the controller does not act on them. On resume it creates a single ReplicaSet that contains the new image and the new variable.
- Pausing stops nothing that runs: the existing pods keep serving.
- A paused Deployment cannot be rolled back; resume it first.
- Without the resume the changes are never applied. `rollout status` after the resume proves that the rollout ran.

**On the exam:** Pause, change, resume, wait for the status, then read the history and count the new revisions. Check that the Deployment is not left paused.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#pausing-and-resuming-a-deployment): pause, several updates, resume. Search: `deployment pausing resuming`
- [kubectl rollout pause](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_pause/): command reference. Search: `kubectl rollout pause`

## 5.8

**What this trains:** Switching a Deployment to the `Recreate` strategy and handling the validation rule that comes with it.

**Why the solution looks like this:**
- `Recreate` scales the old ReplicaSet to zero before new pods are created. Use it when two versions must not run side by side; the price is downtime on every update.
- The `rollingUpdate` block is valid only with type `RollingUpdate`. The API validates the object as a whole, so changing only `type` is rejected while the block is present. It is present even if you never wrote it, because the API server fills in the defaults.
- The JSON patch sends both operations in one request: `remove` the block and `replace` the type.
- The same works in `k edit`: delete the `rollingUpdate` lines and change the type in one save.
- `strategy` is not part of the pod template, so this change starts no rollout and adds no revision.

**On the exam:** `k edit` is the quickest route if you remember to delete the whole block. Print `.spec.strategy.type` to confirm.

**Docs:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy): `Recreate` and `RollingUpdate`. Search: `deployment strategy`
- [Update API Objects in Place Using kubectl patch](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/): patch types and syntax. Search: `kubectl patch`

## 5.9

**What this trains:** Static provisioning: a PersistentVolume created by hand and a PersistentVolumeClaim that binds to it.

**Why the solution looks like this:**
- A PV is cluster-scoped and has no namespace. The PVC lives in the namespace of the pod that will use it.
- A claim binds to a volume whose class and access mode match and whose capacity is at least the request. Binding is one to one, so the 50Mi claim takes the whole volume and reports 100Mi.
- `storageClassName: manual` on both objects is the matching key; no StorageClass object of that name has to exist. Without it on the claim, the default class would be filled in and would dynamically provision a new volume, leaving `weblog-pv` unused.
- `Retain` keeps the volume and its data when the claim is deleted. The hostPath directory exists on one node only, here `ckad`.

**On the exam:** There is no generator; copy both manifests from the docs. Both objects must show `Bound`, and the PV's CLAIM column must name your claim.

**Docs:**
- [Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/#create-a-persistentvolume): hostPath PV, PVC and pod to copy. Search: `configure pod persistentvolume storage`
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/#default-storageclass): what the default class does to claims. Search: `default storageclass`

## 5.10

**What this trains:** Sharing one persistent volume between two containers of a pod, here a web server and a log reader.

**Why the solution looks like this:**
- The claim is declared once under `volumes` and mounted in both containers; the shared volume name is what makes them see the same files. The verify request uses `localhost` because containers of a pod also share the network.
- `nodeName: ckad` places the pod on that node directly. The hostPath PV lives on one node, and nothing stops the scheduler from choosing `ckad-m02`, where `/tmp/weblog` is a different, empty directory.
- The mount hides the image's `/var/log/nginx`, where `access.log` is a symlink to stdout. With the volume on top nginx writes a real file that the second container can read.
- `tail -F` keeps retrying until the file exists; lowercase `-f` exits if the file is missing at start.

**On the exam:** Write the volume first, then copy the same `volumeMounts` block into each container. Prove the sharing by producing data in one container and reading it in the other.

**Docs:**
- [Communicate Between Containers in the Same Pod Using a Shared Volume](https://kubernetes.io/docs/tasks/access-application-cluster/communicate-containers-same-pod-shared-volume/): two containers, one volume. Search: `shared volume containers same pod`
- [Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#nodename): `nodeName` and `nodeSelector`. Search: `assigning pods to nodes`

## 5.11

**What this trains:** Adding storage to a workload that already has volumes, with a claim that the cluster provisions on its own.

**Why the solution looks like this:**
- The claim has no `storageClassName`, so the default StorageClass is assigned and its provisioner creates a matching PV. No PV manifest is needed; a cluster without a default StorageClass needs a hand-made PV instead.
- kubectl has no `set volume`, so the Deployment is changed with `k edit`.
- `volumes` and `volumeMounts` are lists. The new entries are appended as further `- name:` items under the existing keys. Overwriting a list drops the secret mount, which the task tells you to keep.
- The volume name `newvol` ties the two entries together and is independent of the claim name.
- The edit changes the pod template, so new pods roll out; `df` in a new pod shows `/newvol` as a mount of its own.

**On the exam:** After saving, check both mounts: the old path still has its file and the new path exists. The claim must show `Bound`.

**Docs:**
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#claims-as-volumes): using a claim as a pod volume. Search: `persistent volumes`
- [Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/#defaulting-behavior): claims without a class and the default StorageClass. Search: `dynamic volume provisioning`

## 5.12

**What this trains:** Deploying environment variants with Kustomize: a base with plain manifests and an overlay that holds only the differences.

**Why the solution looks like this:**
- The overlay lists `../base` under `resources`, so the same base can serve several environments.
- `namespace` and `namePrefix` apply to every object: the Deployment becomes `prod-api` in `cfg-prod`. Kustomize sets the namespace field but does not create the Namespace, hence the separate `create ns`.
- `images` matches the image name `nginx` and swaps only the tag. `"1.28"` is quoted so YAML keeps it a string instead of a number.
- `replicas` refers to the Deployment by its base name `api`, not the prefixed one.
- `configMapGenerator` appends a content hash, giving `prod-api-config-<hash>`. New content means a new name, and Kustomize rewrites references in workloads, which rolls their pods.

**On the exam:** Preview with `k kustomize prod/` before `k apply -k prod/`. The file must be named `kustomization.yaml`, and generated names carry prefix and hash.

**Docs:**
- [Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#bases-and-overlays): bases, overlays and the field list. Search: `kustomize`
- [Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#configmapgenerator): generated ConfigMaps and the hash suffix. Search: `kustomize configMapGenerator`
