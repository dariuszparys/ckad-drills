# Application Design and Build (20%)

This domain covers packaging an application as a container image and choosing the objects that run it: the workload resource, the containers inside the Pod and the storage they use. Tasks ask you to write a short Dockerfile and build it, create a Job or CronJob with exact settings, add a second container to a Pod, or mount a volume.

## Define, build and modify container images

An image is a filesystem plus metadata that says what to run. You describe it in a `Dockerfile`; each instruction adds a layer on top of the base image. The application files are given; you write the Dockerfile.

| Instruction | What it does |
|---|---|
| `FROM` | Names the base image; comes first |
| `WORKDIR` | Sets the directory for the instructions after it |
| `COPY` | Copies files from the build context into the image |
| `RUN` | Runs a command at build time and keeps the result |
| `ENV` | Sets an environment variable |
| `EXPOSE` | Documents a port; it publishes nothing |
| `ENTRYPOINT` | The executable that always runs |
| `CMD` | Default arguments, or the whole command if there is no `ENTRYPOINT` |

In a Pod, `command` replaces `ENTRYPOINT` and `args` replaces `CMD`.

An image name is `registry/repository:tag`. A tag is another name for the same image ID, so tagging never rebuilds. To push, the name must start with the registry's host and port.

`docker` and `podman` take the same subcommands. With podman, expect three differences: it often needs `sudo`, a plain-HTTP registry needs `--tls-verify=false`, and an OCI archive needs `--format oci-archive`.

To modify an image, edit the Dockerfile, rebuild under a new tag and point the workload at it with `k set image`.

### What you must be able to do
- Write a Dockerfile from a description: base image, files, start command.
- Build an image with a given name and tag.
- Add a tag to an existing image without rebuilding.
- Save an image to an archive at a given path.
- Push to a registry and run a Deployment from that image.

### Commands and YAML to know

```dockerfile
FROM docker.io/library/python:3.12-slim
WORKDIR /app
COPY ticker.py .
RUN mkdir -p /data
ENV INTERVAL=5
CMD ["python", "/app/ticker.py"]
```

```bash
docker build -t ticker:v1 .          # . is the build context
docker tag ticker:v1 $repo/ticker:v1
docker push $repo/ticker:v1
docker save -o /opt/course/ticker.tar ticker:v1
sudo podman push --tls-verify=false $repo/ticker:v1
sudo podman save --format oci-archive -o t.tar ticker:v1
```

### Traps
- `COPY` sources are relative to the build context, the last argument of `build`. Build from the directory that holds the files.
- Check name and tag with `docker images` before saving or pushing.
- Give `save -o` the full path the task names, then check the file with `tar tf`.
- A locally built image is not on the cluster nodes. Push it, and use the full registry name in the Pod.

