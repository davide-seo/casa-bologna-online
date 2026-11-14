// Casa a Bologna — interfaccia. Niente framework: stato in un oggetto,
// ogni vista è una funzione che restituisce HTML.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NF = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 });
const fmt = n => NF.format(Math.round(n));
const eur = n => n == null ? '—' : `${fmt(n)} €`;
const k = n => n == null ? '—' : `${Math.round(n / 1000)}k`;
const STATIC = !!window.CB_STATIC;   // copia online: dati cifrati, sola lettura
let SNAP = null;
const local = {
  get: () => { try { return JSON.parse(localStorage.getItem('cb.stati') ?? '{}'); } catch { return {}; } },
  set: v => { try { localStorage.setItem('cb.stati', JSON.stringify(v)); } catch {} },
};
const withLocal = h => { const st = local.get()[h.id]; return st ? { ...h, ...st } : h; };
async function staticApi(p, opt) {
  const m = p.match(/^\/api\/casa\/(.+?)(\/stato)?$/);
  if (m && m[2]) { const id = decodeURIComponent(m[1]); const all = local.get(); all[id] = { ...all[id], ...(opt.status !== undefined ? { status: opt.status } : {}), ...(opt.note != null ? { note: opt.note } : {}), seen: true }; local.set(all); return { ok: true }; }
  if (m) { const id = decodeURIComponent(m[1]); const d = SNAP.details[id] ?? SNAP.houses.find(h => h.id === id); return withLocal({ sources: [], questions: [], history: [], ...d }); }
  if (p === '/api/case') return SNAP.houses.map(withLocal);
  if (p === '/api/stato') return { ...SNAP.state, now: SNAP.generatedAt };
  if (p === '/api/mercato') return SNAP.market;
  if (p === '/api/viste') { const all = local.get(); for (const id of opt.ids ?? []) all[id] = { ...all[id], seen: true }; local.set(all); return { ok: true }; }
  throw new Error('Nella copia online non si può: si fa dal Mac.');
}
const api = async (p, opt) => {
  if (STATIC) return staticApi(p, opt);
  const r = await fetch(p, opt && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opt) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// Decifra dati.json con la password (PBKDF2 + AES-GCM, come in src/publish.ts).
async function unlock(password) {
  const enc = await fetch('dati.json', { cache: 'no-store' }).then(r => r.json());
  const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(enc.iv) }, key, b(enc.data));
  const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}
function loginScreen() {
  return new Promise(resolve => {
    const saved = (() => { try { return localStorage.getItem('cb.pw'); } catch { return null; } })();
    const tryPw = async (pw, remember) => {
      try { SNAP = await unlock(pw); S.pw = pw; if (remember) try { localStorage.setItem('cb.pw', pw); } catch {} resolve(); return true; }
      catch { return false; }
    };
    if (saved) tryPw(saved, false).then(ok => { if (!ok) show(); }); else show();
    function show() {
      const el = document.createElement('div');
      el.className = 'login';
      el.innerHTML = `<form class="login-box"><svg class="arch" viewBox="0 0 32 32"><path d="M4 30V14a12 12 0 0 1 24 0v16h-5V14a7 7 0 0 0-14 0v16z"/></svg>
        <h1>Casa a Bologna</h1><p>Inserisci la password per vedere le case.</p>
        <input type="password" autocomplete="current-password" placeholder="Password" autofocus>
        <label class="switch"><input type="checkbox" checked> Ricordami su questo dispositivo</label>
        <button class="btn primary" type="submit">Entra</button><div class="login-err" hidden>Password sbagliata.</div></form>`;
      document.body.append(el);
      const [pw, rem] = el.querySelectorAll('input');
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        el.querySelector('button').disabled = true;
        if (await tryPw(pw.value, rem.checked)) el.remove();
        else { el.querySelector('.login-err').hidden = false; el.querySelector('button').disabled = false; pw.select(); }
      };
    }
  });
}
const ago = iso => {
  if (!iso) return 'mai';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
};
const store = {
  get(key, d) { try { return JSON.parse(localStorage.getItem('cb.' + key)) ?? d; } catch { return d; } },
  set(key, v) { try { localStorage.setItem('cb.' + key, JSON.stringify(v)); } catch {} },
};

const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  q: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17v.01"/></svg>',
  house: '<svg viewBox="0 0 24 24"><path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
};
const SOURCE_NAMES = {};

