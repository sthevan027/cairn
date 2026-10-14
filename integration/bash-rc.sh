# rcfile usado pelo warp-clone: carrega o ~/.bashrc do usuário e depois a integração.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
. "$WARP_CLONE_INTEGRATION/bash-integration.sh"
