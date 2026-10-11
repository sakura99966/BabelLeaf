[CmdletBinding()]
param([Parameter(Mandatory = $true)][int]$RootProcessId,
      [Parameter(Mandatory = $true)][string]$ExpectedExecutable)
$ErrorActionPreference = 'Stop'
$expected = (Resolve-Path -LiteralPath $ExpectedExecutable).Path
$root = Get-CimInstance Win32_Process -Filter "ProcessId = $RootProcessId"
if (!$root -or $root.ExecutablePath -ne $expected) { throw 'Sampler process identity mismatch' }
$started = $root.CreationDate
$peakWorkingSet = [int64]0
$peakPrivate = [int64]0
$samples = 0
while ($samples -lt 600) {
    $processes = @(Get-CimInstance Win32_Process)
    $current = @($processes | Where-Object { $_.ProcessId -eq $RootProcessId -and $_.CreationDate -eq $started })
    if ($current.Count -eq 0) { break }
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($RootProcessId)
    do {
        $changed = $false
        foreach ($item in $processes) {
            if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true }
        }
    } while ($changed)
    $workingSet = [int64]0
    $private = [int64]0
    foreach ($id in $ids) {
        $item = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($item) { $workingSet += $item.WorkingSet64; $private += $item.PrivateMemorySize64 }
    }
    $peakWorkingSet = [Math]::Max($peakWorkingSet, $workingSet)
    $peakPrivate = [Math]::Max($peakPrivate, $private)
    $samples += 1
    Start-Sleep -Milliseconds 200
}
@{ samples = $samples; peakWorkingSetBytes = $peakWorkingSet; peakPrivateBytes = $peakPrivate; intervalMs = 200 } | ConvertTo-Json -Compress