const S = {
  view: store.get('view', 'novita'),
  houses: [], state: null, market: null,
  filters: store.get('filters', { zones: [], rooms: 'tutti', sort: 'score', onlyNew: false, maxPrice: null }),
  lastVisit: store.get('lastVisit', null),
  map: null,
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ——— Dati ———
async function load() {
  const [houses, state] = await Promise.all([api('/api/case'), api('/api/stato')]);
  S.houses = houses;
  S.state = state;
  for (const s of state.sources) SOURCE_NAMES[s.id] = s.name;
  renderChrome();
  render();
}

const isNew = h => !h.seen && (!S.lastVisit || h.firstSeen > S.lastVisit || Date.now() - Date.parse(h.firstSeen) < 36 * 3600e3);
const saved = h => ['preferito', 'da-vedere', 'visitato'].includes(h.status);
const lists = {
  suggerite: () => S.houses.filter(h => h.active && h.verdict === 'suggerita' && h.status !== 'scartato'),
  verificare: () => S.houses.filter(h => h.active && h.verdict === 'da-verificare' && h.status !== 'scartato'),
  tutte: () => S.houses.filter(h => h.active),
  salvate: () => S.houses.filter(h => saved(h)),
};

function applyFilters(arr) {
  const f = S.filters;
  let out = arr;
  if (f.zones.length) out = out.filter(h => f.zones.includes(h.zone));
  if (f.rooms !== 'tutti') out = out.filter(h => f.rooms === '4+' ? h.rooms >= 4 : h.rooms === Number(f.rooms));
  if (f.onlyNew) out = out.filter(isNew);
  if (f.maxPrice) out = out.filter(h => (h.price ?? 0) <= f.maxPrice);
  const by = {
    score: (a, b) => b.score - a.score,
    prezzo: (a, b) => (a.price ?? 9e9) - (b.price ?? 9e9),
    metro: (a, b) => ppm(a) - ppm(b),
    recenti: (a, b) => b.firstSeen.localeCompare(a.firstSeen),
    ribassi: (a, b) => b.dropPct - a.dropPct,
    trattativa: (a, b) => (b.negPct ?? 0) - (a.negPct ?? 0),
  }[f.sort];
  return [...out].sort(by);
}
const ppm = h => h.price && h.sqm ? h.price / h.sqm : 9e9;

// ——— Testata ———
function renderChrome() {
  const sug = lists.suggerite();
  const nuove = sug.filter(isNew).length;
  $('#summary').textContent = sug.length
    ? `${sug.length} ${sug.length === 1 ? 'casa' : 'case'} da guardare${nuove ? ` · ${nuove} ${nuove === 1 ? 'nuova' : 'nuove'}` : ''}`
    : S.houses.length ? 'Nessuna casa centra tutti i criteri, per ora' : 'Primo giro: premi «Aggiorna»';
  for (const [key, fn] of Object.entries(lists)) {
    const el = $(`[data-count="${key}"]`);
    if (el) el.textContent = fn().length || '';
  }
  const nn = newOfLastRun().filter(h => h.verdict !== 'fuori').length;
  $('[data-count="novita"]').textContent = nn || '';
  const lr = S.state.lastRun;
  const p = S.state.progress;
  if (STATIC) {
    $('#last').innerHTML = `Dati di ${ago(SNAP.generatedAt)}<br>${pendingSince ? 'richiesta inviata al Mac…' : 'dal Mac ogni ' + S.state.prefs.intervalHours + ' ore'}`;
    $('span', $('#btn-refresh')).textContent = pendingSince ? 'In attesa…' : 'Aggiorna';
    $('#bb-refresh').textContent = pendingSince ? 'In attesa del Mac · annulla' : 'Aggiorna';
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
    return;
  }
  $('#last').innerHTML = p.running ? 'Aggiornamento in corso' : lr
    ? `Aggiornato ${ago(lr.finishedAt)}<br>prossimo fra ${nextIn()}` : 'Mai aggiornato';
  const btn = $('#btn-refresh');
  btn.disabled = p.running;
  $('span', btn).textContent = p.running ? 'Aggiorno…' : 'Aggiorna';
  $('#bb-refresh').textContent = p.running ? 'Aggiorno…' : 'Aggiorna';
  $('#live').hidden = !p.running;
  if (p.running) {
    const cur = Object.entries(p.current).filter(([, v]) => v && !v.startsWith('fatto')).map(([id, v]) => `${SOURCE_NAMES[id] ?? id}: ${v}`);
    $('#live-text').textContent = cur.length ? cur.join('  ·  ') : (p.log.at(-1) ?? 'Parto…').replace(/^\S+\s+/, '');
  }
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
}
function nextIn() {
  const lr = S.state.lastRun;
  if (!lr) return 'poco';
  const ms = Date.parse(lr.startedAt) + S.state.prefs.intervalHours * 3600e3 - Date.now();
  if (ms <= 0) return 'poco';
  const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60e3);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// ——— Viste ———
function render() {
  const main = $('#main');
  const v = S.view;
  if (S.map && v !== 'mappa') { S.map.remove(); S.map = null; }
  if (v === 'novita') main.innerHTML = novitaView();
  else if (lists[v]) main.innerHTML = listView(v);
  else if (v === 'mappa') { main.innerHTML = mapView(); drawMap(); }
  else if (v === 'mercato') { main.innerHTML = '<div class="empty">Carico i numeri…</div>'; marketView(); }
  else if (v === 'fonti') main.innerHTML = sourcesView();
  else if (v === 'impostazioni') main.innerHTML = settingsView();
  bindView();
}

const HEADS = {
  suggerite: ['Da guardare', p => `Le case che centrano tutto: ${eur(p.budgetMin)}–${eur(p.budgetMax)}, ${roomWord(p.idealRooms)}, nelle tue zone, con balcone. In ordine di punteggio.`],
  verificare: ['Da verificare', () => 'Quasi giuste: manca un\'informazione (di solito il balcone o la zona) o sforano di poco il budget. Una telefonata e sai.'],
  tutte: ['Tutte le case', () => 'Ogni annuncio trovato a Bologna nella fascia di prezzo, anche fuori dalle tue zone. Utile per capire il mercato.'],
  salvate: ['Salvate', () => 'Le case che hai segnato: preferite, da vedere, già visitate.'],
};
const roomWord = n => ['', 'monolocale', 'bilocale', 'trilocale', 'quadrilocale'][n] ?? `${n} locali`;

function listView(v) {
  const [title, sub] = HEADS[v];
  const items = applyFilters(lists[v]());
  const prefs = S.state.prefs;
  const zones = Object.entries(prefs.zones).filter(([, t]) => t !== 'altro').map(([z]) => z);
  const f = S.filters;
  return `
  <div class="head">
    <div><h1>${title}</h1><p>${sub(prefs)}</p></div>
    ${v === 'suggerite' && items.some(isNew) ? `<button class="btn small" id="mark-seen">${ICON.check} Segna tutte come viste</button>` : ''}
    ${STATIC && v === 'salvate' && Object.keys(local.get()).some(k => local.get()[k].status !== undefined || local.get()[k].note) ? `<button class="btn small" id="sync-states">Invia al Mac preferiti e appunti</button>` : ''}
  </div>
  <div class="filters">
    ${zones.map(z => `<button class="chip ${f.zones.includes(z) ? 'on' : ''}" data-zone="${esc(z)}"><span class="dot" style="color:var(${prefs.zones[z] === 'target' ? '--persiana' : '--ocra'})"></span>${esc(z)}</button>`).join('')}
    <span class="sep"></span>
    <select class="select" data-f="rooms">
      ${[['tutti', 'Tutti i locali'], ['2', 'Bilocali'], ['3', 'Trilocali'], ['4+', '4 o più']].map(([val, l]) => `<option value="${val}" ${f.rooms === val ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <select class="select" data-f="sort">
      ${[['score', 'Punteggio'], ['prezzo', 'Prezzo più basso'], ['metro', '€/m² più basso'], ['trattativa', 'Più margine di trattativa'], ['recenti', 'Più recenti'], ['ribassi', 'Ribassi']].map(([val, l]) => `<option value="${val}" ${f.sort === val ? 'selected' : ''}>Ordina: ${l}</option>`).join('')}
    </select>
    <button class="chip ${f.onlyNew ? 'on' : ''}" data-f="onlyNew">Solo nuove</button>
    ${f.zones.length || f.rooms !== 'tutti' || f.onlyNew ? '<button class="chip" data-f="reset">Azzera</button>' : ''}
  </div>
  ${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : emptyList(v)}`;
}

function emptyList(v) {
  const never = !S.state.lastRun;
  const msg = never ? ['Nessun annuncio ancora', 'Premi «Aggiorna»: il primo giro su tutte le fonti dura qualche minuto.']
    : v === 'salvate' ? ['Niente salvato', 'Tocca il cuore su una casa per ritrovarla qui.']
    : v === 'suggerite' ? ['Oggi niente centra tutto', 'Guarda in «Da verificare»: spesso manca solo l\'informazione sul balcone.']
    : ['Nessuna casa con questi filtri', 'Prova ad allargare i filtri.'];
  return `<div class="empty">${ICON.house}<h2>${msg[0]}</h2><p>${msg[1]}</p></div>`;
}

const scoreClass = s => s >= 78 ? 'hi' : s >= 62 ? 'mid' : '';
function card(h) {
  const photo = h.photos[0];
  const tags = [];
  if (isNew(h)) tags.push('<span class="tag new">Nuova</span>');
  if (h.dropPct >= 2) tags.push(`<span class="tag drop">−${Math.round(h.dropPct)}%</span>`);
  if (h.gone || (!h.active && saved(h))) tags.push('<span class="tag gone">Non più online</span>');
  if (h.status === 'da-vedere') tags.push('<span class="tag">Da vedere</span>');
  if (h.status === 'visitato') tags.push('<span class="tag">Visitata</span>');
  const zm = h.zoneMedian && h.price && h.sqm ? Math.round((h.price / h.sqm / h.zoneMedian - 1) * 100) : null;
  const srcNames = [...new Set(h.members.map(m => SOURCE_NAMES[m.source] ?? m.source))];
  return `
  <article class="card ${h.status === 'scartato' ? 'scartata' : ''}" data-id="${esc(h.id)}" tabindex="0">
    <div class="ph">
      <div class="ph-frame">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph-empty',innerHTML:'${ICON.house.replace(/"/g, '&quot;')}'}))">` : `<div class="ph-empty">${ICON.house}</div>`}
        ${h.photos.length > 1 ? `<div class="ph-dots">${h.photos.slice(0, 4).map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
      </div>
      <div class="score ${scoreClass(h.score)}" title="Punteggio su 100">${h.score}</div>
      <div class="ribbon">${tags.join('')}</div>
    </div>
    <div class="body">
      <div class="price num">${eur(h.price)}${h.firstPrice && h.firstPrice > h.price ? `<s>${eur(h.firstPrice)}</s>` : ''}</div>
      <div class="facts num"><b>${h.rooms ? roomWord(h.rooms) : 'locali n.d.'}</b>${h.sqm ? ` · ${h.sqm} m²` : ''}${h.price && h.sqm ? ` · ${fmt(h.price / h.sqm)} €/m²` : ''}${zm != null ? ` <span style="color:var(${zm <= -3 ? '--persiana' : zm >= 5 ? '--intonaco' : '--ink-3'})">(${zm > 0 ? '+' : ''}${zm}%)</span>` : ''}</div>
      <div class="where"><span class="tier ${h.tier ?? ''}"></span>${esc(h.zone ?? 'Zona da capire')}${h.area ? ` <small>${esc(title(h.area))}</small>` : ''}</div>
      <div class="pills">${pills(h)}</div>
      <div class="foot">
        ${h.negPct ? `<div class="neg num" title="Margine di trattativa stimato">−${String(h.negPct).replace('.', ',')}%</div>` : ''}
        <div class="srcs" title="${esc(srcNames.join(', '))}">${esc(srcNames.join(' · '))}${h.members.length > 1 ? ` <b>×${h.members.length}</b>` : ''}</div>
        <div class="acts">
          <button class="icon-btn fav ${h.status === 'preferito' ? 'on' : ''}" data-act="preferito" title="Salva">${ICON.heart}</button>
          <button class="icon-btn" data-act="scartato" title="${h.status === 'scartato' ? 'Ripristina' : 'Scarta'}">${ICON.x}</button>
          <a class="icon-btn" href="${esc(h.url)}" target="_blank" rel="noopener" data-act="open" title="Apri l'annuncio">${ICON.ext}</a>
        </div>
      </div>
    </div>
  </article>`;
}
const title = s => s.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());

function pills(h) {
  const p = [];
  if (h.terrace) p.push(`<span class="pill ok">${ICON.check}terrazzo</span>`);
  else if (h.balcony === true) p.push(`<span class="pill ok">${ICON.check}balcone</span>`);
  else if (h.balcony === false) p.push(`<span class="pill bad">senza balcone</span>`);
  else p.push(`<span class="pill warn">${ICON.q}balcone?</span>`);
  if (h.elevator) p.push('<span class="pill">ascensore</span>');
  if (h.airCon === 'si') p.push('<span class="pill">aria condizionata</span>');
  const ex = h.exposure;
  if (ex && (ex.source === 'descrizione' || ex.source === 'fonte') && ex.dirs.length) p.push(`<span class="pill ${ex.dirs.some(d => SUNNY.has(d)) ? 'ok' : ''}">esposto ${esc(ex.dirs.map(d => DIR_SHORT[d]).join('-'))}</span>`);
  if (ex?.luce === 'ottima' || ex?.luce === 'buona') p.push(`<span class="pill ok">luce ${ex.luce}</span>`);
  if (ex?.luce === 'scarsa') p.push('<span class="pill warn">poca luce</span>');
  if (h.floor) p.push(`<span class="pill">${esc(floorText(h.floor))}</span>`);
  if (h.garage) p.push('<span class="pill">box/posto auto</span>');
  if (h.energy) p.push(`<span class="pill">classe ${esc(h.energy)}</span>`);
  if (h.condition) p.push(`<span class="pill">${esc(h.condition)}</span>`);
  for (const t of h.traps) p.push(`<span class="pill bad">${ICON.warn}${esc(t)}</span>`);
  return p.slice(0, 8).join('');
}
const SUNNY = new Set(['S', 'SE', 'SO', 'O']);
const DIR_SHORT = { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SO: 'SO', O: 'O', NO: 'NO' };
const DIR_NAME = { N: 'nord', NE: 'nord-est', E: 'est', SE: 'sud-est', S: 'sud', SO: 'sud-ovest', O: 'ovest', NO: 'nord-ovest' };
const floorText = f => /piano/i.test(f) ? f.toLowerCase() : /^\d+$/.test(f) ? `${f}° piano` : `piano ${f.toLowerCase()}`;

// ——— Novità: il resoconto dell'ultimo giro ———
const lastRun = () => S.state.lastRun;
function newOfLastRun() {
  const lr = lastRun();
  if (!lr) return [];
  return S.houses.filter(h => h.active && h.firstSeen >= lr.startedAt).sort((a, b) => b.score - a.score);
}
const when = iso => new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function novitaView() {
  const lr = lastRun();
  if (!lr) return `<div class="head"><div><h1>Novità</h1></div></div>${emptyList('suggerite')}`;
  const sm = lr.summary ?? {};
  const fresh = newOfLastRun();
  const good = fresh.filter(h => h.verdict === 'suggerita'), check = fresh.filter(h => h.verdict === 'da-verificare');
  const drops = S.houses.filter(h => (sm.ribassi ?? []).includes(h.id));
  const unseen = S.houses.filter(h => h.active && h.verdict === 'suggerita' && !h.seen && h.status !== 'scartato' && !good.includes(h));
  const hist = S.state.runHistory ?? [];
  const stat = (n, l, cls = '') => `<div class="stat ${cls}"><b class="num">${n ?? 0}</b><span>${l}</span></div>`;
  const srcLine = (sm.perFonte ?? []).filter(f => f.status === 'ok' && f.new).map(f => `${esc(SOURCE_NAMES[f.source] ?? f.source)} +${f.new}`).join(' · ');
  return `
  <div class="head"><div><h1>Novità</h1><p>Ultimo giro: ${when(lr.startedAt)} (${ago(lr.finishedAt)}).</p></div></div>
  ${appBox()}
  <div class="run-card">
    ${stat(sm.nuoveTotale ?? fresh.length, 'case nuove', 'big')}
    ${stat(sm.perEsito?.suggerita ?? good.length, 'da guardare', 'good')}
    ${stat(sm.perEsito?.['da-verificare'] ?? check.length, 'da verificare', 'mid')}
    ${stat(sm.perEsito?.fuori, 'fuori criteri')}
    ${stat(drops.length, 'ribassi', 'good')}
    ${stat(sm.ritirate, 'ritirate')}
    ${srcLine ? `<div class="run-src">Nuovi annunci per fonte: ${srcLine}</div>` : ''}
  </div>
  ${savedBox(sm)}
  ${good.length ? `<h2 class="sec-title">Nuove da guardare <span>${good.length}</span></h2><div class="grid">${good.map(card).join('')}</div>` : '<p class="fine big-fine">In questo giro nessuna casa nuova centra tutti i criteri.</p>'}
  ${check.length ? `<h2 class="sec-title">Nuove da verificare <span>${check.length}</span></h2><div class="grid">${check.slice(0, 24).map(card).join('')}</div>` : ''}
  ${drops.length ? `<h2 class="sec-title">Ribassi <span>${drops.length}</span></h2><div class="grid">${drops.map(card).join('')}</div>` : ''}
  ${unseen.length ? `<h2 class="sec-title">Da guardare che non hai ancora aperto <span>${unseen.length}</span></h2><div class="grid">${unseen.slice(0, 12).map(card).join('')}</div>` : ''}
  ${hist.length > 1 ? `<h2 class="sec-title">Giri precedenti</h2><div class="panel"><table class="ztable num"><thead><tr><th>Quando</th><th class="r">Nuove</th><th class="r">Da guardare</th><th class="r">Da verificare</th><th class="r">Ribassi</th></tr></thead><tbody>
    ${hist.slice(0, 15).map(r => `<tr><td>${when(r.startedAt)}</td><td class="r">${r.nuove}</td><td class="r">${r.perEsito?.suggerita ?? 0}</td><td class="r">${r.perEsito?.['da-verificare'] ?? 0}</td><td class="r">${r.ribassi}</td></tr>`).join('')}
  </tbody></table></div>` : ''}`;
}

function savedBox(sm) {
  const sv = sm.salvate;
  if (!sv || !sv.controllate) return '';
  const rows = [
    ...sv.ribassi.map(r => `<a class="src-item" href="#" data-open="${esc(r.id)}"><div><b class="num">${eur(r.a)}</b> <span class="drop-pct">−${String(r.pct).replace('.', ',')}%</span><small>era ${eur(r.da)} · ${esc(r.zone ?? '')} · ${esc(r.title)}</small></div>${ICON.right}</a>`),
    ...sv.ritirate.map(r => `<a class="src-item gone-item" href="#" data-open="${esc(r.id)}"><div><b>Non più online</b><small>${esc(r.zone ?? '')} · ${esc(r.title)}</small></div>${ICON.right}</a>`),
  ];
  return `<div class="saved-box ${rows.length ? 'alert-box' : ''}"><h2 class="sec-title" style="margin-top:0">Le tue case salvate</h2>
    ${rows.length ? `<div class="src-list">${rows.join('')}</div>` : `<p class="fine">Controllate tutte e ${sv.controllate}: nessun ribasso, tutte ancora online.</p>`}</div>`;
}

// ——— App sul telefono e notifiche ———
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushReady = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToBytes(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
async function enablePush() {
  if (isIOS && !standalone) { toast('Prima aggiungi l\'app alla schermata Home e aprila dall\'icona'); return; }
  if (!pushReady()) { toast('Questo browser non supporta le notifiche push'); return; }
  if (!S.state.vapidPublic) { toast('Il Mac non ha ancora pubblicato la chiave: riprova dopo il prossimo giro'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifiche non permesse: si cambia dalle impostazioni del telefono'); return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.state.vapidPublic) });
  if (STATIC) await sendCommand('notifiche', { subscription: sub.toJSON() }, isIOS ? 'iPhone' : 'telefono');
  else { await fetch('/api/notifiche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) }); toast('Notifiche attive: ti ho mandato una prova'); }
  store.set('pushOn', true);
  render();
}
function appBox() {
  const on = store.get('pushOn', false) && 'Notification' in window && Notification.permission === 'granted';
  if (on) return '';
  const steps = isIOS && !standalone
    ? 'Su iPhone: tocca <b>Condividi</b> in Safari, poi <b>Aggiungi alla schermata Home</b>. Apri l\'app dall\'icona e torna qui per attivare le notifiche.'
    : 'Ricevi una notifica per case nuove da guardare, ribassi e case salvate tolte dal mercato.';
  return `<div class="app-box"><div><b>Casa a Bologna sul telefono</b><p>${steps}</p></div>${isIOS && !standalone ? '' : '<button class="btn primary small" id="push-on">Attiva le notifiche</button>'}</div>`;
}

// ——— Comandi al Mac (dal telefono: GitHub Issues) ———
let pendingSince = null;
function ghToken() { try { return localStorage.getItem('cb.ghtoken') || null; } catch { return null; } }
async function sendCommand(kind, data, label) {
  const repo = S.state.commandRepo;
  if (!repo) { toast('Comandi non configurati sul Mac'); return false; }
  const title = `[casa] ${kind}${label ? ' · ' + label : ''}`;
  const body = `Richiesta dal sito Casa a Bologna.\n\n\`\`\`json\n${JSON.stringify(data, null, 1)}\n\`\`\``;
  const token = ghToken();
  if (!token) { commandSheet(repo, title, body); return false; }
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ title, body }) });
  if (!r.ok) { toast('GitHub ha rifiutato il token: controllalo in Impostazioni'); return false; }
  const issue = await r.json();
  pendingSince = SNAP?.generatedAt ?? new Date().toISOString();
  liveStatus(kind === 'aggiorna' ? 'Richiesta inviata: il Mac la prende entro un minuto' : 'Inviato al Mac');
  followIssue(repo, issue.number, token);
  renderChrome();
  watchForNewData();
  return true;
}
// Senza token: si spiega cosa succede, poi si apre GitHub con la richiesta già scritta.
function commandSheet(repo, title, body) {
  const url = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  $('#drawer-body').innerHTML = `<div class="add-form">
    <h2>Manda la richiesta al Mac</h2>
    <p>Si apre GitHub con la richiesta già scritta: premi <b>Create</b> (o «Submit new issue»). Se GitHub ti chiede di entrare, accedi e poi premi Create. Il Mac la legge entro un minuto, ti avvisa con una notifica, fa il giro (circa 10 minuti) e qui si aggiorna da solo.</p>
    <p class="fine">Se non premi Create la richiesta non parte: il tasto in basso resta «In attesa» finché non lo tocchi per annullare.</p>
    <a class="btn primary" id="cmd-open" href="${esc(url)}" target="_blank" rel="noopener">Apri GitHub</a>
    <p class="fine">Per farlo con un tocco solo, senza passare da GitHub: Impostazioni → «Comandi dal telefono».</p>
    <button class="btn" id="cmd-settings">Collega il telefono</button>
  </div>`;
  $('#drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
  const close = () => { $('#drawer').classList.remove('open'); document.body.style.overflow = ''; };
  $$('[data-close]').forEach(b => b.onclick = close);
  $('#cmd-open').onclick = () => { pendingSince = SNAP?.generatedAt ?? new Date().toISOString(); renderChrome(); watchForNewData(); setTimeout(close, 300); };
  $('#cmd-settings').onclick = () => { close(); S.view = 'impostazioni'; renderChrome(); render(); };
}
// Con il token si seguono le risposte del Mac sotto la issue.
function liveStatus(text) {
  const el = $('#live');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  $('#live-text').textContent = text;
}
function followIssue(repo, n, token) {
  let seen = 0;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const t = setInterval(async () => {
    try {
      const [is, cs] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/issues/${n}`, { headers: h }).then(r => r.json()),
        fetch(`https://api.github.com/repos/${repo}/issues/${n}/comments`, { headers: h }).then(r => r.json()),
      ]);
      if (Array.isArray(cs) && cs.length > seen) { seen = cs.length; liveStatus(`Mac: ${cs.at(-1).body.split('\n')[0].replace(/\*\*/g, '')}`); }
      if (is.state === 'closed') { clearInterval(t); setTimeout(() => liveStatus(null), 15000); }
    } catch {}
  }, 15000);
  setTimeout(() => clearInterval(t), 30 * 60e3);
}

