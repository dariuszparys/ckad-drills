## 6.1

**What this trains:** Setting a `securityContext` at pod level and at container level, and knowing which one wins when both set the same field.

**Why the solution looks like this:**
- `fsGroup` exists only at pod level, because it applies to the pod's volumes. `allowPrivilegeEscalation` exists only at container level. Put either in the wrong block and the API server rejects the manifest.
- `runAsUser` and `runAsGroup` are valid in both places. The container value overrides the pod value, so the process runs as UID 2000 while the GID stays 3000 from the pod.
- `id` proves all three settings at once: `uid=2000` is the container override, `gid=3000` the pod default, and `fsGroup` 2000 appears in `groups` as a supplementary group.
- `kubectl run` has no flags for any of this, so generate the YAML and add both blocks by hand.

**On the exam:** Generate with `$do`, add the two blocks, apply, then run `id` in the container. Check the indentation: one block sits under `spec`, the other under the container.

**Docs:**
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#set-the-security-context-for-a-pod): pod-level and container-level examples with the `id` output explained. Search: `security context`

## 6.2

**What this trains:** Adding and dropping Linux capabilities for one container, and reading the result from the process status.

**Why the solution looks like this:**
- Capabilities are a container-level setting only. There is no pod-level `capabilities` field.
- The manifest takes the names without the `CAP_` prefix. The kernel constant is `CAP_NET_ADMIN`; here it is `NET_ADMIN`.
- The pod sets no `runAsUser`, so busybox runs as root. That matters: only a root process gets the capabilities in its effective set. As UID 2000 the added ones would not show up in `CapEff`.
- `CapEff` in `/proc/1/status` is a hex bitmask, one bit per capability. `capsh --decode` turns it into names. busybox has no `capsh`, so decode the value on a node or in a throwaway container that has libcap.
- `MKNOD` is part of the runtime's default set, so dropping it clears a bit that is normally there.

**On the exam:** Copy the `capabilities` snippet from the docs page and adjust the two lists. Check that the block is under the container's `securityContext` and that no name carries `CAP_`.

**Docs:**
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#set-capabilities-for-a-container): the `capabilities.add` example and how to read the bitmask. Search: `set capabilities for a container`

## 6.3

**What this trains:** Combining the usual hardening settings in one Deployment, and keeping the application working once its root filesystem is read-only.

**Why the solution looks like this:**
- The settings are split by where the API allows them. `readOnlyRootFilesystem`, `allowPrivilegeEscalation` and `capabilities` exist only on the container. `runAsNonRoot`, `runAsUser` and `seccompProfile` are valid at pod level, where they cover every container.
- The image is the unprivileged nginx build: it runs as UID 101 and listens on 8080. `runAsNonRoot: true` makes the kubelet refuse to start the container as UID 0, and `runAsUser: 101` states the UID explicitly.
- A read-only root filesystem blocks every write, including the ones nginx needs in `/tmp`. An `emptyDir` mounted there gives back one writable path and leaves the rest locked.
- The `touch /etc/x` check fails with a read-only error while the pod stays Running. That proves the setting is active and the `emptyDir` is enough.

**On the exam:** Generate the Deployment with `$do`, then add both blocks and the volume. If the pod crashes afterwards, the logs name the path it cannot write.

**Docs:**
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#set-the-security-context-for-a-container): the field examples, including seccomp. Search: `security context`
- [Volumes](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir): the `emptyDir` volume syntax. Search: `emptyDir`

## 6.4

**What this trains:** Debugging a container that crashes because of its `securityContext`, and fixing it while keeping the process non-root.

**Why the solution looks like this:**
- The logs name the real cause: a permission error when nginx creates its directories under `/var/cache/nginx`. The stock image expects to start as root and then switch to user `nginx`, so UID 2100 cannot write there.
- Port 80 is not the problem. Container runtimes set `net.ipv4.ip_unprivileged_port_start=0` in the pod, so a non-root process can bind low ports. Don't spend time on that theory.
- The unprivileged image is built for UID 101 and has writable paths for that user. It listens on 8080, so `containerPort` changes too.
- Changing only the UID to 101 on the stock image still fails, because the cache and pid paths stay unwritable.
- `replace --force` deletes and recreates the pod. A pod's `securityContext` cannot be edited in place.

**On the exam:** Read `k logs` before changing anything; plain `logs` already shows the failed start. After the fix, confirm Running and check `id` in the container.

**Docs:**
- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/): the order of checks for a crashing pod. Search: `debug pods`
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/): `runAsUser` and `runAsNonRoot`. Search: `security context`

## 6.5

