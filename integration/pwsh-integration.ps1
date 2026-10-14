# warp-clone: integracao de shell (PowerShell 7 e Windows PowerShell 5.1)
# Somente ASCII: o 5.1 le arquivo sem BOM como ANSI.
#
# Emite OSC 9278 marcando inicio e fim de cada comando:
#   ESC ] 9278 ; pre  ; <base64 do comando>            BEL   (linha aceita, antes de executar)
#   ESC ] 9278 ; post ; <exit code> ; <base64 do cwd>  BEL   (antes do proximo prompt)
# O Start-Sleep antes do OSC e necessario: o ConPTY entrega o OSC na hora mas renderiza o
# texto so no proximo frame (~16ms); sem o atraso o marcador chega antes do texto anterior.
#
# PowerShell nao tem precmd/preexec. Usamos:
#   preexec -> embrulha PSConsoleHostReadLine (roda depois que o PSReadLine renderizou a linha)
#   precmd  -> embrulha a funcao prompt (preservando $? para o prompt original, ex. oh-my-posh)

if ($global:__WC_LOADED) { return }
$global:__WC_LOADED = $true
$global:__wc_pending = $false

function global:__wc_emit([string]$payload) {
    Start-Sleep -Milliseconds 25
    [Console]::Out.Write("$([char]27)]9278;$payload$([char]7)")
}

function global:__wc_b64([string]$text) {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
}

$global:__wc_orig_prompt = $function:prompt
function global:prompt {
    $wcOk = $?
    $wcLec = $global:LASTEXITCODE
    if ($global:__wc_pending) {
        $global:__wc_pending = $false
        $code = 0
        if (-not $wcOk) {
            $code = 1
            if ($wcLec -is [int] -and $wcLec -ne 0) { $code = $wcLec }
        }
        __wc_emit "post;$code;$(__wc_b64 (Get-Location).Path)"
    }
    # os comandos acima zeraram $?; devolve o valor real para o prompt original
    if (-not $wcOk) { Write-Error 'wc' -ErrorAction Ignore }
    & $global:__wc_orig_prompt
}

$wcRead = Get-Command PSConsoleHostReadLine -CommandType Function -ErrorAction SilentlyContinue
if ($wcRead) {
    $global:__wc_orig_readline = $wcRead.ScriptBlock
    function global:PSConsoleHostReadLine {
        $line = & $global:__wc_orig_readline
        if ($line -and $line.Trim()) {
            $global:__wc_pending = $true
            __wc_emit "pre;$(__wc_b64 $line)"
        }
        $line
    }
}