// Dopo un comando si ricontrolla dati.json ogni 30 secondi, per 20 minuti.
let watchTimer = null;
function watchForNewData() {
  clearInterval(watchTimer);
  const until = Date.now() + 20 * 60e3;
  watchTimer = setInterval(async () => {
    if (Date.now() > until) { clearInterval(watchTimer); pendingSince = null; renderChrome(); return; }
    try {
      const pw = localStorage.getItem('cb.pw') ?? S.pw;
      const snap = await unlock(pw);
      if (snap.generatedAt > pendingSince) {
        clearInterval(watchTimer); pendingSince = null; SNAP = snap;
        await load();
        S.view = 'novita'; store.set('view', 'novita'); renderChrome(); render();
        const n = S.state.lastRun?.summary?.nuoveTotale ?? 0;
        toast(`Dati aggiornati: ${n} case nuove`);
      }
    } catch {}
  }, 30_000);
}

function addForm() {
  const zones = Object.keys(S.state.prefs.zones);
  return `<form class="add-form" id="add-form">
    <h2>Aggiungi un annuncio</h2>
    <p>Incolla il link (anche da Immobiliare, Idealista, Casa.it, Tempocasa). Quello che scrivi qui vale più di quello che il Mac riesce a leggere.</p>
    <label>Link dell'annuncio<input name="url" type="url" required placeholder="https://…" inputmode="url"></label>
    <div class="row">
      <label>Prezzo €<input name="prezzo" type="number" step="1000" inputmode="numeric"></label>
      <label>m²<input name="mq" type="number" inputmode="numeric"></label>
      <label>Locali<select name="locali"><option value="">?</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label>Zona<select name="zona"><option value="">da capire</option>${zones.map(z => `<option>${esc(z)}</option>`).join('')}</select></label>
      <label>Balcone<select name="balcone"><option value="">?</option><option value="si">sì</option><option value="no">no</option></select></label>
    </div>
    <label>Indirizzo<input name="indirizzo" placeholder="via e civico, se lo sai"></label>
    <label>Note<textarea name="note" rows="3" placeholder="Es. visto in vetrina, piano alto, chiedere spese"></textarea></label>
    <button class="btn primary" type="submit">${STATIC ? 'Invia al Mac' : 'Aggiungi e valuta'}</button>
  </form>`;
}
function openAdd() {
  $('#drawer-body').innerHTML = addForm();
  $('#drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
  $$('[data-close]').forEach(b => b.onclick = () => { $('#drawer').classList.remove('open'); document.body.style.overflow = ''; });
  $('#add-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = k => f.get(k) ? Number(f.get(k)) : null;
    const data = { url: f.get('url'), prezzo: num('prezzo'), mq: num('mq'), locali: num('locali'), zona: f.get('zona') || null, indirizzo: f.get('indirizzo') || null,
      balcone: f.get('balcone') === 'si' ? true : f.get('balcone') === 'no' ? false : null, note: f.get('note') || null };
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    if (STATIC) {
      if (await sendCommand('aggiungi', data, data.zona ?? '')) { $('#drawer').classList.remove('open'); document.body.style.overflow = ''; }
      else btn.disabled = false;
      return;
    }
    btn.textContent = 'Leggo e valuto…';
    try {
      const r = await fetch('/api/aggiungi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
      S.houses = await api('/api/case');
      toast(`Aggiunta: ${r.score ?? '?'} punti`);
      openHouse(r.id);
    } catch { toast('Non sono riuscito ad aggiungerla'); btn.disabled = false; }
  };
}

// ——— Scheda ———
let D = null;
async function openHouse(id) {
  const d = await api(`/api/casa/${encodeURIComponent(id)}`);
  D = { ...d, photo: 0 };
  $('#drawer-body').innerHTML = drawer(d);
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  bindDrawer();
  if (!d.seen) { api('/api/viste', { ids: [id] }); const h = S.houses.find(x => x.id === id); if (h) h.seen = true; }
  history.replaceState(null, '', `#casa=${encodeURIComponent(id)}`);
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (D?.miniMap) D.miniMap.remove();
  D = null;
  history.replaceState(null, '', location.pathname);
  renderChrome();
  if (lists[S.view]) { const y = scrollY; render(); scrollTo(0, y); }
}

function drawer(d) {
  const zm = d.zoneMedian && d.price && d.sqm ? Math.round((d.price / d.sqm / d.zoneMedian - 1) * 100) : null;
  const x = d.extracted ?? {};
  const statuses = [['preferito', 'Preferita'], ['da-vedere', 'Da vedere'], ['visitato', 'Visitata'], ['scartato', 'Scartata']];
  return `
  <div class="d-gallery">
    <div class="d-main">${d.photos.length ? `<img id="d-img" src="${esc(d.photos[0])}" alt="" referrerpolicy="no-referrer">` : `<div class="ph-empty">${ICON.house}</div>`}
      ${d.photos.length > 1 ? `<button class="d-nav prev" data-ph="-1" aria-label="Foto precedente">${ICON.left}</button><button class="d-nav next" data-ph="1" aria-label="Foto successiva">${ICON.right}</button><span class="d-count" id="d-count">1 / ${d.photos.length}</span>` : ''}
    </div>
    ${d.photos.length > 1 ? `<div class="d-thumbs">${d.photos.slice(0, 30).map((p, i) => `<img src="${esc(p)}" data-i="${i}" class="${i ? '' : 'on'}" loading="lazy" referrerpolicy="no-referrer" alt="">`).join('')}</div>` : ''}
  </div>
  <section class="d-sec">
    <div class="d-title">
      <div>
        <h2 class="num">${eur(d.price)}</h2>
        <div class="facts num"><b>${d.rooms ? roomWord(d.rooms) : 'locali n.d.'}</b>${d.sqm ? ` · ${d.sqm} m²` : ''}${d.price && d.sqm ? ` · ${fmt(d.price / d.sqm)} €/m²` : ''}</div>
        <div class="where" style="margin-top:6px"><span class="tier ${d.tier ?? ''}"></span>${esc(d.zone ?? 'Zona da capire')}${d.area ? ` <small>${esc(title(d.area))}</small>` : ''}${d.address ? ` <small>· ${esc(d.address)}</small>` : ''}</div>
      </div>
      <div class="score ${scoreClass(d.score)}">${d.score}</div>
    </div>
    <div class="d-facts num">
      ${fact('Piano', d.floor ? floorText(d.floor) : null)}
      ${fact('Balcone', d.terrace ? 'terrazzo' : d.balcony === true ? 'sì' : d.balcony === false ? 'no' : 'da chiedere')}
      ${fact('Ascensore', d.elevator === true ? 'sì' : d.elevator === false ? 'no' : null)}
      ${fact('Bagni', d.bathrooms)}
      ${fact('Classe', d.energy)}
      ${fact('Stato', d.condition)}
      ${fact('Aria condizionata', d.airCon === 'si' ? 'sì' : d.airCon === 'predisposizione' ? 'predisposta' : d.airCon === 'no' ? 'no' : null)}
      ${fact('Riscaldamento', x.heating)}
      ${fact('Spese cond.', x.condoFees ? `${x.condoFees} €/mese` : null)}
      ${published(d)}
    </div>
    <div class="status-row">
      ${statuses.map(([s, l]) => `<button class="chip ${d.status === s ? 'on' : ''}" data-status="${s}">${l}</button>`).join('')}
    </div>
  </section>
  ${contactHtml(d)}
  ${d.traps?.length ? `<section class="d-sec">${d.traps.map(t => `<div class="alert">${ICON.warn}<div><b>${esc(cap(t))}.</b> ${esc(TRAP_TEXT[t] ?? '')}</div></div>`).join('')}</section>` : ''}
  <section class="d-sec">
    <h3>Perché ${d.score} su 100</h3>
    <div class="bars">${d.parts.map(p => {
      const r = p.pts / p.max;
      return `<div class="bar"><div class="bar-label">${esc(p.label)}</div><div class="bar-track"><span class="${r >= .7 ? '' : r >= .4 ? 'mid' : 'lo'}" style="width:${Math.max(3, r * 100)}%"></span></div><div class="bar-pts num">${p.pts}/${p.max}</div><div class="bar-note">${esc(p.note)}</div></div>`;
    }).join('')}</div>
    ${d.why?.length ? `<div class="why">${d.why.map(w => `<span class="pill warn">${esc(w)}</span>`).join('')}</div>` : ''}
    ${zm != null ? `<p class="fine">Confronto con la mediana degli annunci raccolti in ${esc(d.zone)}: ${fmt(d.zoneMedian)} €/m² (stessa fascia di prezzo). È un confronto fra prezzi chiesti, non fra prezzi di vendita.</p>` : ''}
  </section>
  ${negotiationHtml(d)}
  ${exposureHtml(d)}
  ${d.history?.length > 1 ? `<section class="d-sec"><h3>Prezzo nel tempo</h3>${spark(d.history)}</section>` : ''}
  <section class="d-sec">
    <h3>Da chiedere all'agenzia <button class="btn small ghost" id="copy-q" style="float:right;margin-top:-6px">${ICON.copy} Copia</button></h3>
    <ol class="qs">${d.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
  </section>
  <section class="d-sec">
    <h3>Quanto ti costa</h3>
    ${calcHtml(d)}
  </section>
  ${d.description ? `<section class="d-sec"><h3>Descrizione</h3><div class="desc" id="desc">${esc(d.description)}</div><button class="btn small ghost" id="more" style="margin-top:6px">Leggi tutto</button></section>` : ''}
  ${d.lat ? `<section class="d-sec"><h3>Dove${d.geoSrc === 'indirizzo' ? ' (dall\'indirizzo)' : d.geoSrc === 'testo' ? '' : ''}</h3><div class="d-map" id="d-map"></div></section>` : ''}
  <section class="d-sec">
    <h3>Dove è pubblicata</h3>
    <div class="src-list">${d.sources.map(s => `<a class="src-item" href="${esc(s.url)}" target="_blank" rel="noopener"><div><b>${esc(SOURCE_NAMES[s.source] ?? s.source)}</b>${s.agency ? ` · ${esc(s.agency)}` : ''}<small>${s.active ? `visto ${ago(s.lastSeen)}` : 'non più online'} · ${eur(s.price)}</small></div>${ICON.ext}</a>`).join('')}</div>
  </section>
  <section class="d-sec">
    <h3>I tuoi appunti</h3>
    <textarea class="note" id="note" placeholder="Es. visto il 12, luminoso ma rumoroso sul lato strada…">${esc(d.note ?? '')}</textarea>
  </section>`;
}
function published(d) {
  const p = d.sources.map(s => s.publishedAt).filter(Boolean).sort()[0];
  if (p) return fact('Pubblicata', new Date(p).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }));
  return fact('Trovata', ago(d.firstSeen));
}
const cap = s => s[0].toUpperCase() + s.slice(1);
const fact = (l, v) => v == null || v === '' ? '' : `<div class="fact"><span>${l}</span><b>${esc(v)}</b></div>`;
const TRAP_TEXT = {
  'asta giudiziaria': 'Il prezzo è una base d\'asta: si compra con offerta in tribunale, tempi e regole diversi, spesso niente visita libera.',
  'già venduto o in trattativa': 'L\'annuncio (o una foto) dice che è venduto o in trattativa: probabilmente non è più disponibile.',
  'nuda proprietà': 'Compri la casa ma ci vive un altro (di solito a vita): per questo costa meno.',
  'usufrutto': 'C\'è un usufrutto: verifica chi ha il diritto di abitarci e fino a quando.',
  'già affittato': 'C\'è un inquilino: non puoi entrare finché il contratto non scade.',
  'rent to buy': 'Non è una vendita classica: si paga un canone con riscatto futuro.',
  'seminterrato': 'Parte della casa è sotto il livello della strada.',
  'solo una quota': 'In vendita c\'è solo una parte della proprietà.',
  'non residenziale': 'Potrebbe non essere accatastato come abitazione: conta per mutuo e agevolazioni prima casa.',
};