**What this trains:** Creating a Secret imperatively and using it in a pod in both ways: single keys as environment variables and the whole Secret as files.

**Why the solution looks like this:**
- `create secret generic` with `--from-literal` encodes the values for you. Quote a literal that contains special characters, so the shell passes it through unchanged.
- The task asks for the names `DB_USER` and `DB_PASS`, which differ from the Secret's keys. That needs `valueFrom.secretKeyRef` per variable; `envFrom` would import the key names as they are.
- The volume uses `secret.secretName`, not `name` as a ConfigMap volume does. Each key becomes one file under the mount path, and `readOnly: true` on the mount keeps the container from writing there.
- The `ls -la` output shows the files as symlinks into `..data`. The kubelet swaps that directory when the Secret changes, so mounted files update while environment variables keep their start-up values.

**On the exam:** Create the Secret with one command, generate the pod with `$do`, and copy the `env` and volume blocks from the docs. Check both with `exec`.

**Docs:**
- [Distribute Credentials Securely Using Secrets](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/): pod examples for Secret volumes and env vars. Search: `distribute credentials secret`
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod): how mounted Secrets behave. Search: `secret`

## 6.6

**What this trains:** The basic RBAC chain in one namespace: ServiceAccount, Role, RoleBinding, and a pod that runs with that identity.

**Why the solution looks like this:**
- All three objects have `kubectl create` generators, so no YAML is needed for them. The binding's subject is written as `--serviceaccount=<ns>:<name>`; without the namespace part the command is rejected.
- `kubectl run` has no `--serviceaccount` flag any more. Generate the pod and add `serviceAccountName` under `spec`. Without it the pod runs as the namespace's `default` ServiceAccount and has none of the granted rights.
- `auth can-i` with `--as=system:serviceaccount:<ns>:<name>` asks the API server on behalf of the ServiceAccount, so you test the rules without a token or an `exec` into the pod.
- The three checks cover the edges of the grant: an allowed verb, a verb that was not granted, and the same verb in another namespace. A Role and RoleBinding never reach outside their namespace.

**On the exam:** Run the three `create` commands, then `auth can-i` at once, before building the pod. Keep `-n` on every command, including the `can-i` checks.

