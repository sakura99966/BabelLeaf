[CmdletBinding()]
param(
    [string]$BundleDirectory = "",
    [string]$ArtifactsDirectory = "",
    [ValidateRange(5, 300)]
    [int]$StartupTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $appRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($BundleDirectory)) {
    $BundleDirectory = Join-Path $repoRoot "target\x86_64-pc-windows-msvc\release\bundle\nsis"
}
if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
    $ArtifactsDirectory = Join-Path $appRoot "artifacts\windows-installer-smoke"
}

$productName = "BabelLeaf"
$bundleIdentifier = "io.github.sakura99966.babelleaf"
$uninstallRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$productName"
$appConfigDirectory = Join-Path $env:APPDATA $bundleIdentifier
$appLocalDataDirectory = Join-Path $env:LOCALAPPDATA $bundleIdentifier
$sentinelPath = Join-Path $appConfigDirectory "installer-smoke-user-data.txt"

$applicationProcess = $null
$installDirectory = $null
$installationAttempted = $false
$primaryFailure = $null
$cleanupFailure = $null

function Write-SmokeArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    New-Item -ItemType Directory -Path $ArtifactsDirectory -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $ArtifactsDirectory $Name) -Value $Content -Encoding UTF8
}

function Collect-FailureArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [System.Management.Automation.ErrorRecord]$Failure
    )

    $details = @(
        "Windows installer smoke test failed."
        "Timestamp: $([DateTimeOffset]::Now.ToString("o"))"
        "Bundle directory: $BundleDirectory"
        "Install directory: $installDirectory"
        "Error: $($Failure.Exception.ToString())"
        "Script stack trace: $($Failure.ScriptStackTrace)"
    ) -join [Environment]::NewLine
    Write-SmokeArtifact -Name "failure.txt" -Content $details

    $logDirectory = Join-Path $appLocalDataDirectory "logs"
    if (Test-Path -LiteralPath $logDirectory) {
        $logArtifactDirectory = Join-Path $ArtifactsDirectory "logs"
        New-Item -ItemType Directory -Path $logArtifactDirectory -Force | Out-Null
        try {
            Copy-Item -Path (Join-Path $logDirectory "*") -Destination $logArtifactDirectory -Recurse -Force
        } catch {
            Write-SmokeArtifact -Name "log-copy-error.txt" -Content $_.Exception.ToString()
        }
    } else {
        Write-SmokeArtifact -Name "logs-not-found.txt" -Content "No application log directory was created at $logDirectory"
    }
}

function Stop-SmokeApplication {
    if ($null -eq $script:applicationProcess) {
        return
    }

    try {
        $script:applicationProcess.Refresh()
        if ($script:applicationProcess.HasExited) {
            return
        }

        if ($script:applicationProcess.CloseMainWindow()) {
            if ($script:applicationProcess.WaitForExit(10000)) {
                return
            }
        }

        Stop-Process -Id $script:applicationProcess.Id -Force -ErrorAction Stop
        $script:applicationProcess.WaitForExit(10000) | Out-Null
    } catch {
        if ($script:applicationProcess.HasExited) {
            return
        }
        throw
    }
}

