const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
function normalizeRole(value) {
 const role=String(value||"").trim().toUpperCase();
 return ({TOP:"TOP",TOPLANE:"TOP",JUNGLE:"JUNGLE",JGL:"JUNGLE",JUNGLER:"JUNGLE",MID:"MID",MIDDLE:"MID",MIDLANE:"MID", "MID LANER":"MID",ADC:"ADC",AD:"ADC",BOT:"ADC",BOTTOM:"ADC",SUP:"SUPPORT",SUPP:"SUPPORT",SUPPORT:"SUPPORT",UTILITY:"SUPPORT"})[role]||null;
}
function selectRoster(saved,bundled) {
 return saved?.schemaVersion===2&&saved.players?.length?saved:bundled;
}
module.exports={ROLES,normalizeRole,selectRoster};
