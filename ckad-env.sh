# CKAD practice shell: makes a Mac terminal behave like the exam terminal.
#
# Start it with:   bash --rcfile ckad-env.sh
# (from the repo folder, or pass the full path). Type `exit` to leave.
#
# The exam runs bash on Linux with GNU tools. The drills are written for that,
# so in zsh `$do` doesn't split into separate flags, and macOS `sed -i` reads
# the next argument as a backup suffix. This file fixes both for practice.

# Keep your normal bash settings (PATH from Homebrew etc.) if you have any.
[ -f ~/.bashrc ] && . ~/.bashrc

# The exam environment usually has `k` preconfigured; check there with: type k
alias k=kubectl
export do="--dry-run=client -o yaml"   # k run x --image=nginx $do > x.yaml
export now="--force --grace-period 0"  # k delete po x $now

# GNU sed, like on the exam's Linux (brew install gnu-sed).
if command -v gsed >/dev/null 2>&1; then
  alias sed=gsed
else
  echo "ckad-env: gsed not found; 'sed -i' in the drills fails with macOS sed (brew install gnu-sed)" >&2
fi

# Same vim settings the cheatsheet recommends, without touching ~/.vimrc.
export VIMINIT='set expandtab tabstop=2 shiftwidth=2 autoindent number | syntax on'

# kubectl completion, also for `k`. Needs bash 4+ and bash-completion@2:
#   brew install bash bash-completion@2
# macOS's own /bin/bash is 3.2, where kubectl completion doesn't work well.
if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
  for f in /opt/homebrew/etc/profile.d/bash_completion.sh /usr/local/etc/profile.d/bash_completion.sh; do
    [ -r "$f" ] && . "$f" && break
  done
  if command -v kubectl >/dev/null 2>&1; then
    . <(kubectl completion bash)
    complete -o default -F __start_kubectl k
  fi
else
  echo "ckad-env: bash $BASH_VERSION has no kubectl completion; brew install bash bash-completion@2, then run with \$(brew --prefix)/bin/bash" >&2
fi

PS1='\[\e[1;34m\]ckad\[\e[0m\] \W \$ '
echo "ckad-env: k, \$do, \$now ready. Exit with 'exit'."
