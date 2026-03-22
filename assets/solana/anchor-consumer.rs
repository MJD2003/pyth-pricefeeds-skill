// Pyth Price Feeds — Anchor program example
//
// Cargo.toml dependency:
//   pyth-solana-receiver-sdk = "0.4.0"
//
// This template shows how to read Pyth prices in a Solana Anchor program.
// Adapt to your project's structure and naming.

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

declare_id!("YOUR_PROGRAM_ID_HERE");

#[program]
pub mod pyth_consumer {
    use super::*;

    /// Read the latest price from a Pyth price update account.
    /// The price update account must be passed as an instruction account.
    pub fn read_price(ctx: Context<ReadPrice>) -> Result<()> {
        let price_update = &ctx.accounts.price_update;

        // Maximum acceptable age for the price (in seconds)
        let maximum_age: u64 = 30;

        // The feed ID for the asset you want to price
        // Find feed IDs at: https://docs.pyth.network/price-feeds/price-feeds
        let feed_id: [u8; 32] = get_feed_id_from_hex(
            "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD
        )?;

        // Read the price with staleness check
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;

        // Price is in fixed-point format:
        //   real_price = price.price * 10^price.exponent
        //   confidence = price.conf * 10^price.exponent
        msg!(
            "Price: ({} ± {}) * 10^{}",
            price.price,
            price.conf,
            price.exponent
        );

        // Example: Convert to a usable format
        // price.price = 238955000000, price.exponent = -8
        // Real price = 238955000000 * 10^(-8) = $2389.55

        Ok(())
    }

    /// Example: Use Pyth price for a swap calculation
    pub fn swap_at_oracle_price(
        ctx: Context<SwapAtOracle>,
        input_amount: u64,
    ) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        let maximum_age: u64 = 30;

        // Read base asset price (e.g., SOL/USD)
        let base_feed: [u8; 32] = get_feed_id_from_hex(
            "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", // SOL/USD
        )?;
        let base_price = price_update.get_price_no_older_than(
            &Clock::get()?,
            maximum_age,
            &base_feed,
        )?;

        require!(base_price.price > 0, ErrorCode::NegativePrice);

        // Calculate output amount using the oracle price
        // output = input_amount * price / 10^(-exponent)
        let price_abs = base_price.price as u64;
        let expo_abs = (-base_price.exponent) as u32;
        let output_amount = (input_amount as u128)
            .checked_mul(price_abs as u128)
            .unwrap()
            .checked_div(10u128.pow(expo_abs))
            .unwrap() as u64;

        msg!("Input: {} SOL → Output: {} USD units", input_amount, output_amount);

        Ok(())
    }

    /// Example: Lending protocol — check if position is healthy
    pub fn check_health(
        ctx: Context<CheckHealth>,
        collateral_amount: u64,
        debt_amount: u64,
        liquidation_threshold_bps: u16, // e.g., 8000 = 80%
    ) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        let maximum_age: u64 = 30;

        // Read collateral price
        let coll_feed: [u8; 32] = get_feed_id_from_hex(
            "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", // SOL/USD
        )?;
        let coll_price = price_update.get_price_no_older_than(
            &Clock::get()?,
            maximum_age,
            &coll_feed,
        )?;

        require!(coll_price.price > 0, ErrorCode::NegativePrice);

        // Conservative collateral valuation: price - confidence
        let conservative_price = coll_price.price - coll_price.conf as i64;
        require!(conservative_price > 0, ErrorCode::NegativePrice);

        // Calculate collateral value (simplified — adapt decimals to your token)
        let coll_value = (collateral_amount as u128)
            .checked_mul(conservative_price as u128)
            .unwrap();

        // Check health: collateral * threshold >= debt
        let threshold_value = coll_value
            .checked_mul(liquidation_threshold_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap();

        let is_healthy = threshold_value >= debt_amount as u128;
        msg!("Position healthy: {}", is_healthy);

        Ok(())
    }
}

// ─── Account Contexts ───────────────────────────────────

#[derive(Accounts)]
pub struct ReadPrice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The Pyth price update account. Must be owned by the Pyth Pull Oracle program.
    /// Using Account<'info, PriceUpdateV2> automatically validates ownership.
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
pub struct SwapAtOracle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
pub struct CheckHealth<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

// ─── Error Codes ────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Price is negative")]
    NegativePrice,
    #[msg("Price is too uncertain")]
    PriceTooUncertain,
    #[msg("Position is unhealthy")]
    UnhealthyPosition,
}
