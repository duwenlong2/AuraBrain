[CmdletBinding()]
param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\AuraBrain\Runtime",
  [string]$NodeVersion = 'v22.14.0',
  [switch]$NoStartup,
  [switch]$NoTray
)

$ErrorActionPreference = 'Stop'
$packageRoot = if (Test-Path (Join-Path $PSScriptRoot 'package.json')) {
  $PSScriptRoot
} else {
  Split-Path -Parent $PSScriptRoot
}
$stagingRoot = Join-Path $env:TEMP "AuraBrain-install-$([guid]::NewGuid().ToString('N'))"
$backupRoot = "$InstallRoot.previous"

function Find-Node {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Ensure-Node([string]$root) {
  $existing = Find-Node
  if ($existing) {
    $version = (& $existing --version).Trim()
    if ($version -match '^v(2[2-9]|[3-9]\d)\.') { return $existing }
    Write-Output "Existing Node.js $version is older than the supported LTS range; using the bundled version."
  }

  $nodeRoot = Join-Path $root 'node'
  $nodePath = Join-Path $nodeRoot 'node.exe'
  if (Test-Path $nodePath) { return $nodePath }

  $downloadDirectory = Join-Path $env:TEMP "AuraBrain-node-$([guid]::NewGuid().ToString('N'))"
  $archive = Join-Path $downloadDirectory "node-$NodeVersion-win-x64.zip"
  $url = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
  New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
  try {
    Write-Output "Downloading Node.js $NodeVersion..."
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
    Expand-Archive -LiteralPath $archive -DestinationPath $downloadDirectory -Force
    $extracted = Join-Path $downloadDirectory "node-$NodeVersion-win-x64"
    New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $extracted '*') -Destination $nodeRoot -Recurse -Force
    if (-not (Test-Path $nodePath)) { throw 'Downloaded Node.js archive did not contain node.exe.' }
    return $nodePath
  } catch {
    throw "Node.js could not be downloaded or installed. Check network access and retry. Error: $($_.Exception.Message)"
  } finally {
    if (Test-Path $downloadDirectory) { Remove-Item $downloadDirectory -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function New-Shortcut([string]$path, [string]$target, [string]$arguments, [string]$workingDirectory, [string]$description) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $workingDirectory
  $shortcut.Description = $description
  $shortcut.Save()
}

try {
  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  $excludedNames = @('.git', '.aurabrain', 'node_modules')
  Copy-Item -Path (Join-Path $packageRoot '*') -Destination $stagingRoot -Recurse -Force -Exclude $excludedNames
  $systemNode = Find-Node
  $node = Ensure-Node $stagingRoot
  $nodeIsBundled = $node -like "$stagingRoot*"
  Push-Location $stagingRoot
  $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
  & $npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed. The previous version was not changed.' }
  if (-not (Test-Path (Join-Path $stagingRoot 'bin\aurabrain.mjs'))) { throw 'The package does not contain the AuraBrain CLI.' }
  Pop-Location

  if (Test-Path $backupRoot) { Remove-Item $backupRoot -Recurse -Force }
  if (Test-Path $InstallRoot) { Move-Item $InstallRoot $backupRoot }
  Move-Item $stagingRoot $InstallRoot
  $stagingRoot = $null

  $bin = Join-Path $InstallRoot 'bin\aurabrain.mjs'
  $installedNode = if ($nodeIsBundled) { Join-Path $InstallRoot 'node\node.exe' } else { $node }
  $runtimeRoot = $InstallRoot
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\AuraBrain'
  New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
  New-Shortcut (Join-Path $startMenu 'AuraBrain.lnk') $installedNode "`"$bin`" dev" $runtimeRoot 'Start AuraBrain Runtime'
  New-Shortcut (Join-Path $startMenu 'AuraBrain Settings.lnk') $installedNode "`"$bin`" settings" $runtimeRoot 'Open AuraBrain Settings'

  $startupPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\AuraBrain.lnk'
  if ($NoStartup) {
    if (Test-Path $startupPath) { Remove-Item $startupPath -Force }
  } else {
    New-Shortcut $startupPath $installedNode "`"$bin`" dev" $runtimeRoot 'Start AuraBrain Runtime at login'
  }

  $trayPath = Join-Path $startMenu 'AuraBrain Tray.lnk'
  $trayExe = Join-Path $InstallRoot 'native\AuraBrain.Tray.exe'
  if ($NoTray) {
    if (Test-Path $trayPath) { Remove-Item $trayPath -Force }
  } elseif (Test-Path $trayExe) {
    New-Shortcut $trayPath $trayExe '' $runtimeRoot 'AuraBrain system tray'
    $trayStartup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\AuraBrain Tray.lnk'
    New-Shortcut $trayStartup $trayExe '' $runtimeRoot 'AuraBrain system tray'
  }

  if (Test-Path $backupRoot) { Remove-Item $backupRoot -Recurse -Force }
  Write-Output "AuraBrain installation complete: $InstallRoot"
  Write-Output "Runtime: $bin"
  Write-Output "Startup: $(-not $NoStartup)"
  Write-Output "Tray: $(-not $NoTray -and (Test-Path $trayExe))"
} catch {
  if ($stagingRoot -and (Test-Path $stagingRoot)) { Remove-Item $stagingRoot -Recurse -Force }
  if ((Test-Path $backupRoot) -and -not (Test-Path $InstallRoot)) { Move-Item $backupRoot $InstallRoot }
  throw
}