// ——— Contatta l'agenzia ———
const fmtPhone = p => p.startsWith('3') ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : `${p.slice(0, 3)} ${p.slice(3)}`;
function messageFor(d) {
  const p = S.state.prefs;
  const casa = `${d.rooms ? roomWord(d.rooms) : 'appartamento'}${d.sqm ? ` di ${d.sqm} m²` : ''}`;
  const dove = [d.zone, d.address].filter(Boolean).join(', ');
  const url = d.sources?.[0]?.url ?? d.url;
  const qs = (d.questions ?? []).filter(q => !/margine sul prezzo/i.test(q)).slice(0, 4);
  const subject = `Richiesta informazioni: ${casa}${d.zone ? `, ${d.zone}` : ''}${d.price ? ` (${eur(d.price)})` : ''}`;
  const body = [
    'Buongiorno,', '',
    `vi scrivo per l'annuncio del ${casa}${dove ? ` in ${dove}` : ''}${d.price ? ` a ${eur(d.price)}` : ''}:`, url, '',
    qs.length ? 'La casa mi interessa e prima di vederla vorrei sapere:' : 'La casa mi interessa.',
    ...qs.map(q => `- ${q}`), '',
    'Se è ancora disponibile potrei passare a vederla nei prossimi giorni. Mi indicate qualche orario?', '',
    'Grazie, buona giornata', p.contactName || '', p.contactPhone || '',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const wa = `Buongiorno, vi contatto per l'annuncio del ${casa}${d.zone ? ` in zona ${d.zone}` : ''}${d.price ? ` a ${eur(d.price)}` : ''} (${url}). È ancora disponibile? Potrei vederla nei prossimi giorni.${p.contactName ? ` ${p.contactName}` : ''}`;
  return { subject, body, wa };
}
function contactHtml(d) {
  const c = d.contatti ?? { emails: [], phones: [], via: [] };
  const agency = c.agency ?? d.sources?.find(s => s.agency)?.agency ?? null;
  const m = messageFor(d);
  const via = { annuncio: 'dall\'annuncio', pagina: 'dalla pagina dell\'annuncio', ricerca: 'da una ricerca sul nome dell\'agenzia' };
  return `<section class="d-sec contact">
    <h3>Contatta ${agency && !/^privat/i.test(agency) ? esc(agency) : 'chi vende'}</h3>
    <div class="ct-who">
      ${c.emails.map(e => `<span class="pill ok">${esc(e)}</span>`).join('')}
      ${c.phones.map(p => `<a class="pill" href="tel:${esc(p)}">${esc(fmtPhone(p))}</a>`).join('')}
      ${!c.emails.length && !c.phones.length ? '<span class="pill warn">nessun contatto trovato: Gmail si apre con il messaggio pronto, aggiungi tu l\'indirizzo, oppure scrivi dal portale</span>' : ''}
    </div>
    ${c.via?.length ? `<p class="fine" style="margin-top:6px">Trovati ${c.via.map(v => via[v] ?? v).join(' e ')}. Controlla prima di inviare.</p>` : ''}
    <label class="ct-l">Oggetto<input id="ct-subject" value="${esc(m.subject)}"></label>
    <label class="ct-l">Messaggio<textarea id="ct-body" rows="11">${esc(m.body)}</textarea></label>
    <div class="ct-actions">
      <button class="btn primary" id="ct-gmail">${ICON.ext} Apri in Gmail</button>
      <button class="btn" id="ct-copy">${ICON.copy} Copia</button>
      <a class="btn" id="ct-mailto" href="#">Altra app mail</a>
      ${c.phones.filter(p => p.startsWith('3')).slice(0, 1).map(p => `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/39${esc(p)}?text=${encodeURIComponent(m.wa)}">WhatsApp</a>`).join('')}
      ${c.phones.slice(0, 1).map(p => `<a class="btn" href="tel:${esc(p)}">Chiama ${esc(fmtPhone(p))}</a>`).join('')}
      <a class="btn ghost" target="_blank" rel="noopener" href="${esc(d.sources?.[0]?.url ?? d.url)}">Scrivi dal portale</a>
    </div>
  </section>`;
}
function bindContact() {
  if (!$('#ct-gmail')) return;
  const to = (D.contatti?.emails ?? []).join(',');
  const val = () => ({ su: $('#ct-subject').value, body: $('#ct-body').value });
  $('#ct-gmail').onclick = () => {
    const v = val();
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(v.su)}&body=${encodeURIComponent(v.body)}`, '_blank');
    navigator.clipboard?.writeText(v.body).catch(() => {});
  };
  $('#ct-copy').onclick = () => { const v = val(); navigator.clipboard.writeText(`${v.su}\n\n${v.body}`).then(() => toast('Messaggio copiato')); };
  $('#ct-mailto').onclick = e => { const v = val(); e.currentTarget.href = `mailto:${to}?subject=${encodeURIComponent(v.su)}&body=${encodeURIComponent(v.body)}`; };
}

