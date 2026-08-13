[CmdletBinding()]
param(
    [string]$ArtifactsDirectory = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "test-windows-installer.ps1"
$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $appRoot "..\.." )).Path
$smokeConfigPath = Join-Path $appRoot "src-tauri\tauri.windows.smoke.conf.json"
if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
    $ArtifactsDirectory = Join-Path $repoRoot "target\windows-installer-preflight-cleanup"
}

$before = @(
    Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter "BabelLeaf-installer-profile-*" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
)
$failureObserved = $false
try {
    & $scriptPath `
        -IsolatedProfile `
        -ForcePreflightFailure `
        -TauriConfigPath $smokeConfigPath `
        -ExpectedProductName "BabelLeaf Smoke" `
        -ExpectedBundleIdentifier "io.github.sakura99966.babelleaf.smoke" `
        -ArtifactsDirectory $ArtifactsDirectory
} catch {
    $failureObserved = $true
}
if (-not $failureObserved) {
    throw "The forced installer preflight failure unexpectedly succeeded."
}

$after = @(
    Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter "BabelLeaf-installer-profile-*" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
)
$newProfiles = @($after | Where-Object { $before -notcontains $_ })
if ($newProfiles.Count -gt 0) {
    throw "Forced installer preflight left profile directories: $($newProfiles -join ', ')"
}

Write-Host "Windows installer forced-preflight cleanup verification passed."
