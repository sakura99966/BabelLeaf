[CmdletBinding()]
param(
    [string]$BundleDirectory = "",
    [string]$ArtifactsDirectory = "",
    [string]$TauriConfigPath = "",
    [string]$ExpectedProductName = "BabelLeaf",
    [string]$ExpectedMainBinaryName = "babelleaf",
    [string]$ExpectedBundleIdentifier = "io.github.sakura99966.babelleaf",
    [switch]$PreflightOnly,
    [switch]$IsolatedProfile,
    [switch]$ForcePreflightFailure,
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
$knownRoamingAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
$knownLocalAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)

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
if ([string]$tauriConfig.bundle.windows.nsis.installMode -ne "currentUser") {
    throw "Windows NSIS installMode must remain 'currentUser' so installation does not require elevation."
}
if ([string]::IsNullOrWhiteSpace($knownRoamingAppData) -or
    [string]::IsNullOrWhiteSpace($knownLocalAppData)) {
    throw "Windows known-folder APIs did not return the roaming and local application-data directories."
}
if ($IsolatedProfile -and -not $PreflightOnly -and
    -not $bundleIdentifier.EndsWith(".smoke", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Isolated installer execution requires a dedicated '.smoke' bundle identifier; refusing to touch the production profile '$bundleIdentifier'."
}

if ([string]::IsNullOrWhiteSpace($BundleDirectory)) {
    $BundleDirectory = Join-Path $repoRoot "target\x86_64-pc-windows-msvc\release\bundle\nsis"
}
if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
    $ArtifactsDirectory = Join-Path $appRoot "artifacts\windows-installer-smoke"
}

$isolatedProfileRoot = $null
$isolatedInstallDirectory = $null
if ($IsolatedProfile -and -not $PreflightOnly) {
    New-Item -ItemType Directory -Path $ArtifactsDirectory -Force | Out-Null
    # NSIS resolves its `$LOCALAPPDATA` variable through the Windows shell,
    # not through the environment variable overridden below. Keep the profile
    # in the system temp directory and pass an explicit `/D` install path so
    # the installer and this test use the same isolated location.
    $isolatedProfileRoot = Join-Path $env:TEMP "BabelLeaf-installer-profile-$([Guid]::NewGuid().ToString('N'))"
    $isolatedInstallDirectory = Join-Path $isolatedProfileRoot "install"
    New-Item -ItemType Directory -Path (Join-Path $isolatedProfileRoot "appdata") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $isolatedProfileRoot "localappdata") -Force | Out-Null
    $env:APPDATA = Join-Path $isolatedProfileRoot "appdata"
    $env:LOCALAPPDATA = Join-Path $isolatedProfileRoot "localappdata"
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $isolatedProfileRoot "webview2"
    Write-Host "Using isolated user-data profile: $isolatedProfileRoot"
}

$uninstallRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$productName"
# Tauri and NSIS use Windows known-folder APIs, which intentionally ignore
# APPDATA/LOCALAPPDATA overrides. Resolve the paths the installed application
# actually uses so the clean-profile check and retention sentinel are real.
$appConfigDirectory = Join-Path $knownRoamingAppData $bundleIdentifier
$appLocalDataDirectory = Join-Path $knownLocalAppData $bundleIdentifier
$sentinelPath = Join-Path $appConfigDirectory "installer-smoke-user-data.txt"