### Docs
The Dockerfile reference is not on a site the exam allows, so know the instructions above by heart. `docker build --help` lists the flags.
- [Images](https://kubernetes.io/docs/concepts/containers/images/): image names, tags and pull policy. Search: `images`
- [Define a Command and Arguments for a Container](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/): how `command` and `args` relate to `ENTRYPOINT` and `CMD`. Search: `command and arguments`

## Choose and use the right workload resource (Deployment, DaemonSet, CronJob, etc.)

A bare Pod is not replaced when it is deleted or its node fails. A workload resource creates Pods from a template and keeps them running. Choose by what the application needs:

| The application | Resource |
|---|---|
| One container for a quick test | Pod |
| Stateless, several replicas, updated often | Deployment |
| One Pod on every node (log agent) | DaemonSet |
| Stable Pod names and a volume per replica | StatefulSet |
| Runs to completion once | Job |
| Runs to completion on a schedule | CronJob |

A Deployment creates a ReplicaSet for each version of its Pod template, and the ReplicaSet keeps the replica count. Delete a Pod, or the ReplicaSet itself, and it comes back. A StatefulSet names its Pods `web-0`, `web-1` and creates a PVC for each from `volumeClaimTemplates`.

A Job runs Pods until enough of them succeed. Its fields:
- `completions`: how many Pods must succeed (default 1).
- `parallelism`: how many run at once (default 1).
- `backoffLimit`: retries before the Job fails (default 6).
- `activeDeadlineSeconds`: time limit for the whole Job; it then fails with `DeadlineExceeded`.
- `ttlSecondsAfterFinished`: deletes the finished Job and its Pods after this time.

A CronJob creates a Job from its `jobTemplate` at each time in `schedule` (minute, hour, day of month, month, day of week). `concurrencyPolicy` says what to do if the previous run is still active: `Allow` (default), `Forbid` (skip the new run) or `Replace` (stop the old one). `successfulJobsHistoryLimit` and `failedJobsHistoryLimit` set how many finished Jobs are kept. `startingDeadlineSeconds` is how late a missed run may still start.

### What you must be able to do
- Generate a Deployment, Job or CronJob with `$do`.
- Turn generated Deployment YAML into a DaemonSet: change `kind`, delete `replicas` and `strategy`.
- Start a CronJob's Job right now.
- Read a Job's result from status and logs.

### Commands and YAML to know

```bash
k create deploy web --image=nginx:1.27 --replicas=3 $do
k create job pi --image=busybox:1.36 $do -- sleep 3
k create cj report --image=busybox:1.36 \
  --schedule="30 * * * *" $do -- date
k create job report-now --from=cronjob/report
k logs job/pi
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
spec:
  schedule: "30 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  jobTemplate:
    spec:                        # the Job spec starts here
      completions: 4
      parallelism: 2
      backoffLimit: 3
      activeDeadlineSeconds: 40
      template:
        spec:
          restartPolicy: Never   # or OnFailure
          containers:
          - name: report
            image: busybox:1.36
            command: ["date"]
```

### Traps
- The generators have no flags for completions, parallelism, deadlines or history limits. Generate, then edit.
- `activeDeadlineSeconds` belongs in `jobTemplate.spec`, not in the CronJob `spec`.
- With `ttlSecondsAfterFinished` the Pods disappear with the Job. Save the logs first.

### Docs
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/): parallel Jobs, deadlines, TTL. Search: `jobs`
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/): schedule syntax, concurrency policy. Search: `cronjob`
- [DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/): a manifest to copy. Search: `daemonset`

## Understand multi-container Pod design patterns (e.g. sidecar, init and others)

All containers in a Pod share one network namespace and can share volumes. They reach each other on `localhost`, so two containers cannot listen on the same port. They do not share a filesystem: to pass files from one to another, mount the same volume, usually an `emptyDir`, in both.

The patterns are names for the job of the extra container, not API fields:
- **Sidecar:** supports the main container, for example by shipping its log files.
- **Adapter:** converts the main container's output into another format, such as metrics.
- **Ambassador:** a local proxy. The app talks to `localhost` and the proxy forwards the traffic outside.

Init containers are listed in `spec.initContainers`. They run one at a time, in order, and each must exit successfully before the next starts. The app containers start after the last one. Until then the Pod shows a status like `Init:0/1`. Typical uses: wait for a Service name to resolve, or write a file into a shared volume.

A native sidecar is an init container with `restartPolicy: Always`, stable since v1.33. It starts before the app containers, but Kubernetes does not wait for it to exit. It runs for the whole life of the Pod, is restarted when it dies and is stopped after the app containers. It counts in the READY column (`2/2`). Unlike a regular second container, it does not keep a Job's Pod from finishing.

### What you must be able to do
- Add a second container to generated Pod or Deployment YAML.
- Share an `emptyDir` between containers.
- Add an init container that blocks until a condition holds.
- Write a native sidecar.
- Read the logs of one named container.

### Commands and YAML to know

```bash
k run web --image=nginx:1.27 $do > pod.yaml
k logs web -c shipper
```

