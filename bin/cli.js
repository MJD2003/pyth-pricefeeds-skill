#!/usr/bin/env node

/**
 * Pyth Price Feeds Skill — CLI Installer
 *
 * Usage:
 *   npx pyth-pricefeeds-skill install [target]
 *   npx pyth-pricefeeds-skill status
 *   npx pyth-pricefeeds-skill uninstall [target]
 *
 * Targets: windsurf, cursor, claude, copilot, cline, all
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const os = require("os");

// ─── Paths ──────────────────────────────────────────────

const HOME = os.homedir();
const SKILL_ROOT = path.resolve(__dirname, "..");

const IDE_PATHS = {
  windsurf: path.join(HOME, ".codeium", "windsurf", "skills", "pyth-pricefeeds"),
  cursor_global: path.join(HOME, ".cursor", "rules"),
  claude: path.join(HOME, ".claude", "skills", "pyth-pricefeeds"),
  copilot: null, // per-project
  cline: null,   // per-project
};

// ─── Helpers ────────────────────────────────────────────

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function fileCount(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += fileCount(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

// ─── Install Functions ──────────────────────────────────

function installWindsurf() {
  const dest = IDE_PATHS.windsurf;
  console.log(`  Installing to ${dim(dest)}`);

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // Copy full skill: SKILL.md, references/, assets/, scripts/
  copyRecursive(path.join(SKILL_ROOT, "references"), path.join(dest, "references"));
  copyRecursive(path.join(SKILL_ROOT, "assets"), path.join(dest, "assets"));
  copyRecursive(path.join(SKILL_ROOT, "scripts"), path.join(dest, "scripts"));
  fs.copyFileSync(path.join(SKILL_ROOT, "SKILL.md"), path.join(dest, "SKILL.md"));

  // Also copy .windsurfrules for workspace-level use
  fs.copyFileSync(
    path.join(SKILL_ROOT, ".windsurfrules"),
    path.join(dest, ".windsurfrules")
  );

  const count = fileCount(dest);
  console.log(green(`  Done — ${count} files installed`));
  console.log(`  Windsurf auto-discovers it from SKILL.md. No per-project setup needed.`);
  console.log(`  ${dim('Trigger: just say "add Pyth price feed" in any project')}`);
}

function installCursor() {
  const globalRules = IDE_PATHS.cursor_global;
  console.log(`  Installing global rule to ${dim(globalRules)}`);

  fs.mkdirSync(globalRules, { recursive: true });

  const cursorRuleSrc = path.join(SKILL_ROOT, ".cursor", "rules", "pyth-pricefeeds.md");
  if (fs.existsSync(cursorRuleSrc)) {
    fs.copyFileSync(cursorRuleSrc, path.join(globalRules, "pyth-pricefeeds.md"));
  } else {
    // Fallback: copy .cursorrules content as the global rule
    fs.copyFileSync(
      path.join(SKILL_ROOT, ".cursorrules"),
      path.join(globalRules, "pyth-pricefeeds.md")
    );
  }

  console.log(green(`  Done — rule installed globally`));
  console.log(`  Cursor loads it automatically when you work on .sol, .ts, .rs, or .py files.`);
  console.log(`  ${dim('Trigger: mention "price feed" or "Pyth oracle" in any project')}`);
}

function installClaude() {
  const dest = IDE_PATHS.claude;
  console.log(`  Installing to ${dim(dest)}`);

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // Copy full skill
  copyRecursive(path.join(SKILL_ROOT, "references"), path.join(dest, "references"));
  copyRecursive(path.join(SKILL_ROOT, "assets"), path.join(dest, "assets"));
  copyRecursive(path.join(SKILL_ROOT, "scripts"), path.join(dest, "scripts"));
  fs.copyFileSync(path.join(SKILL_ROOT, "SKILL.md"), path.join(dest, "SKILL.md"));

  // Copy CLAUDE.md and commands to the global .claude directory
  const claudeRoot = path.join(HOME, ".claude");
  const claudeMd = path.join(claudeRoot, "CLAUDE.md");

  // Append to existing CLAUDE.md or create new
  const pricefeedsBlock = fs.readFileSync(
    path.join(SKILL_ROOT, ".claude", "CLAUDE.md"),
    "utf-8"
  );

  if (fs.existsSync(claudeMd)) {
    const existing = fs.readFileSync(claudeMd, "utf-8");
    if (!existing.includes("Pyth Price Feeds")) {
      fs.appendFileSync(claudeMd, "\n\n" + pricefeedsBlock);
      console.log(`  Appended Price Feeds section to existing ${dim(claudeMd)}`);
    }
  } else {
    fs.mkdirSync(claudeRoot, { recursive: true });
    fs.writeFileSync(claudeMd, pricefeedsBlock);
    console.log(`  Created ${dim(claudeMd)}`);
  }

  // Copy slash command
  const cmdDir = path.join(claudeRoot, "commands");
  fs.mkdirSync(cmdDir, { recursive: true });
  fs.copyFileSync(
    path.join(SKILL_ROOT, ".claude", "commands", "pricefeeds.md"),
    path.join(cmdDir, "pricefeeds.md")
  );

  const count = fileCount(dest);
  console.log(green(`  Done — ${count} files + /pricefeeds command installed`));
  console.log(`  Use ${bold("/pricefeeds")} in Claude Code to trigger the full integration flow.`);
  console.log(`  ${dim('Or just say "add Pyth price feed" in any conversation')}`);
}

function installCopilot(projectDir) {
  const dest = path.join(projectDir, ".github");
  console.log(`  Installing to ${dim(dest)}`);

  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(
    path.join(SKILL_ROOT, ".github", "copilot-instructions.md"),
    path.join(dest, "copilot-instructions.md")
  );

  console.log(green(`  Done — copilot-instructions.md installed`));
  console.log(`  ${dim("Copilot reads this file automatically in this project.")}`);
}

function installCline(projectDir) {
  const dest = path.join(projectDir, ".clinerules");
  console.log(`  Installing to ${dim(dest)}`);

  fs.copyFileSync(path.join(SKILL_ROOT, ".clinerules"), dest);

  console.log(green(`  Done — .clinerules installed`));
  console.log(`  ${dim("Cline/Roo reads this file automatically in this project.")}`);
}

// ─── Status & Uninstall ─────────────────────────────────

function showStatus() {
  console.log("  Installation status:");
  console.log("");

  const checks = [
    { name: "Windsurf", path: IDE_PATHS.windsurf },
    { name: "Cursor", path: path.join(IDE_PATHS.cursor_global, "pyth-pricefeeds.md") },
    { name: "Claude Code", path: IDE_PATHS.claude },
  ];

  for (const c of checks) {
    const exists = fs.existsSync(c.path);
    const icon = exists ? green("✓") : dim("·");
    const count = exists && fs.statSync(c.path).isDirectory()
      ? ` (${fileCount(c.path)} files)`
      : "";
    console.log(`    ${icon} ${c.name}${count}`);
  }
  console.log("");
}

function uninstall(target) {
  const paths = {
    windsurf: IDE_PATHS.windsurf,
    cursor: path.join(IDE_PATHS.cursor_global, "pyth-pricefeeds.md"),
    cursor_global: path.join(IDE_PATHS.cursor_global, "pyth-pricefeeds.md"),
    claude: IDE_PATHS.claude,
  };

  const p = paths[target];
  if (!p) {
    console.log(`  Unknown target: ${target}`);
    return;
  }

  if (fs.existsSync(p)) {
    if (fs.statSync(p).isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
    console.log(green(`  Removed ${target}: ${p}`));
  } else {
    console.log(dim(`  ${target} not installed`));
  }
}

// ─── Update & Verify ─────────────────────────────────────

function updateInstall() {
  console.log("  Re-installing to refresh skill files...");
  console.log("");

  const installed = [];
  if (fs.existsSync(IDE_PATHS.windsurf)) installed.push("windsurf");
  if (fs.existsSync(path.join(IDE_PATHS.cursor_global, "pyth-pricefeeds.md"))) installed.push("cursor");
  if (fs.existsSync(IDE_PATHS.claude)) installed.push("claude");

  if (installed.length === 0) {
    console.log(yellow("  No installations found. Run 'install' first."));
    return;
  }

  for (const ide of installed) {
    if (ide === "windsurf") { console.log(cyan("  Windsurf")); installWindsurf(); console.log(""); }
    if (ide === "cursor") { console.log(cyan("  Cursor")); installCursor(); console.log(""); }
    if (ide === "claude") { console.log(cyan("  Claude Code")); installClaude(); console.log(""); }
  }

  console.log(green(`  Updated ${installed.length} installation(s)`));
}

function verifyInstall() {
  console.log("  Verifying skill package integrity...");
  console.log("");

  const requiredFiles = [
    "SKILL.md",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "package.json",
    "bin/cli.js",
    "references/chainlist.md",
    "references/api-reference.md",
    "references/feed-ids.md",
    "references/best-practices.md",
    "references/debugging.md",
    "references/security.md",
    "references/patterns.md",
    "references/migration-from-chainlink.md",
    "references/express-relay.md",
    "references/mcp-integration.md",
    "assets/solidity/PythPriceFeedBase.sol",
    "assets/solidity/PullConsumer.sol",
    "assets/solidity/PushConsumer.sol",
    "assets/solidity/OracleSwap.sol",
    "assets/solidity/LendingOracle.sol",
    "assets/solidity/CrossRate.sol",
    "assets/solidity/PerpsOracle.sol",
    "assets/solidity/PriceGuard.sol",
    "assets/solidity/BatchPriceConsumer.sol",
    "assets/solidity/PythProxy.sol",
    "assets/solidity/interfaces/IPyth.sol",
    "assets/solidity/interfaces/PythStructs.sol",
    "assets/solidity/test/PythPriceFeedTest.sol",
    "assets/typescript/hermes-client.ts",
    "assets/typescript/price-feed-ethers.ts",
    "assets/typescript/price-feed-viem.ts",
    "assets/typescript/use-pyth-price.ts",
    "assets/typescript/price-utils.ts",
    "assets/typescript/feed-discovery.ts",
    "assets/typescript/price-keeper.ts",
    "assets/typescript/benchmarks-client.ts",
    "assets/typescript/e2e-example.ts",
    "assets/typescript/liquidation-bot.ts",
    "assets/typescript/price-dashboard.html",
    "assets/solana/solana-client.ts",
    "assets/solana/anchor-consumer.rs",
    "assets/python/pyth_price_client.py",
    "assets/foundry/Deploy.s.sol",
    "assets/foundry/foundry.toml",
    "assets/foundry/remappings.txt",
    "assets/hardhat/deploy-pricefeeds.ts",
    "assets/hardhat/hardhat.config.ts",
    "assets/ci/pyth-ci.yml",
    "assets/abi/IPyth.json",
    "assets/env.example",
    "scripts/check-pyth-setup.sh",
    "scripts/check-pyth-setup.ps1",
    "scripts/fetch-feed-ids.js",
  ];

  let missing = 0;
  let present = 0;

  for (const f of requiredFiles) {
    const full = path.join(SKILL_ROOT, f);
    if (fs.existsSync(full)) {
      present++;
    } else {
      missing++;
      console.log(`    ${yellow("MISSING")} ${f}`);
    }
  }

  console.log("");
  if (missing === 0) {
    console.log(green(`  All ${present} files verified`));
  } else {
    console.log(yellow(`  ${missing} file(s) missing out of ${requiredFiles.length}`));
  }

  // Check version consistency
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, "package.json"), "utf-8"));
    const skillContent = fs.readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf-8");
    const skillVersion = skillContent.match(/version:\s*([\d.]+)/)?.[1];

    if (pkg.version !== skillVersion) {
      console.log(yellow(`  Version mismatch: package.json=${pkg.version}, SKILL.md=${skillVersion}`));
    } else {
      console.log(green(`  Version: ${pkg.version} (consistent)`));
    }
  } catch {}

  console.log("");
  return missing === 0;
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "";

  console.log("");
  console.log(bold("  Pyth Price Feeds Skill"));
  console.log(dim("  Real-time oracle prices for AI-powered IDEs"));
  console.log("");

  if (command === "install" || command === "i" || command === "") {
    const target = args[1] || "";

    if (target === "windsurf" || target === "all") {
      console.log(cyan("  Windsurf / Cascade"));
      installWindsurf();
    }
    if (target === "cursor" || target === "all") {
      console.log(cyan("  Cursor"));
      installCursor();
    }
    if (target === "claude" || target === "all") {
      console.log(cyan("  Claude Code"));
      installClaude();
    }
    if (target === "copilot") {
      const dir = args[2] || process.cwd();
      console.log(cyan("  GitHub Copilot"));
      installCopilot(dir);
    }
    if (target === "cline") {
      const dir = args[2] || process.cwd();
      console.log(cyan("  Cline / Roo"));
      installCline(dir);
    }

    if (!target) {
      // Interactive numbered menu
      console.log("  Select where to install:\n");
      console.log(`    ${bold("1.")} ${cyan("Windsurf / Cascade")}  ${dim("\u2014 global skill, always available in all projects")}`);
      console.log(`    ${bold("2.")} ${cyan("Cursor")}              ${dim("\u2014 global rule, activates on .sol/.ts/.rs/.py files")}`);
      console.log(`    ${bold("3.")} ${cyan("Claude Code")}         ${dim("\u2014 global skill + /pricefeeds slash command")}`);
      console.log(`    ${bold("4.")} ${cyan("All of the above")}    ${dim("\u2014 install for Windsurf + Cursor + Claude Code")}`);
      console.log(`    ${bold("5.")} ${cyan("Copilot")}             ${dim("\u2014 per-project .github/copilot-instructions.md")}`);
      console.log(`    ${bold("6.")} ${cyan("Cline / Roo")}         ${dim("\u2014 per-project .clinerules")}`);
      console.log("");
      const answer = await ask("  Enter your choice (1-6, or comma-separated e.g. 1,2): ");

      const picks = answer.split(",").map((s) => s.trim());
      const selected = new Set();

      for (const p of picks) {
        if (p === "4" || p.toLowerCase() === "all") {
          selected.add("windsurf");
          selected.add("cursor");
          selected.add("claude");
        }
        if (p === "1" || p.toLowerCase() === "windsurf") selected.add("windsurf");
        if (p === "2" || p.toLowerCase() === "cursor") selected.add("cursor");
        if (p === "3" || p.toLowerCase() === "claude") selected.add("claude");
        if (p === "5" || p.toLowerCase() === "copilot") selected.add("copilot");
        if (p === "6" || p.toLowerCase() === "cline") selected.add("cline");
      }

      if (selected.size === 0) {
        console.log(yellow("\n  No valid selection. Run again and pick 1-6."));
        console.log("");
        return;
      }

      console.log("");
      if (selected.has("windsurf")) { console.log(cyan("  Windsurf / Cascade")); installWindsurf(); console.log(""); }
      if (selected.has("cursor")) { console.log(cyan("  Cursor")); installCursor(); console.log(""); }
      if (selected.has("claude")) { console.log(cyan("  Claude Code")); installClaude(); console.log(""); }
      if (selected.has("copilot")) { console.log(cyan("  GitHub Copilot")); installCopilot(process.cwd()); console.log(""); }
      if (selected.has("cline")) { console.log(cyan("  Cline / Roo")); installCline(process.cwd()); console.log(""); }
    }

    showStatus();
    console.log(green("  Done! Open any project and ask your AI to add Pyth price feeds."));
    console.log("");

  } else if (command === "status" || command === "s") {
    showStatus();

  } else if (command === "update" || command === "u") {
    updateInstall();
    console.log("");
    showStatus();

  } else if (command === "verify" || command === "check") {
    verifyInstall();

  } else if (command === "uninstall" || command === "remove") {
    const target = args[1] || "all";
    if (target === "all") {
      for (const ide of ["windsurf", "cursor", "claude"]) uninstall(ide);
    } else {
      uninstall(target);
    }
    console.log("");

  } else if (command === "help" || command === "h" || command === "--help" || command === "-h") {
    console.log("  Usage:");
    console.log("");
    console.log(`    ${bold("npx pyth-pricefeeds-skill")}`);
    console.log("      Interactive installer — pick your IDEs from a menu");
    console.log("");
    console.log(`    ${bold("npx pyth-pricefeeds-skill install")} [target]`);
    console.log("      Targets: all, windsurf, cursor, claude, copilot, cline");
    console.log("");
    console.log(`    ${bold("npx pyth-pricefeeds-skill status")}`);
    console.log(`    ${bold("npx pyth-pricefeeds-skill update")}`);
    console.log(`    ${bold("npx pyth-pricefeeds-skill verify")}`);
    console.log(`    ${bold("npx pyth-pricefeeds-skill uninstall")} [target]`);
    console.log("");
  } else {
    // Unknown command — suggest install
    console.log(yellow(`  Unknown command: "${command}"`));
    console.log("");
    console.log(`  Did you mean ${bold("npx pyth-pricefeeds-skill install")}?`);
    console.log(`  Run ${bold("npx pyth-pricefeeds-skill help")} for all commands.`);
    console.log("");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
