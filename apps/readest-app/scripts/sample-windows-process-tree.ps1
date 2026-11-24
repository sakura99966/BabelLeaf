[CmdletBinding()]
param([Parameter(Mandatory = $true)][int]$RootProcessId,
      [Parameter(Mandatory = $true)][string]$ExpectedExecutable,
      [Parameter(Mandatory = $true)][string]$ReadyFile,
      [Parameter(Mandatory = $true)][string]$StopFile)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'owned-windows-processes.ps1')
$expected = (Resolve-Path -LiteralPath $ExpectedExecutable).Path
$identity = Get-BabelLeafProcessIdentity -RootId $RootProcessId -ExecutablePath $expected
$peakWorkingSet = [int64]0
$peakPrivate = [int64]0
$samples = 0
while ($samples -lt 600) {
    if (Test-Path -LiteralPath $StopFile) { break }
    $processes = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5)
    $owned = @(Select-BabelLeafOwnedProcesses -Snapshot $processes -Identity $identity)
    if ($owned.Count -eq 0) { break }
    $workingSet = [int64]0
    $private = [int64]0
    foreach ($item in $owned) {
        $memory = Get-BabelLeafProcessMemory -ProcessRow $item
        $workingSet += $memory.WorkingSetBytes; $private += $memory.PrivateBytes
    }
    $peakWorkingSet = [Math]::Max($peakWorkingSet, $workingSet)
    $peakPrivate = [Math]::Max($peakPrivate, $private)
    $samples += 1
    if ($samples -eq 1) { Set-Content -LiteralPath $ReadyFile -Value $PID -Encoding UTF8 }
    Start-Sleep -Milliseconds 200
}
@{ samples = $samples; peakWorkingSetBytes = $peakWorkingSet; peakPrivateBytes = $peakPrivate; intervalMs = 200; ownershipSchemaVersion = 1; stopRequested = (Test-Path -LiteralPath $StopFile) } | ConvertTo-Json -Compress
