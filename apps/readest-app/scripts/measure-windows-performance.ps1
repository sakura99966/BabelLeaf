[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [ValidateRange(5, 3600)]
    [int]$IdleSeconds = 300,
    [ValidateRange(0, 300)]
    [int]$WarmupSeconds = 60,
    [string]$OutputPath = "",
    [switch]$IsolatedProfile,
    [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
    throw "Executable does not exist: $resolvedExecutable"
}
$executableFile = Get-Item -LiteralPath $resolvedExecutable -ErrorAction Stop
$executableSha256 = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path (Split-Path -Parent $resolvedExecutable) "babelleaf-performance.json"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$workingSetBudgetMb = 350
$startupBudgetMs = 2500
$launchExecutable = $resolvedExecutable
$isolatedProfileRoot = $null
$portableAppDirectory = $null
$profileCleanupPass = $null
$portableStatePass = $null
$portableStatePaths = @()
$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
$originalWebView2UserData = $env:WEBVIEW2_USER_DATA_FOLDER

if ($IsolatedProfile) {
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $isolatedProfileRoot = Join-Path $tempRoot "BabelLeaf-performance-profile-$([Guid]::NewGuid().ToString('N'))"
    $resolvedProfileRoot = [System.IO.Path]::GetFullPath($isolatedProfileRoot)
    $expectedPrefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedProfileRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to create an isolated profile outside the system temp directory: $resolvedProfileRoot"
    }

    $portableAppDirectory = Join-Path $resolvedProfileRoot "app"
    $isolatedAppData = Join-Path $resolvedProfileRoot "appdata"
    $isolatedLocalAppData = Join-Path $resolvedProfileRoot "localappdata"
    $isolatedWebView2Data = Join-Path $resolvedProfileRoot "webview2"
    New-Item -ItemType Directory -Path $portableAppDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $isolatedAppData -Force | Out-Null
    New-Item -ItemType Directory -Path $isolatedLocalAppData -Force | Out-Null
    New-Item -ItemType Directory -Path $isolatedWebView2Data -Force | Out-Null

    $launchExecutable = Join-Path $portableAppDirectory ([System.IO.Path]::GetFileName($resolvedExecutable))
    Copy-Item -LiteralPath $resolvedExecutable -Destination $launchExecutable -Force
    Set-Content -LiteralPath (Join-Path $portableAppDirectory "settings.json") -Value "{}" -Encoding UTF8
    $env:APPDATA = $isolatedAppData
    $env:LOCALAPPDATA = $isolatedLocalAppData
    $env:WEBVIEW2_USER_DATA_FOLDER = $isolatedWebView2Data
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$root = $null

function Get-DescendantProcessIds {
    param([int]$RootId)

    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($RootId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($process in $processes) {
            if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
                $changed = $true
            }
        }
    }
    return @($ids)
}

function Get-ProcessTreeSample {
    param([int]$RootId)

    $rows = @()
    foreach ($id in (Get-DescendantProcessIds -RootId $RootId)) {
        try {
            $process = Get-Process -Id $id -ErrorAction Stop
            $rows += [pscustomobject]@{
                Id = $process.Id
                Name = $process.ProcessName
                WorkingSetBytes = [int64]$process.WorkingSet64
                PrivateBytes = [int64]$process.PrivateMemorySize64
            }
        } catch {
            # A short-lived WebView2 child may exit between enumeration and
            # sampling; the remaining exact-path tree is still valid evidence.
        }
    }
    return $rows
}

