# Tee-Time snapshot (Windows PowerShell or PowerShell 7+)
# Creates a single redacted text report of your current project.

$ErrorActionPreference = "SilentlyContinue"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "tt-snapshot-$ts.txt"

function Section($t){ "`n==================== $t ====================`n" | Out-File -FilePath $out -Append -Encoding UTF8 }
function Append($t){ $t | Out-File -FilePath $out -Append -Encoding UTF8 }

"TEE-TIME SNAPSHOT  Path=$(Get-Location)" | Out-File -FilePath $out -Encoding UTF8
Append "Generated: $(Get-Date)"
Append "OS: $([System.Environment]::OSVersion.VersionString)  Arch: $env:PROCESSOR_ARCHITECTURE"

# Tooling
Section "Tool versions"
foreach($c in @("node -v","npm -v","git --version")){
  $parts=$c.Split(" ")
  try{ & $parts[0] $parts[1..10] 2>&1 | Out-File -FilePath $out -Append -Encoding UTF8 }
  catch{ Append "($c not found)" }
}

# Git
Section "Git remotes / branch / status / last 5 commits"
try{
  Append "`nRemotes:"; git remote -v 2>&1 | Out-File -FilePath $out -Append -Encoding UTF8
  Append "`nBranches:"; git branch 2>&1 | Out-File -FilePath $out -Append -Encoding UTF8
  Append "`nStatus:"; git status -sb 2>&1 | Out-File -FilePath $out -Append -Encoding UTF8
  Append "`nRecent:"; git log --oneline -5 2>&1 | Out-File -FilePath $out -Append -Encoding UTF8
}catch{}

# package.json essentials
Section "package.json summary"
if(Test-Path .\package.json){
  try{
    $pkg = Get-Content .\package.json -Raw | ConvertFrom-Json
    "name: $($pkg.name)`nversion: $($pkg.version)`nmain: $($pkg.main)`n" | Out-File -FilePath $out -Append -Encoding UTF8
    "scripts:" | Out-File -FilePath $out -Append -Encoding UTF8
    $pkg.scripts | Format-Table -AutoSize | Out-String | Out-File -FilePath $out -Append -Encoding UTF8
    "`ndependencies:" | Out-File -FilePath $out -Append -Encoding UTF8
    $pkg.dependencies | Format-Table -AutoSize | Out-String | Out-File -FilePath $out -Append -Encoding UTF8
  }catch{ Append "Could not parse package.json" }
}else{ Append "package.json not found" }

# Deployment hints
Section "Deployment files"
@("render.yaml","Procfile","Dockerfile","vercel.json","netlify.toml","ecosystem.config.js") | ForEach-Object {
  if(Test-Path $_){"FOUND: $_"} else {"missing: $_"}
} | Out-File -FilePath $out -Append -Encoding UTF8

# Redacted .env files
function RedactEnv($p){
  if(Test-Path $p){
    Append "`n--- $p (values redacted) ---"
    Get-Content $p | ForEach-Object {
      if($_ -match '^\s*#' -or $_ -match '^\s*$'){ $_ }
      elseif($_ -match '^\s*([^=]+)=(.*)$'){ "$($Matches[1])=***redacted***" }
      else { $_ }
    } | Out-File -FilePath $out -Append -Encoding UTF8
  }
}
Section ".env files (redacted)"
Get-ChildItem -Force -File -Name ".env*" | ForEach-Object { RedactEnv $_ }

# Shell env (selected, redacted)
Section "Selected current shell env (redacted)"
$prefixes = "PORT","MONGO","ATLAS","DB","DATABASE","URI","URL","SMTP","SENDGRID","MAIL","JWT","SECRET","SESSION"
Get-ChildItem Env: | Where-Object {
  $n=$_.Name.ToUpper(); ($prefixes | ForEach-Object { $n -like "$_*" }) -contains $true
} | ForEach-Object { "$($_.Name)=***redacted***" } | Sort-Object | Out-File -FilePath $out -Append -Encoding UTF8

# Tree: top + public + scripts + models
Section "Tree (top level)"
(Get-ChildItem . -Force | Select-Object Mode,Length,Name | Format-Table -AutoSize | Out-String) | Out-File -FilePath $out -Append -Encoding UTF8
foreach($d in @("public","scripts","models")){
  if(Test-Path ".\$d"){
    Section "Tree ($d)"
    (Get-ChildItem ".\$d" -Recurse | Select-Object FullName,Length | Out-String) | Out-File -FilePath $out -Append -Encoding UTF8
  }
}

# Entry files (first 120 lines)
function Head($p,$n=120){ if(Test-Path $p){ Section "$p (first $n lines)"; (Get-Content $p -TotalCount $n) | Out-File -FilePath $out -Append -Encoding UTF8 } }
Head "server.js"; Head "app.js"; Head "index.js"

# Code signals + routes (heuristic)
Section "Code signals (search across *.js)"
$js = Get-ChildItem -Recurse -Include *.js -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "*node_modules*" }
$needles = @("dotenv","mongoose","mongodb+srv","mongoose.connect","MongoClient","process.env.","app.listen","express(","cors","nodemailer","smtp","sendgrid","render.com")
foreach($n in $needles){
  Append "`n-- $n"
  $js | ForEach-Object { Select-String -Path $_.FullName -Pattern $n -SimpleMatch } |
    ForEach-Object { "{0}:{1}: {2}" -f $_.Path,$_.LineNumber,$_.Line.Trim() } |
    Out-File -FilePath $out -Append -Encoding UTF8
}

Section "Express routes (heuristic)"
$rx = [regex]'app\.(get|post|put|patch|delete)\s*\(\s*([''"`])([^''"`]+)\2'
$routes = @()
foreach($f in $js){
  $i=0
  Get-Content $f.FullName | ForEach-Object {
    $i++
    $m = $rx.Match($_)
    if($m.Success){
      $routes += [pscustomobject]@{ Method=$m.Groups[1].Value.ToUpper(); Path=$m.Groups[3].Value; File=$f.Name; Line=$i }
    }
  }
}
if($routes.Count -gt 0){
  $routes | Sort-Object Method,Path | Format-Table -AutoSize | Out-String | Out-File -FilePath $out -Append -Encoding UTF8
}else{ Append "No routes found." }

# Mongo connection strings (redacted)
Section "Mongo connection strings (redacted)"
$rxMongo = [regex]'mongodb(\+srv)?:\/\/[^\s''""]+'
$files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "*node_modules*" -and $_.Length -lt 2MB }
foreach($f in $files){
  $c = Get-Content $f.FullName -Raw
  $m = $rxMongo.Matches($c)
  foreach($hit in $m){ "File: $($f.FullName) -> mongodb… (redacted)" | Out-File -FilePath $out -Append -Encoding UTF8 }
}

# Port
Section "PORT detection"
"Env PORT: $($env:PORT)" | Out-File -FilePath $out -Append -Encoding UTF8
$js | ForEach-Object { Select-String -Path $_.FullName -Pattern 'PORT' } |
  ForEach-Object { "{0}:{1}: {2}" -f $_.Path,$_.LineNumber,$_.Line.Trim() } |
  Out-File -FilePath $out -Append -Encoding UTF8

Section "Done"
Append "Wrote: $(Resolve-Path $out)"
Write-Host "✅ Snapshot created: $(Resolve-Path $out)"
