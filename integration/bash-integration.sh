# Cairn: integração de shell (bash)
# Emite OSC 9278 marcando início e fim de cada comando:
#   ESC ] 9278 ; pre  ; <base64 do comando>            BEL   (antes de executar)
#   ESC ] 9278 ; post ; <exit code> ; <base64 do cwd>  BEL   (antes do próximo prompt)
# O sleep antes do OSC é necessário: o ConPTY do Windows entrega o OSC na hora mas
# renderiza o texto só no próximo frame (~16ms); sem o atraso o marcador chega antes
# do texto que o precede.

[ -n "$__CAIRN_LOADED" ] && return 0
__CAIRN_LOADED=1
__cairn_at_prompt=0
__cairn_ec=0

__cairn_b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
__cairn_emit() { sleep 0.025; printf '\033]9278;%s\007' "$1"; }

__cairn_capture() { __cairn_ec=$?; }

__cairn_preexec() {
  [ "$__cairn_at_prompt" = 1 ] || return 0
  [ -z "$COMP_LINE" ] || return 0
  case "$BASH_COMMAND" in __cairn_*) return 0 ;; esac
  __cairn_at_prompt=0
  local line
  line=$(HISTTIMEFORMAT= builtin history 1 | sed 's/^ *[0-9]* *//')
  __cairn_emit "pre;$(__cairn_b64 "$line")"
}

__cairn_precmd() {
  __cairn_emit "post;$__cairn_ec;$(__cairn_b64 "$PWD")"
  __cairn_at_prompt=1
}

PROMPT_COMMAND="__cairn_capture${PROMPT_COMMAND:+;$PROMPT_COMMAND};__cairn_precmd"
trap '__cairn_preexec' DEBUG
