# Application Environment, Configuration and Security (25%)

This is the largest domain. It covers how an application gets its configuration (ConfigMaps, Secrets), how much CPU and memory it may use, which identity it has towards the API server, and which privileges its processes run with. Tasks are short and concrete: create an object with a generator, wire it into a pod spec, then prove the result with `exec`, `describe` or `auth can-i`.

## Discover and use resources that extend Kubernetes (CRD, Operators)

A **CustomResourceDefinition (CRD)** adds a new kind to the Kubernetes API. Once it is installed, the API server stores objects of that kind, and kubectl treats them like built-in resources: `get`, `describe`, `apply`, `delete` and `explain` all work.

A CRD on its own only stores data. An **operator** is a controller, usually a Deployment in the cluster, that watches those custom resources and acts on them, for example by creating a database for every `Database` object. Without the controller the object is saved and nothing else happens.

The exam expects you to find and use what is already installed, not to write a controller. Four parts of a CRD tell you how to write a custom resource:

- `spec.group`: the API group. With a version it forms the `apiVersion`.
- `spec.versions`: each has a `name` and `served: true` or `false`.
- `spec.scope`: `Namespaced` or `Cluster`.
- `spec.names`: `kind`, `plural` and short names.

The CRD's own name is always `<plural>.<group>`.

### What you must be able to do
- List the CRDs and read group, scope and served versions of one.
- Find the kind and its short name in `k api-resources`.
- Read its fields with `k explain`.
- Write and apply a custom resource for a given CRD.
- List custom resources across all namespaces.

### Commands and YAML to know
```bash
k get crd
k api-resources | grep -i <word>   # kind, short name, namespaced?
k get crd <plural>.<group> -o yaml | less
k get crd <plural>.<group> -o jsonpath='{.spec.group} {.spec.scope}{"\n"}'
k explain <kind>.spec
k get <plural> -A
```

```yaml
apiVersion: stable.example.com/v1  # <spec.group>/<served version>
kind: CronTab                      # spec.names.kind
metadata:
  name: nightly
  namespace: default               # only if scope is Namespaced
spec:                              # fields come from the CRD's schema
  cronSpec: "0 2 * * *"
```

### Traps
- `apiextensions.k8s.io/v1` is the `apiVersion` of the CRD itself. A custom resource uses the CRD's group and one of its served versions.
- Check the scope before you add `-n` or `metadata.namespace`. A cluster-scoped kind has no namespace.
- If `k explain` shows little, read the schema under `spec.versions` in the CRD, or copy an existing object with `-o yaml`.
- The resource was created but nothing happens: the operator isn't running. Look for its pods.
- Deleting a CRD deletes every object of that kind.

### Docs
- [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/): what CRDs and controllers are. Search: `custom resources`
- [Extend the Kubernetes API with CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/): a full CRD and a custom resource to copy. Search: `CustomResourceDefinition`
- [Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/): what an operator does. Search: `operator pattern`

## Understand authentication, authorization and admission control

Every request to the API server passes three stages, in this order:

1. **Authentication**: who is asking? People come from outside the cluster (certificates, tokens); there is no User object. Pods use a ServiceAccount, whose user name is `system:serviceaccount:<ns>:<name>`.
2. **Authorization**: may this identity use this verb on this resource in this namespace? Kubernetes answers with RBAC. Rules only add rights; there is no deny rule. A refused request returns `Forbidden`.
3. **Admission control**: before a write is stored, admission controllers may change the object (fill in defaults) and then validate it (reject it). Reads skip this stage.

RBAC has four objects:

| Object | Scope | Purpose |
|---|---|---|
| Role | one namespace | verbs on resources |
| ClusterRole | cluster | the same, reusable in any namespace |
| RoleBinding | one namespace | grants a Role or a ClusterRole to subjects, in that namespace only |
| ClusterRoleBinding | cluster | grants a ClusterRole in every namespace |

Admission controllers a developer meets:

