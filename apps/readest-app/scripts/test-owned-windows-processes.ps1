param([switch]$Live, [string]$OutputPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'owned-windows-processes.ps1')
$cases = [Collections.Generic.List[string]]::new()
$path = 'C:\BabelLeaf-test\owned.exe'
function New-Row([int]$Id, [int]$Parent, [string]$Created) {
    [pscustomobject]@{ ProcessId=$Id; ParentProcessId=$Parent; CreationDate=$Created; ExecutablePath=$path }
}
$rootRow = New-Row 100 50 '2026-01-01T00:00:00Z'
$identity = [pscustomobject]@{ ProcessId=100; CreationKey=(Get-BabelLeafCreationKey $rootRow.CreationDate); ExecutablePath=$path }
$child = New-Row 200 100 '2026-01-01T00:00:10Z'
$grandchild = New-Row 300 200 '2026-01-01T00:00:11Z'
function Assert-Ids($Rows, [int[]]$Expected, [string]$Name, $Anchor=$identity) {
    $actual = @(Select-BabelLeafOwnedProcesses -Snapshot $Rows -Identity $Anchor | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
    if (($actual -join ',') -cne (($Expected | Sort-Object) -join ',')) { throw "$Name`: unexpected ownership IDs" }
    $cases.Add($Name)
}
Assert-Ids @($grandchild,$child,$rootRow) @(100,200,300) 'unordered legitimate descendants'
$stale = New-Row 6260 200 '2026-01-01T00:00:01Z'
$staleChild = New-Row 700 6260 '2026-01-01T00:00:02Z'
Assert-Ids @($staleChild,$stale,$child,$grandchild,$rootRow) @(100,200,300) 'reused parent PID excludes older unrelated tree'
$wrongBirth = [pscustomobject]@{ ProcessId=100; CreationKey='2026-01-01T00:00:30.000000Z'; ExecutablePath=$path }
Assert-Ids @($rootRow,$child) @() 'root PID reuse fails closed' $wrongBirth
$wrongPath = [pscustomobject]@{ ProcessId=100; CreationKey=$identity.CreationKey; ExecutablePath='C:\other.exe' }
Assert-Ids @($rootRow,$child) @() 'root executable identity mismatch' $wrongPath
$missing = New-Row 200 100 ''
Assert-Ids @($rootRow,$missing,$grandchild) @(100) 'missing child creation time excludes descendants'
Assert-Ids @($rootRow,$rootRow,$child) @() 'ambiguous root PID fails closed'
Assert-Ids @($rootRow,$child,$child,$grandchild) @(100) 'duplicate child PID excludes descendants'
Assert-Ids @($rootRow,(New-Row 200 100 ''),$child) @(100) 'duplicate PID remains ambiguous after an invalid timestamp'
Assert-Ids @($rootRow,([pscustomobject]@{ProcessId=200}),$child) @(100) 'duplicate PID remains ambiguous after incomplete metadata'
Assert-Ids @((New-Row 100 50 ''),$child) @() 'missing root creation time fails closed'
$differentCase = [pscustomobject]@{ ProcessId=100; CreationKey=$identity.CreationKey; ExecutablePath=$path.ToLowerInvariant() }
Assert-Ids @($rootRow,$child) @(100,200) 'Windows executable path comparison is case insensitive' $differentCase
$bounded = @($rootRow) + @(1..128 | ForEach-Object { New-Row (1000+$_) 100 '2026-01-01T00:00:20Z' })
$rejected = $false
try { $null = @(Select-BabelLeafOwnedProcesses -Snapshot $bounded -Identity $identity) } catch { $rejected = $true }
if (-not $rejected) { throw 'Unbounded process tree was accepted' }
$cases.Add('process count bound fails closed')
$memory = Get-BabelLeafProcessMemory ([pscustomobject]@{ProcessId=100;Name='test.exe';WorkingSetSize='1024';PrivatePageCount='2048'})
if ($memory.WorkingSetBytes -ne 1024 -or $memory.PrivateBytes -ne 2048) { throw 'Memory counters were not preserved as bytes' }
$cases.Add('memory counters preserve their byte units')
foreach ($bad in @(
    ([pscustomobject]@{ProcessId=100;Name='test.exe'}),
    ([pscustomobject]@{ProcessId=100;Name='test.exe';WorkingSetSize=-1;PrivatePageCount=1}),
    ([pscustomobject]@{ProcessId=100;Name='test.exe';WorkingSetSize=1;PrivatePageCount=$null})
)) {
    $rejected=$false
    try { $null=Get-BabelLeafProcessMemory $bad } catch { $rejected=$true }
    if (-not $rejected) { throw 'Missing/invalid memory evidence was accepted' }
}
$cases.Add('missing or invalid memory counters fail closed')

if ($Live) {
    $fixture = Join-Path $PSScriptRoot 'owned-process-fixture.mjs'
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $ownedRoot = $null; $unrelated = $null; $ownedAnchor = $null; $unrelatedAnchor = $null
    try {
        # Both trees are disposable fixtures started by THIS test, not user apps.
        $unrelated = Start-Process -FilePath $node -ArgumentList @(('"'+$fixture+'"'),'--leaf') -PassThru -WindowStyle Hidden
        $unrelatedAnchor = Get-BabelLeafProcessIdentity -RootId $unrelated.Id -ExecutablePath $node
        Start-Sleep -Milliseconds 100
        $ownedRoot = Start-Process -FilePath $node -ArgumentList @(('"'+$fixture+'"')) -PassThru -WindowStyle Hidden
        $ownedAnchor = Get-BabelLeafProcessIdentity -RootId $ownedRoot.Id -ExecutablePath $node
        $rows = @()
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            $rows = @(Get-BabelLeafOwnedProcesses -Identity $ownedAnchor)
            if (@($rows | Where-Object Name -eq 'node.exe').Count -ge 2) { break }
            Start-Sleep -Milliseconds 100
        }
        if (@($rows | Where-Object Name -eq 'node.exe').Count -lt 2) { throw 'Owned fixture root/child did not become ready' }
        # Windows can also create owned conhost children. Keep and validate
        # them rather than assuming the tree consists of exactly two PIDs.
        $ownedChild = $rows | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne $ownedRoot.Id } | Select-Object -First 1
        $fakeOld = Get-CimInstance Win32_Process -Filter "ProcessId=$($unrelated.Id)" |
            Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath
        $fakeOld.ParentProcessId = $ownedChild.ProcessId
        $controlledSnapshot = @($rows) + @($fakeOld)
        $selected = @(Select-BabelLeafOwnedProcesses -Snapshot $controlledSnapshot -Identity $ownedAnchor)
        if ($selected.Count -ne $rows.Count -or $selected.ProcessId -contains $unrelated.Id) { throw 'Live unrelated fixture was misclassified' }
        $stopped = Stop-BabelLeafOwnedProcesses -Identity $ownedAnchor -Snapshot $controlledSnapshot
        if (-not $stopped.RootIdentityMatched -or
            -not $ownedRoot.WaitForExit(3000)) { throw 'The exact owned fixture tree was not terminated' }
        foreach ($before in $rows) {
            $after = Get-CimInstance Win32_Process -Filter "ProcessId=$($before.ProcessId)"
            if ($after -and (Get-BabelLeafCreationKey $after.CreationDate) -ceq (Get-BabelLeafCreationKey $before.CreationDate)) {
                throw 'A captured owned process survived cleanup'
            }
        }
        $unrelated.Refresh()
        if ($unrelated.HasExited) { throw 'Ownership cleanup terminated the unrelated fixture' }
        $cases.Add('live PID-reuse analogue cleans only owned root/child and preserves unrelated fixture')
    } finally {
        # Start-Process already gave us a handle to fixtures created here. If
        # startup identity capture failed, retain that birth identity for cleanup.
        if ($null -eq $ownedAnchor -and $null -ne $ownedRoot -and -not $ownedRoot.HasExited) {
            $ownedAnchor = [pscustomobject]@{ ProcessId=$ownedRoot.Id;
                CreationKey=(Get-BabelLeafCreationKey $ownedRoot.StartTime); ExecutablePath=$node }
        }
        if ($null -eq $unrelatedAnchor -and $null -ne $unrelated -and -not $unrelated.HasExited) {
            $unrelatedAnchor = [pscustomobject]@{ ProcessId=$unrelated.Id;
                CreationKey=(Get-BabelLeafCreationKey $unrelated.StartTime); ExecutablePath=$node }
        }
        foreach ($anchor in @($ownedAnchor,$unrelatedAnchor)) {
            if ($null -ne $anchor) { $null = Stop-BabelLeafOwnedProcesses -Identity $anchor }
        }
        if ($null -ne $ownedRoot) { $ownedRoot.Dispose() }
        if ($null -ne $unrelated) { $unrelated.Dispose() }
    }
}
$receipt = [pscustomobject]@{ passed=$true; cases=$cases.ToArray(); live=$Live.IsPresent; recordedAt=[DateTimeOffset]::Now.ToString('o') }
if ($OutputPath) {
    $absolute = [IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($absolute)) -Force | Out-Null
    $receipt | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $absolute -Encoding UTF8
}
$receipt | ConvertTo-Json -Depth 3 -Compress