function negotiationHtml(d) {
  const t = d.trattativa;
  if (!t || !d.price) return '';
  const kinds = { mercato: 'Mercato', costi: 'Costi a tuo carico', difetto: 'Difetti' };
  const groups = Object.entries(kinds).map(([k, label]) => [label, t.levers.filter(l => l.kind === k)]).filter(([, ls]) => ls.length);
  return `<section class="d-sec">
    <h3>Per trattare <button class="btn small ghost" id="copy-neg" style="float:right;margin-top:-6px">${ICON.copy} Copia</button></h3>
    <div class="offer num">
      <div class="fact main"><span>Offerta di apertura</span><b>${eur(t.offer)}</b></div>
      <div class="fact"><span>Dove puntare a chiudere</span><b>${eur(t.target)}</b></div>
      <div class="fact"><span>Margine stimato</span><b>−${String(t.pct).replace('.', ',')}%</b></div>
    </div>
    ${groups.map(([label, ls]) => `<div class="lev-group"><div class="lev-label">${label}</div><ul class="levers">${ls.map(l => `<li><span>${esc(l.text)}</span>${l.pct ? `<b class="num">−${String(l.pct).replace('.', ',')}%</b>` : ''}</li>`).join('')}</ul></div>`).join('')}
    <p class="fine">Il margine parte da un 3% che si concede quasi sempre e somma il peso di ogni leva, fino a un massimo del 15%. Sono stime per prepararsi: il prezzo finale dipende da quanta fretta ha chi vende e da chi altro offre.</p>
  </section>`;
}

function compass(dirs, front, back) {
  const ang = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };
  const arrow = (d, cls) => { const a = (ang[d] - 90) * Math.PI / 180; const x = 60 + Math.cos(a) * 40, y = 60 + Math.sin(a) * 40; return `<line x1="60" y1="60" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="${cls}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="${cls}-dot"/>`; };
  const arrows = front ? arrow(front, 'cmp-front') + arrow(back, 'cmp-back') : '';
  const known = dirs.filter(d => d !== front && d !== back || !front).map(d => arrow(d, 'cmp-known')).join('');
  return `<svg class="compass" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M60 60 L${60 + 50 * Math.cos(Math.PI * 0.25)} ${60 + 50 * Math.sin(Math.PI * 0.25)} A50 50 0 0 1 ${60 + 50 * Math.cos(Math.PI * 0.75)} ${60 + 50 * Math.sin(Math.PI * 0.75)} Z" class="cmp-sun"/>
    <circle cx="60" cy="60" r="50" class="cmp-ring"/>
    <text x="60" y="8" class="cmp-l">N</text><text x="60" y="118" class="cmp-l">S</text><text x="115" y="64" class="cmp-l">E</text><text x="5" y="64" class="cmp-l">O</text>
    ${arrows}${known}<circle cx="60" cy="60" r="5" class="cmp-c"/>
  </svg>`;
}

function exposureHtml(d) {
  const e = d.esposizione;
  if (!e) return '';
  const st = e.street, ph = e.photos;
  const textDirs = e.source === 'descrizione' || e.source === 'fonte' ? e.dirs : [];
  const lines = [];
  if (textDirs.length) lines.push(`<li><b>${e.source === 'fonte' ? 'Dall\'annuncio' : 'Dalla descrizione'}:</b> esposto a ${textDirs.map(x => DIR_NAME[x]).join(' e ')}${e.doppia ? ', doppia esposizione' : ''}.</li>`);
  else if (e.doppia) lines.push('<li><b>Dalla descrizione:</b> doppia esposizione.</li>');
  if (st) lines.push(`<li><b>Dalla via:</b> il palazzo affaccia su ${esc(st.street ?? 'strada')} verso <b>${DIR_NAME[st.front]}</b>; il retro guarda a <b>${DIR_NAME[st.back]}</b>. Un appartamento su un solo lato prende una delle due. <small>(affidabilità ${st.confidence})</small></li>`);
  if (ph) {
    lines.push(`<li><b>Dalle foto:</b> luce ${ph.luce}${ph.sole_diretto ? ', sole diretto visibile' : ''}; affaccio su ${esc(ph.affaccio)}${ph.vista ? `; vista ${esc(ph.vista)}` : ''}.</li>`);
    if (ph.da_verificare?.length) lines.push(`<li><b>Le foto non mostrano:</b> ${esc(ph.da_verificare.join('; '))}. Chiedi di vederlo.</li>`);
    if (ph.indizi_orientamento) lines.push(`<li><b>Indizi sull'orientamento:</b> ${esc(ph.indizi_orientamento)}</li>`);
  }
  if (!lines.length) lines.push('<li>Nessuna informazione ancora: l\'annuncio non la dice e la posizione non è abbastanza precisa. Chiedila all\'agenzia.</li>');
  return `<section class="d-sec">
    <h3>Esposizione e luce</h3>
    <div class="expo">${compass(e.dirs ?? [], st?.front, st?.back)}<ul class="expo-list">${lines.join('')}</ul></div>
    ${ph?.punti_forti?.length ? `<div class="lev-group"><div class="lev-label">Punti forti visti nelle foto</div><div class="pills">${ph.punti_forti.map(x => `<span class="pill ok">${esc(x)}</span>`).join('')}</div></div>` : ''}
    <p class="fine">In verde la metà sud della bussola, quella che prende più sole. Linea piena: facciata sulla strada; tratteggiata: il retro.</p>
  </section>`;
}

