# Python discovery only: no administrator rights, PATH edits, pip or npm install.
[CmdletBinding()]
param(
    [string]$Python,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$InstallerArguments
)
$ErrorActionPreference = 'Stop'
$candidates = @()
if ($Python) { $candidates += @{ Command = $Python; Prefix = @() } }
else {
    foreach ($name in @('python', 'python3')) {
        $candidate = Get-Command $name -ErrorAction SilentlyContinue
        if ($candidate) { $candidates += @{ Command = $candidate.Source; Prefix = @() } }
    }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { $candidates += @{ Command = $py.Source; Prefix = @('-3') } }
    $bundled = Join-Path $env:USERPROFILE '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) {
        $candidates += @{ Command = $bundled; Prefix = @() }
    }
}
$selected = $null
foreach ($candidate in $candidates) {
    $executable = $candidate.Command
    $prefix = $candidate.Prefix
    try {
        & $executable @prefix -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' 2>$null
        if ($LASTEXITCODE -eq 0) { $selected = $candidate; break }
    } catch { }
}
if (-not $selected) { throw 'Python 3.10+ was not found. Supply -Python C:\path\python.exe or install Harness with its bundled runtime.' }
$executable = $selected.Command
$prefix = $selected.Prefix
& $executable @prefix (Join-Path $PSScriptRoot 'scripts/install_harness.py') @InstallerArguments
exit $LASTEXITCODE
