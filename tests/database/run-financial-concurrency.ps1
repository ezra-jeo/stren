param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 55432,
  [string]$Database = "postgres",
  [string]$UserName = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $Password
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$prepare = Join-Path $PSScriptRoot "financial-concurrency-prepare.sql"
$call = Join-Path $PSScriptRoot "financial-concurrency-call.sql"
$assert = Join-Path $PSScriptRoot "financial-concurrency-assert.sql"

& psql -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1 -f $prepare
if ($LASTEXITCODE -ne 0) { throw "Concurrency test preparation failed." }

$common = @("-h", $HostName, "-p", "$Port", "-U", $UserName, "-d", $Database, "-v", "ON_ERROR_STOP=1")
$startOptions = @{ FilePath = "psql"; PassThru = $true }
if ($env:OS -eq "Windows_NT") { $startOptions.WindowStyle = "Hidden" }
$first = Start-Process @startOptions -ArgumentList ($common + @("-v", "idempotency_key=test-concurrent-payment-a", "-f", $call))
$second = Start-Process @startOptions -ArgumentList ($common + @("-v", "idempotency_key=test-concurrent-payment-b", "-f", $call))
$first.WaitForExit()
$second.WaitForExit()

if ($first.ExitCode -ne 0 -or $second.ExitCode -ne 0) {
  throw "A parallel payment session failed (first=$($first.ExitCode), second=$($second.ExitCode))."
}

& psql -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1 -f $assert
if ($LASTEXITCODE -ne 0) { throw "Concurrency assertions failed." }

Write-Output "financial concurrency: all assertions passed"