function Stop-ExactProcessTree {
    param([int]$RootId)

    # Capture descendants before closing the root. WebView2 children can be
    # re-parented as the host exits, so discovering the tree only afterwards
    # can miss a short-lived metrics/crash helper that still locks the profile.
    $capturedProcessIds = @(Get-DescendantProcessIds -RootId $RootId)
    try {
        $rootProcess = Get-Process -Id $RootId -ErrorAction SilentlyContinue
        if ($null -ne $rootProcess -and -not $rootProcess.HasExited) {
            if ($rootProcess.CloseMainWindow()) {
                $rootProcess.WaitForExit(10000) | Out-Null
            }
        }
    } catch {
        # The bounded forced cleanup below is the fallback for a hung window.
    }

    if (Get-Process -Id $RootId -ErrorAction SilentlyContinue) {
        $killer = Start-Process -FilePath "taskkill.exe" -ArgumentList @("/PID", "$RootId", "/T", "/F") -Wait -PassThru -WindowStyle Hidden
        if ($killer.ExitCode -ne 0 -and (Get-Process -Id $RootId -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $RootId -Force -ErrorAction SilentlyContinue
        }
    }

    foreach ($processId in $capturedProcessIds) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

$warmupSamples = [System.Collections.Generic.List[object]]::new()
$samples = [System.Collections.Generic.List[object]]::new()
$processRoles = @()
$startupMs = $null
$failure = $null
try {
    $root = Start-Process -FilePath $launchExecutable -PassThru
    $deadline = $stopwatch.Elapsed.TotalMilliseconds + ($startupBudgetMs * 4)
    while ($stopwatch.Elapsed.TotalMilliseconds -lt $deadline) {
        $root.Refresh()
        if ($root.HasExited) {
            throw "Application exited during startup with code $($root.ExitCode)."
        }
        if ($root.MainWindowHandle -ne [IntPtr]::Zero -and $root.Responding) {
            $startupMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2)
            break
        }
        Start-Sleep -Milliseconds 50
    }
    if ($null -eq $startupMs) {
        throw "Application did not expose a responding window during the startup measurement."
    }

    $warmupDeadline = [DateTimeOffset]::UtcNow.AddSeconds($WarmupSeconds)
    while ([DateTimeOffset]::UtcNow -lt $warmupDeadline) {
        $rows = @(Get-ProcessTreeSample -RootId $root.Id)
        if ($rows.Count -eq 0) {
            throw "The application process tree disappeared during the warmup sample."
        }
        $warmupSamples.Add([pscustomobject]@{
            At = [DateTimeOffset]::UtcNow.ToString("o")
            ProcessCount = $rows.Count
            WorkingSetBytes = [int64](($rows | Measure-Object WorkingSetBytes -Sum).Sum)
            PrivateBytes = [int64](($rows | Measure-Object PrivateBytes -Sum).Sum)
            Processes = $rows
        })
        Start-Sleep -Seconds 1
    }

    $sampleDeadline = [DateTimeOffset]::UtcNow.AddSeconds($IdleSeconds)
    while ([DateTimeOffset]::UtcNow -lt $sampleDeadline) {
        $rows = @(Get-ProcessTreeSample -RootId $root.Id)
        if ($rows.Count -eq 0) {
            throw "The application process tree disappeared during the idle sample."
        }
        $samples.Add([pscustomobject]@{
            At = [DateTimeOffset]::UtcNow.ToString("o")
            ProcessCount = $rows.Count
            WorkingSetBytes = [int64](($rows | Measure-Object WorkingSetBytes -Sum).Sum)
            PrivateBytes = [int64](($rows | Measure-Object PrivateBytes -Sum).Sum)
            Processes = $rows
        })
        Start-Sleep -Seconds 1
    }

    $treeIds = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($processId in (Get-DescendantProcessIds -RootId $root.Id)) {
        [void]$treeIds.Add($processId)
    }
    $processRoles = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $treeIds.Contains([int]$_.ProcessId) } |
        ForEach-Object {
            $commandLine = [string]$_.CommandLine
            $role = if ([int]$_.ProcessId -eq $root.Id) {
                "host"
            } elseif ($commandLine -match '--type=([^\s"]+)') {
                $matches[1]
            } else {
                "browser"
            }
            if ($role -eq "utility" -and $commandLine -match '--utility-sub-type=([^\s"]+)') {
                $role = "utility:$($matches[1])"
            }
            [pscustomobject]@{
                Id = [int]$_.ProcessId
                Name = [string]$_.Name
                Role = $role
            }
        })

    if ($IsolatedProfile) {
        $requiredPortablePaths = @(
            (Join-Path $portableAppDirectory "settings.json"),
            (Join-Path $portableAppDirectory "Readest"),
            (Join-Path $portableAppDirectory "logs"),
            (Join-Path $portableAppDirectory "EBWebView")
        )
        $portableStatePaths = @($requiredPortablePaths | ForEach-Object {
                [pscustomobject]@{
                    Path = $_
                    Exists = Test-Path -LiteralPath $_
                }
            })
        $portableStatePass = @($portableStatePaths | Where-Object { -not $_.Exists }).Count -eq 0
        if (-not $portableStatePass) {
            $missing = @($portableStatePaths | Where-Object { -not $_.Exists } | ForEach-Object { $_.Path })
            throw "Portable runtime state escaped or did not initialize; missing: $($missing -join ', ')"
        }
    }
} catch {
    $failure = $_
} finally {
    if ($null -ne $root) {
        Stop-ExactProcessTree -RootId $root.Id
    }
    $env:APPDATA = $originalAppData
    $env:LOCALAPPDATA = $originalLocalAppData
    $env:WEBVIEW2_USER_DATA_FOLDER = $originalWebView2UserData

    if ($null -ne $isolatedProfileRoot) {
        try {
            $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd(
                [System.IO.Path]::DirectorySeparatorChar,
                [System.IO.Path]::AltDirectorySeparatorChar
            )
            $resolvedProfileRoot = [System.IO.Path]::GetFullPath($isolatedProfileRoot)
            $expectedPrefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
            $validName = [System.IO.Path]::GetFileName($resolvedProfileRoot).StartsWith(
                "BabelLeaf-performance-profile-",
                [System.StringComparison]::OrdinalIgnoreCase
            )
            if (-not $validName -or -not $resolvedProfileRoot.StartsWith(
                $expectedPrefix,
                [System.StringComparison]::OrdinalIgnoreCase
            )) {
                throw "Refusing to remove an unexpected profile path: $resolvedProfileRoot"
            }
            $lastCleanupError = $null
            for ($attempt = 0; $attempt -lt 40; $attempt++) {
                try {
                    Remove-Item -LiteralPath $resolvedProfileRoot -Recurse -Force -ErrorAction Stop
                    $lastCleanupError = $null
                    break
                } catch {
                    $lastCleanupError = $_
                    Start-Sleep -Milliseconds 250
                }
            }
            $profileCleanupPass = -not (Test-Path -LiteralPath $resolvedProfileRoot)
            if (-not $profileCleanupPass) {
                if ($null -ne $lastCleanupError) {
                    throw $lastCleanupError
                }
                throw "The isolated performance profile still exists after bounded cleanup: $resolvedProfileRoot"
            }
        } catch {
            $profileCleanupPass = $false
            if ($null -eq $failure) {
                $failure = $_
            }
        }
    }
}

