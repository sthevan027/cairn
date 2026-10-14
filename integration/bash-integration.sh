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

# Modo "cairn": o app desenha os widgets e o shell mostra so o simbolo de entrada.
# O app grava o modo em $CAIRN_MODE_FILE; ler a cada prompt faz a troca valer na hora.
__cairn_ps1_orig="$PS1"
__cairn_apply_mode() {
  local mode=shell
  [ -r "$CAIRN_MODE_FILE" ] && read -r mode < "$CAIRN_MODE_FILE"
  if [ "$mode" = cairn ]; then
    PS1=$'\\[\e[33m\\]\xe2\x9d\xaf\\[\e[0m\\] '
  else
    PS1="$__cairn_ps1_orig"
  fi
}

__cairn_precmd() {
  __cairn_apply_mode
  __cairn_emit "post;$__cairn_ec;$(__cairn_b64 "$PWD")"
  __cairn_at_prompt=1
}

PROMPT_COMMAND="__cairn_capture${PROMPT_COMMAND:+;$PROMPT_COMMAND};__cairn_precmd"
trap '__cairn_preexec' DEBUG
