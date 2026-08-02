[CmdletBinding()]
param(
    [string]$BundleDirectory = "",
    [string]$ArtifactsDirectory = "",
    [string]$TauriConfigPath = "",
    [string]$ExpectedProductName = "BabelLeaf",
    [string]$ExpectedMainBinaryName = "babelleaf",
    [string]$ExpectedBundleIdentifier = "io.github.sakura99966.babelleaf",
    [switch]$PreflightOnly,
    [ValidateRange(5, 300)]
    [int]$StartupTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $appRoot "..\..")).Path
$packageJsonPath = Join-Path $appRoot "package.json"
if ([string]::IsNullOrWhiteSpace($TauriConfigPath)) {
    $TauriConfigPath = Join-Path $appRoot "src-tauri\tauri.conf.json"
}
if (-not (Test-Path -LiteralPath $TauriConfigPath -PathType Leaf)) {
    throw "Tauri configuration file does not exist: $TauriConfigPath"
}
$tauriConfigPath = (Resolve-Path -LiteralPath $TauriConfigPath).Path

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$packageVersion = [string]$packageJson.version
$productName = [string]$tauriConfig.productName
$mainBinaryName = [string]$tauriConfig.mainBinaryName
$bundleIdentifier = [string]$tauriConfig.identifier

if ([string]::IsNullOrWhiteSpace($packageVersion)) {
    throw "package.json does not define a version."
}
if ($productName -ne $ExpectedProductName) {
    throw "Unexpected Tauri product name: $productName (expected $ExpectedProductName)"
}
if ($mainBinaryName -ne $ExpectedMainBinaryName) {
    throw "Unexpected Tauri main binary name: $mainBinaryName (expected $ExpectedMainBinaryName)"
}
if ($bundleIdentifier -ne $ExpectedBundleIdentifier) {
    throw "Unexpected Tauri bundle identifier: $bundleIdentifier (expected $ExpectedBundleIdentifier)"
}
if ([string]$tauriConfig.bundle.windows.webviewInstallMode.type -ne "offlineInstaller") {
    throw "Windows packages must embed the WebView2 offline installer."
}
if ([string]$tauriConfig.bundle.windows.nsis.installMode -ne "both") {
    throw "Windows NSIS installMode must remain 'both'."
}

if ([string]::IsNullOrWhiteSpace($BundleDirectory)) {
    $BundleDirectory = Join-Path $repoRoot "target\x86_64-pc-windows-msvc\release\bundle\nsis"
}
if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
    $ArtifactsDirectory = Join-Path $appRoot "artifacts\windows-installer-smoke"
}

$uninstallRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$productName"
$appConfigDirectory = Join-Path $env:APPDATA $bundleIdentifier
$appLocalDataDirectory = Join-Path $env:LOCALAPPDATA $bundleIdentifier
$sentinelPath = Join-Path $appConfigDirectory "installer-smoke-user-data.txt"

$applicationProcess = $null
$installDirectory = $null
$installationAttempted = $false
$profileWasClean = $false
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
    if ($script:profileWasClean -and (Test-Path -LiteralPath $logDirectory)) {
        $logArtifactDirectory = Join-Path $ArtifactsDirectory "logs"
        New-Item -ItemType Directory -Path $logArtifactDirectory -Force | Out-Null
        try {
            Copy-Item -Path (Join-Path $logDirectory "*") -Destination $logArtifactDirectory -Recurse -Force
        } catch {
            Write-SmokeArtifact -Name "log-copy-error.txt" -Content $_.Exception.ToString()
        }
    } elseif (-not $script:profileWasClean) {
        Write-SmokeArtifact -Name "logs-not-collected.txt" -Content "Existing user-data was detected; application logs were not copied."
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

    $expectedInstallerName = "${productName}_${packageVersion}_x64-setup.exe"
    $installerPath = Join-Path $BundleDirectory $expectedInstallerName
    if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
        $availableInstallers = @(
            Get-ChildItem -LiteralPath $BundleDirectory -File -Filter "${productName}_*_x64-setup.exe"
        )
        $found = if ($availableInstallers.Count -eq 0) {
            "none"
        } else {
            ($availableInstallers.FullName -join ", ")
        }
        throw "Expected the current package '$installerPath'; available BabelLeaf x64 installers: $found"
    }

    $installerVersion = (Get-Item -LiteralPath $installerPath).VersionInfo
    if ([string]$installerVersion.FileVersion -ne $packageVersion) {
        throw "Installer file version '$($installerVersion.FileVersion)' does not match package.json '$packageVersion'."
    }
    if ([string]$installerVersion.ProductName -ne $productName) {
        throw "Installer product name '$($installerVersion.ProductName)' does not match '$productName'."
    }

    Write-Host "Using installer: $installerPath"
    Write-Host "Validated $productName $packageVersion with embedded WebView2 offline installer configuration."

    if ($PreflightOnly) {
        Write-Host "Windows NSIS installer preflight passed."
        return
    }

    if (Test-Path -LiteralPath $uninstallRegistryPath) {
        throw "Refusing to replace an existing $productName installation at $uninstallRegistryPath"
    }
    if (
        (Test-Path -LiteralPath $appConfigDirectory) -or
        (Test-Path -LiteralPath $appLocalDataDirectory)
    ) {
        throw "Refusing to run against an existing $productName user-data profile."
    }
    $profileWasClean = $true

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
        $mainBinaryName = "$ExpectedMainBinaryName.exe"
    }
    $applicationPath = Join-Path $installDirectory $mainBinaryName
    if (-not (Test-Path -LiteralPath $applicationPath -PathType Leaf)) {
        throw "The installed application executable does not exist: $applicationPath"
    }

    $applicationVersion = (Get-Item -LiteralPath $applicationPath).VersionInfo
    if ([string]$applicationVersion.FileVersion -ne $packageVersion) {
        throw "Installed application version '$($applicationVersion.FileVersion)' does not match '$packageVersion'."
    }
    if ([string]$applicationVersion.ProductName -ne $productName) {
        throw "Installed application product name '$($applicationVersion.ProductName)' does not match '$productName'."
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

                $installedExecutable = Join-Path $installDirectory "$ExpectedMainBinaryName.exe"
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