$peakWorkingSet = if ($samples.Count -gt 0) {
    [int64](($samples | Measure-Object WorkingSetBytes -Maximum).Maximum)
} else { 0 }
$peakPrivate = if ($samples.Count -gt 0) {
    [int64](($samples | Measure-Object PrivateBytes -Maximum).Maximum)
} else { 0 }
$warmupPeakWorkingSet = if ($warmupSamples.Count -gt 0) {
    [int64](($warmupSamples | Measure-Object WorkingSetBytes -Maximum).Maximum)
} else { 0 }
$warmupPeakPrivate = if ($warmupSamples.Count -gt 0) {
    [int64](($warmupSamples | Measure-Object PrivateBytes -Maximum).Maximum)
} else { 0 }
$result = [pscustomobject]@{
    schemaVersion = 3
    executable = $resolvedExecutable
    executableBytes = [int64]$executableFile.Length
    executableSha256 = $executableSha256
    isolatedProfile = [bool]$IsolatedProfile
    profileCleanupPass = $profileCleanupPass
    portableStatePass = $portableStatePass
    portableStatePaths = $portableStatePaths
    host = $env:COMPUTERNAME
    os = (Get-CimInstance Win32_OperatingSystem).Caption
    osVersion = (Get-CimInstance Win32_OperatingSystem).Version
    measuredAt = [DateTimeOffset]::Now.ToString("o")
    warmupSeconds = $WarmupSeconds
    idleSeconds = $IdleSeconds
    startupMs = $startupMs
    workingSetBudgetMb = $workingSetBudgetMb
    startupBudgetMs = $startupBudgetMs
    warmupPeakWorkingSetMb = [math]::Round($warmupPeakWorkingSet / 1MB, 2)
    warmupPeakPrivateMb = [math]::Round($warmupPeakPrivate / 1MB, 2)
    peakWorkingSetMb = [math]::Round($peakWorkingSet / 1MB, 2)
    peakPrivateMb = [math]::Round($peakPrivate / 1MB, 2)
    startupPass = ($null -ne $startupMs -and $startupMs -le $startupBudgetMs)
    idleWorkingSetPass = ($peakWorkingSet -le ($workingSetBudgetMb * 1MB))
    status = if ($null -eq $failure -and
        $null -ne $startupMs -and
        $startupMs -le $startupBudgetMs -and
        $peakWorkingSet -le ($workingSetBudgetMb * 1MB) -and
        (-not $IsolatedProfile -or ($portableStatePass -and $profileCleanupPass))) { "pass" } else { "fail" }
    error = if ($null -ne $failure) { $failure.Exception.Message } else { $null }
    processRoles = $processRoles
    warmupSamples = $warmupSamples
    samples = $samples
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding UTF8
Write-Host ($result | Select-Object `
    status, startupMs, startupPass, warmupSeconds, warmupPeakWorkingSetMb, `
    idleSeconds, peakWorkingSetMb, idleWorkingSetPass, peakPrivateMb, `
    isolatedProfile, portableStatePass, profileCleanupPass, error | ConvertTo-Json)
Write-Host "Performance evidence: $resolvedOutput"

if ($Enforce -and $result.status -ne "pass") {
    exit 1
}
