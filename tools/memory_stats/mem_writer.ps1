# Tracks one daemon lifetime. mem_writer.vbs starts this sampler without a console.
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$DaemonProcessId,
    [ValidateRange(1, 30)]
    [int]$IntervalSeconds = 15
)

$ErrorActionPreference = 'Stop'
$writerMutex = [System.Threading.Mutex]::new($false, "Local\RatwoodMemoryWriter_$DaemonProcessId")
$ownsMutex = $false
$daemonProcess = $null
$temporaryFile = $null
try {
    try {
        $ownsMutex = $writerMutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (-not $ownsMutex) { return }

    $daemonProcess = [System.Diagnostics.Process]::GetProcessById($DaemonProcessId)
    # Keep a handle to this process object; a reused numeric PID is a different lifetime.
    $null = $daemonProcess.Handle
    $startedTicks = $daemonProcess.StartTime.ToUniversalTime().Ticks
    $dataDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\data'))
    $null = [System.IO.Directory]::CreateDirectory($dataDirectory)
    $outputFile = Join-Path $dataDirectory "memory_rss_$DaemonProcessId.txt"
    $temporaryFile = "$outputFile.tmp"
    $writeFailures = 0

    while (-not $daemonProcess.HasExited) {
        $daemonProcess.Refresh()
        if ($daemonProcess.HasExited -or $daemonProcess.StartTime.ToUniversalTime().Ticks -ne $startedTicks) { break }
        $rssBytes = $daemonProcess.WorkingSet64
        $sampleTicks = [DateTime]::UtcNow.Ticks
        $sample = "$DaemonProcessId|$startedTicks|$sampleTicks|$rssBytes"
        try {
            [System.IO.File]::WriteAllText($temporaryFile, $sample, [System.Text.Encoding]::ASCII)
            if ($daemonProcess.HasExited) { break }
            if ([System.IO.File]::Exists($outputFile)) {
                [System.IO.File]::Replace($temporaryFile, $outputFile, $null)
            } else {
                [System.IO.File]::Move($temporaryFile, $outputFile)
            }
            $writeFailures = 0
        } catch [System.IO.IOException] {
            # A brief reader lock may reject replacement; leave the complete last sample.
            $writeFailures++
            if ($writeFailures -ge 3) { break }
        }
        if ($daemonProcess.WaitForExit($IntervalSeconds * 1000)) { break }
    }
} catch {
    # The subsystem reports unavailable data and owns the bounded restart attempts.
} finally {
    if ($temporaryFile -and [System.IO.File]::Exists($temporaryFile)) {
        Remove-Item -LiteralPath $temporaryFile -Force -ErrorAction SilentlyContinue
    }
    if ($daemonProcess) { $daemonProcess.Dispose() }
    if ($ownsMutex) { $writerMutex.ReleaseMutex() }
    $writerMutex.Dispose()
}
