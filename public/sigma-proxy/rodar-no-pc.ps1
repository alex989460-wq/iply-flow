# SuperGestor - Agente do Duplecast para rodar no seu PC (Windows)
# Uso (PowerShell): irm https://supergestor.top/sigma-proxy/rodar-no-pc.ps1 | iex

$ErrorActionPreference = "Stop"
$Secret = "sg-duplecast-2026-7Kq3Vt9Zr1Ax"
$Dir = "$env:USERPROFILE\supergestor-agente"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

function Find-PythonExe {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:ProgramFiles\Python312\python.exe",
    "$env:ProgramFiles\Python313\python.exe",
    "$env:ProgramFiles\Python311\python.exe"
  )

  $pythonRoot = "$env:LOCALAPPDATA\Programs\Python"
  if (Test-Path $pythonRoot) {
    $candidates += Get-ChildItem -Path $pythonRoot -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not $candidate -or -not (Test-Path $candidate)) { continue }
    try {
      $ver = & $candidate --version 2>&1 | Out-String
      if ($ver.Trim().StartsWith("Python ")) { return $candidate }
    } catch {}
  }

  try {
    $launcher = Get-Command py.exe -ErrorAction Stop
    $resolved = & $launcher.Source -3 -c "import sys; print(sys.executable)" 2>$null
    if ($resolved -and (Test-Path $resolved.Trim())) { return $resolved.Trim() }
  } catch {}

  try {
    $command = Get-Command python.exe -CommandType Application -ErrorAction Stop
    $resolved = $command.Source
    if ($resolved -notlike "*\WindowsApps\*" -and (Test-Path $resolved)) {
      $ver = & $resolved --version 2>&1 | Out-String
      if ($ver.Trim().StartsWith("Python ")) { return $resolved }
    }
  } catch {}

  return $null
}

Write-Host "1/4 Verificando Python..."
$PythonExe = Find-PythonExe
if (-not $PythonExe) {
  Write-Host "Python nao esta instalado ou e o atalho da Microsoft Store. Instalando Python 3.12..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
  } else {
    Write-Host "winget nao encontrado. Baixando instalador do Python..."
    $pyInstaller = "$Dir\python-installer.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.6/python-3.12.6-amd64.exe" -OutFile $pyInstaller
    & $pyInstaller /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 | Out-Null
  }
  # Recarrega o PATH e procura diretamente nas pastas de instalacao.
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + "$env:LOCALAPPDATA\Programs\Python\Python312;" + "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts"
  $PythonExe = Find-PythonExe
  if (-not $PythonExe) {
    throw "O Python foi instalado, mas o executavel nao foi localizado. Abra https://python.org/downloads, instale marcando Add Python to PATH e rode novamente."
  }
}
Write-Host "Python encontrado: $PythonExe" -ForegroundColor Green

Write-Host "2/4 Instalando o navegador automatico..."
& $PythonExe -m pip install --upgrade pip seleniumbase | Out-Null

Write-Host "3/4 Baixando o programa..."
Invoke-WebRequest -Uri "https://supergestor.top/sigma-proxy/seleniumbase_agent.py" -OutFile "$Dir\agente.py"
if (-not (Test-Path "$Dir\cloudflared.exe")) {
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$Dir\cloudflared.exe"
}

Write-Host "4/4 Iniciando agente local..."
$env:SIGMA_PROXY_SECRET = $Secret
$env:HEADLESS = "0"
$env:PORT = "8788"
$agente = Start-Process -FilePath $PythonExe -ArgumentList "`"$Dir\agente.py`"" -WorkingDirectory $Dir -PassThru

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
  if (-not $agente.HasExited) { Stop-Process -Id $agente.Id -Force -ErrorAction SilentlyContinue }
  throw "O agente local nao iniciou. O tunel nao sera aberto para evitar o erro 502."
}

Write-Host ""
Write-Host "Pronto! Copie o link https://....trycloudflare.com que vai aparecer abaixo e mande no chat do SuperGestor."
Write-Host "Deixe esta janela aberta." -ForegroundColor Yellow
& "$Dir\cloudflared.exe" tunnel --url http://127.0.0.1:8788
