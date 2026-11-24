# Shared qualification-only ownership rules. A ParentProcessId can refer to a
# later process which reused that PID. Never infer ownership from PID alone.
# https://learn.microsoft.com/windows/win32/cimwin32prov/win32-process
function Get-BabelLeafCreationKey {
    param($CreationDate)
    if ($null -eq $CreationDate) { return $null }
    try {
        $created = if ($CreationDate -is [DateTime]) {
            $CreationDate.ToUniversalTime()
        } else {
            [DateTimeOffset]::Parse([string]$CreationDate, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
        }
        if ($created.Year -lt 1970) { return $null }
        return $created.ToString("yyyy-MM-ddTHH:mm:ss.ffffff'Z'", [Globalization.CultureInfo]::InvariantCulture)
    } catch { return $null }
}

function Select-BabelLeafOwnedProcesses {
    param(
        [object[]]$Snapshot,
        [Parameter(Mandatory = $true)]$Identity
    )
    $byId = @{}
    $seen = [Collections.Generic.HashSet[int]]::new()
    $ambiguous = [Collections.Generic.HashSet[int]]::new()
    foreach ($row in $Snapshot) {
        if ($null -eq $row -or $null -eq $row.PSObject.Properties['ProcessId']) { continue }
        $id = [int]$row.ProcessId
        if ($id -le 0 -or $ambiguous.Contains($id)) { continue }
        if (-not $seen.Add($id)) {
            [void]$ambiguous.Add($id)
            $byId.Remove($id)
            continue
        }
        if ($null -eq $row.PSObject.Properties['ParentProcessId'] -or
            $null -eq $row.PSObject.Properties['CreationDate']) { continue }
        $key = Get-BabelLeafCreationKey $row.CreationDate
        if ($null -eq $key) { continue }
        $byId[$id] = [pscustomobject]@{ Row = $row; Created = $key }
    }
    $rootId = [int]$Identity.ProcessId
    if (-not $byId.ContainsKey($rootId)) { return @() }
    $rootEntry = $byId[$rootId]
    if ($rootEntry.Created -cne $Identity.CreationKey -or
        $null -eq $rootEntry.Row.PSObject.Properties['ExecutablePath'] -or
        -not [string]::Equals([string]$rootEntry.Row.ExecutablePath, [string]$Identity.ExecutablePath,
            [StringComparison]::OrdinalIgnoreCase)) { return @() }
    $owned = @{}
    $owned[$rootId] = $rootEntry
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($id in @($byId.Keys)) {
            if ($owned.ContainsKey($id)) { continue }
            $entry = $byId[$id]
            $parentId = [int]$entry.Row.ParentProcessId
            if ($owned.ContainsKey($parentId) -and
                [string]::CompareOrdinal($entry.Created, $owned[$parentId].Created) -ge 0) {
                if ($owned.Count -ge 128) { throw 'Owned-process snapshot exceeds its bound' }
                $owned[$id] = $entry
                $changed = $true
            }
        }
    }
    return @($owned.Values | ForEach-Object { $_.Row })
}

function Get-BabelLeafProcessIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$RootId,
        [Parameter(Mandatory = $true)][string]$ExecutablePath
    )
    $rows = @(Get-CimInstance Win32_Process -Filter "ProcessId=$RootId" -OperationTimeoutSec 5)
    if ($rows.Count -ne 1 -or
        -not [string]::Equals([string]$rows[0].ExecutablePath, $ExecutablePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The expected executable does not own the process ID'
    }
    $key = Get-BabelLeafCreationKey $rows[0].CreationDate
    if ($null -eq $key) { throw 'Owned root creation time is unavailable' }
    return [pscustomobject]@{ ProcessId = $RootId; CreationKey = $key; ExecutablePath = $ExecutablePath }
}

function Get-BabelLeafOwnedProcesses {
    param([Parameter(Mandatory = $true)]$Identity)
    $snapshot = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5)
    return @(Select-BabelLeafOwnedProcesses -Snapshot $snapshot -Identity $Identity)
}

function Get-BabelLeafProcessMemory {
    param([Parameter(Mandatory = $true)]$ProcessRow)
    $values = @{}
    foreach ($field in @('WorkingSetSize','PrivatePageCount')) {
        $property = $ProcessRow.PSObject.Properties[$field]
        $number = [long]0
        if ($null -eq $property -or $null -eq $property.Value -or
            -not [long]::TryParse([string]$property.Value, [ref]$number) -or $number -lt 0) {
            throw 'Owned-process memory counter is missing or invalid'
        }
        $values[$field] = $number
    }
    return [pscustomobject]@{ Id=[int]$ProcessRow.ProcessId; Name=[string]$ProcessRow.Name;
        WorkingSetBytes=$values.WorkingSetSize; PrivateBytes=$values.PrivatePageCount }
}

function Stop-BabelLeafOwnedProcesses {
    param(
        [Parameter(Mandatory = $true)]$Identity,
        [object[]]$Snapshot
    )
    if ($null -eq $Snapshot) { $Snapshot = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5) }
    $owned = @(Select-BabelLeafOwnedProcesses -Snapshot $Snapshot -Identity $Identity)
    # Stop the known root first so it cannot respawn WebView children. Each
    # remaining target retains its own immutable birth identity after root exit.
    $ordered = @($owned | Sort-Object @{ Expression = { if ([int]$_.ProcessId -eq [int]$Identity.ProcessId) { 0 } else { 1 } } },
        @{ Expression = { Get-BabelLeafCreationKey $_.CreationDate }; Descending = $true })
    $stopped = @()
    foreach ($row in $ordered) {
        $process = $null
        try {
            $process = [Diagnostics.Process]::GetProcessById([int]$row.ProcessId)
            # Pin the process object/handle before checking its birth time;
            # Kill() uses this process object, never a later raw-PID lookup.
            $null = $process.Handle
            if ((Get-BabelLeafCreationKey $process.StartTime) -cne (Get-BabelLeafCreationKey $row.CreationDate)) { continue }
            if (-not $process.HasExited) {
                $process.Kill()
                if (-not $process.WaitForExit(3000)) { throw 'Owned process did not exit after termination' }
                $stopped += [int]$row.ProcessId
            }
        } catch [ArgumentException] {
            # It exited before its handle was acquired. Do not chase a reused ID.
        } catch [InvalidOperationException] {
            # The pinned original process already exited.
        } finally {
            if ($null -ne $process) { $process.Dispose() }
        }
    }
    return [pscustomobject]@{ RootIdentityMatched = ($owned.Count -gt 0); StoppedProcessIds = $stopped }
}
