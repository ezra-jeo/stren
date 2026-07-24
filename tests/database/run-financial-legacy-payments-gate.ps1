param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 55432,
  [string]$Database = "postgres",
  [string]$UserName = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Continue"
$env:PGPASSWORD = $Password
$sql = Join-Path $PSScriptRoot "financial-legacy-payments-gate.sql"
$output = & psql -h $HostName -p $Port -U $UserName -d $Database -f $sql 2>&1
$exitCode = $LASTEXITCODE
$message = $output -join "`n"

if ($exitCode -eq 0) {
  throw "Migration unexpectedly accepted a nonempty legacy payments table."
}
if ($message -notmatch "legacy payments inventory requires review before migration 025 \(rows=1, total=1\.00\)") {
  throw "Migration failed for an unexpected reason:`n$message"
}

Write-Output "financial legacy payments gate: expected fail-closed abort observed"
