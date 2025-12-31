# Changelog

## [1.5.0] - 2025-12-28

### Added

#### Radio Tab
- **Radio Station Generator**: New `/radio` page for personalized radio stations
- **Multi-Tag Selection**: Select up to 5 tags/genres to curate your station
- **Dedicated Radio Player**: Purple-themed player with album art, prev/next, and progress bar
- **Tag Sorting**: Dropdown to sort by popularity, frequency, or alphabetically  
- **Genre Popularity**: Tags sorted by real-world genre popularity by default
- **Playlist Generation**: Auto-generates ~20 songs (~50 min) based on selected tags
- **Shuffle Toggle**: Randomize playlist order before generation
- **Tag Search**: Filter tags with search input

---

## [1.4.0] - 2025-12-28

### Added

#### Mixtape Editing
- **Edit Mixtape Button**: Creator-only button on mixtape detail pages
- **Track Reordering**: Drag-and-drop and arrow button controls for track order
- **Safe Save**: Updates use API `PUT` call only—no blockchain/wallet interactions
- **Draft Persistence**: Local storage backup of unsaved changes

#### Developer Experience
- **DEVELOPER_SETUP.md**: New comprehensive setup guide for fork contributors
- **Cross-Origin Auth Headers**: `Authorization: Bearer` headers for API requests

#### UI Polish
- **Dark Scrollbar**: Styled scrollbar matching dark theme in mixtape track list

### Pending
- Mixtape save requires `PUT /mixtapes/:id` endpoint deployment to production API

---

## [1.3.0] - 2025-12-27

### Added

#### Artist Audio Experience
- **Real-time Visualizer**: Active waveform visualization using Web Audio API in the artist player
- **Live Lyrics Display**: Auto-scrolling lyrics panel next to album art
- **Lyrics Enhancements**: Smooth scrolling (60fps), filtered metadata tags, and dark filtered UI
- **Playlist Controls**: Full playlist management with **Shuffle** support and Previous/Next navigation

#### Artist Page Improvements
- **Expanded Grid**: "Recent" section now displays 10 items in a responsive 5x2 layout
- **Top Tags**: Increased tag visibility to show the top 10 artist genres
- **Mobile Responsiveness**: Improved grid and player layout for smaller screens

---

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
