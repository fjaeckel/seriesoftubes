// Runs inside the MCP server's own game page (scripts/lib/mcp-game.js), in the game's global scope, after the page has
// loaded: the half of a session only that page has. It starts, loads and exports games, which in a player's browser
// are the player's alone, so it is not part of any page. Everything else a tool does goes through the page's own
// facade (window.TUBES, src/agent/).
(() => {
  // Out of the way of the game: no sheet of a previous game, no title screen or pitch, the clock left to the server.
  const settle = () => { UI.started = true; UI.pitched = true; UI.speed = 0; if (UI.pendGame) ACT.pitchSkip(); closeModal(); API_SHEET = null; compute(); renderAll(); };
  const newGame = ({ city = 'fra', name, preset = 'oncall', seed, asn, chaos } = {}) => {
    const c = apiCityOf(city).id;
    if (!homeOk(c)) apiFail(`${apiCityName(c)} cannot be a home city.`);
    if (!['soft', 'freeze', 'oncall', 'bgp', 'sandbox'].includes(preset)) apiFail('preset is one of soft, freeze, oncall, bgp, sandbox');
    if (asn !== undefined && !asnOk(+asn)) apiFail(`AS${asn} cannot be yours: it is reserved, private or another network's. Leave asn out for a free one.`);
    if (chaos !== undefined && preset !== 'sandbox') apiFail('chaos is the sandbox\'s dial: give preset "sandbox" with it.');
    if (chaos !== undefined && !own(CHAOS, chaos)) apiFail(`chaos is one of ${Object.keys(CHAOS).join(', ')}.`);
    if (seed !== undefined && window.__reseed) window.__reseed(Math.max(1, Math.floor(+seed) || 1));
    if (UI.pendGame) UI.pendGame = null;
    UI.pitched = true;
    const nm = String(name || randomNetworkName()).slice(0, 24), was = UI.asnTxt;
    // beginGame takes the ASN typed on the title screen.
    UI.asnTxt = asn !== undefined ? String(+asn) : '';
    try { beginGame(nm, c, preset === 'sandbox' ? { mode: 'sandbox', rules: { chaos: chaos || 'none' } } : { mode: 'normal', preset }); } finally { UI.asnTxt = was; }
    settle();
    return apiStatus();
  };
  const loadSave = (txt) => {
    const r = parseSave(txt);
    if (r.err) apiFail(apiText(r.err));
    S = migrate(JSON.parse(JSON.stringify(r.s)));
    settle();
    return { savedBy: r.ver, ...apiStatus() };
  };
  // Like the game's own export: never the multiplayer private key or the records waiting to go out (fedPublic).
  const exportSave = (version) => JSON.stringify({ app: 'series-of-tubes', version: /^\d/.test(APP_VERSION) ? APP_VERSION : version, exported: new Date().toISOString(), S: packSave(fedPublic(S)) });
  // The server's clock: the agent's (advance), or a running one it ticks itself (apiTick) at paceMs.
  const setClock = (mode, paceMs, running) => { API_CLK = { mode, paceMs: mode === 'realtime' ? paceMs : 0, running: !!running }; };
  window.__mcpHeadless = { newGame, loadSave, exportSave, setClock };
})();
