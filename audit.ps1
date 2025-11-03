# audit.ps1  (drop-in replacement)

[CmdletBinding()]
param(
  [string]$Root = ".",
  [string]$OutDir = "audit_$(Get-Date -Format yyyyMMdd_HHmmss)"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$treePath = Join-Path $OutDir "tree.txt"
$csvPath  = Join-Path $OutDir "node_packages.csv"

# Repo tree
try {
  tree /f /a | Out-File -Encoding UTF8 $treePath
} catch {
  # Fallback for systems without 'tree'
  Get-ChildItem -Recurse | Select-Object FullName |
    Out-File -Encoding UTF8 $treePath
}

# Helper to safely extract object property names
function Get-PropNames {
  param($obj)
  if ($null -eq $obj) { return @() }
  if ($obj -is [string]) {
    try { $parsed = $obj | ConvertFrom-Json -ErrorAction Stop } catch { $parsed = $null }
    if ($parsed) { return (Get-PropNames -obj $parsed) }
  }
  if ($obj -is [hashtable] -or $obj.PSObject.Properties) {
    return ($obj.PSObject.Properties | Where-Object { $_.MemberType -eq 'NoteProperty' } | ForEach-Object { $_.Name })
  }
  return @()
}

# Find all package.json files
$packages = Get-ChildItem -Path $Root -Filter package.json -Recurse -ErrorAction SilentlyContinue

$rows = @()
foreach ($pkg in $packages) {
  try {
    $j = Get-Content $pkg.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-Warning "Failed to parse $($pkg.FullName): $($_.Exception.Message)"
    continue
  }

  $scripts        = (Get-PropNames $j.scripts) -join ','
  $deps           = (Get-PropNames $j.dependencies) -join ','
  $devDeps        = (Get-PropNames $j.devDependencies) -join ','
  $frameworkGuess = if ($j.dependencies.'next' -or $j.devDependencies.'next') { 'next' }
                    elseif ($j.dependencies.'express' -or $j.devDependencies.'express') { 'express' }
                    elseif ($j.dependencies.'vite' -or $j.devDependencies.'vite') { 'vite' }
                    else { $null }

  $rows += [PSCustomObject]@{
    Path            = $pkg.FullName
    Name            = $j.name
    Scripts         = $scripts
    Dependencies    = $deps
    DevDependencies = $devDeps
    Framework       = $frameworkGuess
  }
}

$rows | Export-Csv -NoTypeInformation -Encoding UTF8 $csvPath

Write-Host "Audit written to $OutDir"
