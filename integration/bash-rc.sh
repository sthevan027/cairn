# rcfile usado pelo cairn: carrega o ~/.bashrc do usuário e depois a integração.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
. "$CAIRN_INTEGRATION/bash-integration.sh"
