# MidPulse — OUAT scouting

Windows desktop scouting for OUATventure midlaners only. Professional rosters and professional background requests have been removed. Existing professional cache entries are ignored.

- OUAT players, teams, divisions, SoloQ ranks, favorites and spectator requests.
- Analyse de patchs: choose an OUAT player, load a dedicated sample of up to 30 ranked-mid games without timelines, compare each observed patch with the previous observed sample using explicit game counts, average kills/deaths/assists, win-rate-point and KDA deltas, IC95, champion mix and sample warnings, and open official Riot patch notes.
- Riot API credentials remain local. The patch section requires a valid key for player statistics; official notes open without a key.
- Version is displayed from Electron app.getVersion().

Spectate inspects every running League client command line plus lockfile candidates, so a syntactically valid but stale Windows session cannot mask a later responsive client instance. Candidate credentials are tested only with the read-only phase request and a 2.5-second probe deadline, then the responsive session is pinned for launch with the normal request deadline; a failed POST is never retried against another session. Settings includes a key-free local client diagnostic that reports the observed phase and authentication source, separating client connection failures from Riot spectator-data failures. Rejected local launches distinguish authentication errors, stale or incompatible spectator data, a busy client and local server failures while retaining the observed client phase. Ambiguous failures are never automatically resubmitted. An accepted local request reports the observed client phase and LCU route for diagnosis; it still does not prove that the game window opened.

## Data notes

Scouting reports use up to 12 mid-role games from the 20 most recent Ranked Solo/Duo matches. Lane-at-5 and Lane-at-10 measurements require a timeline snapshot within one second of 5:00 or 10:00 and complete, finite, non-negative CS, gold and XP values for both midlaners. Short games and incomplete snapshots are excluded from each lane sample rather than treated as zero. This one-second window is an application validation rule, not a Riot API guarantee. The two displayed lane samples can therefore differ and be smaller than the overall report sample; these measurements do not establish the causes of lane outcomes. The 5-to-10 progression uses only games where both validated snapshots exist, reports changes in the relative CS, gold and XP gaps against the opposing midlaner, and displays its own paired sample size. A positive change means that relative gap increased; it is descriptive and does not establish a balance effect or a micro-gameplay cause.

The overall Lane-at-5 and Lane-at-10 panels report the share of comparable games with a strictly positive gold differential and the share with a death, each with a 95% Wilson score interval based on that panel's own validated snapshot sample. Lane-at-10 also reports both the mean and median gold differential; the median reduces the influence of one extreme game. Ties are not counted as being ahead. These measures remain descriptive rather than causal.

Every report records its collection coverage: recent match IDs requested, match payloads loaded, eligible mid games, and timelines loaded. A Riot rate limit, authentication failure, or individual payload error marks the report as partial instead of presenting it as a complete sample. A report is considered controlled when all requested history was inspected or the 12-game mid target was reached without collection errors. Lane samples below three comparable games are explicitly marked as weak.

Early-habit summaries use timestamped timeline events through 10:00. Kill/assist participation, average takedowns and the share of games with a death are split into paired 0-to-5 and 5-to-10 windows over the same timelines; the 5:00 boundary belongs only to the first window and 10:00 to the second. The report also shows the median first ward time, timeline count and ward-specific sample. These are event frequencies only: they do not infer movement, recalls, causes, positioning quality, or micro-gameplay.

Lane-at-10 comparisons by the player's champion reuse only the same complete 10:00 snapshots with an identified opposing mid. Each champion row reports its own game count, average CS/gold/XP differential and share of games with an early death. The champion progression panel separately requires paired complete 5:00 and 10:00 snapshots, and reports the change in each relative gap plus the share of games where the gold gap improved. Rows below three games are explicitly marked as weak; the values are descriptive and do not explain champion causality or micro-gameplay quality.

Lane-at-10 comparisons by opposing champion apply the same validation and expose a separate sample for each identified matchup. The opposing-champion progression panel additionally requires paired complete 5:00 and 10:00 snapshots, and reports changes in the relative CS/gold/XP gaps plus the share where the gold gap improved. These measurements do not establish that the opposing champion caused the observed result or measure micro-gameplay quality.

Patch comparisons normalize Riot's full `gameVersion` to its major/minor patch and show their own game count. Average kills, deaths and assists per game make the composition behind the aggregate KDA visible. Each patch is compared only with the previous patch actually observed in the available history, which may skip Riot versions. Both sample sizes and signed win-rate-point/KDA deltas are shown. Samples below three games are explicitly marked as limited; champion pools and context may differ, so differences remain descriptive and do not establish that a patch caused a performance change.

Matchup summaries group results by the opposing player assigned to mid and display their own sample size. They describe results against a champion; they do not measure matchup causality or micro-gameplay quality.

Observed win rates include a 95% Wilson score interval for the overall report, played champions, opposing champions and patches. This interval makes the uncertainty of small samples visible; it is not a prediction. Positive or negative form is promoted as a scouting signal only when the full interval is respectively at or above 50%, or below 50%.

Reports show the actual oldest and newest match timestamps in the retained mid sample, how many matches were successfully dated, and the age of the latest game. A latest game at least 30 days old is explicitly marked as stale, so an inactive account is not presented as current form.

OUATventure rosters are imported from LEA with a bundled build-time snapshot fallback. Amateur teams and accounts can change during a season.

Rank loading prioritizes the current view, caches successful results for 15 minutes, and follows Riot's `Retry-After` delay after an HTTP 429. Replacing an expired API key immediately retries previously failed ranks while retaining the last verified value. Riot documents personal-key limits of 20 requests per second and 100 every two minutes; limits remain enforced per region: https://developer.riotgames.com/docs/portal (checked 2026-10-07).

When more eligible accounts remain after the five-account request budget, MidPulse schedules the next rank batch after four seconds instead of waiting for the 20-second maintenance interval. Authentication and rate-limit cooldowns still stop this follow-up.

Foreground Riot actions (scouting reports, patch analysis, account checks and spectate verification) are serialized. Automatic rank and live batches wait while one is active, reducing avoidable competition for the same API-key quota.

Rank collection caches Riot PUUIDs per linked account. If League-V4 rejects a cached PUUID with a 404, MidPulse now resolves the Riot ID again through Account-V1 and retries the rank once in the same batch. Fresh 404s, authentication failures and rate limits are not looped.

For players with several linked Riot accounts, a verified SoloQ rank remains visible while the other accounts load, but is labelled `PARTIEL` until every account has a conclusive result. This avoids presenting an interim rank as the player's confirmed best rank.

When a previously verified rank is retained after a Riot refresh error, the UI labels it `À REVÉRIFIER`. The cached value remains useful for scouting, but is no longer presented as current until a later League-V4 request succeeds.

Live status now distinguishes a successful Spectator-V5 `404` for a resolved account (confirmed outside a game) from account-resolution, authentication, rate-limit and network failures (status unavailable). An unavailable refresh also clears a stale in-game badge. The manual account check likewise reports League-V4 failures instead of presenting them as an unranked result.

When a player has several linked Riot accounts, rank loading checks every unique account within the existing five-account batch budget and displays the highest verified SoloQ rank. A successful unranked response for one account no longer hides a ranked secondary account or marks the player unranked while another account is still pending.

LPL players may use Chinese servers that are not exposed through the global Riot API; live detection and spectating can therefore be unavailable for those accounts.

MidWatch is an independent community project and is not endorsed by Riot Games, DPM, OUAT or LEA.
