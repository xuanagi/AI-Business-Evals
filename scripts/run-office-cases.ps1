[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,
    [Parameter(Mandatory = $true)]
    [string]$Model,
    [string]$ReasoningEffort = '',
    [string[]]$AgentKwarg = @(),
    [ValidateRange(1, 100)]
    [int]$Attempts = 1,
    [ValidateRange(1, 100)]
    [int]$Concurrent = 1,
    [string]$JobName = '',
    [string]$Dataset = '',
    [string]$JobsDir = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Dataset) {
    $Dataset = Join-Path $repoRoot 'examples\harbor-office-tasks'
}
if (-not $JobsDir) {
    $JobsDir = Join-Path $repoRoot 'harbor-jobs'
}
if (-not (Test-Path -LiteralPath (Join-Path $Dataset 'dataset.toml'))) {
    throw "Harbor dataset was not found: $Dataset"
}
if (-not (Get-Command harbor -ErrorAction SilentlyContinue)) {
    throw 'harbor command was not found. Install Harbor first.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker command was not found. Install and start Docker first.'
}
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
docker info *> $null
$dockerInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($dockerInfoExitCode -ne 0) {
    throw 'Docker is installed, but the Docker daemon is not running.'
}

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$pythonPathEntries = @($repoRoot)
if ($env:PYTHONPATH) {
    $pythonPathEntries += $env:PYTHONPATH
}
$env:PYTHONPATH = $pythonPathEntries -join [IO.Path]::PathSeparator

$harborArgs = @(
    'run',
    '--path', $Dataset,
    '--agent', $Agent,
    '--model', $Model,
    '--n-attempts', $Attempts,
    '--n-concurrent', $Concurrent,
    '--jobs-dir', $JobsDir,
    '--artifact', '/workspace/output'
)

if ($ReasoningEffort) {
    if ($ReasoningEffort -notin @('low', 'medium', 'high', 'xhigh', 'max', 'ultra')) {
        throw "Unsupported reasoning effort: $ReasoningEffort"
    }
    $harborArgs += @('--agent-kwarg', "reasoning_effort=$ReasoningEffort")
}
foreach ($value in $AgentKwarg) {
    $harborArgs += @('--agent-kwarg', $value)
}
if ($JobName) {
    $harborArgs += @('--job-name', $JobName)
}

Write-Host "Dataset : $Dataset"
Write-Host "Agent   : $Agent"
Write-Host "Model   : $Model"
Write-Host "Jobs    : $JobsDir"

& harbor @harborArgs
if ($LASTEXITCODE -ne 0) {
    throw "Harbor failed with exit code $LASTEXITCODE"
}