try {
    if (-not (Test-Path -LiteralPath $BundleDirectory -PathType Container)) {
        throw "NSIS bundle directory does not exist: $BundleDirectory"
    }

    $installers = @(
        Get-ChildItem -LiteralPath $BundleDirectory -File -Filter "*-setup.exe"
    )
    if ($installers.Count -ne 1) {
        $found = if ($installers.Count -eq 0) {
            "none"
        } else {
            ($installers.FullName -join ", ")
        }
        throw "Expected exactly one x64 NSIS installer in '$BundleDirectory'; found $($installers.Count): $found"
    }
    if ($installers[0].Name -notlike "${productName}_*_x64-setup.exe") {
        throw "The only NSIS installer has an unexpected name: $($installers[0].Name)"
    }
    $installerPath = $installers[0].FullName
    Write-Host "Using installer: $installerPath"

    if (Test-Path -LiteralPath $uninstallRegistryPath) {
        throw "Refusing to replace an existing $productName installation at $uninstallRegistryPath"
    }
    if (
        (Test-Path -LiteralPath $appConfigDirectory) -or
        (Test-Path -LiteralPath $appLocalDataDirectory)
    ) {
        throw "Refusing to run against an existing $productName user-data profile."
    }

    $installDirectory = Join-Path $env:LOCALAPPDATA $productName
    $installationAttempted = $true
    $installerProcess = Start-Process `
        -FilePath $installerPath `
        -ArgumentList @("/S", "/CurrentUser", "/NS") `
        -Wait `
        -PassThru
    if ($installerProcess.ExitCode -ne 0) {
        throw "NSIS installer exited with code $($installerProcess.ExitCode)."
    }

    if (-not (Test-Path -LiteralPath $uninstallRegistryPath)) {
        throw "CurrentUser uninstall registry entry was not created: $uninstallRegistryPath"
    }

    $uninstallEntry = Get-ItemProperty -LiteralPath $uninstallRegistryPath
    $installDirectory = ([string]$uninstallEntry.InstallLocation).Trim('"')
    if ([string]::IsNullOrWhiteSpace($installDirectory)) {
        throw "The uninstall registry entry has no InstallLocation."
    }
    if (-not (Test-Path -LiteralPath $installDirectory -PathType Container)) {
        throw "The registered install directory does not exist: $installDirectory"
    }

    $mainBinaryName = [string]$uninstallEntry.MainBinaryName
    if ([string]::IsNullOrWhiteSpace($mainBinaryName)) {
        $mainBinaryName = "babelleaf.exe"
    }
    $applicationPath = Join-Path $installDirectory $mainBinaryName
    if (-not (Test-Path -LiteralPath $applicationPath -PathType Leaf)) {
        throw "The installed application executable does not exist: $applicationPath"
    }
    Write-Host "Installed application: $applicationPath"

    $applicationProcess = Start-Process -FilePath $applicationPath -PassThru
    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    $ready = $false

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $applicationProcess.Refresh()
        if ($applicationProcess.HasExited) {
            throw "The application exited during startup with code $($applicationProcess.ExitCode)."
        }
        if ($applicationProcess.MainWindowHandle -ne [IntPtr]::Zero -and $applicationProcess.Responding) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw "The application did not create a responding window within $StartupTimeoutSeconds seconds."
    }
    Write-Host "Application process $($applicationProcess.Id) is alive with a responding window."

    New-Item -ItemType Directory -Path $appConfigDirectory -Force | Out-Null
    Set-Content -LiteralPath $sentinelPath -Value "preserve-user-data" -Encoding UTF8
} catch {
    $primaryFailure = $_
} finally {
    try {
        Stop-SmokeApplication
    } catch {
        $cleanupFailure = $_
        Write-SmokeArtifact -Name "process-cleanup-failure.txt" -Content $_.Exception.ToString()
    }

    if ($installationAttempted) {
        try {
            if ([string]::IsNullOrWhiteSpace($installDirectory) -and (Test-Path -LiteralPath $uninstallRegistryPath)) {
                $entry = Get-ItemProperty -LiteralPath $uninstallRegistryPath
                $installDirectory = ([string]$entry.InstallLocation).Trim('"')
            }

            if (-not [string]::IsNullOrWhiteSpace($installDirectory)) {
                $uninstallerPath = Join-Path $installDirectory "uninstall.exe"
                if (-not (Test-Path -LiteralPath $uninstallerPath -PathType Leaf)) {
                    throw "The uninstaller does not exist: $uninstallerPath"
                }

                $uninstallerProcess = Start-Process `
                    -FilePath $uninstallerPath `
                    -ArgumentList @("/S", "/CurrentUser") `
                    -Wait `
                    -PassThru
                if ($uninstallerProcess.ExitCode -ne 0) {
                    throw "NSIS uninstaller exited with code $($uninstallerProcess.ExitCode)."
                }

                $installedExecutable = Join-Path $installDirectory "babelleaf.exe"
                $uninstallDeadline = (Get-Date).AddSeconds(30)
                while (
                    ((Test-Path -LiteralPath $uninstallRegistryPath) -or
                        (Test-Path -LiteralPath $installedExecutable)) -and
                    (Get-Date) -lt $uninstallDeadline
                ) {
                    Start-Sleep -Milliseconds 500
                }
                if (Test-Path -LiteralPath $uninstallRegistryPath) {
                    throw "The CurrentUser uninstall registry entry remains after uninstall."
                }
                if (Test-Path -LiteralPath $installedExecutable) {
                    throw "The installed application executable remains after uninstall."
                }
                if ((Test-Path -LiteralPath $sentinelPath) -and
                    ((Get-Content -LiteralPath $sentinelPath -Raw).Trim() -eq "preserve-user-data")) {
                    Write-Host "Uninstall completed and preserved the user-data sentinel."
                } elseif ($null -eq $primaryFailure) {
                    throw "The silent uninstaller removed or changed the user-data sentinel."
                }
            }
        } catch {
            if ($null -eq $cleanupFailure) {
                $cleanupFailure = $_
            }
            Write-SmokeArtifact -Name "uninstall-failure.txt" -Content $_.Exception.ToString()
        }
    }
}

if ($null -ne $primaryFailure -or $null -ne $cleanupFailure) {
    $reportedFailure = if ($null -ne $primaryFailure) {
        $primaryFailure
    } else {
        $cleanupFailure
    }
    try {
        Collect-FailureArtifacts -Failure $reportedFailure
    } catch {
        Write-Warning "Failed to collect installer smoke artifacts: $($_.Exception.Message)"
    }
}

if ($null -ne $primaryFailure) {
    if ($null -ne $cleanupFailure) {
        throw "$($primaryFailure.Exception.Message) Cleanup also failed: $($cleanupFailure.Exception.Message)"
    }
    throw $primaryFailure
}
if ($null -ne $cleanupFailure) {
    throw $cleanupFailure
}

Write-Host "Windows NSIS installer smoke test passed."