**Docs:**
- [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#command-line-utilities): `create role` and `create rolebinding` examples. Search: `rbac`
- [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/): `serviceAccountName` in a pod spec. Search: `configure service account`

## 6.7

**What this trains:** The difference between binding a ClusterRole with a ClusterRoleBinding and with a RoleBinding, and what the `create clusterrole` generator writes for API groups.

**Why the solution looks like this:**
- A ClusterRole is only a set of rules. The binding decides the scope: a ClusterRoleBinding grants the rules in every namespace, while a RoleBinding that references the same ClusterRole grants them only in the RoleBinding's own namespace.
- The task says "every namespace", so only `create clusterrolebinding` fits. The ServiceAccount is still named with its namespace, `sec-e:securityaccount`.
- `--resource=pods` writes `apiGroups: [""]`, the core group, which is where pods live. The task asks for all API groups, and the generator cannot produce `"*"`, so that version is YAML.
- The checks run in `kube-system`, a namespace the ServiceAccount has nothing to do with: `list` is allowed, `get` is not. Verbs are granted one by one; `list` does not include `get`.

**On the exam:** Read the scope words in the task first: "in namespace X" means RoleBinding, "cluster-wide" means ClusterRoleBinding. Then confirm with `auth can-i` in a second namespace.

**Docs:**
- [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#rolebinding-and-clusterrolebinding): the binding types and what a RoleBinding to a ClusterRole means. Search: `rbac`
- [kubectl auth can-i](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/): flags and examples for the check. Search: `kubectl auth can-i`

## 6.8

**What this trains:** Getting a token for a ServiceAccount on a current cluster, where token Secrets are no longer created automatically.

**Why the solution looks like this:**
- Since v1.24 a new ServiceAccount has no Secret with a token in it. Looking for one with `get secret` finds nothing.
- `create token` asks the TokenRequest API for a short-lived token. `--duration=1h` sets the lifetime the task asks for.
- The command prints the token and nothing else on stdout, so a plain redirect gives a file with "only the token". The value is already the readable JWT; don't base64-decode it.
- A long-lived token is a different request. It needs a Secret of type `kubernetes.io/service-account-token` with the annotation that names the ServiceAccount; the control plane then fills in the token. That value sits in `.data`, so it is base64-encoded and has to be decoded.

**On the exam:** Use `create token` unless the task explicitly wants a long-lived token or a Secret. Check the file: it starts with `eyJ` and has no extra text.

**Docs:**
- [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/#manually-create-an-api-token-for-a-serviceaccount): `create token` and the long-lived token Secret manifest. Search: `configure service account`
- [kubectl create token](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/): the flags, including `--duration`. Search: `kubectl create token`

## 6.9

**What this trains:** Writing the default-deny NetworkPolicy that closes a namespace in both directions. Most NetworkPolicy tasks build on it.

**Why the solution looks like this:**
- An empty `podSelector: {}` selects every pod in the namespace, including pods created later.
- Listing `Ingress` and `Egress` under `policyTypes` without any `ingress` or `egress` rules means: both directions are controlled and nothing is allowed. Leave out `Egress` and outgoing traffic stays open.
- There is no generator for NetworkPolicies, so this is YAML from the docs.
- Egress deny also blocks DNS. The test pod cannot resolve the Service name, so wget fails with `bad address` instead of a connection timeout. Read that message as "DNS is blocked", not as a typo in the name.
- The policy only has an effect when the CNI enforces it (Calico or Cilium here). A CNI without enforcement accepts the object and the test would wrongly pass.

**On the exam:** Copy the default-deny example from the Network Policies page and set name and namespace. Check `describe netpol`: it must list both policy types and no allowed traffic.

**Docs:**
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-ingress-and-all-egress-traffic): the default-deny manifests to copy. Search: `network policies`

## 6.10

**What this trains:** Opening one path through a default-deny namespace: ingress to a server from labelled clients, plus the egress those clients need, DNS included.

**Why the solution looks like this:**
- Policies are additive. The deny policy stays, and each new policy adds allowed traffic for the pods it selects.
- Two policies are needed because default-deny blocks both ends. One allows ingress to `app=web`; the other allows egress from `role=frontend`. With only the first, the client cannot send anything.
- In the ingress rule, `from` and `ports` sit in the same rule, so both must match: labelled client and TCP 80.
- The client looks up the name `web` before it connects. The second egress rule allows port 53 over UDP and TCP to the `kube-system` namespace, selected through the label `kubernetes.io/metadata.name` that every namespace carries.
- The unlabelled test pod fails with `bad address`. It has no DNS egress, so it never gets as far as the ingress rule.

**On the exam:** List both directions for every pod involved before typing YAML. Test with one allowed and one unlabelled client.

**Docs:**
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/#networkpolicy-resource): the full example with `ingress`, `egress` and `ports`. Search: `network policies`
- [Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/): a worked test with a labelled busybox client. Search: `declare network policy`

## 6.11

**What this trains:** Choosing the right peer type in a NetworkPolicy and reading the list syntax of `from` correctly.

**Why the solution looks like this:**
- `namespaceSelector` matches namespaces by their labels and then covers every pod in them. The label `team=frontend` must be on the Namespace object, not on the client pod.
- `ipBlock` matches by address range and suits addresses outside the cluster. `except` cuts a smaller range out of the `cidr`.
- The two peers are separate list items, each with its own dash, so they are OR'd. A `namespaceSelector` and a `podSelector` inside one item are AND'd: those pods in those namespaces. One dash changes the meaning.
- `ports` belongs to the rule and applies to both peers. `policyTypes` lists only `Ingress`, so egress stays unrestricted as the task asks.
- The client in `default` ends with `download timed out`, not `bad address`. Its DNS works; only the connection to the pod is dropped.

**On the exam:** Count the dashes under `from` against the wording: "or" means separate items, "pods in namespace" means one item. `describe netpol` shows how the rule was parsed.

**Docs:**
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors): the four peer forms and the AND/OR examples. Search: `network policies`

## 6.12

**What this trains:** Understanding that a Service finds its pods only through labels, and repairing a Service that selects nothing without touching the running pod.

**Why the solution looks like this:**
- `expose` builds the Service's selector from the labels of the object it exposes. A pod without labels gives it nothing to select on, so it stops with an error.
- Labels can be added to a running pod. `k label` fixes the cause without recreating anything, which the task forbids.
- `expose` has no flag for a fixed node port. `create service nodeport` has `--node-port`, which is why the solution switches generators.
- That generator always writes the selector `app=<service name>`. No pod carries `app: secondapp`, so the selector is edited to the new label before applying. Skip the edit and the Service exists but has no endpoints.
- The EndpointSlice check shows one endpoint, which proves the selector matches. The curl on the node port then proves the whole path.

**On the exam:** After creating any Service, look at its endpoints first. If there are none, compare the selector with `k get po --show-labels`.

**Docs:**
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport): NodePort Services and choosing your own port. Search: `service nodeport`
- [kubectl create service nodeport](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_service_nodeport/): the `--tcp` and `--node-port` flags. Search: `kubectl create service nodeport`
