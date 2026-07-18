param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 54322,
  [string]$Database = "postgres",
  [string]$UserName = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $Password
$prepare = Join-Path $PSScriptRoot "attendance-concurrency-prepare.sql"
$call = Join-Path $PSScriptRoot "attendance-concurrency-call.sql"
$assert = Join-Path $PSScriptRoot "attendance-concurrency-assert.sql"
$common = @("-h", $HostName, "-p", "$Port", "-U", $UserName, "-d", $Database, "-X", "-v", "ON_ERROR_STOP=1")

& psql @common -f $prepare
if ($LASTEXITCODE -ne 0) { throw "Attendance concurrency preparation failed." }

$first = Start-Process -FilePath "psql" -ArgumentList ($common + @("-f", $call)) -PassThru -WindowStyle Hidden
$second = Start-Process -FilePath "psql" -ArgumentList ($common + @("-f", $call)) -PassThru -WindowStyle Hidden
$first.WaitForExit()
$second.WaitForExit()

if ($first.ExitCode -ne 0 -or $second.ExitCode -ne 0) {
  throw "A parallel attendance session failed (first=$($first.ExitCode), second=$($second.ExitCode))."
}

& psql @common -f $assert
if ($LASTEXITCODE -ne 0) { throw "Attendance concurrency assertions failed." }

Write-Output "attendance concurrency: all assertions passed"
