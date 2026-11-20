# CKAD speed sheet (one page)

Exam: 2 h, ~15-20 tasks, pass at 66%, remote Linux desktop (PSI) with terminal + Firefox. The exam environment runs Kubernetes v1.37 (checked on 2026-11-20; re-read the "Important Instructions: CKA and CKAD" page the week before). **Every task names a host: `ssh` to it from the task's infobox, do the work there, then `exit`.** Nested ssh isn't supported, and `sudo -i` is available on the host.

## 1. First 60 seconds
You can't bring scripts, dotfiles or notes into the exam; nothing from your machine reaches the PSI desktop. You can type anything into its terminal, so memorise these lines:
- **Usually preconfigured:** `alias k=kubectl` and bash completion. Check with `type k`, and re-read the current "Important Instructions: CKAD" page before exam day.
- **Type yourself:** the `export do=...` line (and `now` if you use it). Train this: in practice, start without `$do` and type it every session.
- **Only if needed:** the `~/.vimrc` line; many exam setups already indent YAML sensibly, so look first.

```bash
alias k=kubectl                       # usually preconfigured; check with: type k
export do="--dry-run=client -o yaml"  # k run x --image=nginx $do > x.yaml
export now="--force --grace-period 0" # k delete po x $now
source <(kubectl completion bash); complete -o default -F __start_kubectl k
k config set-context --current --namespace=<ns>   # only if a task is all in one ns; otherwise always pass -n
```
`~/.vimrc`:
```
set expandtab tabstop=2 shiftwidth=2 autoindent number
```

## 2. Context and namespace
```bash
ssh <host>                       # copy it from the task's infobox, every task; `exit` when the task is done
k config current-context         # only to check where you are; the exam no longer asks you to switch contexts
k config view --minify | grep namespace
```

## 3. Generators (imperative first, then edit)
| Need | Command |
|---|---|
| Pod | `k run web --image=nginx --port=80 -l app=web $do` |
| Pod + command | `k run bb --image=busybox:1.36 $do -- sh -c 'sleep 3600'` (`--command` not needed with `--`) |
| Temp test pod | `k run t --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- svc:80` |
| Deployment | `k create deploy web --image=nginx --replicas=3 --port=80 $do` |
| Service from deploy/pod | `k expose deploy web --port=80 --target-port=8080 --type=NodePort --name=web-svc` |
| Service with node port | `k create svc nodeport web --tcp=80:80 --node-port=30080 $do` (selector `app=web`!) |
| Job | `k create job j --image=busybox:1.36 $do -- sleep 5` (add completions/parallelism by hand) |
| Job from CronJob | `k create job now --from=cronjob/cj` |
| CronJob | `k create cj cj --image=busybox:1.36 --schedule="*/5 * * * *" $do -- date` |
| ConfigMap | `k create cm c --from-literal=K=V --from-file=key=./file --from-env-file=.env` |
| Secret | `k create secret generic s --from-literal=pw=x`; TLS: `k create secret tls t --cert=c.crt --key=c.key` |
| Docker registry secret | `k create secret docker-registry reg --docker-server=… --docker-username=… --docker-password=…` |
| SA / token | `k create sa app`; `k create token app --duration=1h` |
| Role / binding | `k create role r --verb=get,list --resource=pods,deployments.apps`; `k create rolebinding rb --role=r --serviceaccount=ns:app` |
| ClusterRole | `k create clusterrole cr --verb=list --resource=pods`; `k create clusterrolebinding …` |
| Quota | `k create quota q --hard=pods=5,requests.cpu=1,limits.memory=2Gi` |
| Ingress | `k create ingress i --class=nginx --rule="host.com/api*=svc:8080"` (`*` → Prefix, none → Exact) |
| PDB | `k create pdb p --selector=app=web --min-available=1` |

No generator (copy from docs): PV, PVC, NetworkPolicy, LimitRange, probes, securityContext, volumes, init/sidecar containers.

## 4. Change things fast
```bash
k set image deploy/web nginx=nginx:1.28        # container=image
k set env deploy/web MODE=prod                 # --from=configmap/c (keys become UPPERCASE)
k set resources deploy/web --requests=cpu=100m,memory=64Mi --limits=cpu=200m,memory=128Mi
k set serviceaccount deploy/web app
k scale deploy web --replicas=5
k label po x tier=fe --overwrite ; k label po x tier-     # add / remove
k annotate deploy web kubernetes.io/change-cause="why"   # replaces deprecated --record
k patch svc web -p '{"spec":{"selector":{"app":"v2"}}}'
k replace --force -f pod.yaml                  # immutable pod fields: export, edit, force-replace
k edit ...  # on save error, kubectl writes /tmp/kubectl-edit-*.yaml → k replace --force -f that file
```

## 5. Rollouts
```bash
k rollout status|history|pause|resume|restart deploy/web
k rollout history deploy/web --revision=2
k rollout undo deploy/web [--to-revision=1]
```

