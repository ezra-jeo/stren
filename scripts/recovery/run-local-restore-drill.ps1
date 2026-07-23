param(
  [string]$SourceWorkdir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
  [int]$TargetPortBase = 55320
)

$ErrorActionPreference = "Stop"
$startedAt = [DateTime]::UtcNow
$stamp = $startedAt.ToString("yyyyMMddTHHmmssZ")
$root = (Resolve-Path $SourceWorkdir).Path
$targetRoot = Join-Path ([IO.Path]::GetTempPath()) "stren-isolated-recovery-$stamp"
$targetSupabase = Join-Path $targetRoot "supabase"
$evidenceRoot = Join-Path $root "recovery-evidence\$stamp"
$backupRoot = Join-Path $targetRoot "storage-backup"
$dumpPath = Join-Path $targetRoot "database.backup.dump"

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedTarget = [IO.Path]::GetFullPath($targetRoot)
if (-not $resolvedTarget.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Recovery target must remain inside the operating-system temporary directory."
}
if (Test-Path -LiteralPath $targetRoot) {
  throw "Refusing to reuse an existing recovery target."
}

New-Item -ItemType Directory -Path $targetSupabase, (Join-Path $targetSupabase "migrations"), (Join-Path $targetSupabase ".temp"), $evidenceRoot -Force | Out-Null
foreach ($migrationPath in [IO.Directory]::GetFiles((Join-Path $root "supabase\migrations"), '*.sql')) {
  [IO.File]::Copy($migrationPath, (Join-Path $targetSupabase "migrations\$([IO.Path]::GetFileName($migrationPath))"), $false)
}

function ConvertTo-NativeArgument([AllowEmptyString()][string]$Argument) {
  if ($Argument.Length -gt 0 -and $Argument -notmatch '[\s"]') { return $Argument }
  $escaped = [regex]::Replace($Argument, '(\\*)"', {
    param($match)
    $slashes = $match.Groups[1].Value
    return $slashes + $slashes + '\"'
  })
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

function Get-SafeNativeDiagnostic([string]$Diagnostic) {
  if ([string]::IsNullOrWhiteSpace($Diagnostic)) { return "" }
  $safe = $Diagnostic
  $safe = $safe -replace '(?i)postgres(?:ql)?://\S+', '[redacted-database-url]'
  $safe = $safe -replace '(?i)\beyJ[A-Za-z0-9._-]+', '[redacted-jwt]'
  $safe = $safe -replace '(?i)\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[redacted-key]'
  $lines = @($safe -split "`r?`n" | Where-Object { $_ } | Select-Object -Last 12)
  $safe = $lines -join "`n"
  if ($safe.Length -gt 1800) { $safe = $safe.Substring($safe.Length - 1800) }
  return "`nNative diagnostic (credentials redacted):`n$safe"
}

function Invoke-Native(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$WorkingDirectory,
  [string]$Failure,
  [switch]$CaptureOutput
) {
  # Native stderr is not a failure signal: the Supabase CLI writes ordinary
  # progress messages there. ProcessStartInfo keeps those messages out of the
  # PowerShell error stream and prevents local credentials from reaching logs.
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw $Failure }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $process.Dispose()

  if ($exitCode -ne 0) {
    $diagnostic = Get-SafeNativeDiagnostic $stderr
    throw "$Failure (exit code $exitCode)$diagnostic"
  }
  if ($CaptureOutput) { return $stdout -split "`r?`n" | Where-Object { $_ } }
}

function Invoke-NativeToFile(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$WorkingDirectory,
  [string]$OutputPath,
  [string]$Failure
) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw $Failure }
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $output = [IO.File]::Open($OutputPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $process.StandardOutput.BaseStream.CopyTo($output)
  }
  finally {
    $output.Dispose()
  }
  $process.WaitForExit()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $process.Dispose()
  if ($exitCode -ne 0) {
    [IO.File]::Delete($OutputPath)
    $diagnostic = Get-SafeNativeDiagnostic $stderr
    throw "$Failure (exit code $exitCode)$diagnostic"
  }
}

