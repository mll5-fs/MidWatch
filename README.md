# MidWatch 2.0

MidWatch is a Windows desktop companion for following professional League of Legends midlaners and OUATventure midlaners.

## What 2.0 does

- Tier-1 MID directory for LCK, LEC, LPL, LCS and LCP with a 2026 bootstrap snapshot.
- Refreshes pro rosters and public SoloQ accounts when the live source is available; keeps the bundled snapshot if it is unavailable.
- Player profiles, teams, SoloQ accounts, rank/LP, recent champions and favorites.
- Recent Ranked Solo/Duo mid-role scouting reports are available for every player with a public Riot ID, not only OUATventure players.
- Uses Riot's official API at check time for live-game verification.
- One-click **Spectate**: if Riot reports an active game, MidPulse sends a spectator launch request to the locally running League client.
- Spectate uses the local League Client API. An accepted request does not confirm that the game opened. Local HTTP calls expire after 12 seconds; connection and authentication failures stop the attempt, and alternate launch routes are tried only for HTTP 404/405. Riot does not officially support third-party use of the League Client API or guarantee its endpoints: https://developer.riotgames.com/docs/lol#league-client-api (checked 2026-10-07).
- Detects common League installation folders automatically, with a folder picker as fallback.
- **OUATventure** section: imports MID players from the public LEA tournament page and groups them by team (and division when LEA exposes it). It tests recent season URLs and also accepts an exact LEA tournament URL in Settings.
- Riot API key and preferences are stored only in the local Electron user-data folder, never in the repository or installer.

## Data notes

Scouting reports use up to 12 mid-role games from the 20 most recent Ranked Solo/Duo matches. Lane-at-10 measurements require a timeline snapshot within one second of 10:00 and complete, finite, non-negative CS, gold and XP values for both midlaners. Short games and incomplete snapshots are excluded from the lane sample rather than treated as zero. This one-second window is an application validation rule, not a Riot API guarantee. The displayed lane sample can therefore be smaller than the overall report sample; these measurements do not establish the causes of lane outcomes.

Every report records its collection coverage: recent match IDs requested, match payloads loaded, eligible mid games, and timelines loaded. A Riot rate limit, authentication failure, or individual payload error marks the report as partial instead of presenting it as a complete sample. A report is considered controlled when all requested history was inspected or the 12-game mid target was reached without collection errors. Lane samples below three comparable games are explicitly marked as weak.

Early-habit summaries use timestamped timeline events through 10:00. They report the share of games with at least one kill/assist participation, average early takedowns, the share with a death, and the median first ward time. Each panel shows its timeline count and the ward-specific sample. These are event frequencies only: they do not infer movement, recalls, causes, positioning quality, or micro-gameplay.

Lane-at-10 comparisons by the player's champion reuse only the same complete 10:00 snapshots with an identified opposing mid. Each champion row reports its own game count, average CS/gold/XP differential and share of games with an early death. Rows below three games are explicitly marked as weak; the values are descriptive and do not explain matchup causality or micro-gameplay quality.

Patch comparisons normalize Riot's full `gameVersion` to its major/minor patch and show their own game count. Samples below three games are explicitly marked as limited; differences remain descriptive and do not establish that a patch caused a performance change.

Matchup summaries group results by the opposing player assigned to mid and display their own sample size. They describe results against a champion; they do not measure matchup causality or micro-gameplay quality.

The bundled pro roster is a fallback. Public roster/SoloQ sources can change independently of MidWatch. OUATventure rosters are imported live rather than hard-coded because amateur teams and accounts can change during a season.

Rank loading prioritizes the current view, caches successful results for 15 minutes, and follows Riot's `Retry-After` delay after an HTTP 429. Replacing an expired API key immediately retries previously failed ranks while retaining the last verified value. Riot documents personal-key limits of 20 requests per second and 100 every two minutes; limits remain enforced per region: https://developer.riotgames.com/docs/portal (checked 2026-10-07).

LPL players may use Chinese servers that are not exposed through the global Riot API; live detection and spectating can therefore be unavailable for those accounts.

MidWatch is an independent community project and is not endorsed by Riot Games, DPM, OUAT or LEA.