- **LimitRanger** fills in default requests and limits and rejects values outside min/max.
- **ResourceQuota** rejects objects that would exceed the namespace quota.
- **PodSecurity** checks pods against the Pod Security Standards (`privileged`, `baseline`, `restricted`). The level is set with labels on the namespace.

### What you must be able to do
- Create Roles, ClusterRoles and both kinds of binding with generators.
- Bind a ClusterRole in a single namespace with a RoleBinding.
- Test access as a ServiceAccount with `k auth can-i`.
- Tell from an error which stage refused a request.

### Commands and YAML to know
```bash
k -n dev create role reader --verb=get,list --resource=secrets
k -n dev create role dep --verb=get,update --resource=deployments.apps
k -n dev create rolebinding rb --role=reader --serviceaccount=dev:app
k create clusterrole podlist --verb=list --resource=pods
k -n dev create rolebinding rb2 --clusterrole=podlist --serviceaccount=dev:app
k create clusterrolebinding crb --clusterrole=podlist --serviceaccount=dev:app
k auth can-i list secrets -n dev --as=system:serviceaccount:dev:app
k label ns dev pod-security.kubernetes.io/enforce=restricted
```

```yaml
rules:                     # one Role can hold several rules
- apiGroups: [""]          # core group: pods, secrets, services
  resources: ["pods"]
  verbs: ["list"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch"]
```

### Traps
- `--serviceaccount` takes `<ns>:<name>`. `--as` needs the full `system:serviceaccount:<ns>:<name>`.
- Verbs are not implied: `list` does not grant `get`.
- `--resource=pods` writes `apiGroups: [""]`. Deployments need `deployments.apps`.
- `can-i` prints `no` and exits with status 1. If the task wants the answer in a file, the file must still contain `no`.
- A binding's `roleRef` can't be edited. Delete the binding and create it again.