## 6. Find and inspect
```bash
k explain pod.spec.containers.securityContext --recursive | less
k api-resources | grep -i netpol        k api-versions
k get po -A -o wide --show-labels -l app=web,env!=prod
k get po -o jsonpath='{.items[*].metadata.name}'
k get po --sort-by=.metadata.creationTimestamp
k get po -o custom-columns=NAME:.metadata.name,IMG:.spec.containers[0].image
k describe po x | grep -A10 Events      k events -n ns --types=Warning   # ordered by time; or k get events --sort-by=.metadata.creationTimestamp
k logs x -c c --previous --tail=20 --since=5m     k logs deploy/web     k logs job/j
k exec -it x -c c -- sh                 k debug x -it --image=busybox:1.36 --target=c
k top po -A --sort-by=memory            k top node
k auth can-i list secrets -n ns --as=system:serviceaccount:ns:app
k describe svc x -n ns | grep Endpoints # empty = selector or readiness problem (EndpointSlices also list not-ready pods)
```

## 7. Helm
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update
helm search repo nginx            helm show values bitnami/nginx | less
helm install rel bitnami/nginx -n ns --create-namespace --set replicaCount=2 [-f values.yaml]
helm upgrade rel bitnami/nginx -n ns --reuse-values --set image.tag=x
helm list -A [--failed | --pending]          helm history rel -n ns   # Helm 4 lists all states; Helm 3 needs -a
helm rollback rel 1 -n ns          helm uninstall rel -n ns       helm get values rel -n ns
helm template rel chart/ > out.yaml          helm pull repo/chart --untar
```

## 8. Kustomize
```bash
k kustomize dir/      # render       k apply -k dir/      k delete -k dir/
```
`kustomization.yaml` keys: `resources`, `namespace`, `namePrefix`, `commonLabels`/`labels`, `images` (`name`, `newName`, `newTag`), `replicas`, `configMapGenerator`, `secretGenerator`, `patches`.

## 9. vim / YAML tips
- Paste from the docs with `:set paste` (then `:set nopaste`), or the `.vimrc` above.
- Indent a block: `V` + select lines + `>` / `<`. `5>>` indents 5 lines. Undo `u`, redo `Ctrl-r`.
- Delete to end of file: `dG`. Go to line 42: `42G`. Search: `/image`.
- `- ` list items line up with the parent key's children. Probes, resources, securityContext and volumeMounts belong to the **container**. volumes, initContainers, serviceAccountName, nodeSelector and pod `securityContext` belong to the **pod spec**.
- Quote values that look like numbers or booleans in env, labels and annotations: `"8080"`, `"true"`.
- Copy and paste in the exam terminal: `Ctrl+Shift+C` / `Ctrl+Shift+V`.

## 10. Bookmarks (allowed: kubernetes.io/docs, kubernetes.io/blog, helm.sh/docs; Gateway API docs are allowed for the CKA only)
Know where these pages are, since bookmarks may not carry over. Use the kubernetes.io search box:
- kubectl Quick Reference: `/docs/reference/kubectl/quick-reference/`
- Configure Liveness, Readiness and Startup Probes: `/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/`
- Configure a Security Context: `/docs/tasks/configure-pod-container/security-context/`
- Configure a Pod to Use a PersistentVolume for Storage: `/docs/tutorials/configuration/configure-persistent-volume-storage/`
- Configure a Pod to Use a ConfigMap / Secrets (distribute credentials): `/docs/tasks/configure-pod-container/configure-pod-configmap/`, `/docs/tasks/inject-data-application/distribute-credentials-secure/`
- Network Policies (has the ingress+egress example): `/docs/concepts/services-networking/network-policies/`
- Ingress: `/docs/concepts/services-networking/ingress/`
- Jobs and CronJob: `/docs/concepts/workloads/controllers/job/`, `/docs/concepts/workloads/controllers/cron-jobs/`
- Init Containers and Sidecar Containers: `/docs/concepts/workloads/pods/init-containers/`, `/docs/concepts/workloads/pods/sidecar-containers/`
- Resource Quotas and Limit Ranges: `/docs/concepts/policy/resource-quotas/`, `/docs/concepts/policy/limit-range/`
- Using RBAC Authorization: `/docs/reference/access-authn-authz/rbac/`
- Deployments (rolling update, rollback): `/docs/concepts/workloads/controllers/deployment/`
- Debug Running Pods (ephemeral containers): `/docs/tasks/debug/debug-application/debug-running-pod/`
- Deprecated API Migration Guide: `/docs/reference/using-api/deprecation-guide/`
- Declarative Management with Kustomize: `/docs/tasks/manage-kubernetes-objects/kustomization/`
- helm.sh: `/docs/helm/helm_install/`, `/docs/helm/helm_upgrade/`, `/docs/helm/helm_rollback/`

## 11. Exam tactics
- Read the whole task, then `ssh` to its host. Write files exactly where asked (absolute paths). `exit` before the next task.
- The task's Quick Reference box links to the docs pages you may need. There are no personal bookmarks: the browser runs inside the remote desktop.
- 2% tasks: max 3-4 min. Flag hard tasks and come back. 66% passes; don't sink 15 min into one task.
- Verify each task with one `get`/`describe`/`exec` before moving on. Pods `Running` ≠ `Ready`.
- Don't wait for things: `k delete … $now`, and use `-w` only when you must.
- Build/podman tasks: the task tells you on which host. `ssh` there, and `exit` back afterwards.
