param(
  [switch]$Apply,
  [int]$MaxPasses = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..')
)

$gitMarker = Join-Path $root '.git'

if (-not (Test-Path -LiteralPath $gitMarker)) {
  throw 'The parent directory is not a Git repository.'
}

Set-Location -LiteralPath $root

$utf8Strict = [System.Text.UTF8Encoding]::new(
  $false,
  $true
)

$utf8NoBom = [System.Text.UTF8Encoding]::new(
  $false
)

$cp1252 = [System.Text.Encoding]::GetEncoding(
  1252
)

$allowedExtensions =
  [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )

@(
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.astro',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.prisma',
  '.sql',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.env',
  '.example',
  '.sh',
  '.ps1'
) | ForEach-Object {
  [void]$allowedExtensions.Add($_)
}

function Test-TextFile {
  param(
    [Parameter(Mandatory)]
    [string]$RelativePath
  )

  $normalized = $RelativePath.Replace('\', '/')

  if (
    $normalized -match
    '(^|/)(\.git|node_modules|dist|coverage|\.astro|\.turbo|generated|tmp|temp)(/|$)'
  ) {
    return $false
  }

  if (
    $normalized -match
    '(^|/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$'
  ) {
    return $false
  }

  $fileName = [System.IO.Path]::GetFileName(
    $normalized
  )

  if (
    $fileName -match
    '^(README.*|Dockerfile|\.gitignore|\.gitattributes|\.prettierignore|\.npmrc)$'
  ) {
    return $true
  }

  $extension = [System.IO.Path]::GetExtension(
    $fileName
  )

  return $allowedExtensions.Contains($extension)
}

function Get-SuspiciousScore {
  param(
    [Parameter(Mandatory)]
    [string]$Text
  )

  $score = 0

  foreach ($character in $Text.ToCharArray()) {
    $codePoint = [int][char]$character

    switch ($codePoint) {
      194 {
        $score += 4
      }

      195 {
        $score += 4
      }

      226 {
        $score += 5
      }

      239 {
        $score += 6
      }

      240 {
        $score += 6
      }

      65533 {
        $score += 10
      }
    }
  }

  return $score
}

function Convert-OnePass {
  param(
    [Parameter(Mandatory)]
    [string]$Text
  )

  $bytes = $cp1252.GetBytes($Text)
  $roundTrip = $cp1252.GetString($bytes)

  if ($roundTrip -cne $Text) {
    return $null
  }

  try {
    return $utf8Strict.GetString($bytes)
  } catch {
    return $null
  }
}

function Repair-Fragment {
  param(
    [Parameter(Mandatory)]
    [string]$Text
  )

  $original = $Text
  $current = $Text
  $currentScore = Get-SuspiciousScore $current

  if ($currentScore -eq 0) {
    return [pscustomobject]@{
      Text = $current
      Changed = $false
    }
  }

  for (
    $pass = 1;
    $pass -le $MaxPasses;
    $pass++
  ) {
    $candidate = Convert-OnePass $current

    if ($null -eq $candidate) {
      break
    }

    $candidateScore =
      Get-SuspiciousScore $candidate

    if ($candidateScore -ge $currentScore) {
      break
    }

    $current = $candidate
    $currentScore = $candidateScore
  }

  return [pscustomobject]@{
    Text = $current
    Changed = $current -cne $original
  }
}

$files = @(
  git ls-files -co --exclude-standard
)

$changedFiles =
  [System.Collections.Generic.List[string]]::new()

$skippedFiles =
  [System.Collections.Generic.List[string]]::new()

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$backupRoot = Join-Path `
  $env:TEMP `
  "intgarti-mojibake-backup-$timestamp"

foreach ($relativePath in $files) {
  if (-not (Test-TextFile $relativePath)) {
    continue
  }

  $fullPath = Join-Path $root $relativePath

  if (-not (Test-Path $fullPath -PathType Leaf)) {
    continue
  }

  if (
    $PSCommandPath -and
    (
      [System.IO.Path]::GetFullPath($fullPath) -eq
      [System.IO.Path]::GetFullPath($PSCommandPath)
    )
  ) {
    continue
  }

  $bytes = [System.IO.File]::ReadAllBytes(
    $fullPath
  )

  try {
    $content = $utf8Strict.GetString($bytes)
  } catch {
    $skippedFiles.Add($relativePath)
    continue
  }

  $initialScore = Get-SuspiciousScore $content

  if ($initialScore -eq 0) {
    continue
  }

  $parts = [regex]::Split(
    $content,
    '(\s+)'
  )

  $fileChanged = $false

  for (
    $index = 0;
    $index -lt $parts.Length;
    $index++
  ) {
    if (
      [string]::IsNullOrEmpty($parts[$index]) -or
      $parts[$index] -match '^\s+$'
    ) {
      continue
    }

    $result = Repair-Fragment $parts[$index]

    if ($result.Changed) {
      $parts[$index] = $result.Text
      $fileChanged = $true
    }
  }

  if (-not $fileChanged) {
    continue
  }

    $newContent = [string]::Concat($parts)
  $newContent = $newContent -replace "`r`n", "`n"
  $newContent = $newContent -replace "`r", "`n"
  $finalScore = Get-SuspiciousScore $newContent

  if ($finalScore -ge $initialScore) {
    continue
  }

  $changedFiles.Add($relativePath)

  Write-Host (
    '[{0} -> {1}] {2}' -f
    $initialScore,
    $finalScore,
    $relativePath
  ) -ForegroundColor Yellow

  if (-not $Apply) {
    continue
  }

  $backupPath = Join-Path `
    $backupRoot `
    $relativePath

  $backupDirectory = Split-Path `
    $backupPath `
    -Parent

  New-Item `
    -ItemType Directory `
    -Path $backupDirectory `
    -Force |
  Out-Null

  Copy-Item `
    $fullPath `
    $backupPath `
    -Force

  [System.IO.File]::WriteAllText(
    $fullPath,
    $newContent,
    $utf8NoBom
  )
}

Write-Host ''

if ($changedFiles.Count -eq 0) {
  Write-Host `
    'No safe repairs were found.' `
    -ForegroundColor Green
} elseif ($Apply) {
  Write-Host (
    'Repaired files: {0}' -f
    $changedFiles.Count
  ) -ForegroundColor Green

  Write-Host (
    'Backup: {0}' -f
    $backupRoot
  ) -ForegroundColor Cyan
} else {
  Write-Host (
    'Dry run. Files that would change: {0}' -f
    $changedFiles.Count
  ) -ForegroundColor Cyan

  Write-Host `
    'Run again with -Apply to write the changes.' `
    -ForegroundColor Cyan
}

if ($skippedFiles.Count -gt 0) {
  Write-Host ''
  Write-Host `
    'Files skipped because they are not valid UTF-8:' `
    -ForegroundColor Yellow

  foreach ($file in $skippedFiles) {
    Write-Host "  $file"
  }
}