function Invoke-NativeFromFile(
  [string]$FilePath,
  [string[]]$Arguments,
  [string]$WorkingDirectory,
  [string]$InputPath,
  [string]$Failure
) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw $Failure }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $input = [IO.File]::OpenRead($InputPath)
  try {
    $input.CopyTo($process.StandardInput.BaseStream)
    $process.StandardInput.Close()
  }
  finally {
    $input.Dispose()
  }
  $process.WaitForExit()
  $null = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $process.Dispose()
  if ($exitCode -ne 0) {
    $diagnostic = Get-SafeNativeDiagnostic $stderr
    throw "$Failure (exit code $exitCode)$diagnostic"
  }
}

function Get-LocalSupabaseEnvironment([string]$Workdir) {
  $result = @{}
  $lines = Invoke-Native -FilePath $supabaseExe -Arguments @('status', '-o', 'env') -WorkingDirectory $Workdir -Failure "Could not read local Supabase status." -CaptureOutput
  foreach ($line in $lines) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
      $result[$Matches[1]] = $Matches[2].TrimEnd('"')
    }
  }
  return $result
}

function Get-LocalDatabaseContainer([string]$DatabaseUrl) {
  $databasePort = ([Uri]$DatabaseUrl).Port
  $containers = @(Invoke-Native -FilePath $dockerExe -Arguments @('ps', '--filter', "publish=$databasePort", '--filter', 'name=supabase_db_', '--format', '{{.Names}}') -WorkingDirectory $root -Failure "Could not identify the local database container." -CaptureOutput)
  if ($containers.Count -ne 1) { throw "Expected one local database container on port $databasePort, found $($containers.Count)." }
  return $containers[0]
}

$config = [IO.File]::ReadAllText((Join-Path $root "supabase\config.toml"))
$isolatedProjectId = "stren-isolated-recovery-$stamp"
$config = [regex]::Replace($config, 'project_id\s*=\s*"[^"]+"', "project_id = `"$isolatedProjectId`"", 1)
$sourcePostgresVersion = [IO.File]::ReadAllText((Join-Path $root "supabase\.temp\postgres-version")).Trim()
if ($sourcePostgresVersion -notmatch '^(\d+)\.') { throw "Source PostgreSQL version metadata is invalid." }
$sourcePostgresMajor = $Matches[1]
$config = [regex]::Replace($config, '(major_version\s*=\s*)\d+', "`${1}$sourcePostgresMajor", 1)
$ports = @{
  '54320' = [string]($TargetPortBase + 0)
  '54321' = [string]($TargetPortBase + 1)
  '54322' = [string]($TargetPortBase + 2)
  '54323' = [string]($TargetPortBase + 3)
  '54324' = [string]($TargetPortBase + 4)
  '54325' = [string]($TargetPortBase + 5)
  '54326' = [string]($TargetPortBase + 6)
  '54327' = [string]($TargetPortBase + 7)
  '54329' = [string]($TargetPortBase + 9)
}
foreach ($entry in $ports.GetEnumerator()) { $config = $config.Replace($entry.Key, $entry.Value) }
$seedPattern = [regex]::new('(?ms)(\[db\.seed\].*?enabled\s*=\s*)true')
$config = $seedPattern.Replace($config, '${1}false', 1)
$edgePattern = [regex]::new('(?ms)(\[edge_runtime\].*?enabled\s*=\s*)true')
$config = $edgePattern.Replace($config, '${1}false', 1)
[IO.File]::WriteAllText((Join-Path $targetSupabase "config.toml"), $config, [Text.UTF8Encoding]::new($false))
foreach ($versionFile in @('gotrue-version', 'postgres-version', 'rest-version', 'storage-version', 'storage-migration')) {
  $sourceVersionPath = Join-Path $root "supabase\.temp\$versionFile"
  if (Test-Path -LiteralPath $sourceVersionPath) {
    [IO.File]::Copy($sourceVersionPath, (Join-Path $targetSupabase ".temp\$versionFile"), $false)
  }
}

$previousGoogleId = $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID
$previousGoogleSecret = $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET
$previousSupabaseSecretKey = $env:SUPABASE_SECRET_KEY
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = "local-recovery-client"
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET = "local-recovery-secret"
$targetStarted = $false
$supabaseExe = Join-Path $root "node_modules\supabase\bin\supabase.exe"
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$dockerExe = (Get-Command docker.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $supabaseExe)) { throw "The local Supabase CLI binary is unavailable." }

