# SuperGestor - Agente do Duplecast para rodar no seu PC (Windows)
# Uso (PowerShell): irm https://supergestor.top/sigma-proxy/rodar-no-pc.ps1 | iex

$ErrorActionPreference = "Stop"
$Secret = "sg-duplecast-2026-7Kq3Vt9Zr1Ax"
$Dir = "$env:USERPROFILE\supergestor-agente"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

function Test-PythonReal {
  try {
    $ver = & python --version 2>&1
    return ($ver -is [string] -and $ver.StartsWith("Python "))
  } catch { return $false }
}

Write-Host "1/4 Verificando Python..."
if (-not (Test-PythonReal)) {
  Write-Host "Python nao esta instalado ou e o atalho da Microsoft Store. Instalando Python 3.12..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
  } else {
    Write-Host "winget nao encontrado. Baixando instalador do Python..."
    $pyInstaller = "$Dir\python-installer.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.6/python-3.12.6-amd64.exe" -OutFile $pyInstaller
    & $pyInstaller /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 | Out-Null
  }
  # Recarrega PATH sem fechar o PowerShell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + "$env:LOCALAPPDATA\Programs\Python\Python312;" + "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts"
  if (-not (Test-PythonReal)) {
    throw "Python ainda nao foi instalado. Feche o PowerShell, abra novamente e rode o comando de novo."
  }
}

Write-Host "2/4 Instalando o navegador automatico..."
python -m pip install --upgrade pip seleniumbase | Out-Null

Write-Host "3/4 Baixando o programa..."
Invoke-WebRequest -Uri "https://supergestor.top/sigma-proxy/seleniumbase_agent.py" -OutFile "$Dir\agente.py"
if (-not (Test-Path "$Dir\cloudflared.exe")) {
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$Dir\cloudflared.exe"
}

Write-Host "4/4 Iniciando agente local..."
$env:SIGMA_PROXY_SECRET = $Secret
$env:HEADLESS = "0"
$env:PORT = "8788"
$agente = Start-Process -FilePath "python" -ArgumentList "$Dir\agente.py" -WorkingDirectory $Dir -PassThru

Write-Host "Aguardando o agente subir..."
$tentativas = 0
while ($tentativas -lt 15) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8788/" -UseBasicParsing -ErrorAction Stop -MaximumRedirection 0
    if ($r.StatusCode -eq 200) { break }
  } catch {}
  Start-Sleep -Seconds 1
  $tentativas++
}
if ($tentativas -ge 15) {
  Write-Host "O agente local nao subiu. Verifique se aparece algum erro acima." -ForegroundColor Red
}

Write-Host ""
Write-Host "Pronto! Copie o link https://....trycloudflare.com que vai aparecer abaixo e mande no chat do SuperGestor."
Write-Host "Deixe esta janela aberta." -ForegroundColor Yellow
& "$Dir\cloudflared.exe" tunnel --url http://127.0.0.1:8788
