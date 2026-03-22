#
# Pyth Price Feeds — Setup verification script (Windows PowerShell)
# Checks that the project is correctly configured to use Pyth Price Feeds.
#

Write-Host ""
Write-Host "  Pyth Price Feeds — Setup Check" -ForegroundColor Cyan
Write-Host "  ==============================="
Write-Host ""

$Pass = 0; $Warn = 0; $Fail = 0

function Check($msg, $status) {
    switch ($status) {
        "pass" { Write-Host "  [PASS] $msg" -ForegroundColor Green; $script:Pass++ }
        "warn" { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:Warn++ }
        "fail" { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:Fail++ }
    }
}

# Check SDK installation
if (Test-Path "node_modules/@pythnetwork/pyth-sdk-solidity") {
    Check "Pyth Solidity SDK installed" "pass"
} else {
    Check "Pyth SDK not found — run: npm install @pythnetwork/pyth-sdk-solidity" "fail"
}

# Check Hermes client
if (Test-Path "node_modules/@pythnetwork/hermes-client") {
    Check "Hermes client SDK installed" "pass"
} else {
    Check "Hermes client not installed — run: npm install @pythnetwork/hermes-client" "warn"
}

# Check framework
if (Test-Path "foundry.toml") {
    Check "Framework: Foundry detected" "pass"

    if ((Test-Path "remappings.txt") -and (Select-String -Path "remappings.txt" -Pattern "pyth-sdk-solidity" -Quiet)) {
        Check "Foundry remappings configured" "pass"
    } else {
        Check "Missing Foundry remapping — add: @pythnetwork/pyth-sdk-solidity/=node_modules/@pythnetwork/pyth-sdk-solidity" "fail"
    }
} elseif ((Test-Path "hardhat.config.ts") -or (Test-Path "hardhat.config.js")) {
    Check "Framework: Hardhat detected" "pass"
} elseif (Test-Path "Anchor.toml") {
    Check "Framework: Anchor (Solana) detected" "pass"
} else {
    Check "No smart contract framework detected" "warn"
}

# Check .env
if (Test-Path ".env") {
    Check ".env file exists" "pass"

    if (Select-String -Path ".env" -Pattern "PYTH_ADDRESS" -Quiet) {
        Check "PYTH_ADDRESS configured in .env" "pass"
    } else {
        Check "PYTH_ADDRESS not set in .env" "warn"
    }

    if (Select-String -Path ".env" -Pattern "RPC_URL" -Quiet) {
        Check "RPC_URL configured in .env" "pass"
    } else {
        Check "RPC_URL not set in .env" "warn"
    }
} else {
    Check ".env not found — copy from .env.example" "warn"
}

# Check Hermes connectivity
Write-Host ""
Write-Host "  Testing Hermes API..."
try {
    $response = Invoke-WebRequest -Uri "https://hermes.pyth.network/v2/updates/price/latest?ids[]=ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Check "Hermes API reachable (ETH/USD price fetched)" "pass"
    } else {
        Check "Hermes API returned HTTP $($response.StatusCode)" "fail"
    }
} catch {
    Check "Hermes API unreachable" "fail"
}

# Summary
Write-Host ""
Write-Host "  ─────────────────────────────"
Write-Host "  $Pass passed, $Warn warnings, $Fail failed"
Write-Host ""

if ($Fail -gt 0) {
    Write-Host "  Fix the failures above before proceeding." -ForegroundColor Red
    exit 1
} else {
    Write-Host "  Setup looks good! You're ready to integrate Pyth Price Feeds." -ForegroundColor Green
}
Write-Host ""
