#!/usr/bin/env bash
#
# Pyth Price Feeds Skill — One-Command Installer (macOS/Linux)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/MJD2003/pyth-pricefeeds-skill/main/install.sh | bash
#
# Or locally:
#   chmod +x install.sh && ./install.sh
#

set -e

REPO_URL="https://github.com/MJD2003/pyth-pricefeeds-skill.git"
SKILL_NAME="pyth-pricefeeds"
HOME_DIR="$HOME"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "  ${CYAN}${BOLD}Pyth Price Feeds Skill Installer${NC}"
echo ""

# ─── Get skill root ─────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT=""
TEMP_DIR="/tmp/pyth-pricefeeds-skill-install"

if [ -f "$SCRIPT_DIR/SKILL.md" ]; then
    SKILL_ROOT="$SCRIPT_DIR"
    echo -e "  ${DIM}Using local skill files${NC}"
else
    echo "  Cloning skill repository..."
    rm -rf "$TEMP_DIR"
    git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null || {
        echo "  Git clone failed. Ensure git is installed."
        exit 1
    }
    SKILL_ROOT="$TEMP_DIR"
fi

# ─── Install functions ───────────────────────────────────

install_windsurf() {
    local dest="$HOME_DIR/.codeium/windsurf/skills/$SKILL_NAME"
    echo -e "  ${DIM}Installing to $dest${NC}"

    rm -rf "$dest"
    mkdir -p "$dest"

    [ -d "$SKILL_ROOT/references" ] && cp -r "$SKILL_ROOT/references" "$dest/"
    [ -d "$SKILL_ROOT/assets" ] && cp -r "$SKILL_ROOT/assets" "$dest/"
    [ -d "$SKILL_ROOT/scripts" ] && cp -r "$SKILL_ROOT/scripts" "$dest/"
    cp "$SKILL_ROOT/SKILL.md" "$dest/"
    cp "$SKILL_ROOT/.windsurfrules" "$dest/"

    local count=$(find "$dest" -type f | wc -l | tr -d ' ')
    echo -e "  ${GREEN}Done — $count files installed${NC}"
    echo -e "  ${DIM}Trigger: just say \"add Pyth price feed\" in any project${NC}"
}

install_cursor() {
    local rules_dir="$HOME_DIR/.cursor/rules"
    echo -e "  ${DIM}Installing global rule to $rules_dir${NC}"

    mkdir -p "$rules_dir"

    if [ -f "$SKILL_ROOT/.cursor/rules/pyth-pricefeeds.md" ]; then
        cp "$SKILL_ROOT/.cursor/rules/pyth-pricefeeds.md" "$rules_dir/"
    else
        cp "$SKILL_ROOT/.cursorrules" "$rules_dir/pyth-pricefeeds.md"
    fi

    echo -e "  ${GREEN}Done — rule installed globally${NC}"
    echo -e "  ${DIM}Cursor activates on .sol, .ts, .rs, .py files${NC}"
}

install_claude() {
    local dest="$HOME_DIR/.claude/skills/$SKILL_NAME"
    echo -e "  ${DIM}Installing to $dest${NC}"

    rm -rf "$dest"
    mkdir -p "$dest"

    [ -d "$SKILL_ROOT/references" ] && cp -r "$SKILL_ROOT/references" "$dest/"
    [ -d "$SKILL_ROOT/assets" ] && cp -r "$SKILL_ROOT/assets" "$dest/"
    [ -d "$SKILL_ROOT/scripts" ] && cp -r "$SKILL_ROOT/scripts" "$dest/"
    cp "$SKILL_ROOT/SKILL.md" "$dest/"

    # Append to CLAUDE.md
    local claude_md="$HOME_DIR/.claude/CLAUDE.md"
    local block=$(cat "$SKILL_ROOT/.claude/CLAUDE.md")

    if [ -f "$claude_md" ]; then
        if ! grep -q "Pyth Price Feeds" "$claude_md"; then
            echo -e "\n\n$block" >> "$claude_md"
            echo -e "  ${DIM}Appended Price Feeds section to CLAUDE.md${NC}"
        fi
    else
        mkdir -p "$HOME_DIR/.claude"
        echo "$block" > "$claude_md"
    fi

    # Copy slash command
    local cmd_dir="$HOME_DIR/.claude/commands"
    mkdir -p "$cmd_dir"
    cp "$SKILL_ROOT/.claude/commands/pricefeeds.md" "$cmd_dir/"

    local count=$(find "$dest" -type f | wc -l | tr -d ' ')
    echo -e "  ${GREEN}Done — $count files + /pricefeeds command installed${NC}"
}

# ─── Interactive mode ────────────────────────────────────

echo "  Which IDEs? (comma-separated, or 'all')"
echo ""
echo "    windsurf  — global skill, always available"
echo "    cursor    — global rule, activates on .sol/.ts/.rs/.py"
echo "    claude    — global skill + /pricefeeds command"
echo "    all       — install everywhere"
echo ""
read -p "  > " ANSWER

IFS=',' read -ra CHOICES <<< "$ANSWER"

INSTALL_WINDSURF=false
INSTALL_CURSOR=false
INSTALL_CLAUDE=false

for choice in "${CHOICES[@]}"; do
    c=$(echo "$choice" | tr -d ' ' | tr '[:upper:]' '[:lower:]')
    case "$c" in
        all) INSTALL_WINDSURF=true; INSTALL_CURSOR=true; INSTALL_CLAUDE=true ;;
        windsurf) INSTALL_WINDSURF=true ;;
        cursor) INSTALL_CURSOR=true ;;
        claude) INSTALL_CLAUDE=true ;;
    esac
done

echo ""
if $INSTALL_WINDSURF; then echo -e "  ${CYAN}Windsurf / Cascade${NC}"; install_windsurf; echo ""; fi
if $INSTALL_CURSOR; then echo -e "  ${CYAN}Cursor${NC}"; install_cursor; echo ""; fi
if $INSTALL_CLAUDE; then echo -e "  ${CYAN}Claude Code${NC}"; install_claude; echo ""; fi

# ─── Cleanup ────────────────────────────────────────────

[ -d "$TEMP_DIR" ] && rm -rf "$TEMP_DIR"

echo -e "  ${GREEN}You're set. Open any project and ask your AI to add Pyth price feeds.${NC}"
echo ""
