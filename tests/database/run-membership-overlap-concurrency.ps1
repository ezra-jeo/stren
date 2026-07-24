param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 54322,
  [string]$Database = "postgres",
  [string]$UserName = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $Password
$prepare = Join-Path $PSScriptRoot "membership-overlap-concurrency-prepare.sql"
$call = Join-Path $PSScriptRoot "membership-overlap-concurrency-call.sql"
$assert = Join-Path $PSScriptRoot "membership-overlap-concurrency-assert.sql"

& psql -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1 -f $prepare
if ($LASTEXITCODE -ne 0) { throw "Overlap test preparation failed." }

$common = @("-h", $HostName, "-p", "$Port", "-U", $UserName, "-d", $Database, "-v", "ON_ERROR_STOP=1")
$startOptions = @{ FilePath = "psql"; PassThru = $true }
if ($env:OS -eq "Windows_NT") { $startOptions.WindowStyle = "Hidden" }
$first = Start-Process @startOptions -ArgumentList ($common + @("-f", $call))
$second = Start-Process @startOptions -ArgumentList ($common + @("-f", $call))
$first.WaitForExit()
$second.WaitForExit()

$successes = @($first.ExitCode, $second.ExitCode | Where-Object { $_ -eq 0 }).Count
if ($successes -ne 1) {
  throw "Exactly one overlapping direct write must succeed (first=$($first.ExitCode), second=$($second.ExitCode))."
}

& psql -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1 -f $assert
if ($LASTEXITCODE -ne 0) { throw "Overlap concurrency assertions failed." }

Write-Output "membership overlap concurrency: one write accepted and one rejected"