function spark(hist) {
  // Più agenzie possono avere prezzi diversi: per ogni giorno conta il più basso.
  const byDay = new Map();
  for (const h of hist) { const d = h.seen_at.slice(0, 10); byDay.set(d, Math.min(byDay.get(d) ?? Infinity, h.price)); }
  const pts = [...byDay].sort().map(([d, p]) => ({ t: Date.parse(d), p }));
  if (pts.length < 2) return `<p class="fine">Prezzo stabile a ${eur(pts[0]?.p)}.</p>`;
  const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t)) || t0 + 1;
  const p0 = Math.min(...pts.map(p => p.p)), p1 = Math.max(...pts.map(p => p.p));
  const X = t => 10 + (t - t0) / Math.max(1, t1 - t0) * 580, Y = p => p1 === p0 ? 35 : 60 - (p - p0) / (p1 - p0) * 50;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.p).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 600 70" preserveAspectRatio="none"><path d="${path}" stroke="var(--persiana)" stroke-width="2" fill="none" vector-effect="non-scaling-stroke"/>${pts.map(p => `<circle cx="${X(p.t)}" cy="${Y(p.p)}" r="3" fill="var(--persiana)"><title>${eur(p.p)} · ${new Date(p.t).toLocaleDateString('it-IT')}</title></circle>`).join('')}</svg>
  <p class="fine">Da ${eur(pts[0].p)} a ${eur(pts.at(-1).p)} (il prezzo più basso fra le agenzie, giorno per giorno).</p>`;
}

function calcHtml(d) {
  const m = S.state.prefs.mortgage;
  return `
  <div class="calc">
    <label>Anticipo %<input type="number" id="c-down" value="${m.downPct}" min="0" max="100" step="5"></label>
    <label>Tasso fisso %<input type="number" id="c-rate" value="${m.rate}" min="0" max="10" step="0.1"></label>
    <label>Anni<input type="number" id="c-years" value="${m.years}" min="5" max="40" step="5"></label>
  </div>
  <div class="calc-out num" id="calc-out"></div>
  <p class="fine">Stime: provvigione d'agenzia 3% + IVA se c'è un'agenzia; imposte prima casa da privato su valore catastale (qui stimate al 2% del prezzo, di solito sono meno); notaio e perizia circa 3.500 €. Da confermare con notaio e banca.</p>`;
}
function calc() {
  if (!D) return;
  const price = D.price ?? 0;
  const down = Number($('#c-down').value) / 100, rate = Number($('#c-rate').value), years = Number($('#c-years').value);
  const loan = price * (1 - down);
  const r = rate / 1200, n = years * 12;
  const rata = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
  const agency = D.sources.some(s => s.agency && !/privat/i.test(s.agency)) || !D.sources.every(s => ['subito', 'casadaprivato'].includes(s.source));
  const fee = agency ? price * 0.03 * 1.22 : 0;
  const tax = price * 0.02, notary = 3500;
  $('#calc-out').innerHTML = `
    <div class="fact main"><span>Rata mensile</span><b>${eur(rata)}</b></div>
    <div class="fact"><span>Mutuo</span><b>${eur(loan)}</b></div>
    <div class="fact"><span>Da avere subito</span><b>${eur(price * down + fee + tax + notary)}</b></div>
    <div class="fact"><span>di cui agenzia</span><b>${agency ? eur(fee) : 'privato'}</b></div>`;
}

