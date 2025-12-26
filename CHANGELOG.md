# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-12-26

### Added - Artist Profile Enhancements

#### Artist Profile Tabs
- **Discography Tab**: Shows songs created/published by the artist
- **Minted Tab**: Songs from discography that have been minted on-chain
- **Collection Tab**: Shows songs the artist minted from other creators

#### Minter Tracking via Horizon API
- Integrated Stellar Horizon API to track who minted each song
- New `Minted_By` field populated from blockchain transaction history
- Snapshot generator queries mint operations to build ownership data

#### Artist Profile UI Improvements
- **Separate badges**: Published (lime) and Collected (purple) counts
- Tags now derived from Discography only (not collected songs)
- Recent 4 images show created songs only

#### Data Attributes for Cards
- Added `data-creator`, `data-address`, `data-minted-by` attributes to SmolCard

---

## Previous Versions

See upstream repository [kalepail/smol-fe](https://github.com/kalepail/smol-fe) for prior history.
