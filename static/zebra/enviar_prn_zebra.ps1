# Envia arquivo .prn (ZPL) para impressora Zebra no Windows — sem Zebra Setup Utilities.
# Uso: clique direito → Executar com PowerShell
#   .\enviar_prn_zebra.ps1 -Arquivo "C:\Downloads\longarina_11-A-01-1.prn"
# Ou arraste o .prn sobre enviar_prn_zebra.bat

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Arquivo
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Arquivo)) {
    Write-Host "ERRO: arquivo nao encontrado: $Arquivo" -ForegroundColor Red
    exit 1
}

$caminho = (Resolve-Path -LiteralPath $Arquivo).Path
$printers = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match 'ZDesigner|ZD220|ZD230|Zebra'
})

if ($printers.Count -eq 0) {
    Write-Host ""
    Write-Host "Nenhuma impressora Zebra/ZDesigner encontrada no Windows." -ForegroundColor Yellow
    Write-Host "Instale o driver da ZD220: https://www.zebra.com/ap/en/support-downloads/printers/desktop/ZD200d.html"
    Write-Host "Ou o Zebra Setup Utilities: https://www.zebra.com/setup"
    Write-Host ""
    Write-Host "Impressoras instaladas:"
    Get-Printer -ErrorAction SilentlyContinue | Format-Table Name, PortName, DriverName -AutoSize
    exit 1
}

$printer = $null
if ($printers.Count -eq 1) {
    $printer = $printers[0]
} else {
    Write-Host ""
    Write-Host "Varias impressoras Zebra encontradas:"
    for ($i = 0; $i -lt $printers.Count; $i++) {
        $p = $printers[$i]
        Write-Host "  [$i] $($p.Name)  (porta: $($p.PortName))"
    }
    $sel = Read-Host "Digite o numero da impressora"
    $idx = [int]$sel
    if ($idx -lt 0 -or $idx -ge $printers.Count) {
        Write-Host "ERRO: numero invalido." -ForegroundColor Red
        exit 1
    }
    $printer = $printers[$idx]
}

$port = $printer.PortName
if (-not $port) {
    Write-Host "ERRO: porta da impressora nao encontrada." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Arquivo : $caminho"
Write-Host "Impressora: $($printer.Name)"
Write-Host "Porta   : $port"
Write-Host "Enviando..."
Write-Host ""

# Metodo classico Zebra Windows: copia binaria direto para a porta USB/COM
$null = cmd /c "copy /b `"$caminho`" $port"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao enviar para $port" -ForegroundColor Red
    Write-Host "Tente instalar Zebra Setup Utilities: https://www.zebra.com/setup"
    exit 1
}

Write-Host "OK — comandos enviados para a impressora." -ForegroundColor Green
Write-Host ""
