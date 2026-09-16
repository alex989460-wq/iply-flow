# SuperGestor - Agente do Duplecast para rodar no seu PC (Windows)
# Uso (PowerShell): irm https://supergestor.top/sigma-proxy/rodar-no-pc.ps1 | iex

$ErrorActionPreference = "Stop"
$Secret = "sg-duplecast-2026-7Kq3Vt9Zr1Ax"
$Dir = "$env:USERPROFILE\supergestor-agente"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

Write-Host "1/4 Verificando Python..."
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Instalando Python..."
  winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

Write-Host "2/4 Instalando o navegador automatico..."
python -m pip install --upgrade pip seleniumbase | Out-Null

Write-Host "3/4 Baixando o programa..."
Invoke-WebRequest -Uri "https://supergestor.top/sigma-proxy/seleniumbase_agent.py" -OutFile "$Dir\agente.py"
if (-not (Test-Path "$Dir\cloudflared.exe")) {
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$Dir\cloudflared.exe"
}

Write-Host "4/4 Iniciando..."
$env:SIGMA_PROXY_SECRET = $Secret
$env:HEADLESS = "0"
$env:PORT = "8788"
Start-Process -FilePath "python" -ArgumentList "$Dir\agente.py" -WorkingDirectory $Dir
Start-Sleep -Seconds 6
Write-Host ""
Write-Host "Pronto! Copie o link https://....trycloudflare.com que vai aparecer abaixo e mande no chat do SuperGestor."
Write-Host "Deixe esta janela aberta." -ForegroundColor Yellow
& "$Dir\cloudflared.exe" tunnel --url http://127.0.0.1:8788
