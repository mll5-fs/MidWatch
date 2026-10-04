# MidWatch 2.0

MidWatch is a Windows desktop companion for following professional League of Legends midlaners and OUATventure midlaners.

## What 2.0 does

- Tier-1 MID directory for LCK, LEC, LPL, LCS and LCP with a 2026 bootstrap snapshot.
- Refreshes pro rosters and public SoloQ accounts when the live source is available; keeps the bundled snapshot if it is unavailable.
- Player profiles, teams, SoloQ accounts, rank/LP, recent champions and favorites.
- Uses Riot's official API at check time for live-game verification.
- One-click **Spectate**: if Riot reports an active game, MidWatch launches the locally installed League game executable with the spectator payload.
- Detects common League installation folders automatically, with a folder picker as fallback.
- **OUATventure** section: imports MID players from the public LEA tournament page and groups them by team (and division when LEA exposes it). It tests recent season URLs and also accepts an exact LEA tournament URL in Settings.
- Riot API key and preferences are stored only in the local Electron user-data folder, never in the repository or installer.

## Data notes

The bundled pro roster is a fallback. Public roster/SoloQ sources can change independently of MidWatch. OUATventure rosters are imported live rather than hard-coded because amateur teams and accounts can change during a season.

LPL players may use Chinese servers that are not exposed through the global Riot API; live detection and spectating can therefore be unavailable for those accounts.

MidWatch is an independent community project and is not endorsed by Riot Games, DPM, OUAT or LEA.
