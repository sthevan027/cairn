# Cairn: integracao de shell (PowerShell 7 e Windows PowerShell 5.1)
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

if ($global:__CAIRN_LOADED) { return }
$global:__CAIRN_LOADED = $true
$global:__cairn_pending = $false

function global:__cairn_emit([string]$payload) {
    Start-Sleep -Milliseconds 25
    [Console]::Out.Write("$([char]27)]9278;$payload$([char]7)")
}

function global:__cairn_b64([string]$text) {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
}

$global:__cairn_orig_prompt = $function:prompt
function global:prompt {
    $wcOk = $?
    $wcLec = $global:LASTEXITCODE
    if ($global:__cairn_pending) {
        $global:__cairn_pending = $false
        $code = 0
        if (-not $wcOk) {
            $code = 1
            if ($wcLec -is [int] -and $wcLec -ne 0) { $code = $wcLec }
        }
        __cairn_emit "post;$code;$(__cairn_b64 (Get-Location).Path)"
    }
    # Modo "cairn": o app desenha os widgets e o shell mostra so o simbolo de entrada.
    # O app grava o modo em $env:CAIRN_MODE_FILE; ler a cada prompt faz a troca valer na hora.
    $wcMode = $null
    if ($env:CAIRN_MODE_FILE -and (Test-Path -LiteralPath $env:CAIRN_MODE_FILE)) {
        $wcMode = Get-Content -LiteralPath $env:CAIRN_MODE_FILE -TotalCount 1
    }
    if ($wcMode -eq 'cairn') {
        return "$([char]27)[33m$([char]0x276F)$([char]27)[0m "
    }
    # os comandos acima zeraram $?; devolve o valor real para o prompt original
    if (-not $wcOk) { Write-Error 'wc' -ErrorAction Ignore }
    & $global:__cairn_orig_prompt
}

$wcRead = Get-Command PSConsoleHostReadLine -CommandType Function -ErrorAction SilentlyContinue
if ($wcRead) {
    $global:__cairn_orig_readline = $wcRead.ScriptBlock
    function global:PSConsoleHostReadLine {
        $line = & $global:__cairn_orig_readline
        if ($line -and $line.Trim()) {
            $global:__cairn_pending = $true
            __cairn_emit "pre;$(__cairn_b64 $line)"
        }
        $line
    }
}
