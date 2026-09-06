[CmdletBinding()]
param(
    [string]$Dataset = '',
    [switch]$Docker
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Dataset) {
    $Dataset = Join-Path $repoRoot 'examples\harbor-office-tasks'
}

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python command was not found.'
}

$arguments = @((Join-Path $PSScriptRoot 'validate_harbor.py'), $Dataset)
if ($Docker) {
    $arguments += '--docker'
}
python @arguments
if ($LASTEXITCODE -ne 0) {
    throw 'Harbor dataset validation failed.'
}