function bindDrawer() {
  $$('[data-close]').forEach(b => b.onclick = closeDrawer);
  const setPh = i => {
    if (!D.photos.length) return;
    D.photo = (i + D.photos.length) % D.photos.length;
    $('#d-img').src = D.photos[D.photo];
    $('#d-count').textContent = `${D.photo + 1} / ${D.photos.length}`;
    $$('.d-thumbs img').forEach((t, j) => t.classList.toggle('on', j === D.photo));
  };
  $$('[data-ph]').forEach(b => b.onclick = () => setPh(D.photo + Number(b.dataset.ph)));
  $$('.d-thumbs img').forEach(t => t.onclick = () => setPh(Number(t.dataset.i)));
  $$('.status-row .chip').forEach(b => b.onclick = async () => {
    const st = D.status === b.dataset.status ? null : b.dataset.status;
    await setStatus(D.id, st);
    D.status = st;
    $$('.status-row .chip').forEach(c => c.classList.toggle('on', c.dataset.status === st));
  });
  $('#more')?.addEventListener('click', e => { $('#desc').classList.toggle('open'); e.target.textContent = $('#desc').classList.contains('open') ? 'Riduci' : 'Leggi tutto'; });
  $('#copy-q')?.addEventListener('click', () => {
    const txt = `${D.title}\n${D.sources[0]?.url}\n\n` + D.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Domande copiate'));
  });
  $('#copy-neg')?.addEventListener('click', () => {
    const t = D.trattativa;
    const txt = `${D.title}\n${D.sources[0]?.url}\nPrezzo chiesto ${eur(D.price)} · offerta di apertura ${eur(t.offer)} · obiettivo ${eur(t.target)}\n\n` + t.levers.map(l => `- ${l.text}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Argomenti per trattare copiati'));
  });
  bindContact();
  ['c-down', 'c-rate', 'c-years'].forEach(id => $('#' + id).oninput = calc);
  calc();
  let t;
  $('#note').oninput = e => { clearTimeout(t); t = setTimeout(async () => { await api(`/api/casa/${encodeURIComponent(D.id)}/stato`, { status: D.status, note: e.target.value }); const h = S.houses.find(x => x.id === D.id); if (h) h.note = e.target.value; toast('Appunto salvato'); }, 700); };
  if (D.lat && window.L) {
    D.miniMap = L.map('d-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([D.lat, D.lon], 15);
    tiles().addTo(D.miniMap);
    L.marker([D.lat, D.lon], { icon: pinIcon(D) }).addTo(D.miniMap);
  }
}

async function setStatus(id, status) {
  await api(`/api/casa/${encodeURIComponent(id)}/stato`, { status });
  const h = S.houses.find(x => x.id === id);
  if (h) { h.status = status; h.seen = true; }
  toast({ preferito: 'Salvata fra le preferite', 'da-vedere': 'Segnata da vedere', visitato: 'Segnata come visitata', scartato: 'Scartata: non la vedrai più nei suggerimenti' }[status] ?? 'Tolta dalle salvate');
  renderChrome();
}

// ——— Mappa ———
const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
const pinIcon = h => L.divIcon({ className: '', html: `<div class="pin ${scoreClass(h.score)}"><b>${h.score}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
function mapView() {
  const f = S.mapFilter ?? (S.mapFilter = store.get('mapFilter', 'buone'));
  const opts = [['buone', 'Da guardare'], ['tutte-buone', '+ da verificare'], ['salvate', 'Salvate']];
  return `<div class="head"><div><h1>Mappa</h1><p>Tocca un segnaposto per l'anteprima, poi «Apri scheda». In verde le tue zone, in ocra quelle vicine.</p></div></div>
  <div class="filters">${opts.map(([v, l]) => `<button class="chip ${f === v ? 'on' : ''}" data-mapf="${v}">${l}</button>`).join('')}<span class="sep"></span><span class="map-count" id="map-count"></span></div>
  <div class="map-wrap"><div id="map"></div>
    <div class="map-legend"><div><i style="background:var(--persiana)"></i>Le tue zone</div><div><i style="background:var(--ocra)"></i>Zone vicine</div><div><span class="pin-mini hi"></span>78+ punti</div></div>
  </div>`;
}
function mapHouses() {
  const f = S.mapFilter;
  return S.houses.filter(h => h.lat && (f === 'salvate' ? saved(h) : h.active && h.status !== 'scartato' && (h.verdict === 'suggerita' || (f === 'tutte-buone' && h.verdict === 'da-verificare'))));
}
function mapPopup(h) {
  const img = h.photos[0] ? `<img src="${esc(h.photos[0])}" referrerpolicy="no-referrer" alt="">` : '';
  return `<div class="mp">${img}<div class="mp-body"><div class="mp-top"><b class="num">${eur(h.price)}</b><span class="score mini ${scoreClass(h.score)}">${h.score}</span></div>
    <div class="facts num">${h.rooms ? roomWord(h.rooms) : ''}${h.sqm ? ` · ${h.sqm} m²` : ''}</div><div class="mp-zone">${esc(h.zone ?? '')}</div>
    <button class="btn primary small" data-open-house="${esc(h.id)}">Apri scheda</button></div></div>`;
}
async function drawMap() {
  if (!window.L) return;
  S.map = L.map('map', { zoomControl: true, tap: true }).setView([44.494, 11.29], 13);
  tiles().addTo(S.map);
  const prefs = S.state.prefs;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const styleFor = t => t === 'target' ? { color: css('--persiana'), weight: 2, fillOpacity: .2 } : t === 'vicina' ? { color: css('--ocra'), weight: 1.2, fillOpacity: .14 } : { color: css('--line-2'), weight: .6, fillOpacity: 0 };
  const label = p => ({ 'XXI APRILE': 'Andrea Costa', 'VIA DEL GENIO': 'Andrea Costa', 'STADIO-MELONCELLO': 'Andrea Costa', 'RAVONE': 'Andrea Costa', 'SAN GIUSEPPE': 'Saragozza', 'SAN LUCA': 'Saragozza' }[p.area] ?? ({ A: 'Barca', C: 'Borgo Panigale', S: 'Santa Viola', P: 'Saffi', L: 'Malpighi' }[p.zona]));
  const [aree, comuni] = await Promise.all([fetch('aree.geojson').then(r => r.json()), fetch('comuni.geojson').then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (!S.map) return;
  const zoneLayer = L.geoJSON(aree, {
    style: f => styleFor(prefs.zones[label(f.properties)]),
    onEachFeature: (f, layer) => { const l = label(f.properties); if (prefs.zones[l]) layer.bindTooltip(`${l} · ${title(f.properties.area)}`, { sticky: true }); },
    interactive: !matchMedia('(pointer: coarse)').matches,
  }).addTo(S.map);
  if (comuni) L.geoJSON(comuni, {
    style: f => styleFor(prefs.zones[f.properties.comune]),
    onEachFeature: (f, layer) => layer.bindTooltip(f.properties.comune, { sticky: true }),
    interactive: !matchMedia('(pointer: coarse)').matches,
  }).addTo(S.map);
  const pts = mapHouses();
  $('#map-count').textContent = `${pts.length} ${pts.length === 1 ? 'casa' : 'case'}`;
  const markers = pts.map(h => L.marker([h.lat, h.lon], { icon: pinIcon(h), zIndexOffset: h.score * 10, riseOnHover: true })
    .bindPopup(mapPopup(h), { maxWidth: 260, minWidth: 220, className: 'mp-wrap', autoPanPadding: [20, 70] }).addTo(S.map));
  // Inquadra le case visibili (o le tue zone se non ce ne sono).
  const group = markers.length ? L.featureGroup(markers) : zoneLayer;
  try { S.map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 15 }); } catch {}
  S.map.on('popupopen', e => {
    const b = e.popup.getElement()?.querySelector('[data-open-house]');
    if (b) b.onclick = () => { S.map.closePopup(); openHouse(b.dataset.openHouse); };
  });
}

// ——— Mercato ———
async function marketView() {
  const m = await api('/api/mercato');
  S.market = m;
  if (S.view !== 'mercato') return;
  const zones = m.zones.filter(z => z.zone !== 'Fuori zona');
  const maxPpm = Math.max(...zones.map(z => z.ppm ?? 0), 1);
  const order = { target: 0, vicina: 1, altro: 2 };
  zones.sort((a, b) => order[a.tier] - order[b.tier] || (b.ppm ?? 0) - (a.ppm ?? 0));
  $('#main').innerHTML = `
  <div class="head"><div><h1>Mercato</h1><p>Prezzi chiesti negli annunci raccolti, nella tua fascia di prezzo. Servono a capire se una casa è cara per la sua zona, non sono prezzi di rogito.</p></div></div>
  <div class="panels">
    <div class="panel">
      <h2>€/m² per zona</h2><p>Mediana degli annunci attivi${m.cityPpm ? `; Bologna nel complesso ${fmt(m.cityPpm)} €/m²` : ''}.</p>
      <table class="ztable num"><thead><tr><th>Zona</th><th class="r">€/m²</th><th class="r">Case</th><th class="r">Trilocali</th><th class="r">Nuove 7gg</th></tr></thead><tbody>
      ${zones.map(z => `<tr class="${z.tier}"><td>${esc(z.zone)}<div class="hbar"><span class="${z.tier}" style="width:${(z.ppm ?? 0) / maxPpm * 100}%"></span></div></td><td class="r">${z.ppm ? fmt(z.ppm) : '<small>pochi dati</small>'}</td><td class="r">${z.count}</td><td class="r">${z.trilocali}</td><td class="r">${z.newWeek}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="panel">
      <h2>Prezzo e superficie</h2><p>Ogni punto è una casa nelle tue zone o vicine. In basso a destra quelle che offrono più metri per il prezzo; la fascia verde è il tuo budget.</p>
      ${scatter(m)}
    </div>
    <div class="panel">
      <h2>Ribassi</h2><p>Case il cui prezzo è sceso da quando le seguiamo.</p>
      ${m.drops.length ? `<div class="src-list">${m.drops.map(h => `<a class="src-item" href="#" data-open="${esc(h.id)}"><div><b>${eur(h.price)}</b> <span style="color:var(--persiana)">−${Math.round(h.dropPct)}%</span><small>${esc(h.zone ?? '')} · ${h.rooms ? roomWord(h.rooms) : ''} ${h.sqm ? h.sqm + ' m²' : ''} · era ${eur(h.firstPrice)}</small></div>${ICON.right}</a>`).join('')}</div>` : '<p class="fine">Ancora nessun ribasso: servono un po\' di giorni di osservazione.</p>'}
    </div>
  </div>`;
  $$('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openHouse(a.dataset.open); });
  $$('.scatter circle').forEach(c => c.onclick = () => openHouse(c.dataset.id));
}
function scatter(m) {
  const prefs = S.state.prefs;
  const hs = S.houses.filter(h => h.active && h.price && h.sqm && h.sqm < 200 && (h.tier === 'target' || h.tier === 'vicina'));
  if (hs.length < 3) return '<p class="fine">Servono più case con superficie nota.</p>';
  const W = 520, H = 320, L0 = 46, B0 = 30;
  const xs = hs.map(h => h.sqm), ys = hs.map(h => h.price);
  const x0 = Math.floor(Math.min(...xs) / 10) * 10, x1 = Math.ceil(Math.max(...xs) / 10) * 10;
  const y0 = Math.floor(Math.min(...ys, prefs.budgetMin) / 20000) * 20000, y1 = Math.ceil(Math.max(...ys) / 20000) * 20000;
  const X = v => L0 + (v - x0) / (x1 - x0 || 1) * (W - L0 - 10), Y = v => H - B0 - (v - y0) / (y1 - y0 || 1) * (H - B0 - 10);
  const css = v => `var(${v})`;
  let g = '';
  for (let v = y0; v <= y1; v += 20000) g += `<line class="grid" x1="${L0}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L0 - 6}" y="${Y(v) + 4}" text-anchor="end">${k(v)}</text>`;
  for (let v = x0; v <= x1; v += 20) g += `<text x="${X(v)}" y="${H - 10}" text-anchor="middle">${v} m²</text>`;
  const band = `<rect class="budget" x="${L0}" width="${W - L0 - 10}" y="${Y(Math.min(prefs.budgetMax, y1))}" height="${Math.max(0, Y(Math.max(prefs.budgetMin, y0)) - Y(Math.min(prefs.budgetMax, y1)))}"/>`;
  const dots = hs.map(h => `<circle data-id="${esc(h.id)}" cx="${X(h.sqm).toFixed(1)}" cy="${Y(h.price).toFixed(1)}" r="${h.rooms === prefs.idealRooms ? 5.5 : 4}" fill="${css(h.tier === 'target' ? '--persiana' : '--ocra')}" fill-opacity="${h.verdict === 'suggerita' ? .9 : .4}" stroke="var(--surface)" stroke-width="1"><title>${eur(h.price)} · ${h.sqm} m² · ${esc(h.zone)}</title></circle>`).join('');
  return `<svg class="scatter" viewBox="0 0 ${W} ${H}">${band}${g}<line class="axis" x1="${L0}" x2="${W - 10}" y1="${H - B0}" y2="${H - B0}"/>${dots}</svg>
  <p class="fine">Punti grandi: ${roomWord(prefs.idealRooms)}. Pieni: suggerite.</p>`;
}

// ——— Fonti ———
function sourcesView() {
  const st = S.state;
  const p = st.prefs;
  const kinds = { portale: 'portale', agenzia: 'agenzia', privati: 'privati', motore: 'ricerca web' };
  const label = s => s.live ? s.live : s.status === 'ok' ? `${s.found} annunci letti, ${s.new} nuovi · ${ago(s.lastRun)}` : s.status === 'bloccato' ? 'Il sito blocca la lettura automatica' : s.status === 'errore' ? `Errore: ${s.message ?? ''}` : 'Non ancora letta';
  const q = new URLSearchParams({ prezzoMinimo: p.budgetMin, prezzoMassimo: p.budgetMax, localiMinimo: p.idealRooms });
  return `
  <div class="head"><div><h1>Fonti</h1><p>Da dove arrivano le case. Ogni fonte si legge con calma, una pagina alla volta, ogni ${p.intervalHours} ore fra le 7 e le 23.</p></div></div>
  <div class="sources">
    ${st.sources.map(s => `<div class="source"><span class="st ${s.live ? 'in-corso' : s.status}"></span><div><b>${esc(s.name)}</b><span class="kind">${kinds[s.kind] ?? s.kind}</span><small>${esc(label(s))}</small></div><div class="num" style="text-align:right"><b>${s.active}</b><small>attivi</small></div></div>`).join('')}
  </div>
  <div class="blocked-box">
    <h2>Immobiliare.it, Idealista, Casa.it</h2>
    <p>Questi tre portali rispondono ai programmi con una verifica anti-robot (DataDome), quindi il tool non li legge direttamente e non prova ad aggirarla. Due strade: la fonte «ricerca web» trova i loro annunci nuovi attraverso un motore di ricerca; e una ricerca salvata sul portale ti manda le novità per email. I link qui sotto aprono la ricerca con il tuo budget.</p>
    <div class="blocked-links">
      <a class="btn small" target="_blank" rel="noopener" href="https://www.immobiliare.it/vendita-case/bologna/?${q}">${ICON.ext} Immobiliare.it</a>
      <a class="btn small" target="_blank" rel="noopener" href="https://www.idealista.it/vendita-case/bologna-bologna/con-prezzo_${p.budgetMax},prezzo-min_${p.budgetMin},trilocali-3/">${ICON.ext} Idealista</a>
      <a class="btn small" target="_blank" rel="noopener" href="https://www.casa.it/vendita/residenziale/bologna/?priceMin=${p.budgetMin}&priceMax=${p.budgetMax}">${ICON.ext} Casa.it</a>
    </div>
  </div>
  ${st.progress.log.length ? `<div class="log">${esc(st.progress.log.join('\n'))}</div>` : ''}`;
}

// ——— Impostazioni ———
function settingsView() {
  const p = S.state.prefs;
  const labels = [...new Set([...Object.keys(p.zones), ...S.state.labels])].filter(l => l !== 'Fuori zona');
  const order = { target: 0, vicina: 1 };
  labels.sort((a, b) => (order[p.zones[a]] ?? 2) - (order[p.zones[b]] ?? 2) || a.localeCompare(b));
  return `
  <div class="head"><div><h1>Cosa cerchi</h1><p>${STATIC ? 'Questa è la copia online, in sola lettura: i criteri si cambiano dal Mac, su http://localhost:4400.' : 'Cambia i criteri e i punteggi si ricalcolano subito su tutte le case già trovate.'}</p></div></div>
  <form class="form" id="prefs">
    <div class="field"><span class="lbl">Budget</span><p>Le case fino al ${Math.round(p.tolerance * 100)}% sopra il massimo finiscono in «Da verificare»: sul prezzo chiesto spesso si tratta.</p>
      <div class="row"><label>Minimo €<input type="number" name="budgetMin" value="${p.budgetMin}" step="5000"></label><label>Massimo €<input type="number" name="budgetMax" value="${p.budgetMax}" step="5000"></label><label>Margine trattativa %<input type="number" name="tolerance" value="${Math.round(p.tolerance * 100)}" step="1" min="0" max="20"></label></div></div>
    <div class="field"><span class="lbl">La casa</span>
      <div class="row"><label>Locali ideali<select name="idealRooms">${[2, 3, 4].map(n => `<option value="${n}" ${p.idealRooms === n ? 'selected' : ''}>${roomWord(n)}</option>`).join('')}</select></label><label>Superficie minima m²<input type="number" name="minSqm" value="${p.minSqm}" step="5"></label>
      <label>Balcone<select name="balcony">${['obbligatorio', 'preferito', 'indifferente'].map(v => `<option ${p.balcony === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <label class="switch" style="margin-top:12px"><input type="checkbox" name="hideTraps" ${p.hideTraps ? 'checked' : ''}> Nascondi aste, nude proprietà e case già affittate</label></div>
    <div class="field"><span class="lbl">Zone</span><p>«Mia» vale il punteggio pieno, «vicina» la metà, le altre restano solo in «Tutte».</p>
      <div class="zone-grid">${labels.map(l => `<div class="zone-opt"><span>${esc(l)}</span><div class="seg" data-zone="${esc(l)}">${[['target', 'Mia'], ['vicina', 'Vicina'], ['altro', 'No']].map(([v, t]) => `<button type="button" data-v="${v}" class="${(p.zones[l] ?? 'altro') === v ? 'on ' + v : ''}">${t}</button>`).join('')}</div></div>`).join('')}</div></div>
    <div class="field"><span class="lbl">Aggiornamento e avvisi</span>
      <div class="row"><label>Ogni quante ore<select name="intervalHours">${[1, 2, 3, 4, 6, 12, 24].map(n => `<option value="${n}" ${p.intervalHours === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>Notifica sul Mac sopra<input type="number" name="notifyScore" value="${p.notifyScore}" min="0" max="100"></label></div></div>
    <div class="field"><span class="lbl">Firma dei messaggi alle agenzie</span>
      <div class="row"><label>Nome<input name="contactName" value="${esc(p.contactName ?? '')}" style="width:220px"></label><label>Telefono<input name="contactPhone" value="${esc(p.contactPhone ?? '')}" style="width:180px" inputmode="tel"></label></div></div>
    <div class="field"><span class="lbl">Mutuo di riferimento</span>
      <div class="row"><label>Anticipo %<input type="number" name="downPct" value="${p.mortgage.downPct}" step="5"></label><label>Tasso fisso %<input type="number" name="rate" value="${p.mortgage.rate}" step="0.1"></label><label>Anni<input type="number" name="years" value="${p.mortgage.years}" step="5"></label></div></div>
    ${STATIC ? `<div class="field"><span class="lbl">Comandi dal telefono</span>
      <p>Senza collegamento, «Aggiorna» e «Aggiungi» aprono GitHub e serve premere «Create». Per un tocco solo: crea un token GitHub «fine-grained» limitato al repository <b>${esc(S.state.commandRepo ?? '')}</b> con il solo permesso <b>Issues: Read and write</b> e incollalo qui. Resta solo su questo dispositivo.</p>
      <p><a class="btn small" target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens/new">Crea il token su GitHub</a></p>
      <div class="row"><label style="flex:1">Token<input type="password" id="gh-token" value="${esc(ghToken() ?? '')}" placeholder="github_pat_…" style="width:100%"></label><button type="button" class="btn" id="save-token">Salva</button></div></div>` : '<div><button class="btn primary" type="submit">Salva e ricalcola</button></div>'}
  </form>`;
}

async function savePrefs(form) {
  const f = new FormData(form);
  const n = k => Number(f.get(k));
  const zones = {};
  $$('.seg[data-zone]', form).forEach(s => { const v = $('button.on', s)?.dataset.v; if (v && v !== 'altro') zones[s.dataset.zone] = v; });
  const body = {
    budgetMin: n('budgetMin'), budgetMax: n('budgetMax'), tolerance: n('tolerance') / 100, idealRooms: n('idealRooms'), minSqm: n('minSqm'),
    balcony: f.get('balcony'), hideTraps: f.get('hideTraps') === 'on', intervalHours: n('intervalHours'), notifyScore: n('notifyScore'),
    mortgage: { downPct: n('downPct'), rate: n('rate'), years: n('years') }, zones,
    contactName: String(f.get('contactName') ?? ''), contactPhone: String(f.get('contactPhone') ?? ''),
  };
  $('button[type=submit]', form).disabled = true;
  await api('/api/preferenze', body);
  toast('Criteri salvati, punteggi ricalcolati');
  await load();
}

// ——— Eventi ———
function bindView() {
  $$('.card').forEach(c => {
    c.onclick = e => {
      const act = e.target.closest('[data-act]');
      if (act?.dataset.act === 'open') return;
      if (act) {
        e.stopPropagation();
        const h = S.houses.find(x => x.id === c.dataset.id);
        const st = h.status === act.dataset.act ? null : act.dataset.act;
        setStatus(h.id, st).then(() => { const y = scrollY; render(); scrollTo(0, y); });
        return;
      }
      openHouse(c.dataset.id);
    };
    c.onkeydown = e => { if (e.key === 'Enter') openHouse(c.dataset.id); };
  });
  $$('[data-zone]').forEach(b => { if (b.classList.contains('chip')) b.onclick = () => { const z = b.dataset.zone; const f = S.filters; f.zones = f.zones.includes(z) ? f.zones.filter(x => x !== z) : [...f.zones, z]; saveFilters(); }; });
  $$('select[data-f]').forEach(s => s.onchange = () => { S.filters[s.dataset.f] = s.value; saveFilters(); });
  $('[data-f="onlyNew"]')?.addEventListener('click', () => { S.filters.onlyNew = !S.filters.onlyNew; saveFilters(); });
  $('[data-f="reset"]')?.addEventListener('click', () => { S.filters = { zones: [], rooms: 'tutti', sort: S.filters.sort, onlyNew: false, maxPrice: null }; saveFilters(); });
  $('#mark-seen')?.addEventListener('click', async () => {
    const ids = lists.suggerite().filter(isNew).map(h => h.id);
    await api('/api/viste', { ids });
    ids.forEach(id => { const h = S.houses.find(x => x.id === id); if (h) h.seen = true; });
    renderChrome(); render();
  });
  $('#sync-states')?.addEventListener('click', () => {
    const changes = Object.fromEntries(Object.entries(local.get()).filter(([, v]) => v.status !== undefined || v.note).map(([k, v]) => [k, { status: v.status ?? null, note: v.note ?? null }]));
    sendCommand('stati', { changes }, `${Object.keys(changes).length} case`);
  });
  $('#push-on')?.addEventListener('click', enablePush);
  $$('#main [data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openHouse(a.dataset.open); });
  $$('[data-mapf]').forEach(b => b.onclick = () => { S.mapFilter = b.dataset.mapf; store.set('mapFilter', S.mapFilter); render(); });
  $('#save-token')?.addEventListener('click', () => { try { const v = $('#gh-token').value.trim(); v ? localStorage.setItem('cb.ghtoken', v) : localStorage.removeItem('cb.ghtoken'); toast(v ? 'Token salvato su questo dispositivo' : 'Token tolto'); } catch {} });
  const form = $('#prefs');
  if (form) {
    form.onsubmit = e => { e.preventDefault(); savePrefs(form); };
    $$('.seg button', form).forEach(b => b.onclick = () => { $$('button', b.parentElement).forEach(x => x.className = ''); b.className = 'on ' + b.dataset.v; });
  }
}
function saveFilters() { store.set('filters', S.filters); const y = scrollY; render(); scrollTo(0, y); }

$('#tabs').onclick = e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  S.view = b.dataset.view;
  store.set('view', S.view);
  renderChrome(); render();
  scrollTo(0, 0);
};
document.addEventListener('keydown', e => {
  if (!D) return;
  if (e.key === 'Escape') closeDrawer();
  if (e.key === 'ArrowRight') $('.d-nav.next')?.click();
  if (e.key === 'ArrowLeft') $('.d-nav.prev')?.click();
});

$('#btn-add').onclick = () => openAdd();
$$('[data-proxy]').forEach(b => b.onclick = () => $('#' + b.dataset.proxy).click());
$('#btn-refresh').onclick = async () => {
  if (STATIC) {
    if (pendingSince) { pendingSince = null; clearInterval(watchTimer); liveStatus(null); renderChrome(); toast('Attesa annullata. Se su GitHub non hai premuto «Create», la richiesta non è partita.'); return; }
    sendCommand('aggiorna', {});
    return;
  }
  await api('/api/aggiorna', {});
  toast('Aggiornamento partito');
  S.state.progress.running = true;
  renderChrome();
  poll();
};

// Durante un aggiornamento si interroga lo stato ogni 2 secondi; fuori, ogni minuto.
let polling = null;
async function poll() {
  clearTimeout(polling);
  if (STATIC) return;
  const wasRunning = S.state?.progress.running;
  try {
    S.state = await api('/api/stato');
    if (wasRunning && !S.state.progress.running) {
      S.houses = await api('/api/case');
      const n = S.state.lastRun?.fresh ?? 0;
      const tot = S.state.lastRun?.summary?.nuoveTotale ?? 0;
      toast(`Giro finito: ${tot} case nuove, ${n} da guardare`);
      store.set('seenRun', S.state.lastRun?.startedAt);
      if (!D) { S.view = 'novita'; store.set('view', 'novita'); renderChrome(); render(); }
    } else if (S.view === 'fonti' && !D) render();
    renderChrome();
  } catch {}
  polling = setTimeout(poll, S.state?.progress.running ? 2000 : 60000);
}

// Avvio
window.addEventListener('beforeunload', () => store.set('lastVisit', new Date().toISOString()));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (STATIC) await loginScreen();
await load();
// Se c'è stato un giro dall'ultima visita, si apre subito il resoconto.
{
  const seenRun = store.get('seenRun', null), lr = S.state.lastRun;
  if (lr && lr.startedAt !== seenRun) {
    store.set('seenRun', lr.startedAt);
    if (seenRun && !location.hash.includes('casa=')) { S.view = 'novita'; store.set('view', 'novita'); renderChrome(); render(); }
  }
}
poll();
if (location.hash === '#novita') { S.view = 'novita'; renderChrome(); render(); }
const m = location.hash.match(/casa=(.+)/);
if (m) openHouse(decodeURIComponent(m[1]));
