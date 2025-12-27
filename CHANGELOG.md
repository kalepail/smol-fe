# Changelog

## [2.2.0] - 2025-12-27

### Added
- **Tag Explorer**: A new page (`/tags`) to browse the music library by genre and style.
    - **Dynamic Tag Cloud**: Visualizes tag popularity with weighted sizing.
    - **Search**: Real-time search to find specific styles instantly.
    - **Show All**: Toggle to expand the list beyond the top 50 tags.
    - **Instant Filtering**: Clicking a tag updates the song grid without reloading.
- **Data Pipeline**: Updated `generate_snapshot.py` to extract and index style tags for the explorer.

## [2.1.0] - 2025-12-26

### Added
- **Artist Profile**: Dedicated pages for each creator (`/artist/[address]`).
    - **Tabs**: Switch between "Discography" (Created) and "Collection" (Owned/Minted).
    - **Stats**: Badges showing total songs published and collected.
    - **Mint Badge**: Clickable badge linking to Stellar Expert for on-chain verification.

## [2.0.0] - 2025-12-25

### Added
- **Authentication**: Keypass integration for secure login.
- **Mixtape Mode**: Create and manage custom playlists.
- **Like System**: "Heart" logic to save favorite songs.
- **Infinite Scroll**: `SmolGrid` now supports pagination for large libraries.

### Fixed
- **Login Flow**: Resolved cookie domain issues for localhost vs production.
- **Grid Layout**: Improved responsiveness on ultra-wide monitors.
