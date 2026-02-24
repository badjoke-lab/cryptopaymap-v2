# Submit Asset / Network Coverage (Current)

This document captures the current submit UI dictionary scope and free-input rules.

## 1) Asset suggestion coverage (canonical list)

Submit asset suggestions use a local canonical list (`lib/assets.ts`) and display as:

- **`{Formal Name} ({SYMBOL})`**

Current coverage (top-asset oriented):

- Bitcoin (BTC)
- Ethereum (ETH)
- Tether (USDT)
- USD Coin (USDC)
- Solana (SOL)
- XRP (XRP)
- BNB (BNB)
- Cardano (ADA)
- Dogecoin (DOGE)
- TRON (TRX)
- Dai (DAI)
- Litecoin (LTC)
- Bitcoin Cash (BCH)
- Polkadot (DOT)
- Avalanche (AVAX)
- Chainlink (LINK)
- Uniswap (UNI)
- Stellar (XLM)
- Monero (XMR)
- Cosmos (ATOM)
- Polygon (MATIC)
- Arbitrum (ARB)
- Optimism (OP)
- Aave (AAVE)
- NEAR Protocol (NEAR)
- Aptos (APT)
- Sui (SUI)
- Ethereum Classic (ETC)
- Filecoin (FIL)
- Hedera (HBAR)
- Internet Computer (ICP)
- VeChain (VET)
- Maker (MKR)
- Algorand (ALGO)
- MultiversX (EGLD)
- Theta Network (THETA)
- Tezos (XTZ)
- EOS (EOS)
- Flow (FLOW)
- Kaspa (KAS)
- THORChain (RUNE)
- The Graph (GRT)
- Synthetix (SNX)
- The Sandbox (SAND)
- Decentraland (MANA)
- Chiliz (CHZ)
- Axie Infinity (AXS)
- Quant (QNT)
- Curve DAO Token (CRV)
- Compound (COMP)
- Kusama (KSM)
- NEO (NEO)
- Zcash (ZEC)
- Dash (DASH)
- Waves (WAVES)
- Mina (MINA)
- Oasis Network (ROSE)
- Kava (KAVA)
- IOTA (IOTA)
- Zilliqa (ZIL)
- Enjin Coin (ENJ)
- Basic Attention Token (BAT)

> Lightning is intentionally **not** an asset candidate.

## 2) Network suggestion coverage (core-only)

Core network keys are fixed to the following 12:

- `bitcoin`
- `lightning`
- `liquid`
- `ethereum`
- `arbitrum`
- `optimism`
- `base`
- `polygon`
- `bsc`
- `tron`
- `solana`
- `xrpl`

## 3) Asset → Network restriction rules

Network candidates are asset-scoped in UI.

Current explicit mappings:

- BTC → `bitcoin`, `lightning`, `liquid`
- ETH → `ethereum`, `arbitrum`, `optimism`, `base`, `polygon`
- SOL → `solana`
- XRP → `xrpl`
- USDT → `ethereum`, `tron`, `polygon`, `bsc`
- USDC → `ethereum`, `polygon`, `base`, `solana`
- TRX → `tron`
- DAI → `ethereum`, `polygon`, `arbitrum`, `optimism`, `base`

Assets without explicit mapping show no predefined network chips (custom network remains available).

## 4) Free-input rules

### 4.1 Asset free input

- If input exactly matches a canonical symbol, the canonical suggestion is used and display follows `Name (SYMBOL)`.
- If not in canonical list:
  - `asset_key`: `normalizeAssetKey(raw)` = `trim + remove spaces + upper`
  - display label: **raw input as typed (trimmed)**
  - no automatic `(...SYMBOL)` suffix is added to custom display labels.

### 4.2 Network free input (custom network)

- User inputs via **Custom network** field.
- Saved as:
  - `rail_key = "custom"`
  - `rail_raw = <trimmed raw input>`
- UI does not auto-promote custom network strings into predefined dictionary values.

### 4.3 Unspecified network

- If an asset is selected with no network selected, submit payload keeps one row with unspecified network (`rail_key = "unknown"` in payload internals).

## 5) Future expansion policy

- **Assets:** broad coverage is acceptable; add in curated batches.
- **Networks:** keep to core-only and add cautiously in separate PRs.
- Any dictionary expansion should include docs updates in this file.
