# MidWatch 1.0

A clean Windows desktop companion for following Tier-1 League of Legends midlaners.

## Features
- LCK, LPL, LEC, LCS and LCP midlaner directory
- Region filters, search, sorting and persistent favorites
- Player profile drawer
- Per-player Riot ID linking
- Riot ranked SoloQ status
- Live-game detection with Riot Spectator-v5
- Local settings: Riot IDs and favorites remain on the computer
- One-click Windows installer configuration through electron-builder

## 30-second Windows install
For an end user, download `MidWatch-Setup-1.0.0.exe` from Releases and double-click it. The installer creates the app shortcut automatically.

## Riot API
Live SoloQ features require a Riot API key. Copy `.env.example` to `.env` and set `RIOT_API_KEY`. The key is never committed.

## Build the installer
Install Node.js 20+, clone the repository, run `npm install`, then `npm run dist`. The installer is generated in `dist/`.

## Spectating
Riot officially exposes active-game data through Spectator-v5. MidWatch 1.0 detects those games. Automatic League-client spectator launching is not enabled because the local League Client API is unsupported by Riot and can change without notice.

## Data note
The player directory is a practical 2026 Tier-1 snapshot, not a contractual roster database. Esports rosters change during the season.

MidWatch is an independent project and is not endorsed by Riot Games. League of Legends and Riot Games are trademarks of Riot Games, Inc.
