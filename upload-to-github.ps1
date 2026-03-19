# GitHub Upload Script for WirePulse RTMS
# This script uploads all files to GitHub using the REST API
#
# INSTRUCTIONS:
# 1. Go to https://github.com/settings/tokens/new
# 2. Give it a name like "wirepulse-upload"
# 3. Select scope: "repo" (full control of private repositories)
# 4. Click "Generate token" and copy it
# 5. Run this script and paste the token when asked

param(
    [string]$Token,
    [string]$RepoName = "wirepulse-rtms"
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
    Write-Host ""
    Write-Host "=== GitHub Upload for WirePulse RTMS ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You need a GitHub Personal Access Token." -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/settings/tokens/new" -ForegroundColor White
    Write-Host "2. Name: wirepulse-upload" -ForegroundColor White
    Write-Host "3. Select scope: repo" -ForegroundColor White
    Write-Host "4. Generate and copy the token" -ForegroundColor White
    Write-Host ""
    $Token = Read-Host "Paste your GitHub token here"
}

$headers = @{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github.v3+json"
    "Content-Type" = "application/json"
}

# Get username
Write-Host "[1/5] Getting GitHub username..." -ForegroundColor Yellow
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
$username = $user.login
Write-Host "  Logged in as: $username" -ForegroundColor Green

# Create repo
Write-Host "[2/5] Creating repository: $RepoName..." -ForegroundColor Yellow
$repoBody = @{
    name = $RepoName
    description = "WirePulse RTMS - Wire Manufacturing Intelligence Platform"
    private = $false
    auto_init = $true
} | ConvertTo-Json

try {
    $repo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $repoBody
    Write-Host "  Repository created: $($repo.html_url)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 422) {
        Write-Host "  Repository already exists, continuing..." -ForegroundColor Yellow
    } else {
        throw
    }
}

Start-Sleep -Seconds 2

# Collect all files
Write-Host "[3/5] Collecting files..." -ForegroundColor Yellow
$deployDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) ""
if (-not (Test-Path (Join-Path $deployDir "server.js"))) {
    $deployDir = "c:\Users\singhr64\Downloads\Scada\wirepulse-deploy"
}

$files = Get-ChildItem -Path $deployDir -Recurse -File | Where-Object {
    $_.FullName -notmatch "node_modules" -and 
    $_.FullName -notmatch "\.db$" -and
    $_.FullName -notmatch "tunnel\.log" -and
    $_.FullName -notmatch "upload-to-github\.ps1" -and
    $_.Name -ne "start.ps1" -and
    $_.Name -ne "setup.sh"
}

Write-Host "  Found $($files.Count) files to upload" -ForegroundColor Green

# Upload each file via Contents API
Write-Host "[4/5] Uploading files..." -ForegroundColor Yellow
$apiBase = "https://api.github.com/repos/$username/$RepoName/contents"
$uploaded = 0
$failed = 0

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($deployDir.Length).TrimStart('\').Replace('\', '/')
    
    # Read file content as base64
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $base64 = [Convert]::ToBase64String($bytes)
    
    $body = @{
        message = "Add $relativePath"
        content = $base64
    } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Uri "$apiBase/$relativePath" -Method Put -Headers $headers -Body $body
        $uploaded++
        Write-Host "  [$uploaded/$($files.Count)] $relativePath" -ForegroundColor Gray
    } catch {
        $failed++
        Write-Host "  FAILED: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Small delay to avoid rate limiting
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "[5/5] Done!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Uploaded: $uploaded files" -ForegroundColor Green
if ($failed -gt 0) { Write-Host "  Failed: $failed files" -ForegroundColor Red }
Write-Host ""
Write-Host "  GitHub Repo: https://github.com/$username/$RepoName" -ForegroundColor White
Write-Host ""
Write-Host "  Next: Go to https://railway.app and deploy this repo" -ForegroundColor Yellow
Write-Host "  Builder: Nixpacks" -ForegroundColor Yellow
Write-Host "  Build Command: npm install && node db/seed.js" -ForegroundColor Yellow
Write-Host "  Start Command: node server.js" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Clear token from memory
$Token = $null
