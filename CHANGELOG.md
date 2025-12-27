# Changelog

## [1.2.0] - 2025-12-27

### Added

#### Tag Explorer
- New `/tags` page to browse music by genre/style
- Dynamic tag cloud with weighted sizing
- Real-time search filtering
- "Show All" toggle (50-tag default)
- Instant song grid filtering on tag click

---

## [1.1.0] - 2025-12-26

### Added

#### Artists Index
- New `/artists` page listing all creators
- Navigation menu link to Artists

#### Artist Profile
- Discography: All songs created by the artist
- Minted: Songs from discography that have been minted on-chain
- Collection: Songs the artist collected from other creators
- Published and Collected count badges
- Genre tags from artist's work

#### Mint Badges
- Visual indicator on minted songs across all views

#### Minter Tracking
- Horizon API integration to identify who minted each song
- `Minted_By` field in snapshot data

#### SmolCard Enhancements
- `data-creator`, `data-address`, `data-minted-by` attributes for filtering
