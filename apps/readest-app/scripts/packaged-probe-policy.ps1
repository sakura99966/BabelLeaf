[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('create', 'remove')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^BabelLeafProbe-[a-f0-9]{32}\.exe$')]
    [string]$ExecutableName,
    [Parameter(Mandatory = $true)]
    [ValidateRange(1024, 65535)]
    [int]$Port
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $elevated) {
    if ($Action -eq 'remove') {
        $readOnlyKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments')
        try {
            if ($null -ne $readOnlyKey -and ($readOnlyKey.GetValueNames() -contains $ExecutableName)) {
                throw 'Cannot restore an elevated probe policy from a non-elevated process.'
            }
        } finally {
            if ($null -ne $readOnlyKey) { $readOnlyKey.Dispose() }
        }
        [pscustomobject]@{ removed = $true; elevated = $false } | ConvertTo-Json -Compress
    } else {
        [pscustomobject]@{ applied = $false; elevated = $false } | ConvertTo-Json -Compress
    }
    exit 0
}

# Runtime 150+ ignores WEBVIEW2_* overrides from elevated hosts. This policy
# applies only to a disposable nonce-named executable, never babelleaf.exe or *.
# No user policy, registry subtree, ACL or normal product setting is changed.
$keyPath = 'SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$expected = "--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1"
$key = $null
try {
    if ($Action -eq 'create') {
        $key = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey($keyPath, $true)
        if ($key.GetValueNames() -contains $ExecutableName) {
            throw 'Disposable probe policy already exists; refusing to overwrite.'
        }
        $key.SetValue($ExecutableName, $expected, [Microsoft.Win32.RegistryValueKind]::String)
        $key.Flush()
        if ($key.GetValue($ExecutableName) -ne $expected) { throw 'Probe policy read-back failed.' }
        [pscustomobject]@{ applied = $true; elevated = $true } | ConvertTo-Json -Compress
    } else {
        $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($keyPath, $true)
        if ($null -ne $key -and ($key.GetValueNames() -contains $ExecutableName)) {
            if ($key.GetValue($ExecutableName) -ne $expected) {
                throw 'Probe policy changed externally; preserving the unexpected value.'
            }
            $key.DeleteValue($ExecutableName, $true)
            $key.Flush()
            if ($key.GetValueNames() -contains $ExecutableName) { throw 'Probe policy cleanup failed.' }
        }
        [pscustomobject]@{ removed = $true; elevated = $true } | ConvertTo-Json -Compress
    }
} finally {
    if ($null -ne $key) { $key.Dispose() }
}
