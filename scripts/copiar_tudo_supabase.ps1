# Copia schema + dados: base antiga -> Doca Livre WMS PRO
# Pede a senha UMA vez (mesma nos dois projetos Supabase)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ""
Write-Host "=== Copiar Supabase: antiga -> PRO ===" -ForegroundColor Cyan
Write-Host "Projeto antigo: ndfjetskugqsrrmulcyz"
Write-Host "Projeto novo:   wbqyufalamdsgurejvyz (Doca Livre WMS PRO)"
Write-Host ""

$senhaTexto = $env:SUPABASE_DB_PASSWORD
if (-not $senhaTexto -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*SUPABASE_DB_PASSWORD\s*=\s*(.+)\s*$') {
            $senhaTexto = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $senhaTexto) {
    $senha = Read-Host "Senha do banco (Database password do PRO - mesma nos dois)" -AsSecureString
    $senhaTexto = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senha)
    )
}

if ([string]::IsNullOrWhiteSpace($senhaTexto)) {
    Write-Host "Senha vazia. Cancelado." -ForegroundColor Red
    exit 1
}

# Escapar caracteres especiais na URL
$senhaEnc = [uri]::EscapeDataString($senhaTexto)

$env:PGSSLMODE = "require"
$env:DATABASE_URL_ORIGEM = "postgresql://postgres:${senhaEnc}@db.ndfjetskugqsrrmulcyz.supabase.co:5432/postgres"
$env:DATABASE_URL_DESTINO = "postgresql://postgres:${senhaEnc}@db.wbqyufalamdsgurejvyz.supabase.co:5432/postgres"

Write-Host ""
Write-Host "1/2 Aplicando schema no PRO..." -ForegroundColor Yellow
$env:DATABASE_URL = $env:DATABASE_URL_DESTINO
python scripts/aplicar_schema_supabase.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "2/2 Copiando dados..." -ForegroundColor Yellow
python scripts/migrar_supabase_para_supabase.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Conferindo contagens (origem):" -ForegroundColor Yellow
$env:DATABASE_URL = $env:DATABASE_URL_ORIGEM
python scripts/contar_linhas_supabase.py

Write-Host ""
Write-Host "Conferindo contagens (destino PRO):" -ForegroundColor Yellow
$env:DATABASE_URL = $env:DATABASE_URL_DESTINO
python scripts/contar_linhas_supabase.py

Write-Host ""
Write-Host "Concluido! Proximo passo: atualize DATABASE_URL no Render (pooler porta 6543)." -ForegroundColor Green
