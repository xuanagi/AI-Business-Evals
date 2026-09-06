[CmdletBinding()]
param(
    [string]$Root = '',
    [ValidateRange(1, 65535)]
    [int]$Port = 8765,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Root) {
    $Root = Join-Path $repoRoot 'harbor-jobs'
}
$server = Join-Path $repoRoot 'tools\trajectory-portal\server.py'
$dist = Join-Path $repoRoot 'tools\trajectory-portal\dist\index.html'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python command was not found.'
}
if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Harbor job directory was not found: $Root"
}
if (-not (Test-Path -LiteralPath $dist -PathType Leaf)) {
    throw 'Trajectory Portal has not been built. Run npm install and npm run build in tools\trajectory-portal.'
}

$arguments = @($server, '--root', $Root, '--port', $Port)
if ($NoOpen) {
    $arguments += '--no-open'
}

python @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Trajectory Portal exited with code $LASTEXITCODE"
}
