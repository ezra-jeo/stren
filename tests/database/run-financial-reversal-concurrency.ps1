param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 54322,
  [string]$Database = "postgres",
  [string]$UserName = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $Password
$call = Join-Path $PSScriptRoot "financial-reversal-concurrency-call.sql"
$assert = Join-Path $PSScriptRoot "financial-reversal-concurrency-assert.sql"
$common = @("-h", $HostName, "-p", "$Port", "-U", $UserName, "-d", $Database, "-v", "ON_ERROR_STOP=1")

$startOptions = @{ FilePath = "psql"; PassThru = $true }
if ($env:OS -eq "Windows_NT") { $startOptions.WindowStyle = "Hidden" }
$first = Start-Process @startOptions -ArgumentList ($common + @("-v", "idempotency_key=test-concurrent-reversal-a", "-f", $call))
$second = Start-Process @startOptions -ArgumentList ($common + @("-v", "idempotency_key=test-concurrent-reversal-b", "-f", $call))
$first.WaitForExit()
$second.WaitForExit()

$successes = @($first.ExitCode, $second.ExitCode | Where-Object { $_ -eq 0 }).Count
if ($successes -ne 1) {
  throw "Exactly one concurrent reversal must succeed (first=$($first.ExitCode), second=$($second.ExitCode))."
}

& psql @common -f $assert
if ($LASTEXITCODE -ne 0) { throw "Concurrent reversal assertions failed." }

Write-Output "financial reversal concurrency: one reversal accepted and one rejected"
