# MidPulse — OUAT scouting

Windows desktop scouting for OUATventure midlaners only. Professional rosters and professional background requests have been removed. Existing professional cache entries are ignored.

- OUAT players, teams, divisions, SoloQ ranks, favorites and spectator requests.
- Analyse de patchs: choose an OUAT player, load a dedicated sample of up to 30 ranked-mid games without timelines, compare patch samples with game counts, win rates, IC95, KDA and champion mix, and open official Riot patch notes.
- Riot API credentials remain local. The patch section requires a valid key for player statistics; official notes open without a key.
- Version is displayed from Electron app.getVersion().

## Data notes

Scouting reports use up to 12 mid-role games from the 20 most recent Ranked Solo/Duo matches. Lane-at-10 measurements require a timeline snapshot within one second of 10:00 and complete, finite, non-negative CS, gold and XP values for both midlaners. Short games and incomplete snapshots are excluded from the lane sample rather than treated as zero. This one-second window is an application validation rule, not a Riot API guarantee. The displayed lane sample can therefore be smaller than the overall report sample; these measurements do not establish the causes of lane outcomes.

The overall Lane-at-10 panel reports both the mean and median gold differential, plus the share of comparable games with a strictly positive gold differential. The median reduces the influence of one extreme game; ties are not counted as being ahead. All three measures reuse the same validated timeline sample and remain descriptive rather than causal.

Every report records its collection coverage: recent match IDs requested, match payloads loaded, eligible mid games, and timelines loaded. A Riot rate limit, authentication failure, or individual payload error marks the report as partial instead of presenting it as a complete sample. A report is considered controlled when all requested history was inspected or the 12-game mid target was reached without collection errors. Lane samples below three comparable games are explicitly marked as weak.

Early-habit summaries use timestamped timeline events through 10:00. They report the share of games with at least one kill/assist participation, average early takedowns, the share with a death, and the median first ward time. Each panel shows its timeline count and the ward-specific sample. These are event frequencies only: they do not infer movement, recalls, causes, positioning quality, or micro-gameplay.

Lane-at-10 comparisons by the player's champion reuse only the same complete 10:00 snapshots with an identified opposing mid. Each champion row reports its own game count, average CS/gold/XP differential and share of games with an early death. Rows below three games are explicitly marked as weak; the values are descriptive and do not explain matchup causality or micro-gameplay quality.

Lane-at-10 comparisons by opposing champion apply the same validation and expose a separate sample for each identified matchup. They report average CS/gold/XP differential and early-death frequency, but do not establish that the opposing champion caused the observed result or measure micro-gameplay quality.

Patch comparisons normalize Riot's full `gameVersion` to its major/minor patch and show their own game count. Samples below three games are explicitly marked as limited; differences remain descriptive and do not establish that a patch caused a performance change.

Matchup summaries group results by the opposing player assigned to mid and display their own sample size. They describe results against a champion; they do not measure matchup causality or micro-gameplay quality.

Observed win rates include a 95% Wilson score interval for the overall report, played champions, opposing champions and patches. This interval makes the uncertainty of small samples visible; it is not a prediction. Positive or negative form is promoted as a scouting signal only when the full interval is respectively at or above 50%, or below 50%.

Reports show the actual oldest and newest match timestamps in the retained mid sample, how many matches were successfully dated, and the age of the latest game. A latest game at least 30 days old is explicitly marked as stale, so an inactive account is not presented as current form.

OUATventure rosters are imported from LEA with a bundled build-time snapshot fallback. Amateur teams and accounts can change during a season.

Rank loading prioritizes the current view, caches successful results for 15 minutes, and follows Riot's `Retry-After` delay after an HTTP 429. Replacing an expired API key immediately retries previously failed ranks while retaining the last verified value. Riot documents personal-key limits of 20 requests per second and 100 every two minutes; limits remain enforced per region: https://developer.riotgames.com/docs/portal (checked 2026-10-07).

When a player has several linked Riot accounts, rank loading checks every unique account within the existing five-account batch budget and displays the highest verified SoloQ rank. A successful unranked response for one account no longer hides a ranked secondary account or marks the player unranked while another account is still pending.

LPL players may use Chinese servers that are not exposed through the global Riot API; live detection and spectating can therefore be unavailable for those accounts.

MidWatch is an independent community project and is not endorsed by Riot Games, DPM, OUAT or LEA.
