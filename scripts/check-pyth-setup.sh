#!/usr/bin/env bash
# Pyth Price Feeds — Setup verification script
# Checks that the project is correctly configured to use Pyth Price Feeds.

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "  Pyth Price Feeds — Setup Check"
echo "  ═══════════════════════════════"
echo ""

PASS=0
WARN=0
FAIL=0

check() {
    if [ "$2" = "pass" ]; then
        echo -e "  ${GREEN}✓${NC} $1"
        PASS=$((PASS + 1))
    elif [ "$2" = "warn" ]; then
        echo -e "  ${YELLOW}△${NC} $1"
        WARN=$((WARN + 1))
    else
        echo -e "  ${RED}✗${NC} $1"
        FAIL=$((FAIL + 1))
    fi
}

# Check SDK installation
if [ -d "node_modules/@pythnetwork/pyth-sdk-solidity" ]; then
    check "Pyth Solidity SDK installed" "pass"
elif [ -f "Cargo.toml" ] && grep -q "pyth-solana-receiver" Cargo.toml 2>/dev/null; then
    check "Pyth Solana SDK in Cargo.toml" "pass"
else
    check "Pyth SDK not found — run: npm install @pythnetwork/pyth-sdk-solidity" "fail"
fi

# Check Hermes client
if [ -d "node_modules/@pythnetwork/hermes-client" ]; then
    check "Hermes client SDK installed" "pass"
else
    check "Hermes client not installed — run: npm install @pythnetwork/hermes-client" "warn"
fi

# Check framework
if [ -f "foundry.toml" ]; then
    check "Framework: Foundry detected" "pass"
    
    # Check remappings
    if [ -f "remappings.txt" ] && grep -q "pyth-sdk-solidity" remappings.txt 2>/dev/null; then
        check "Foundry remappings configured" "pass"
    else
        check "Missing Foundry remapping — add: @pythnetwork/pyth-sdk-solidity/=node_modules/@pythnetwork/pyth-sdk-solidity" "fail"
    fi
elif [ -f "hardhat.config.ts" ] || [ -f "hardhat.config.js" ]; then
    check "Framework: Hardhat detected" "pass"
elif [ -f "Anchor.toml" ]; then
    check "Framework: Anchor (Solana) detected" "pass"
else
    check "No smart contract framework detected" "warn"
fi

# Check .env
if [ -f ".env" ]; then
    check ".env file exists" "pass"
    
    if grep -q "PYTH_ADDRESS" .env 2>/dev/null; then
        check "PYTH_ADDRESS configured in .env" "pass"
    else
        check "PYTH_ADDRESS not set in .env" "warn"
    fi
    
    if grep -q "RPC_URL" .env 2>/dev/null; then
        check "RPC_URL configured in .env" "pass"
    else
        check "RPC_URL not set in .env" "warn"
    fi
else
    check ".env not found — copy from .env.example" "warn"
fi

# Check Hermes connectivity
echo ""
echo "  Testing Hermes API..."
if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://hermes.pyth.network/v2/updates/price/latest?ids[]=ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        check "Hermes API reachable (ETH/USD price fetched)" "pass"
    else
        check "Hermes API unreachable (HTTP $HTTP_CODE)" "fail"
    fi
else
    check "curl not available — cannot test Hermes" "warn"
fi

# Summary
echo ""
echo "  ─────────────────────────────"
echo -e "  ${GREEN}$PASS passed${NC}, ${YELLOW}$WARN warnings${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "  Fix the failures above before proceeding."
    exit 1
else
    echo "  Setup looks good! You're ready to integrate Pyth Price Feeds."
fi
echo ""