$applicationProcess = $null
$applicationPath = $null
$installDirectory = $null
$registryEntryCreated = $false
$installationAttempted = $false
$profileWasClean = $false
$primaryFailure = $null
$cleanupFailure = $null
$sentinelPreserved = $false

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
    $rootProcessIds = @()
    if ($null -ne $script:applicationProcess) {
        try {
            $rootProcessIds = @([int]$script:applicationProcess.Id)
            $script:applicationProcess.Refresh()
            if (-not $script:applicationProcess.HasExited) {
                if ($script:applicationProcess.CloseMainWindow()) {
                    $script:applicationProcess.WaitForExit(10000) | Out-Null
                }
                if (-not $script:applicationProcess.HasExited) {
                    Stop-Process -Id $script:applicationProcess.Id -Force -ErrorAction Stop
                    $script:applicationProcess.WaitForExit(10000) | Out-Null
                }
            }
        } catch {
            if (-not $script:applicationProcess.HasExited) {
                throw
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($script:applicationPath)) {
        $targetPath = [System.IO.Path]::GetFullPath($script:applicationPath)
        foreach ($rootProcessId in $rootProcessIds) {
            # Kill the captured Tauri root as a tree before inspecting CIM. This
            # covers the short interval where the WebView child has detached
            # from an already-exited root and avoids passing a live file lock to
            # the NSIS uninstaller.
            Start-Process -FilePath "taskkill.exe" `
                -ArgumentList @("/PID", "$rootProcessId", "/T", "/F") `
                -Wait -PassThru -WindowStyle Hidden |
                Out-Null
        }
        $getRelatedProcesses = {
            $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
            $knownProcessIds = @{}
            foreach ($rootProcessId in $rootProcessIds) {
                $knownProcessIds[[int]$rootProcessId] = $true
            }

            $frontier = @($rootProcessIds | ForEach-Object { [int]$_ })
            while ($frontier.Count -gt 0) {
                $nextFrontier = @(
                    $allProcesses |
                        Where-Object {
                            $frontier -contains [int]$_.ParentProcessId -and
                            -not $knownProcessIds.ContainsKey([int]$_.ProcessId)
                        } |
                        ForEach-Object {
                            $processId = [int]$_.ProcessId
                            $knownProcessIds[$processId] = $true
                            $processId
                        }
                )
                $frontier = $nextFrontier
            }

            @($allProcesses | Where-Object {
                $processId = [int]$_.ProcessId
                $isRelated = $knownProcessIds.ContainsKey($processId)
                $isExactTarget = -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
                    [string]::Equals(
                        [System.IO.Path]::GetFullPath([string]$_.ExecutablePath),
                        $targetPath,
                        [System.StringComparison]::OrdinalIgnoreCase
                    )
                $isRelated -or $isExactTarget
            })
        }
        # Tauri can leave a second process for the same executable while the
        # main window process is closing. Use the CIM executable path rather
        # than Get-Process.Path (which can be unavailable during WebView2
        # teardown), and stop every related instance before invoking NSIS.
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $remaining = @(& $getRelatedProcesses)
            if ($remaining.Count -eq 0) {
                break
            }
            foreach ($process in $remaining) {
                $killer = Start-Process -FilePath "taskkill.exe" `
                    -ArgumentList @("/PID", "$($process.ProcessId)", "/T", "/F") `
                    -Wait -PassThru -WindowStyle Hidden
                if ($killer.ExitCode -ne 0) {
                    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Milliseconds 250
        }
    }
}

try {
    if ($ForcePreflightFailure) {
        throw "Forced preflight failure for cleanup verification."
    }
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

    if ($null -ne $isolatedInstallDirectory) {
        $installDirectory = $isolatedInstallDirectory
    } else {
        $installDirectory = Join-Path $env:LOCALAPPDATA $productName
    }
    $installationAttempted = $true
    $installerArguments = @("/S", "/NS")
    if ($null -ne $isolatedInstallDirectory) {
        # `/D` must be the final NSIS argument. The temp path has no spaces,
        # so it can be passed without quoting through Start-Process.
        $installerArguments += "/D=$isolatedInstallDirectory"
    }
    $installerProcess = Start-Process `
        -FilePath $installerPath `
        -ArgumentList $installerArguments `
        -Wait `
        -PassThru
    if ($installerProcess.ExitCode -ne 0) {
        throw "NSIS installer exited with code $($installerProcess.ExitCode)."
    }

    $registryEntryCreated = Test-Path -LiteralPath $uninstallRegistryPath
    if ($registryEntryCreated) {
        $uninstallEntry = Get-ItemProperty -LiteralPath $uninstallRegistryPath
        $installDirectory = ([string]$uninstallEntry.InstallLocation).Trim('"')
    }
    # Current-user NSIS packages may omit the uninstall registry entry when
    # launched silently. The isolated test already passes an explicit /D path;
    # use that bounded path instead of treating the optional registry metadata
    # as proof that installation failed.
    if ([string]::IsNullOrWhiteSpace($installDirectory) -and $null -ne $isolatedInstallDirectory) {
        $installDirectory = $isolatedInstallDirectory
    }
    if ([string]::IsNullOrWhiteSpace($installDirectory)) {
        $installDirectory = Join-Path $env:LOCALAPPDATA $productName
    }
    if ([string]::IsNullOrWhiteSpace($installDirectory)) {
        throw "Could not determine the installed application directory."
    }
    if (-not (Test-Path -LiteralPath $installDirectory -PathType Container)) {
        throw "The registered install directory does not exist: $installDirectory"
    }

    $mainBinaryName = if ($registryEntryCreated) {
        [string]$uninstallEntry.MainBinaryName
    } else {
        "$ExpectedMainBinaryName.exe"
    }
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
                    -ArgumentList @("/S") `
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
                if ($registryEntryCreated -and (Test-Path -LiteralPath $uninstallRegistryPath)) {
                    throw "The CurrentUser uninstall registry entry remains after uninstall."
                }
                if (Test-Path -LiteralPath $installedExecutable) {
                    throw "The installed application executable remains after uninstall."
                }
                if ((Test-Path -LiteralPath $sentinelPath) -and
                    ((Get-Content -LiteralPath $sentinelPath -Raw).Trim() -eq "preserve-user-data")) {
                    $sentinelPreserved = $true
                    Write-Host "Uninstall completed and preserved the user-data sentinel."
                    Write-SmokeArtifact -Name "success.txt" -Content (@(
                            "Windows NSIS installer smoke test passed."
                            "Product: $productName"
                            "Version: $packageVersion"
                            "Bundle identifier: $bundleIdentifier"
                            "Installed executable: $applicationPath"
                            "Uninstall preserved user data: true"
                            "Timestamp: $([DateTimeOffset]::Now.ToString('o'))"
                        ) -join [Environment]::NewLine)
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

    # Profile creation happens before the main preflight try block, so cleanup
    # must remain inside this guaranteed finally path. Otherwise a failed
    # product/version preflight leaves a BabelLeaf-installer-profile-* tree in
    # the user's temp directory.
    if ($null -ne $isolatedProfileRoot -and (Test-Path -LiteralPath $isolatedProfileRoot)) {
        try {
            Remove-Item -LiteralPath $isolatedProfileRoot -Recurse -Force -ErrorAction Stop
        } catch {
            if ($null -eq $cleanupFailure) {
                $cleanupFailure = $_
            }
            Write-SmokeArtifact -Name "profile-cleanup-failure.txt" -Content $_.Exception.ToString()
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

# A dedicated smoke bundle is disposable after its uninstall-retention result
# has been captured. Validate both exact known-folder targets before deleting;
# production BabelLeaf profiles can never enter this path.
if ($IsolatedProfile -and $profileWasClean) {
    try {
        if (-not $bundleIdentifier.EndsWith(".smoke", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean a non-smoke bundle profile: $bundleIdentifier"
        }
        $expectedConfigDirectory = [System.IO.Path]::GetFullPath(
            (Join-Path $knownRoamingAppData $bundleIdentifier)
        )
        $expectedLocalDataDirectory = [System.IO.Path]::GetFullPath(
            (Join-Path $knownLocalAppData $bundleIdentifier)
        )
        foreach ($target in @($appConfigDirectory, $appLocalDataDirectory)) {
            $resolvedTarget = [System.IO.Path]::GetFullPath($target)
            if ($resolvedTarget -ne $expectedConfigDirectory -and
                $resolvedTarget -ne $expectedLocalDataDirectory) {
                throw "Refusing to clean an unexpected installer-smoke profile: $resolvedTarget"
            }
            if (Test-Path -LiteralPath $resolvedTarget) {
                Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction Stop
            }
        }
        if ($sentinelPreserved -and (Test-Path -LiteralPath $sentinelPath)) {
            throw "The disposable smoke sentinel remains after bounded profile cleanup."
        }
    } catch {
        if ($null -eq $cleanupFailure) {
            $cleanupFailure = $_
        }
        Write-SmokeArtifact -Name "smoke-profile-cleanup-failure.txt" -Content $_.Exception.ToString()
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