### Docs
- [Controlling Access to the Kubernetes API](https://kubernetes.io/docs/concepts/security/controlling-access/): the three stages. Search: `controlling access`
- [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/): YAML for all four objects and the `kubectl create` commands. Search: `rbac`
- [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/): the namespace labels. Search: `pod security admission`

## Understand requests, limits, quotas

This bullet is about namespace-wide policy, usually set by an administrator: ResourceQuota and LimitRange. "Define resource requirements" is about the requests and limits you write on your own containers.

A **ResourceQuota** caps the totals of one namespace: object counts such as `pods`, and the sums `requests.cpu`, `requests.memory`, `limits.cpu` and `limits.memory` over all pods. It is checked when a pod is created. A pod that would push a total over the cap is rejected.

A quota on requests or limits has a side effect: every new pod must state those values. A pod without them is rejected with a message like this:

```text
failed quota: team-quota: must specify limits.cpu for: nores; limits.memory ...
```

A **LimitRange** works per container. `defaultRequest` and `default` (the default limit) are written into containers that set nothing; `min` and `max` reject values outside the range. Defaults are added before the quota check, so with a LimitRange in the namespace the same pod without resources is accepted.

Both act only when a pod is created. Running pods are not changed.

A Deployment does not fail under a quota. The Deployment and its ReplicaSet are created; the ReplicaSet cannot create pods and records a `FailedCreate` event. `k get deploy` only shows fewer ready replicas than desired.

### What you must be able to do
- Create a ResourceQuota with the generator and read used against hard values.
- Write a LimitRange with defaults and a maximum.
- Find out why a Deployment in a quota namespace has too few pods.
- Check that replicas times request fits the quota.

### Commands and YAML to know
```bash
k -n team create quota team-quota \
  --hard=pods=5,requests.cpu=1,requests.memory=1Gi,limits.cpu=2,limits.memory=2Gi
k -n team describe quota team-quota       # Used and Hard per resource
k -n team describe limitrange
k -n team get events --sort-by=.lastTimestamp   # FailedCreate from the ReplicaSet
k -n team describe rs <name>
```

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: container-defaults
  namespace: team
spec:
  limits:
  - type: Container
    defaultRequest:        # request for containers that set none
      cpu: 100m
      memory: 64Mi
    default:               # limit for containers that set none
      cpu: 200m
      memory: 128Mi
    max:                   # no container may ask for more
      cpu: 500m
```

### Traps
- LimitRange has no generator. Copy the YAML from the docs.
- `default` is the default limit, not the default request. They are easy to swap.
- Create the quota and the LimitRange before the workload. If the Deployment comes first, its ReplicaSet shows `FailedCreate` until the pods have resources.
- Do the sum before you scale: three replicas requesting `200m` use `600m` of `requests.cpu`.
- The error is on the ReplicaSet, not on the Deployment. Read the events.

### Docs
- [Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/): quota names and a full example. Search: `resource quotas`
- [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/): the fields and how defaults are applied. Search: `limit range`
- [Configure Default Memory Requests and Limits for a Namespace](https://kubernetes.io/docs/tasks/administer-cluster/manage-resources/memory-default-namespace/): a LimitRange to copy. Search: `default memory requests`

## Understand ConfigMaps

A ConfigMap holds configuration that is not secret, as key/value pairs. It keeps settings out of the image, so one image runs with different configuration. A pod can only use ConfigMaps from its own namespace.

`k create configmap` reads four kinds of source, and you can mix them in one command:

- `--from-literal=key=value`: one pair.
- `--from-file=path`: the file name becomes the key, the content the value. `--from-file=key=path` sets the key yourself.
- `--from-file=dir/`: one key per file in the directory.
- `--from-env-file=file`: every `KEY=value` line becomes its own key.

A container consumes a ConfigMap in three ways:

- `env` with `configMapKeyRef`: one key, under a variable name you choose.
- `envFrom` with `configMapRef`: every key becomes a variable. Since v1.34 a variable name may contain any printable ASCII character except `=`, so a key such as `app.properties` is imported too.
- A `configMap` volume: every key becomes a file in the mount path. `items` picks keys and names their files. `subPath` on the mount places one file into a directory without hiding the rest of it.

Updates behave differently. Files in a volume follow a changed ConfigMap after a short delay. Environment variables are read once at container start and stay as they are until the pod is recreated. A ConfigMap with `immutable: true` can't be changed at all; delete it and create it again.

### What you must be able to do
- Create a ConfigMap from literals, files, a directory and an env file.
- Inject one key or all keys as environment variables.
- Mount all keys or selected keys as files.
- Verify with `k exec` what the container sees.

### Commands and YAML to know
```bash
k create cm shades --from-literal=text=grey \
  --from-file=./favorite --from-file=./tones/
k create cm app --from-env-file=app.env $do
k set env deploy/web --from=configmap/shades   # keys become UPPERCASE names
k exec deploy/web -- env
```

```yaml
# pod spec, shortened
    env:
    - name: ILIKE              # your variable name
      valueFrom:
        configMapKeyRef:
          name: shades
          key: favorite
    envFrom:
    - configMapRef:
        name: shades           # every key
    volumeMounts:
    - name: cfg
      mountPath: /etc/app
      readOnly: true
  volumes:                     # pod level
  - name: cfg
    configMap:
      name: app-config
      items:                   # optional: only these keys
      - key: app.properties
        path: app.properties
```

### Traps
- A volume mounted on an existing directory hides the files the image had there. To add a single file, set `mountPath` to the full file path and `subPath` to the key. Such a file does not receive updates.
- After changing a ConfigMap used through `env`, run `k rollout restart deploy/<name>`.
- `k set env --from` writes the names in upper case; `envFrom` keeps the keys as they are.
- A pod that references a missing ConfigMap does not start. `k describe po` names the missing object.

### Docs
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/): the concept, immutable ConfigMaps and update behaviour. Search: `configmap`
- [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/): every create and consume variant with YAML. Search: `configure pod configmap`

## Define resource requirements

Here you write requests and limits on your own containers. The quota bullet above is the namespace policy that checks and defaults them.

`resources` is set per container and has two parts:

- **Requests** are for the scheduler. A pod is only placed on a node that still has that much unreserved CPU and memory. If no node has it, the pod stays `Pending`.
- **Limits** are enforced while the container runs. CPU above the limit is throttled; the container keeps running, only slower. Memory above the limit gets the container killed: the reason is `OOMKilled`, the exit code is 137, and after a few restarts the pod shows `CrashLoopBackOff`.

Units: CPU is counted in cores or millicores (`500m` is half a core), memory in bytes with binary suffixes (`Mi`, `Gi`) or decimal ones (`M`, `G`).

If you set only a limit, the request is set to the same value. A request above its limit is rejected.

From these values Kubernetes derives a QoS class, shown in `status.qosClass`:

| Class | Condition |
|---|---|
| Guaranteed | every container has CPU and memory requests equal to its limits |
| Burstable | at least one request or limit, but not Guaranteed |
| BestEffort | no requests and no limits |

When a node runs out of memory, BestEffort pods are evicted first and Guaranteed pods last.

### What you must be able to do
- Add requests and limits to a pod or Deployment.
- Read the current values and the QoS class.
- Recognise an OOMKilled container and raise its memory limit.
- Change resources on a bare pod.

### Commands and YAML to know
```bash
k set resources deploy web \
  --requests=cpu=100m,memory=64Mi --limits=cpu=200m,memory=128Mi
k get po web -o jsonpath='{.spec.containers[0].resources}{"\n"}'
k get po web -o jsonpath='{.status.qosClass}{"\n"}'
k describe po web | grep -A3 'Last State'   # Reason: OOMKilled, Exit Code: 137
k replace --force -f pod.yaml               # bare pod: delete and recreate
```

```yaml
  containers:
  - name: web
    image: nginx
    resources:             # per container, not per pod
      requests:
        cpu: 200m
        memory: 64Mi
      limits:
        cpu: 400m
        memory: 128Mi
```

### Traps
- `64M` and `64Mi` differ, and `64m` is millibytes. Write `Mi` and `Gi` for memory, `m` only for CPU.
- An OOMKilled container needs a higher memory limit. Raising the request changes nothing.
- `k set resources` on a Deployment starts a rollout. Add `-c <container>` if the pod has several containers.
- On a bare pod, export it with `-o yaml`, edit the file and run `k replace --force -f`. In-place resize exists but is restricted; the QoS class must not change.
- `k run` has no flags for resources. Generate YAML with `$do` and add the block.

### Docs
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/): units and what happens at the limit. Search: `manage resources containers`
- [Pod Quality of Service Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/): the three classes. Search: `pod qos`
- [Assign Memory Resources to Containers and Pods](https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/): an OOMKilled example. Search: `assign memory resource`

## Create & consume Secrets

A Secret works like a ConfigMap but is meant for passwords, tokens and keys. The values under `data` are base64-encoded. That is an encoding, not encryption: anyone who may read the Secret can decode it. Protection comes from RBAC and, on the admin side, from encryption at rest.

The `type` says what a Secret contains:

| Type | Created with | Content |
|---|---|---|
| `Opaque` | `k create secret generic` | any keys |
| `kubernetes.io/tls` | `k create secret tls` | `tls.crt` and `tls.key` |
| `kubernetes.io/dockerconfigjson` | `k create secret docker-registry` | registry login, used through `imagePullSecrets` |
| `kubernetes.io/service-account-token` | YAML | a long-lived ServiceAccount token |

kubectl encodes the values for you. In YAML you either write base64 under `data` or plain text under `stringData`; the API server encodes `stringData` and stores it under `data`.

Consuming a Secret mirrors a ConfigMap: `secretKeyRef` for one variable, `envFrom` with `secretRef` for all keys, or a `secret` volume in which every key is a file with the decoded value.

### What you must be able to do
- Create generic, TLS and registry Secrets with kubectl.
- Inject a key as an environment variable and mount a Secret as files.
- Decode a value from a Secret.
- Write a Secret manifest with `stringData`.

### Commands and YAML to know
```bash
k create secret generic db-cred \
  --from-literal=username=app --from-literal='password=Tr@1nPass'
k create secret generic key --from-file=id_rsa=./key.pem
k create secret tls web-tls --cert=tls.crt --key=tls.key
k create secret docker-registry reg --docker-server=registry.example.com \
  --docker-username=app --docker-password='s3cr3t'
k get secret db-cred -o jsonpath='{.data.password}' | base64 -d; echo
echo -n 'Tr@1nPass' | base64                   # -n: no trailing newline
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-cred
type: Opaque
stringData:                # plain text, stored encoded under data
  password: Tr@1nPass
---
# pod spec, shortened
    env:
    - name: DB_PASS
      valueFrom:
        secretKeyRef:
          name: db-cred
          key: password
    volumeMounts:
    - name: cred
      mountPath: /etc/cred
      readOnly: true
  volumes:
  - name: cred
    secret:
      secretName: db-cred  # secretName here; a configMap volume uses name
```

### Traps
- Put literals with special characters in single quotes (`'DB_PASSWORD=s3cr3t!'`), or the shell changes them.
- `echo` without `-n` encodes a trailing newline into the value.
- Plain text under `data` is rejected as illegal base64. Use `stringData`.
- `k describe secret` shows only sizes. Read the value with `-o jsonpath` and `base64 -d`.
- The volume field is `secretName`; in `secretKeyRef` and `secretRef` it is `name`.
- As with ConfigMaps, variables keep the old value until the pod is recreated.

### Docs
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/): types, `stringData` and the ways to use a Secret. Search: `secrets`
- [Distribute Credentials Securely Using Secrets](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/): pod YAML for env and volume. Search: `distribute credentials`
- [Managing Secrets using kubectl](https://kubernetes.io/docs/tasks/configmap-secret/managing-secret-using-kubectl/): create, decode and edit. Search: `managing secrets kubectl`

## Understand ServiceAccounts

A ServiceAccount (SA) is the identity a pod uses towards the API server. Every namespace has an SA named `default`, and a pod that names none runs as it. A new SA has no permissions of its own. An application that must call the API gets its own SA, a Role and a RoleBinding, and the pod names the SA in `spec.serviceAccountName`.

The kubelet gives each container a token for its SA through a projected volume. The token is short-lived and replaced automatically. It is mounted here, next to `ca.crt` and `namespace`:

```text
/var/run/secrets/kubernetes.io/serviceaccount/token
```

Since v1.24 no token Secret is created together with an SA. For a token to use outside a pod, `k create token` asks the API server for one with a limited lifetime. Only if a task explicitly demands a long-lived token do you create a Secret of type `kubernetes.io/service-account-token` that names the SA in an annotation.

A pod that never calls the API does not need the token. `automountServiceAccountToken: false` switches the mount off, on the SA for all its pods or on a single pod. The pod's setting wins.

### What you must be able to do
- Create an SA and run a pod or Deployment with it.
- Give the SA rights with a Role and RoleBinding, and test them.
- Write a token for an SA to a file.
- Turn off token mounting.

### Commands and YAML to know
```bash
k -n dev create sa app
k -n dev set serviceaccount deploy web app
k -n dev create token app --duration=1h > /tmp/token
k -n dev get po web -o jsonpath='{.spec.serviceAccountName}{"\n"}'
k auth can-i list secrets -n dev --as=system:serviceaccount:dev:app
```

```yaml
spec:                                  # Deployment: spec.template.spec
  serviceAccountName: app
  automountServiceAccountToken: false  # only if no API access is needed
  containers:
  - name: app
    image: busybox:1.36
```

### Traps
- `k run` no longer has a `--serviceaccount` flag. Generate the YAML with `$do` and add `serviceAccountName`.
- `serviceAccountName` belongs to the pod spec, not to a container.
- It can't be changed on a running pod. Recreate the pod with `k replace --force -f`. On a Deployment the change starts a rollout.
- Create the SA before the pod. A pod that names a missing SA is rejected; with a Deployment you see that as `FailedCreate` on the ReplicaSet.
- Creating an SA grants nothing. Without a binding `can-i` answers `no`.
- `k create token` prints only the token, so redirect it straight into the file the task names.

### Docs
- [Service Accounts](https://kubernetes.io/docs/concepts/security/service-accounts/): the concept and the default SA. Search: `service accounts`
- [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/): `serviceAccountName`, opting out of the token, long-lived token Secret. Search: `configure service account`
- [kubectl create token](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/): the flags. Search: `kubectl create token`

## Understand Application Security (SecurityContexts, Capabilities, etc.)

A `securityContext` sets which user a process runs as and which kernel privileges it has. `spec.securityContext` applies to every container of the pod. `spec.containers[].securityContext` applies to one container and wins where both set the same field.

| Field | Pod | Container | Effect |
|---|---|---|---|
| `runAsUser`, `runAsGroup` | yes | yes | UID and GID of the process |
| `runAsNonRoot` | yes | yes | refuse to start a container as UID 0 |
| `seccompProfile` | yes | yes | system call filter, usually `type: RuntimeDefault` |
| `fsGroup` | yes | no | extra group that owns mounted volumes |
| `allowPrivilegeEscalation` | no | yes | `false`: the process can't gain privileges |
| `readOnlyRootFilesystem` | no | yes | the root filesystem is read-only |
| `capabilities` | no | yes | `add` and `drop` Linux capabilities |

Capabilities split root's power into pieces such as `NET_ADMIN`. The usual hardening is `drop: ["ALL"]`, then `add` what the application needs. Names have no `CAP_` prefix.

Three failures are typical:

- `runAsNonRoot: true` with an image that runs as root: the container is not started and the events say why. Set a non-zero `runAsUser`.
- The stock `nginx` image under another UID crashes because it can't write its cache directory (log line below). Use `nginxinc/nginx-unprivileged`, which runs as UID 101 and listens on 8080.
- `readOnlyRootFilesystem: true`: writes fail with `Read-only file system`. Mount an `emptyDir` at every path the application writes to.

```text
mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)
```

### What you must be able to do
- Set user, group and `fsGroup` for a pod; override the user in one container.
- Harden a container: non-root, read-only root, no privilege escalation, dropped capabilities.
- Give a read-only container a writable `emptyDir`.
- Find out from logs and events why a pod fails.

### Commands and YAML to know
```bash
k explain pod.spec.securityContext
k explain pod.spec.containers.securityContext
k exec secure -- id
k exec secure -- grep CapEff /proc/1/status
k logs secure
```

```yaml
spec:
  securityContext:               # pod level
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 2001
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: secure
    image: busybox:1.36
    securityContext:             # container level
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop: ["ALL"]
        add: ["NET_BIND_SERVICE"]
    volumeMounts:
    - name: data
      mountPath: /data           # stays writable
  volumes:
  - name: data
    emptyDir: {}
```

### Traps
- `capabilities`, `readOnlyRootFilesystem` and `allowPrivilegeEscalation` at pod level, or `fsGroup` at container level, are rejected as unknown fields.
- Added capabilities only show in the effective set (`CapEff`) when the process runs as root.
- A non-root process can bind port 80 in a pod, so the port is not why nginx fails.
- A securityContext has no generator and can't be edited on a running pod. Use `k replace --force -f`.

### Docs
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/): every field with an example. Search: `security context`
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/): what `baseline` and `restricted` require. Search: `pod security standards`
