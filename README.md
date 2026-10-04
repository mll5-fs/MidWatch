# MidWatch

MidWatch is a Windows desktop companion focused on **Tier-1 League of Legends midlaners**.

## v0.1 foundation
- Electron desktop application
- Midlaners grouped by LCK / LEC / LCP / LCS (LPL dataset expansion in progress)
- Search by player or team
- Player detail drawer
- Riot API service for account, ranked entries and Spectator-v5 active-game detection
- API key stays local in `.env`

## Run
1. Install Node.js 20+
2. Clone the repository
3. Run `npm install`
4. Copy `.env.example` to `.env`
5. Add your Riot Developer API key
6. Run `npm start`

## Roadmap
The next data pass adds the complete current Tier-1 roster set, verified public SoloQ Riot IDs, richer player/team metadata, competitive stats, favorites and a tested spectate-launch workflow.

Active-game detection and client spectating are intentionally separate: MidWatch will not claim a game is directly spectatable until the launch path is verified against the current League client.
