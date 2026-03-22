#
# Pyth Price Feeds Skill — One-Command Installer (Windows PowerShell)
#
# Usage:
#   irm https://raw.githubusercontent.com/MJD2003/pyth-pricefeeds-skill/main/install.ps1 | iex
#
# Or locally:
#   .\install.ps1 [-Windsurf] [-Cursor] [-Claude] [-Project "C:\path\to\project"]
#

param(
    [switch]$Windsurf,
    [switch]$Cursor,
    [switch]$Claude,
    [switch]$All,
    [string]$Project = ""
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/MJD2003/pyth-pricefeeds-skill.git"
$SkillName = "pyth-pricefeeds"

Write-Host ""
Write-Host "  Pyth Price Feeds Skill Installer" -ForegroundColor Cyan
Write-Host ""

# ─── Clone or use local ─────────────────────────────────

$TempDir = Join-Path $env:TEMP "pyth-pricefeeds-skill-install"
$SkillRoot = ""

if (Test-Path (Join-Path $PSScriptRoot "SKILL.md")) {
    $SkillRoot = $PSScriptRoot
    Write-Host "  Using local skill files" -ForegroundColor DarkGray
} else {
    Write-Host "  Cloning skill repository..."
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    try {
        git clone --depth 1 $RepoUrl $TempDir 2>$null
        $SkillRoot = $TempDir
    } catch {
        Write-Host "  Git clone failed. Ensure git is installed." -ForegroundColor Red
        exit 1
    }
}

# ─── Helper: Copy directory recursively ─────────────────

function Copy-SkillDir($src, $dest) {
    if (Test-Path $src) {
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Copy-Item $src $dest -Recurse -Force
    }
}

# ─── Install functions ───────────────────────────────────

function Install-Windsurf {
    $dest = Join-Path $HOME ".codeium\windsurf\skills\$SkillName"
    Write-Host "  Installing to $dest" -ForegroundColor DarkGray

    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null

    Copy-SkillDir (Join-Path $SkillRoot "references") (Join-Path $dest "references")
    Copy-SkillDir (Join-Path $SkillRoot "assets") (Join-Path $dest "assets")
    Copy-SkillDir (Join-Path $SkillRoot "scripts") (Join-Path $dest "scripts")
    Copy-Item (Join-Path $SkillRoot "SKILL.md") (Join-Path $dest "SKILL.md") -Force
    Copy-Item (Join-Path $SkillRoot ".windsurfrules") (Join-Path $dest ".windsurfrules") -Force

    $count = (Get-ChildItem $dest -Recurse -File).Count
    Write-Host "  Done — $count files installed" -ForegroundColor Green
    Write-Host "  Windsurf auto-discovers it from SKILL.md." -ForegroundColor DarkGray
}

function Install-Cursor {
    $rulesDir = Join-Path $HOME ".cursor\rules"
    Write-Host "  Installing global rule to $rulesDir" -ForegroundColor DarkGray

    New-Item -ItemType Directory -Path $rulesDir -Force | Out-Null

    $src = Join-Path $SkillRoot ".cursor\rules\pyth-pricefeeds.md"
    if (-not (Test-Path $src)) {
        $src = Join-Path $SkillRoot ".cursorrules"
    }
    Copy-Item $src (Join-Path $rulesDir "pyth-pricefeeds.md") -Force

    Write-Host "  Done — rule installed globally" -ForegroundColor Green
    Write-Host "  Cursor activates on .sol, .ts, .rs, .py files." -ForegroundColor DarkGray
}

function Install-Claude {
    $dest = Join-Path $HOME ".claude\skills\$SkillName"
    Write-Host "  Installing to $dest" -ForegroundColor DarkGray

    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null

    Copy-SkillDir (Join-Path $SkillRoot "references") (Join-Path $dest "references")
    Copy-SkillDir (Join-Path $SkillRoot "assets") (Join-Path $dest "assets")
    Copy-SkillDir (Join-Path $SkillRoot "scripts") (Join-Path $dest "scripts")
    Copy-Item (Join-Path $SkillRoot "SKILL.md") (Join-Path $dest "SKILL.md") -Force

    # Append to CLAUDE.md
    $claudeRoot = Join-Path $HOME ".claude"
    $claudeMd = Join-Path $claudeRoot "CLAUDE.md"
    $block = Get-Content (Join-Path $SkillRoot ".claude\CLAUDE.md") -Raw

    if (Test-Path $claudeMd) {
        $existing = Get-Content $claudeMd -Raw
        if ($existing -notmatch "Pyth Price Feeds") {
            Add-Content $claudeMd "`n`n$block"
            Write-Host "  Appended Price Feeds section to CLAUDE.md" -ForegroundColor DarkGray
        }
    } else {
        New-Item -ItemType Directory -Path $claudeRoot -Force | Out-Null
        Set-Content $claudeMd $block
    }

    # Copy slash command
    $cmdDir = Join-Path $claudeRoot "commands"
    New-Item -ItemType Directory -Path $cmdDir -Force | Out-Null
    Copy-Item (Join-Path $SkillRoot ".claude\commands\pricefeeds.md") (Join-Path $cmdDir "pricefeeds.md") -Force

    $count = (Get-ChildItem $dest -Recurse -File).Count
    Write-Host "  Done — $count files + /pricefeeds command installed" -ForegroundColor Green
}

# ─── Interactive mode ────────────────────────────────────

$anySelected = $Windsurf -or $Cursor -or $Claude -or $All

if (-not $anySelected) {
    Write-Host "  Which IDEs? (comma-separated, or 'all')"
    Write-Host ""
    Write-Host "    windsurf  — global skill, always available"
    Write-Host "    cursor    — global rule, activates on .sol/.ts/.rs/.py"
    Write-Host "    claude    — global skill + /pricefeeds command"
    Write-Host "    all       — install everywhere"
    Write-Host ""
    $answer = Read-Host "  > "
    $choices = $answer.ToLower().Split(",") | ForEach-Object { $_.Trim() }

    if ($choices -contains "all") {
        $Windsurf = $true; $Cursor = $true; $Claude = $true
    } else {
        if ($choices -contains "windsurf") { $Windsurf = $true }
        if ($choices -contains "cursor") { $Cursor = $true }
        if ($choices -contains "claude") { $Claude = $true }
    }
}

if ($All) { $Windsurf = $true; $Cursor = $true; $Claude = $true }

Write-Host ""
if ($Windsurf) { Write-Host "  Windsurf / Cascade" -ForegroundColor Cyan; Install-Windsurf; Write-Host "" }
if ($Cursor) { Write-Host "  Cursor" -ForegroundColor Cyan; Install-Cursor; Write-Host "" }
if ($Claude) { Write-Host "  Claude Code" -ForegroundColor Cyan; Install-Claude; Write-Host "" }

# ─── Cleanup ────────────────────────────────────────────

if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "  You're set. Open any project and ask your AI to add Pyth price feeds." -ForegroundColor Green
Write-Host ""