```yaml
spec:
  volumes:
  - name: logs
    emptyDir: {}
  initContainers:
  - name: wait-for-db          # must exit before the next starts
    image: busybox:1.36
    command: ["sh", "-c", "until nslookup db.shop.svc.cluster.local; do sleep 2; done"]
  - name: shipper              # native sidecar: keeps running
    image: busybox:1.36
    restartPolicy: Always
    command: ["sh", "-c", "tail -F /logs/access.log"]
    volumeMounts:
    - name: logs
      mountPath: /logs
      readOnly: true
  containers:
  - name: web
    image: nginx:1.27
    volumeMounts:
    - name: logs
      mountPath: /var/log/nginx
```

### Traps
- `volumes` belongs to the Pod `spec`, `volumeMounts` to each container. The names must match.
- Without `-c`, `logs` and `exec` use the first container.
- busybox `nslookup` ignores search domains for names that contain a dot. Use the full `<svc>.<ns>.svc.cluster.local` in a wait loop.
- You cannot add a container to a running Pod. Edit the YAML and run `k replace --force -f pod.yaml`.

### Docs
- [Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/): order and failure behaviour. Search: `init containers`
- [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/): the `restartPolicy: Always` example. Search: `sidecar containers`
- [Communicate Between Containers in the Same Pod Using a Shared Volume](https://kubernetes.io/docs/tasks/access-application-cluster/communicate-containers-same-pod-shared-volume/): two containers and one `emptyDir`. Search: `shared volume`

## Utilize persistent and ephemeral volumes

A container's own filesystem is lost when the container restarts. A volume is a directory that lives longer. You declare it in the Pod's `spec.volumes` and mount it into containers with `volumeMounts`.

Ephemeral volumes live as long as the Pod:
- `emptyDir` starts empty and is deleted with the Pod. It survives container restarts. `sizeLimit` caps it. `medium: Memory` keeps it in RAM, which counts against the container's memory limit.
- `configMap` and `secret` volumes show each key as a read-only file.

Persistent storage uses two objects. A PersistentVolume (PV) is a piece of storage and is cluster-scoped. A PersistentVolumeClaim (PVC) is a namespaced request for storage. The Pod names the PVC, and Kubernetes binds the PVC to a PV with the same `storageClassName`, a matching access mode and at least the requested size. The claim gets the whole PV: 50Mi requested from a 100Mi PV shows 100Mi.

`storageClassName` on the PVC decides where the PV comes from:
- A name: use a PV of that class, or let that class provision one.
- Left out: the cluster's default StorageClass provisions a new PV.
- Empty string `""`: bind only to a PV without a class; never provision.

Access modes are `ReadWriteOnce` (one node), `ReadOnlyMany`, `ReadWriteMany` (many nodes) and `ReadWriteOncePod` (one Pod). The reclaim policy applies when the PVC is deleted: `Retain` keeps PV and data, `Delete` removes both and is the default for provisioned volumes.

### What you must be able to do
- Add an `emptyDir` with a size limit and mount it.
- Write a PV and a matching PVC and confirm both are `Bound`.
- Create a PVC that uses the default StorageClass.
- Mount a PVC in an existing Deployment and keep its other mounts.

### Commands and YAML to know

```bash
k get pv,pvc -n shop
k -n shop describe pvc data     # events explain Pending
```

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-pv                 # no namespace
spec:
  storageClassName: manual
  capacity:
    storage: 100Mi
  accessModes: ["ReadWriteOnce"]
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
  namespace: shop
spec:
  storageClassName: manual      # same as the PV
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 50Mi
```

```yaml
  volumes:                      # in the Pod spec
  - name: data
    persistentVolumeClaim:
      claimName: data
  - name: scratch
    emptyDir:
      sizeLimit: 50Mi
```

### Traps
- PV and PVC have no generator, and there is no `k set volume`. Copy YAML from the docs; use `k edit` for a Deployment.
- A PVC stays `Pending` when class, access mode or size match no PV.
- `hostPath` data lives on one node. On a multi-node cluster a Pod on another node sees an empty directory, so pin the Pod with `nodeName`.

### Docs
- [Volumes](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir): an example per volume type. Search: `volumes`
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/): binding, access modes, reclaim policy. Search: `persistent volumes`
- [Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/): YAML to copy. Search: `configure pod persistentvolume`