try {
  Write-Output "Recovery drill stage: start isolated target"
  Invoke-Native -FilePath $supabaseExe -Arguments @('start') -WorkingDirectory $targetRoot -Failure "Isolated local Supabase target failed to start."
  $targetStarted = $true
  $source = Get-LocalSupabaseEnvironment $root
  $target = Get-LocalSupabaseEnvironment $targetRoot
  foreach ($key in @('ANON_KEY', 'API_URL', 'DB_URL', 'SERVICE_ROLE_KEY')) {
    if (-not $source[$key] -or -not $target[$key]) { throw "Local Supabase status omitted required recovery value: $key" }
  }
  if ($source['API_URL'] -eq $target['API_URL']) { throw "Recovery target is not isolated from source." }
  $targetDatabaseUri = [Uri]$target['DB_URL']
  if ($targetDatabaseUri.Host -notin @('127.0.0.1', 'localhost', '::1')) { throw "Recovery target database is not local." }
  Write-Output "Recovery drill stage: target migrations bootstrapped"

  $env:SUPABASE_URL = $source['API_URL']
  $env:SUPABASE_SERVICE_ROLE_KEY = $source['SERVICE_ROLE_KEY']
  $env:SUPABASE_SECRET_KEY = $source['SERVICE_ROLE_KEY']
  Write-Output "Recovery drill stage: capture source"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/recovery/seed-local-storage-probe.mjs') -WorkingDirectory $root -Failure "Synthetic source Storage probe failed."

  $env:RECOVERY_DATABASE_URL = $source['DB_URL']
  $env:RECOVERY_EVIDENCE_OUTPUT = Join-Path $evidenceRoot "source.json"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/recovery/capture-recovery-evidence.mjs') -WorkingDirectory $root -Failure "Source recovery evidence capture failed."

  Write-Output "Recovery drill stage: back up and restore database"
  $sourceDbContainer = Get-LocalDatabaseContainer $source['DB_URL']
  $targetDbContainer = Get-LocalDatabaseContainer $target['DB_URL']
  if ($targetDatabaseUri.UserInfo -notmatch '^[^:]+:(.+)$') { throw "The isolated target database URL omitted its local password." }
  $targetDatabasePassword = [Uri]::UnescapeDataString($Matches[1])
  $targetPasswordEnvironment = "PGPASSWORD=$targetDatabasePassword"
  Invoke-NativeToFile -FilePath $dockerExe -Arguments @('exec', $sourceDbContainer, 'pg_dump', '--username=postgres', '--dbname=postgres', '--format=custom', '--schema=public', '--schema=auth', '--schema=storage', '--schema=supabase_migrations', '--extension=pg_trgm', '--extension=uuid-ossp', '--extension=pgcrypto', '--extension=btree_gist') -WorkingDirectory $root -OutputPath $dumpPath -Failure "Source database backup failed."

  Invoke-NativeFromFile -FilePath $dockerExe -Arguments @('exec', '--env', $targetPasswordEnvironment, '-i', $targetDbContainer, 'pg_restore', '--clean', '--if-exists', '--exit-on-error', '--username=supabase_admin', '--dbname=postgres') -WorkingDirectory $root -InputPath $dumpPath -Failure "Database restore into the isolated target failed."

  $env:BACKUP_OUTPUT_DIR = $backupRoot
  Write-Output "Recovery drill stage: back up and restore Storage"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/backup/export-storage.mjs') -WorkingDirectory $root -Failure "Source Storage backup failed."

  $env:SOURCE_SUPABASE_URL = $source['API_URL']
  $env:RECOVERY_TARGET_SUPABASE_URL = $target['API_URL']
  $env:RECOVERY_TARGET_SERVICE_ROLE_KEY = $target['SERVICE_ROLE_KEY']
  $env:RECOVERY_TARGET_CONFIRM = "ISOLATED_NON_PRODUCTION"
  $env:STORAGE_BACKUP_MANIFEST = Join-Path $backupRoot "manifest.json"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/backup/restore-storage.mjs') -WorkingDirectory $root -Failure "Storage restore into the isolated target failed."
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/backup/verify-storage-restore.mjs') -WorkingDirectory $root -Failure "Isolated Storage object/hash verification failed."

  $env:LOCAL_DATABASE_URL = $target['DB_URL']
  Write-Output "Recovery drill stage: validate database, RLS, and financial reconciliation"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/run-local-database-invariants.mjs') -WorkingDirectory $root -Failure "Isolated database/RLS/financial invariants failed."
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/check-local-deployment-contract.mjs') -WorkingDirectory $root -Failure "Isolated deployment schema contract failed."
  $env:DATABASE_TYPES_DB_URL = $target['DB_URL']
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/check-database-types.mjs') -WorkingDirectory $root -Failure "Isolated generated database types differ."
  $env:RECOVERY_TARGET_ANON_KEY = $target['ANON_KEY']
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/recovery/verify-local-recovery-auth-routing.mjs') -WorkingDirectory $root -Failure "Isolated Auth sign-in/routing contract failed."

  $env:RECOVERY_DATABASE_URL = $target['DB_URL']
  $env:RECOVERY_EVIDENCE_OUTPUT = Join-Path $evidenceRoot "target.json"
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/recovery/capture-recovery-evidence.mjs') -WorkingDirectory $root -Failure "Target recovery evidence capture failed."

  $completedAt = [DateTime]::UtcNow
  $env:SOURCE_RECOVERY_EVIDENCE = Join-Path $evidenceRoot "source.json"
  $env:TARGET_RECOVERY_EVIDENCE = Join-Path $evidenceRoot "target.json"
  $env:RECOVERY_RESULT_OUTPUT = Join-Path $evidenceRoot "result.json"
  $env:RECOVERY_STARTED_AT = $startedAt.ToString("o")
  $env:RECOVERY_COMPLETED_AT = $completedAt.ToString("o")
  Invoke-Native -FilePath $nodeExe -Arguments @('scripts/recovery/compare-recovery-evidence.mjs') -WorkingDirectory $root -Failure "Source/target aggregate reconciliation differs."

  $storageStatus = Get-Content -Raw (Join-Path $backupRoot "status.json") | ConvertFrom-Json
  $result = Get-Content -Raw $env:RECOVERY_RESULT_OUTPUT | ConvertFrom-Json
  $result | Add-Member -NotePropertyName storageBucketCount -NotePropertyValue $storageStatus.bucketCount
  $result | Add-Member -NotePropertyName storageObjectCount -NotePropertyValue $storageStatus.objectCount
  $result | Add-Member -NotePropertyName storageManifestSha256 -NotePropertyValue $storageStatus.manifestSha256
  $result | Add-Member -NotePropertyName isolatedTargetStoppedNotDeleted -NotePropertyValue $true
  $result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $env:RECOVERY_RESULT_OUTPUT

  Write-Output ("Isolated local restore passed. RPO={0:N2} minutes; RTO={1:N2} minutes; Storage buckets={2}; objects={3}. Evidence: {4}" -f $result.actualRpoMinutes, $result.actualRtoMinutes, $storageStatus.bucketCount, $storageStatus.objectCount, $env:RECOVERY_RESULT_OUTPUT)
}
finally {
  if ($targetStarted) {
    Invoke-Native -FilePath $supabaseExe -Arguments @('stop') -WorkingDirectory $targetRoot -Failure "Isolated target could not be stopped; inspect $targetRoot before retrying."
  }
  $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = $previousGoogleId
  $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET = $previousGoogleSecret
  $env:SUPABASE_SECRET_KEY = $previousSupabaseSecretKey
}
