# install.ps1 — Cody AI Coding Assistant installer for Windows
# Usage: irm https://raw.githubusercontent.com/your-org/cody-ai/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/your-org/cody-ai"
$InstallDir = Join-Path $env:USERPROFILE ".cody-ai"
$MinNodeVersion = 18

# ── Colors & helpers ──────────────────────────────────────────────────────────
function Log    { Write-Host "  o " -ForegroundColor Cyan -NoNewline; Write-Host $args }
function Ok     { Write-Host "  v " -ForegroundColor Green -NoNewline; Write-Host $args }
function Warn   { Write-Host "  ! " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Err    { Write-Host "  x " -ForegroundColor Red -NoNewline; Write-Host $args; exit 1 }
function Dim    { Write-Host "    $args" -ForegroundColor Gray }

Write-Host ""
Write-Host "  Cody AI Coding Assistant - Installer" -ForegroundColor Cyan
Write-Host "  ------------------------------------" -ForegroundColor Gray
Write-Host ""

# ── Check/Install Node.js ──────────────────────────────────────────────────
function Get-NodeVersion {
    try {
        $ver = (node --version 2>$null).TrimStart('v').Split('.')[0]
        return [int]$ver
    } catch {
        return 0
    }
}

$nodeVer = Get-NodeVersion
if ($nodeVer -lt $MinNodeVersion) {
    if ($nodeVer -gt 0) {
        Warn "Node.js v$nodeVer is too old (need v${MinNodeVersion}+). Installing via winget..."
    } else {
        Log "Node.js not found. Installing via winget..."
    }

    # Try winget first (Windows 11 / updated Win 10)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + `
                    [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    # Try Chocolatey
    elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install nodejs-lts -y
    }
    # Try Scoop
    elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
        scoop install nodejs-lts
    }
    else {
        Err "Could not install Node.js automatically.`nPlease install Node.js v${MinNodeVersion}+ from https://nodejs.org/ and re-run this script."
    }

    $nodeVer = Get-NodeVersion
    if ($nodeVer -lt $MinNodeVersion) {
        Err "Node.js installation failed. Please install manually from https://nodejs.org/"
    }
}

Ok "Node.js v$(node --version) found"

# ── Check git ─────────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Log "Installing Git..."
        winget install Git.Git --silent --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + `
                    [System.Environment]::GetEnvironmentVariable("Path", "User")
    } else {
        Err "Git is required. Install from https://git-scm.com/download/win"
    }
}

# ── Clone repository ──────────────────────────────────────────────────────────
Log "Installing Cody from $RepoUrl..."

if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
}

git clone --depth=1 $RepoUrl $InstallDir 2>$null
if ($LASTEXITCODE -ne 0) {
    Err "Failed to clone $RepoUrl. Check your internet connection."
}
Ok "Repository cloned to $InstallDir"

# ── Install dependencies ──────────────────────────────────────────────────────
Log "Installing dependencies..."
Push-Location $InstallDir
npm install --omit=dev --silent 2>$null
if ($LASTEXITCODE -ne 0) { npm install --production --silent }
Pop-Location
Ok "Dependencies installed"

# ── Add to PATH ───────────────────────────────────────────────────────────────
$BinDir = Join-Path $InstallDir "bin"

# Create a small wrapper .cmd file so 'cody' works from CMD and PowerShell
$WrapperDir = Join-Path $env:USERPROFILE ".local\bin"
New-Item -ItemType Directory -Force -Path $WrapperDir | Out-Null

$WrapperPath = Join-Path $WrapperDir "cody.cmd"
Set-Content -Path $WrapperPath -Value "@echo off`r`nnode `"$BinDir\cody.js`" %*"

# Add ~/.local/bin to user PATH if not already there
$UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$WrapperDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$UserPath;$WrapperDir", "User")
    $env:Path += ";$WrapperDir"
    Ok "Added $WrapperDir to PATH"
} else {
    Ok "PATH already includes $WrapperDir"
}

# ── API key setup ─────────────────────────────────────────────────────────────
Write-Host ""
if (-not $env:ANTHROPIC_API_KEY) {
    Warn "ANTHROPIC_API_KEY is not set."
    Write-Host ""
    Dim "Set it permanently with:"
    Dim '[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")'
    Write-Host ""
    Dim "Get your API key at: https://console.anthropic.com/"
} else {
    Ok "ANTHROPIC_API_KEY is already set"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Cody installed successfully!" -ForegroundColor Green
Write-Host ""
Dim "Restart your terminal, then run:"
Write-Host ""
Write-Host "    cd your-project" -ForegroundColor Cyan
Write-Host "    cody" -ForegroundColor Cyan
Write-Host ""
Dim "Or run a one-shot command:"
Write-Host "    cody `"explain the auth flow`"" -ForegroundColor Cyan
Write-Host ""
