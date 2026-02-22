const STORAGE_KEY = "stockTradeRows.v1";
const CLOSE_KEY = "stockTradeCloseByDate.v1";

const COLLAPSE_KEY = "stockTradeCollapseDates.v1";
const CLOUD_CFG_KEY = "stockTradeCloudCfg.v1";
const DIRTY_KEY = "stockTradeDirty.v1";
const LAST_SYNC_KEY = "stockTradeLastSync.v1";

// 매수/매도 계획
const PLAN_BUY_KEY = "stockTradePlanBuy.v1";
const PLAN_SELL_KEY = "stockTradePlanSell.v1";

// 자동 현재가(최신 종가) 캐시: { [company]: { price:number, ts:number } }
const AUTO_CLOSE_CACHE_KEY = "stockTradeAutoCloseCache.v1";

// ===== Easy Login 레지스트리 URL =====
// (기존엔 app.js에 하드코딩했는데, 업데이트로 파일이 바뀌면 값이 날아갈 수 있어서
//  localStorage에 저장하도록 변경)
const REGISTRY_URL_KEY = 'stockTradeRegistryUrl.v1';
function loadRegistryUrl() {
  return (localStorage.getItem(REGISTRY_URL_KEY) || '').toString().trim();
}
function saveRegistryUrl(url) {
  localStorage.setItem(REGISTRY_URL_KEY, (url || '').toString().trim());
}
let REGISTRY_URL = loadRegistryUrl();

const $ = (id) => document.getElementById(id);
const ASOF_KEY = "stockTradeAsOfDate.v1";

// 공백/특수문자 때문에 PC↔모바일에서 종목명이 미세하게 달라도 매칭되게 처리
function normCompany(s) {
  return (s ?? "").toString().trim().replace(/\s+/g, " ");
}
function normDateIso(s) {
  return (s ?? "").toString().trim().slice(0, 10);
}

// ===== 탭 =====
function activateTab(tabId, pushHash = true) {
  document.querySelectorAll('.tab-page').forEach(el => el.classList.toggle('active', el.id === tabId));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  if (pushHash) {
    try { history.replaceState(null, '', `#${tabId}`); } catch {}
  }
  // 표/차트가 숨겨졌다가 보이면 사이즈 계산이 깨질 수 있어서 한 번 더 리렌더
  try { renderFull(); } catch {}
}
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
  const fromHash = (location.hash || '').replace('#', '').trim();
  if (fromHash && document.getElementById(fromHash)) activateTab(fromHash, false);
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function fmtMoney(n) {
  if (n === "" || n === null || n === undefined || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}
function fmtPct(x) {
  if (!Number.isFinite(x)) return "-";
  return (x * 100).toFixed(2) + "%";
}
function fmtChartPct(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) < 0.005) return "0%";
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(2) + "%";
}
function num(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  // allow inputs like "18,000" or "31,055.5"
  const s = String(v).replaceAll(",", "").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

function stripCommas(v) {
  return String(v ?? "").replaceAll(",", "");
}

function formatMoneyInputValue(v) {
  // keep digits and a single dot for decimals
  const raw = String(v ?? "");
  if (!raw) return "";
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const intPart = (parts[0] || "").replace(/^0+(\d)/, "$1");
  const decPart = parts.length > 1 ? parts.slice(1).join("").slice(0, 8) : "";
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${withComma}.${decPart}` : withComma;
}

function bindMoneyCommaInput(inputEl) {
  if (!inputEl) return;
  // Avoid double-binding
  if (inputEl.getAttribute('data-comma-bound') === '1') return;
  inputEl.setAttribute('data-comma-bound', '1');

  // format existing value on bind (so commas persist after refresh)
  try { inputEl.value = formatMoneyInputValue(inputEl.value); } catch (_) {}

  inputEl.addEventListener('blur', () => {
    try { inputEl.value = formatMoneyInputValue(inputEl.value); } catch (_) {}
  });

  inputEl.addEventListener('input', () => {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const before = inputEl.value;
    const formatted = formatMoneyInputValue(before);
    inputEl.value = formatted;
    // Best-effort caret restore
    const diff = formatted.length - before.length;
    const nextPos = Math.max(0, Math.min(formatted.length, start + diff));
    try { inputEl.setSelectionRange(nextPos, nextPos); } catch (_) {}
  });
}
function normalizeAccount(v) {
  const s = (v ?? "").toString().trim();
  if (s === "ISA") return "ISA";
  if (s === "일반" || s.toLowerCase() === "general") return "일반";
  return s;
}
function normalizeSide(v) {
  const s = (v ?? "").toString().trim().toUpperCase();
  if (s === "BUY" || s === "매수") return "BUY";
  if (s === "SELL" || s === "매도") return "SELL";
  return s;
}

function loadRows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveRows(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  scheduleCloudUpload('rows');
}

function loadCloseMap(){
  try{
    const raw = localStorage.getItem(CLOSE_KEY);
    if(!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}
function saveCloseMap(map){
  localStorage.setItem(CLOSE_KEY, JSON.stringify(map));
  scheduleCloudUpload('close');
}
function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
function saveCollapsed(obj) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(obj));
  scheduleCloudUpload('collapse');
}
let collapsedDates = loadCollapsed();
let closeMap = loadCloseMap();

function loadAutoCloseCache(){
  try{
    const raw = localStorage.getItem(AUTO_CLOSE_CACHE_KEY);
    if(!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}
function saveAutoCloseCache(obj){
  try{ localStorage.setItem(AUTO_CLOSE_CACHE_KEY, JSON.stringify(obj)); } catch {}
}
let autoCloseCache = loadAutoCloseCache();

// 중복 fetch 방지
const autoCloseInflight = new Map();

// ===== 구글시트(클라우드) 동기화 =====
function loadCloudCfg() {
  try {
    const raw = localStorage.getItem(CLOUD_CFG_KEY);
    if (!raw) return { url: '', token: '', auto: true };
    const o = JSON.parse(raw);
    return {
      url: (o?.url || '').toString().trim(),
      token: (o?.token || '').toString().trim(),
      auto: o?.auto !== false,
    };
  } catch {
    return { url: '', token: '', auto: true };
  }
}
function saveCloudCfg(cfg) {
  localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg));
}
let cloudCfg = loadCloudCfg();
let cloudUploadTimer = null;

function setCloudStatus(msg, level) {
  const el = $('gsStatus');
  if (!el) return;
  el.textContent = `상태: ${msg}`;
  el.classList.remove('ok','err');
  if (level === 'ok') el.classList.add('ok');
  if (level === 'err') el.classList.add('err');
}

function canCloud() {
  return !!(cloudCfg.url && cloudCfg.token);
}

function markDirty() {
  try { localStorage.setItem(DIRTY_KEY, "1"); } catch {}
}
function clearDirty() {
  try { localStorage.removeItem(DIRTY_KEY); } catch {}
}
function isDirty() {
  try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch { return false; }
}

function scheduleCloudUpload(reason) {
  markDirty();
  if (!cloudCfg.auto) return;
  if (!canCloud()) return;
  if (cloudUploadTimer) clearTimeout(cloudUploadTimer);
  cloudUploadTimer = setTimeout(() => {
    cloudUploadTimer = null;
    cloudSaveAll().catch(() => {});
  }, 900);
}

async function cloudCall(action, payloadObj) {
  if (!canCloud()) throw new Error('URL/토큰이 비어있어요');
  const body = JSON.stringify({ action, token: cloudCfg.token, payload: payloadObj || null });
  const res = await fetch(cloudCfg.url, {
    method: 'POST',
    // Apps Script는 JSON을 text/plain으로 보내는 쪽이 가장 안정적
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { ok: false, error: txt }; }
  if (!data?.ok) throw new Error(data?.error || '클라우드 요청 실패');
  return data;
}

async function cloudSaveAll() {
  setCloudStatus('업로드 중…');
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows,
    closeMap,
    collapsedDates,
    baseDate: (document.getElementById('asOfDate')?.value || ''),
  };
  await cloudCall('save', payload);
  clearDirty();
  try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); } catch {}
  setCloudStatus('업로드 완료 ✅', 'ok');
}

async function cloudLoadAll() {
  setCloudStatus('불러오는 중…');
  const data = await cloudCall('load', null);
  const p = data?.payload;
  if (!p) throw new Error('payload 없음');
  rows = Array.isArray(p.rows) ? p.rows : [];
  closeMap = (p.closeMap && typeof p.closeMap === 'object') ? p.closeMap : {};
  collapsedDates = (p.collapsedDates && typeof p.collapsedDates === 'object') ? p.collapsedDates : {};
  // 기준일(날짜)도 기기 간 동기화
  if (p.baseDate) {
    const bd = normDateIso(p.baseDate);
    const el = document.getElementById('asOfDate');
    if (el && bd) el.value = bd;
    if (bd) localStorage.setItem(ASOF_KEY, bd);
  }

  // 로컬도 같이 갱신
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  localStorage.setItem(CLOSE_KEY, JSON.stringify(closeMap));
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsedDates));

  renderFull();
  setCloudStatus('불러오기 완료 ✅', 'ok');
}

function setupBackupUI() {
  const backupBtn = $('gsBackupBtn');
  const restoreFile = $('gsRestoreFile');
  if (!backupBtn || !restoreFile) return;

  backupBtn.addEventListener('click', () => {
    // 최신 로컬 상태를 파일로 저장
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      rows,
      closeMap,
      collapsedDates,
      baseDate: (document.getElementById('asOfDate')?.value || localStorage.getItem(ASOF_KEY) || ''),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-dashboard-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCloudStatus('백업 파일 다운로드 완료 ✅', 'ok');
  });

  restoreFile.addEventListener('change', async () => {
    const file = restoreFile.files && restoreFile.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object') throw new Error('백업 파일 형식이 이상해요');
      rows = Array.isArray(obj.rows) ? obj.rows : [];
      closeMap = (obj.closeMap && typeof obj.closeMap === 'object') ? obj.closeMap : {};
      collapsedDates = (obj.collapsedDates && typeof obj.collapsedDates === 'object') ? obj.collapsedDates : {};
      const bd = normDateIso(obj.baseDate || '');
      const el = document.getElementById('asOfDate');
      if (el && bd) el.value = bd;
      if (bd) localStorage.setItem(ASOF_KEY, bd);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      localStorage.setItem(CLOSE_KEY, JSON.stringify(closeMap));
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsedDates));

      renderFull();
      setCloudStatus('백업으로 복원 완료 ✅ (원하면 클라우드 저장 눌러서 업로드)', 'ok');
      markDirty();
      // 복원 후 자동 저장 켜져 있으면 업로드 예약
      scheduleCloudUpload('restore');
    } catch (e) {
      setCloudStatus(`복원 실패 ❌ (${e.message})`, 'err');
    } finally {
      restoreFile.value = '';
    }
  });
}


// ===== Easy Login (암호로 URL/토큰 불러오기) =====
function bytesToB64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64UrlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256B64Url(str) {
  const enc = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return bytesToB64Url(digest);
}
async function deriveAesKey(password, saltBytes, iterations = 150000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptCfg(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    salt: bytesToB64Url(salt),
    iv: bytesToB64Url(iv),
    ct: bytesToB64Url(ct),
  };
}
async function decryptCfg(password, payload) {
  if (!payload || payload.v !== 1) throw new Error('지원하지 않는 payload');
  const salt = b64UrlToBytes(payload.salt);
  const iv = b64UrlToBytes(payload.iv);
  const ct = b64UrlToBytes(payload.ct);
  const key = await deriveAesKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  const txt = new TextDecoder().decode(pt);
  return JSON.parse(txt);
}
async function registryCall(action, bodyObj) {
  if (!REGISTRY_URL) throw new Error('REGISTRY_URL이 비어있어요 (개발자 설정 필요)');
  const res = await fetch(REGISTRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...bodyObj }),
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { ok: false, error: txt }; }
  if (!data?.ok) throw new Error(data?.error || '레지스트리 요청 실패');
  return data;
}
async function registryRegister(password, cfgObj) {
  const id = await sha256B64Url('v1:' + password);
  const payload = await encryptCfg(password, cfgObj);
  await registryCall('register', { id, payload });
  return id;
}
async function registryFetch(password) {
  const id = await sha256B64Url('v1:' + password);
  const data = await registryCall('get', { id });
  const cfgObj = await decryptCfg(password, data.payload);
  return cfgObj;
}

function setupEasyLoginUI() {
  const passEl = $('gsPass');
  const regBtn = $('gsRegBtn');
  const loginBtn = $('gsLoginBtn');
  const hintEl = $('gsEasyHint');
  const regUrlEl = $('gsRegistryUrl');

  if (!passEl || !regBtn || !loginBtn) return;

  // 레지스트리 URL 입력 UI 반영
  if (regUrlEl) {
    regUrlEl.value = REGISTRY_URL;
    regUrlEl.addEventListener('change', () => {
      REGISTRY_URL = (regUrlEl.value || '').trim();
      saveRegistryUrl(REGISTRY_URL);
      // 버튼 활성/비활성 즉시 반영
      const ok = !!REGISTRY_URL;
      regBtn.disabled = !ok;
      loginBtn.disabled = !ok;
      if (hintEl) hintEl.textContent = ok
        ? '레지스트리 URL 설정됨! 이제 암호만으로 불러올 수 있어요.'
        : '레지스트리 URL을 먼저 입력해야 “암호 로그인”이 동작해요.';
    });
  }

  // 레지스트리 URL 미설정이면 안내만
  if (!REGISTRY_URL) {
    if (hintEl) hintEl.textContent = '레지스트리 URL을 먼저 입력해야 “암호 로그인”이 동작해요.';
    regBtn.disabled = true;
    loginBtn.disabled = true;
    return;
  }

  regBtn.addEventListener('click', async () => {
    const password = (passEl.value || '').trim();
    const url = ($('gsUrl')?.value || '').trim();
    const token = ($('gsToken')?.value || '').trim();
    if (!password) { alert('암호를 입력해줘'); return; }
    if (!url || !token) { alert('먼저 Apps Script URL/토큰을 입력해줘'); return; }

    regBtn.disabled = true;
    loginBtn.disabled = true;
    try {
      await registryRegister(password, { url, token });
      // 이 기기에도 저장
      cloudCfg = { ...cloudCfg, url, token };
      saveCloudCfg(cloudCfg);
      setCloudStatus('가입(등록) 완료 ✅ 이제 다른 기기에서 암호만 입력해도 돼요', 'ok');
      if (hintEl) hintEl.textContent = '등록 완료! (암호는 잃어버리면 복구 불가)';
    } catch (e) {
      setCloudStatus(`가입(등록) 실패 ❌ (${e.message})`, 'err');
    } finally {
      regBtn.disabled = false;
      loginBtn.disabled = false;
    }
  });

  loginBtn.addEventListener('click', async () => {
    const password = (passEl.value || '').trim();
    if (!password) { alert('암호를 입력해줘'); return; }

    regBtn.disabled = true;
    loginBtn.disabled = true;
    try {
      const cfg = await registryFetch(password);
      if (!cfg?.url || !cfg?.token) throw new Error('저장된 값이 이상해요');
      // UI 반영
      const urlEl = $('gsUrl'); const tokEl = $('gsToken');
      if (urlEl) urlEl.value = cfg.url;
      if (tokEl) tokEl.value = cfg.token;
      // 저장
      cloudCfg = { ...cloudCfg, url: cfg.url, token: cfg.token };
      saveCloudCfg(cloudCfg);
      setCloudStatus('암호 로그인 성공 ✅ URL/토큰 자동 입력됨', 'ok');
      if (hintEl) hintEl.textContent = '성공! 이제 “불러오기/업로드” 버튼을 누르면 돼요.';
    } catch (e) {
      setCloudStatus(`암호 로그인 실패 ❌ (${e.message})`, 'err');
    } finally {
      regBtn.disabled = false;
      loginBtn.disabled = false;
    }
  });
}
// ===== /Easy Login =====

function setupCloudUI() {
  const urlEl = $('gsUrl');
  const tokEl = $('gsToken');
  const autoEl = $('gsAuto');
  const loadBtn = $('gsLoadBtn');
  const saveBtn = $('gsSaveBtn');

  if (!urlEl || !tokEl || !autoEl || !loadBtn || !saveBtn) return;

  urlEl.value = cloudCfg.url;
  tokEl.value = cloudCfg.token;
  autoEl.checked = !!cloudCfg.auto;
  setCloudStatus('대기');

  const persist = () => {
    cloudCfg = { url: urlEl.value.trim(), token: tokEl.value.trim(), auto: autoEl.checked };
    saveCloudCfg(cloudCfg);
  };
  urlEl.addEventListener('change', persist);
  tokEl.addEventListener('change', persist);
  autoEl.addEventListener('change', persist);

  saveBtn.addEventListener('click', async () => {
    persist();
    try { await cloudSaveAll(); }
    catch (e) { setCloudStatus(`실패 ❌ (${e.message})`, 'err'); }
  });

  loadBtn.addEventListener('click', async () => {
    persist();
    try { await cloudLoadAll(); }
    catch (e) { setCloudStatus(`실패 ❌ (${e.message})`, 'err'); }
  });
}
function setGroupCollapsed(dateIso, isCollapsed) {
  collapsedDates[dateIso] = !!isCollapsed;
  saveCollapsed(collapsedDates);
}
function isGroupCollapsed(dateIso) {
  return !!collapsedDates[dateIso];
}

function scrollDataEntryToBottom() {
  const table = $("dataTable");
  if (!table) return;
  const wrap = table.closest(".table-wrap");
  if (!wrap) return;
  wrap.scrollTop = wrap.scrollHeight;
}
function focusCompanyInput(i) {
  const el = document.querySelector(`input[data-k="company"][data-i="${i}"]`);
  if (el) el.focus();
}
function blankRow(seedDate) {
  return { date: seedDate || ($("asOfDate").value || todayISO()), company: "", account: "ISA", side: "BUY", price: "", qty: "" };
}
function insertRowAt(index, seedDate) {
  const i = Math.max(0, Math.min(rows.length, index));
  rows.splice(i, 0, blankRow(seedDate));
  saveRows(rows);
  renderFull();
  scrollDataEntryToBottom();
  focusCompanyInput(i);
}
function moveRow(from, to) {
  if (from < 0 || from >= rows.length) return;
  if (to < 0 || to >= rows.length) return;
  const [item] = rows.splice(from, 1);
  rows.splice(to, 0, item);
  saveRows(rows);
  renderFull();
  focusCompanyInput(to);
}

// --- Ledger compute (moving average cost) ---
// Returns:
// { perRow: Map(index -> {amount, realized, cumReal}), positions: Map(key->pos), monthReal: Map(ym->{ISA,GEN,ALL}) }
function computeLedger(rows, asOfIso, cutoffIso = asOfIso) {
  // Process in chronological order (date asc, then original index asc) for correct realized calc.
  const order = rows.map((r, idx) => ({ r, idx, date: (r.date || "").trim() }))
    .sort((a,b)=> (a.date || "").localeCompare(b.date || "") || (a.idx - b.idx));

  const pos = new Map(); // key = company||account => {qty, avg, realizedCum, lastClose}
  const perRow = new Map();
  const monthReal = new Map();

  const getPos = (key) => {
    if (!pos.has(key)) pos.set(key, { qty: 0, avg: 0, realizedCum: 0, lastClose: NaN, company: "", account: "", trades: 0 });
    return pos.get(key);
  };

  for (const it of order) {
    const r = it.r;
    const idx = it.idx;

    const date = (r.date || "").trim();
    if (cutoffIso && date && date > cutoffIso) continue;
    const company = (r.company || "").trim();
    const account = normalizeAccount(r.account);
    const side = normalizeSide(r.side);
    const price = num(r.price);
    const qty = num(r.qty);
    const close = NaN;

    const key = company + "||" + account;
    const p = getPos(key);
    p.company = company;
    p.account = account;
    if (company) p.trades = (p.trades || 0) + 1;

    let amount = NaN;
    let realized = 0;
    if (Number.isFinite(price) && Number.isFinite(qty)) {
      amount = price * qty * (side === "SELL" ? -1 : 1);

      if (side === "BUY") {
        // avg cost update
        const newQty = p.qty + qty;
        if (newQty > 0) {
          p.avg = (p.avg * p.qty + price * qty) / newQty;
        }
        p.qty = newQty;
      } else if (side === "SELL") {
        // disallow selling more than holding
        const sellQty = qty;
        const canSell = Math.min(sellQty, p.qty);
        realized = (Number.isFinite(p.avg) ? (price - p.avg) : 0) * canSell;
        p.realizedCum += realized;
        p.qty = p.qty - canSell;
        // if sold all, keep avg as is (or 0)
        if (p.qty === 0) p.avg = p.avg; 
      }
    }

    // month realized aggregate
    const ym = (date && date.length >= 7) ? date.slice(0,7) : null;
    if (ym) {
      if (!monthReal.has(ym)) monthReal.set(ym, { ym, ISA: 0, GEN: 0, ALL: 0 });
      const mr = monthReal.get(ym);
      mr.ALL += realized;
      if (account === "ISA") mr.ISA += realized;
      if (account === "일반") mr.GEN += realized;
    }

    perRow.set(idx, { amount, realized, cumReal: p.realizedCum });
  }

  // apply close prices for asOf date from closeMap
  const cm = closeMap?.[asOfIso] || {};
  for (const [key, p] of pos.entries()) {
    const c = cm[p.company];
    p.lastClose = Number.isFinite(Number(c)) ? Number(c) : NaN;
  }

  return { perRow, positions: pos, monthReal };
}

function normalizeCompany(s){
  return (s||"")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.()\[\]{}'"]/g,"")
    .replace(/[,&/]/g,"")
    .replace(/\u00a0/g,"");
}

function matchCompanyName(input, candidates){
  const raw = (input||"").trim();
  if(!raw) return raw;
  // 1) exact
  const exact = candidates.find(c => c === raw);
  if(exact) return exact;

  const nIn = normalizeCompany(raw);
  if(!nIn) return raw;

  // 2) normalized exact
  for(const c of candidates){
    if(normalizeCompany(c) === nIn) return c;
  }

  // 3) substring / closest length
  let best = null;
  let bestScore = Infinity;
  for(const c of candidates){
    const nc = normalizeCompany(c);
    if(!nc) continue;
    if(nc.includes(nIn) || nIn.includes(nc)){
      const score = Math.abs(nc.length - nIn.length);
      if(score < bestScore){
        bestScore = score;
        best = c;
      }
    }
  }
  return best || raw;
}

function getCompaniesInPortfolio(ledger) {
  // show companies that exist in positions OR appear in trades (so you can prefill)
  const s = new Set();
  for (const p of ledger.positions.values()) {
    const name = (p.company || "").trim();
    if (name) s.add(name);
  }
  for (const r of rows) {
    const name = (r.company || "").trim();
    if (name) s.add(name);
  }
  return Array.from(s).sort((a,b)=>a.localeCompare(b));
}

function getCloseFor(asOfIso, company) {
  const d = closeMap?.[normDateIso(asOfIso)] || {};
  const raw = (company ?? "").toString();
  const k = normCompany(raw);
  // 1) 완전 일치 2) 정규화 키 3) (마지막) 정규화 비교로 찾기
  let v = d[raw];
  if (v === undefined) v = d[k];
  if (v === undefined && k) {
    for (const kk of Object.keys(d)) {
      if (normCompany(kk) === k) { v = d[kk]; break; }
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function setCloseFor(asOfIso, company, value) {
  const dateKey = normDateIso(asOfIso);
  const raw = (company ?? "").toString();
  const k = normCompany(raw);

  if (!closeMap[dateKey]) closeMap[dateKey] = {};
  if (!Number.isFinite(value)) {
    delete closeMap[dateKey][raw];
    delete closeMap[dateKey][k];
    // 혹시 예전 키가 있으면 같이 제거
    for (const kk of Object.keys(closeMap[dateKey])) {
      if (normCompany(kk) === k) delete closeMap[dateKey][kk];
    }
  } else {
    closeMap[dateKey][k] = value;
  }
  saveCloseMap(closeMap);
}

function buildCloseTable(ledger) {
  const asOfIso = $("asOfDate").value || todayISO();
  const tbody = $("closeTable").querySelector("tbody");

  // 기존 행들의 현재 입력값 보존 (포커스 유지)
  const focused = document.activeElement;
  const focusedCompany = focused ? focused.getAttribute("data-close-company-name") : null;
  const focusedField = focused ? focused.getAttribute("data-close-field") : null;

  tbody.innerHTML = "";

  // closeMap에 저장된 기업들 + 행 추가로 새로 입력 중인 임시 행들 표시
  const savedCompanies = Object.keys(closeMap[normDateIso(asOfIso)] || {});

  for (const c of savedCompanies) {
    const v = getCloseFor(asOfIso, c);
    addCloseRow(tbody, asOfIso, c, Number.isFinite(v) ? v : "", false);
  }
}

function addCloseRow(tbody, asOfIso, companyVal, priceVal, focusCompany) {
  const candidates = getCompaniesInPortfolio(computeLedger(rows, asOfIso));
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <input type="text" list="closeCompanyList" placeholder="기업명"
        data-close-company-name="${companyVal}"
        data-close-field="company"
        value="${companyVal}" style="width:100%">
    </td>
    <td>
      <input type="text" inputmode="decimal" placeholder="종가"
        data-close-company-name="${companyVal}"
        data-close-field="price"
        value="${priceVal !== "" ? priceVal : ""}" style="width:100%">
    </td>
    <td style="color:#475569; font-variant-numeric: tabular-nums">${asOfIso}</td>
    <td><button class="mini-danger" data-close-del>삭제</button></td>
  `;
  tbody.appendChild(tr);

  const companyInp = tr.querySelector('[data-close-field="company"]');
  const priceInp = tr.querySelector('[data-close-field="price"]');
  bindMoneyCommaInput(priceInp);

  // datalist 자동완성 (매매기록 기업명 목록)
  let dl = document.getElementById("closeCompanyList");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "closeCompanyList";
    document.body.appendChild(dl);
  }
  dl.innerHTML = candidates.map(c => `<option value="${c}">`).join("");

  function save() {
    const company = companyInp.value.trim();
    const price = Number(stripCommas(priceInp.value));
    // 이전 기업명 key 정리
    const oldName = companyInp.getAttribute("data-close-company-name");
    if (oldName && oldName !== company) {
      setCloseFor(asOfIso, oldName, NaN);
    }
    if (company) {
      companyInp.setAttribute("data-close-company-name", company);
      priceInp.setAttribute("data-close-company-name", company);
      if (priceInp.value !== "" && Number.isFinite(price)) {
        setCloseFor(asOfIso, company, price);
      } else if (priceInp.value === "") {
        setCloseFor(asOfIso, company, NaN);
      }
    }
    const ledger2 = computeLedger(rows, asOfIso);
    updateDerived(ledger2);
  }

  companyInp.addEventListener("change", save);
  companyInp.addEventListener("blur", save);
  priceInp.addEventListener("input", save);

  // 삭제 버튼
  tr.querySelector("[data-close-del]").addEventListener("click", () => {
    const company = companyInp.value.trim();
    if (company) setCloseFor(asOfIso, company, NaN);
    tr.remove();
    const ledger2 = computeLedger(rows, asOfIso);
    updateDerived(ledger2);
  });

  if (focusCompany) companyInp.focus();
}

function applyBulkClose() {
  const asOfIso = $("asOfDate").value || todayISO();
  const text = ($("bulkClose").value || "").trim();
  if (!text) return;

  const ledger = computeLedger(rows, asOfIso);
  const candidates = getCompaniesInPortfolio(ledger);
  const lines = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  for (const line of lines) {
    // allow "기업, 123" or "기업 123" or tab
    const parts = line.split(/\t|,|\s{2,}/).map(s=>s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const priceStr = parts[parts.length-1].replace(/,/g,"");
      const price = Number(priceStr);
      let company = parts.slice(0, parts.length-1).join(" ").trim();
      company = matchCompanyName(company, candidates);
      if (company && Number.isFinite(price)) setCloseFor(asOfIso, company, price);
    } else {
      // single space split fallback: last token number
      const m = line.match(/^(.*?)[\s,]+([0-9][0-9,]*)$/);
      if (m) {
        let company = m[1].trim();
        const price = Number(m[2].replace(/,/g,""));
        company = matchCompanyName(company, candidates);
        if (company && Number.isFinite(price)) setCloseFor(asOfIso, company, price);
      }
    }
  }
  const btn = $("applyBulkCloseBtn");
  const prev = btn.textContent;
  btn.textContent = "적용됨";
  setTimeout(()=>{ btn.textContent = prev; }, 1200);

  $("bulkClose").value = "";
  renderFull();
}

function clearCloseForDate() {
  const asOfIso = $("asOfDate").value || todayISO();
  if (!confirm("이 기준일의 종가를 전부 지울까?")) return;
  delete closeMap[asOfIso];
  saveCloseMap(closeMap);
  renderFull();
}

function setSignedKpi(id, value, formatter) {
  const el = $(id);
  el.textContent = formatter(value);
  el.classList.remove("pos","neg","zero");
  if (!Number.isFinite(value)) return;
  if (value > 0) el.classList.add("pos");
  else if (value < 0) el.classList.add("neg");
  else el.classList.add("zero");
}
function setKpi(id, value) {
  const el = $(id);
  el.textContent = value;
  el.classList.remove("pos","neg","zero");
}

// --- Rendering: grouped by date (desc) ---
let holdScope = "ALL"; // ALL | ISA | GEN | ETC

// ===== 실시간 시세(TradingView 위젯) =====
// 회사명은 입력 방식이 제각각이라, 공백/대소문자/기호를 제거한 '정규화 키'로 매칭
function normName(s){
  return String(s||"")
    .toLowerCase()
    .replace(/\s+/g,"")
    .replace(/[·\.\(\)\[\]\-_/&+]/g,"")
    .trim();
}

// KRX 종목/ETF 코드 매핑 (필요하면 여기만 추가하면 됨)
// - TIGER 미국S&P500: 360750 citeturn0search4
// - KODEX 미국나스닥100: 379810 citeturn0search1
// - TIGER 미국배당다우존스: 458730 citeturn0search10
// - KODEX 200TR: 278530 citeturn1search4
// - TIGER 반도체TOP10: 396500 citeturn0search7
// - PLUS 고배당주: 161510 citeturn1search13
// - KODEX 코스닥150: 229200 citeturn1search14
// - TIGER 은행고배당플러스TOP10: 466940 citeturn1search7
// - KODEX 200: 069500 citeturn2search16
const TV_SYMBOL_BY_NAME = {
  // 네가 적어준 명칭(표에 그대로 들어올 가능성 높은 것들)
  [normName("미래에셋증권")]: "KRX:006800",
  [normName("한화시스템")]: "KRX:272210",
  [normName("삼성전자")]: "KRX:005930",
  [normName("sk하이닉스")]: "KRX:000660",
  [normName("현대차")]: "KRX:005380",
  [normName("우리기술")]: "KRX:032820",
  [normName("우리금융지주")]: "KRX:316140",

  // 소문자/축약 형태로 입력한 경우
  [normName("tiger 미국s&p500")]: "KRX:360750",

  // 실사용에서 자주 나오는 변형(공백/대소문자)
  [normName("TIGER 미국S&P500")]: "KRX:360750",
  [normName("TIGER미국S&P500")]: "KRX:360750",
  [normName("KODEX 미국나스닥100")]: "KRX:379810",
  [normName("KOKEX 미국나스닥10")]: "KRX:379810", // 사용자가 오타로 적은 경우 대비
  [normName("TIGER 미국배당다우존스")]: "KRX:458730",
  [normName("KODEX 200TR")]: "KRX:278530",
  [normName("TIGER 반도체TOP10")]: "KRX:396500",
  [normName("PLUS 고배당주")]: "KRX:161510",
  [normName("KODEX 코스닥150")]: "KRX:229200",
  [normName("TIGER 은행고배당플러스TOP10")]: "KRX:466940",
  [normName("KODEX 200")]: "KRX:069500",
};

function getTvSymbol(company){
  const k = normName(company);
  return TV_SYMBOL_BY_NAME[k] || null;
}

// ===== 자동 현재가(최신 종가) 가져오기: Stooq CSV (키 없이 가능, 다만 모든 종목이 지원되진 않음) =====
function stooqDailyCsvUrl(stooqSymbol){
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(String(stooqSymbol).toLowerCase())}&i=d`;
}
function viaAllOrigins(url){
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}
function parseLatestCloseFromCsv(csvText){
  // Date,Open,High,Low,Close,Volume
  const lines = (csvText || '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1].split(',');
  const date = (last[0] || '').trim();
  const close = Number(last[4]);
  if (!date || !Number.isFinite(close)) return null;
  return { date, close };
}

function stooqCandidatesFromTvSymbol(tv){
  if (!tv) return [];
  const [ex, sym] = String(tv).split(':');
  if (!sym) return [];
  const exch = (ex || '').toUpperCase();
  const s = sym.trim();
  if (!s) return [];
  // 미국/해외
  if (['NASDAQ','NYSE','AMEX','CBOE'].includes(exch)) return [`${s}.us`];
  // 한국(코스피/코스닥/ETF)
  if (['KRX','KOSPI','KOSDAQ'].includes(exch)) return [`${s}.kr`, `${s}.ks`, `${s}.kq`];
  // 그 외는 시도만
  return [`${s}.us`, `${s}.kr`];
}

async function fetchLatestCloseViaStooq(company){
  const tv = getTvSymbol(company);
  const cands = stooqCandidatesFromTvSymbol(tv);
  if (!cands.length) return null;

  // 최근 30분 이내 캐시 사용
  const key = normCompany(company);
  const cached = autoCloseCache[key];
  if (cached && Number.isFinite(cached.price) && (Date.now() - cached.ts) < 30 * 60 * 1000) {
    return { close: cached.price, source: 'cache' };
  }

  for (const sym of cands) {
    const url = stooqDailyCsvUrl(sym);
    try {
      // 직접 호출 → 실패하면 프록시로 재시도
      let res;
      try {
        res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('direct not ok');
      } catch {
        res = await fetch(viaAllOrigins(url), { cache: 'no-store' });
        if (!res.ok) throw new Error('proxy not ok');
      }
      const text = await res.text();
      const latest = parseLatestCloseFromCsv(text);
      if (!latest) continue;

      autoCloseCache[key] = { price: latest.close, ts: Date.now() };
      saveAutoCloseCache(autoCloseCache);
      return { close: latest.close, source: sym };
    } catch {
      // 다음 후보 시도
    }
  }

  return null;
}

async function ensureAutoCloseFor(asOfIso, company){
  const c = normCompany(company);
  if (!c) return null;
  const existing = getCloseFor(asOfIso, c);
  if (Number.isFinite(existing)) return existing;

  // 이미 in-flight면 그거 기다리기
  if (autoCloseInflight.has(c)) {
    try { return await autoCloseInflight.get(c); } catch { return null; }
  }

  const p = (async () => {
    const got = await fetchLatestCloseViaStooq(c);
    if (got && Number.isFinite(got.close)) {
      // 사용자가 입력한 값이 없을 때만 채워넣기
      const cur2 = getCloseFor(asOfIso, c);
      if (!Number.isFinite(cur2)) {
        setCloseFor(asOfIso, c, got.close);
        // setCloseFor가 내부에서 saveCloseMap 호출 안 하는 구조면 여기서 저장
        saveCloseMap(closeMap);
      }
      return got.close;
    }
    return null;
  })();

  autoCloseInflight.set(c, p);
  try {
    return await p;
  } finally {
    autoCloseInflight.delete(c);
  }
}

function openPriceModal(company){
  const modal = document.getElementById("priceModal");
  const title = document.getElementById("priceModalTitle");
  const sub = document.getElementById("priceModalSub");
  const wrap = document.getElementById("tvWidgetWrap");
  if (!modal || !title || !sub || !wrap) return;

  const symbol = getTvSymbol(company);
  title.textContent = company;
  sub.textContent = symbol ? `TradingView: ${symbol}` : "이름→종목코드 매칭이 없어서 위젯을 띄울 수 없어요 (아래 매핑에 추가 필요)";

  wrap.innerHTML = "";
  if (symbol) {
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.innerHTML = `
      <div class="tradingview-widget-container__widget"></div>
    `;
    wrap.appendChild(container);

    // TradingView Mini Symbol Overview 위젯 (팝업용: 현재가/등락 + 미니차트)
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.textContent = JSON.stringify({
      symbol,
      width: "100%",
      height: 240,
      locale: "kr",
      dateRange: "1M",
      colorTheme: "light",
      isTransparent: false,
      largeChartUrl: "",
    });
    container.appendChild(script);
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
}

function closePriceModal(){
  const modal = document.getElementById("priceModal");
  const wrap = document.getElementById("tvWidgetWrap");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  if (wrap) wrap.innerHTML = "";
}

// 모달 닫기 이벤트(1회 바인딩)
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.matches("[data-modal-close]")) closePriceModal();
});
document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape") closePriceModal();
});

function buildHoldTables(ledger) {
  const allItems = Array.from(ledger.positions.values())
    .filter(p => (p.company || "").trim().length > 0)
    .filter(p => {
      if (holdScope === "ISA") return p.account === "ISA";
      if (holdScope === "GEN") return p.account === "일반";
      if (holdScope === "ETC") return p.account !== "ISA" && p.account !== "일반";
      return true;
    })
    .map(p => {
      const cost = p.qty * p.avg;
      const close = p.lastClose;
      const unreal = (Number.isFinite(close) ? (close - p.avg) * p.qty : NaN);
      const total = (Number.isFinite(unreal) ? unreal : 0) + p.realizedCum;
      const ret = (cost !== 0) ? (total / cost) : NaN;
      const trades = Number(p.trades || 0);
      return { ...p, cost, unreal, total, ret, close, trades };
    });

  const current = allItems
    .filter(p => p.qty > 0)
    .sort((a,b)=> (b.cost - a.cost) || a.company.localeCompare(b.company));

  const closed = allItems
    .filter(p => p.qty === 0 && p.trades > 0)
    .sort((a,b)=> (b.realizedCum - a.realizedCum) || a.company.localeCompare(b.company));

  renderHoldTableTo("holdTableCurrent", current, "거래를 입력하면 보유중인 종목이 여기에 표시돼요.");
  // 매수·매도 계획 탭에도 동일한 보유현황 표 표시
  renderHoldTableTo("holdTableCurrentPlan", current, "거래를 입력하면 보유중인 종목이 여기에 표시돼요.");
  renderHoldTableTo("holdTableClosed", closed, "전량 매도한 종목이 여기에 표시돼요.");
}

function renderHoldTableTo(tableId, items, emptyMsg) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector("tbody");
  const isCurrent = tableId === "holdTableCurrent";
  const asOfIso = $("asOfDate").value || todayISO();

  // 기준일 표시
  if (isCurrent) {
    const label = document.getElementById("holdAsOfLabel");
    if (label) label.textContent = `기준일: ${asOfIso} 종가 기준`;
  }
  if (tableId === "holdTableCurrentPlan") {
    const label2 = document.getElementById("holdAsOfLabelPlan");
    if (label2) label2.textContent = `기준일: ${asOfIso} 종가 기준`;
  }

  if (!items.length) {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="10" style="color:#64748b">${emptyMsg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  // 기존 행 재사용: 회사 목록이 같으면 input은 그대로 두고 계산 결과만 업데이트
  const existingRows = Array.from(tbody.querySelectorAll("tr[data-hold-company]"));
  const existingKeys = existingRows.map(r => r.getAttribute("data-hold-company"));
  const newKeys = items.map(p => p.company);
  const sameLayout = existingKeys.length === newKeys.length && existingKeys.every((k,i) => k === newKeys[i]);

  if (sameLayout) {
    // 레이아웃 동일 → input 건드리지 않고 계산 셀만 업데이트
    existingRows.forEach((tr, i) => {
      const p = items[i];
      const cells = tr.querySelectorAll("td");
      // cells: 기업명(0) 계좌(1) 수량(2) 평균단가(3) 원가(4) 종가input(5) 평가손익(6) 실현누적(7) 총손익(8) 수익률(9)
      if (isCurrent) {
        cells[6].textContent = Number.isFinite(p.unreal) ? fmtMoney(p.unreal) : "-";
        cells[7].textContent = fmtMoney(p.realizedCum);
        cells[8].textContent = fmtMoney(p.total);
        cells[9].textContent = Number.isFinite(p.ret) ? fmtPct(p.ret) : "-";
      }
    });
    return;
  }

  // 레이아웃 변경 → 전체 재렌더
  tbody.innerHTML = "";
  for (const p of items) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-hold-company", p.company);

    const closeTd = isCurrent
      ? `<td><input type="text" inputmode="decimal"
            data-hold-close="${p.company}"
            value="${Number.isFinite(p.close) ? p.close : ""}"
            placeholder="-"
            style="width:90px;text-align:right"></td>`
      : `<td>${Number.isFinite(p.close) ? fmtMoney(p.close) : "-"}</td>`;

    tr.innerHTML = `
      <td><button class="linklike" type="button" data-company-click="${p.company}">${p.company}</button></td>
      <td>${p.account}</td>
      <td>${fmtQty(p.qty)}</td>
      <td>${Number.isFinite(p.avg) ? fmtMoney(p.avg) : "-"}</td>
      <td>${fmtMoney(p.cost)}</td>
      ${closeTd}
      <td>${Number.isFinite(p.unreal) ? fmtMoney(p.unreal) : "-"}</td>
      <td>${fmtMoney(p.realizedCum)}</td>
      <td>${fmtMoney(p.total)}</td>
      <td>${Number.isFinite(p.ret) ? fmtPct(p.ret) : "-"}</td>
    `;
    tbody.appendChild(tr);

    // 기업명 클릭 → 실시간 시세 모달
    const btn = tr.querySelector("button[data-company-click]");
    if (btn) {
      btn.addEventListener("click", () => openPriceModal(p.company));
    }
  }

  if (isCurrent) {
    tbody.querySelectorAll("input[data-hold-close]").forEach(inp => {
      const company = inp.getAttribute("data-hold-close");
      bindMoneyCommaInput(inp);
      inp.addEventListener("input", () => {
        const raw = inp.value;
        const v = Number(stripCommas(raw));
        if (raw === "") setCloseFor(asOfIso, company, NaN);
        else if (Number.isFinite(v)) setCloseFor(asOfIso, company, v);
        const ledger2 = computeLedger(rows, asOfIso);
        updateDerived(ledger2);
      });
    });
  }
}

// ===== 매수/매도 계획 저장/불러오기 =====
function loadPlans(type) {
  const key = type === 'BUY' ? PLAN_BUY_KEY : PLAN_SELL_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function savePlans(type, arr) {
  const key = type === 'BUY' ? PLAN_BUY_KEY : PLAN_SELL_KEY;
  localStorage.setItem(key, JSON.stringify(arr));
  scheduleCloudUpload('plans');
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

let planEditing = { type: 'BUY', id: null };

function getPlanMode() {
  const v = (document.getElementById('planMode')?.value || 'QTY').toString().toUpperCase();
  return (v === 'AMOUNT') ? 'AMOUNT' : 'QTY';
}

function setPlanModeUI(mode) {
  const qtyWrap = document.getElementById('planQtyWrap');
  const amtWrap = document.getElementById('planAmountWrap');
  const qtyEl = document.getElementById('planQty');
  const amtEl = document.getElementById('planAmount');
  if (qtyWrap) qtyWrap.style.display = (mode === 'QTY') ? '' : 'none';
  if (amtWrap) amtWrap.style.display = (mode === 'AMOUNT') ? '' : 'none';
  if (qtyEl) qtyEl.disabled = (mode !== 'QTY');
  if (amtEl) amtEl.disabled = (mode !== 'AMOUNT');
}

function openPlanModal(type, existing = null) {
  const modal = document.getElementById('planModal');
  if (!modal) return;
  planEditing = { type, id: existing?.id || null };

  const title = document.getElementById('planModalTitle');
  const sub = document.getElementById('planModalSub');
  if (title) title.textContent = existing ? '계획 수정' : '계획 추가';
  if (sub) sub.textContent = (type === 'BUY') ? '매수계획' : '매도계획';

  const company = document.getElementById('planCompany');
  const acctType = document.getElementById('planAccountType');
  const acctOther = document.getElementById('planAccountOther');
  const modeEl = document.getElementById('planMode');
  const qty = document.getElementById('planQty');
  const amount = document.getElementById('planAmount');
  const note = document.getElementById('planNote');
  const status = document.getElementById('planStatus');

  const mode = (existing?.mode || 'QTY').toString().toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'QTY';

  if (company) company.value = existing?.company || '';

  // 계좌 선택
  const acctRaw = (existing?.account || 'ISA').toString();
  let acctSel = 'ISA';
  let acctEtc = '';
  if (acctRaw === 'ISA' || acctRaw === '일반') {
    acctSel = acctRaw;
  } else {
    acctSel = '기타';
    acctEtc = acctRaw;
  }
  if (acctType) acctType.value = acctSel;
  if (acctOther) acctOther.value = acctEtc;
  const otherWrap = document.getElementById('planAccountOtherWrap');
  if (otherWrap) otherWrap.style.display = (acctSel === '기타') ? '' : 'none';
  if (modeEl) modeEl.value = mode;
  setPlanModeUI(mode);
  if (qty) qty.value = (existing?.qty ?? '');
  if (amount) amount.value = (existing?.amount ?? '') === '' ? '' : formatMoneyInputValue(String(existing?.amount ?? ''));
  // 소수점 거래
  const frac = document.getElementById('planFractional');
  const unit = document.getElementById('planUnitPrice');
  const calc = document.getElementById('planCalcQty');
  if (frac) frac.checked = !!existing?.fractional;
  if (unit) unit.value = (existing?.unitPrice ?? '') === '' ? '' : formatMoneyInputValue(String(existing?.unitPrice ?? ''));
  if (calc) calc.value = '';
  if (note) note.value = existing?.note || '';
  if (status) status.value = (existing?.status === '완료') ? '완료' : '대기';

  updatePlanCurrentHint();
  updatePlanCalcHint();

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => company?.focus(), 0);
}

function closePlanModal() {
  const modal = document.getElementById('planModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function updatePlanCurrentHint() {
  const el = document.getElementById('planCurrentHint');
  if (el) el.textContent = '현재가는 종목명을 눌러 팝업에서 확인해줘.';
}

function updatePlanCalcHint() {
  const mode = getPlanMode();
  const frac = document.getElementById('planFractional');
  const unitEl = document.getElementById('planUnitPrice');
  const calcEl = document.getElementById('planCalcQty');
  const amtEl = document.getElementById('planAmount');
  const qtyEl = document.getElementById('planQty');

  const isFrac = !!frac?.checked;

  // 소수점 거래는 금액(원) 입력일 때만 예상 수량을 계산
  if (unitEl) unitEl.style.display = (isFrac && mode === 'AMOUNT') ? '' : 'none';
  if (calcEl) calcEl.style.display = (isFrac && mode === 'AMOUNT') ? '' : 'none';

  if (!isFrac || mode !== 'AMOUNT') {
    if (calcEl) calcEl.value = '';
    return;
  }

  const amount = num(amtEl?.value);
  const unitPrice = num(unitEl?.value);

  if (Number.isFinite(amount) && Number.isFinite(unitPrice) && unitPrice > 0) {
    const q = amount / unitPrice;
    const qStr = (Math.round(q * 1e8) / 1e8).toString();
    if (calcEl) calcEl.value = qStr;
    // 저장 시 참고할 수 있게 수량에도 자동 반영(숨김일 수 있음)
    if (qtyEl) qtyEl.value = qStr;
  } else {
    if (calcEl) calcEl.value = '';
  }
}

function planDiffBadge() { return { cls: 'neutral', text: '' }; }

function renderPlans() {
  const buy = loadPlans('BUY');
  const sell = loadPlans('SELL');

  const buyWrap = document.getElementById('buyPlanList');
  const sellWrap = document.getElementById('sellPlanList');
  const buyEmpty = document.getElementById('buyPlanEmpty');
  const sellEmpty = document.getElementById('sellPlanEmpty');
  if (!buyWrap || !sellWrap) return;

  const renderOne = (type, arr, wrap, emptyEl) => {
    wrap.innerHTML = '';
    if (emptyEl) emptyEl.style.display = arr.length ? 'none' : 'block';

    // 최신 생성/수정이 위로
    const sorted = [...arr].sort((a,b)=> (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    const STATUS_ORDER = ['대기', '완료'];
    const statusClass = (s) => {
      if (s === '대기') return 'wait';
      if (s === '완료') return 'done';
      return 'wait';
    };

    const buckets = new Map(STATUS_ORDER.map(s => [s, []]));
    for (const it of sorted) {
      const s0 = (it.status || '대기').toString();
      const s = (s0 === '완료') ? '완료' : '대기';
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(it);
    }

    const makeSection = (label) => {
      const sec = document.createElement('div');
      sec.className = `plan-status-sec status-${statusClass(label)}`;
      sec.innerHTML = `
        <div class="plan-status-head">
          <div class="plan-status-title">${label}</div>
          <div class="plan-status-count"></div>
        </div>
        <div class="plan-status-list"></div>
      `;
      return sec;
    };

    // 섹션 생성(고정 순서) + 기타 상태도 맨 아래
    const statusKeys = [...STATUS_ORDER, ...Array.from(buckets.keys()).filter(s => !STATUS_ORDER.includes(s))];
    const sections = new Map();
    for (const s of statusKeys) {
      const list = buckets.get(s) || [];
      if (!list.length) continue; // 비어있으면 숨김
      const sec = makeSection(s);
      sec.querySelector('.plan-status-count').textContent = `${list.length}건`;
      wrap.appendChild(sec);
      sections.set(s, sec.querySelector('.plan-status-list'));
    }

    for (const it of sorted) {
      const company = it.company || '';
      const mode = (it.mode || 'QTY').toString().toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'QTY';
      const qty = Number(it.qty);
      const amount = Number(it.amount);
      const status = ((it.status || '대기').toString() === '완료') ? '완료' : '대기';
      const note = it.note || '';
      const account = (it.account || '').toString().trim() || '-';

      const showQty = Number.isFinite(qty) ? (fmtQty(qty) + '주') : '-';
      const showAmt = Number.isFinite(amount) ? (fmtMoney(amount) + '원') : '-';

      const card = document.createElement('div');
      card.className = 'plan-card';
      card.innerHTML = `
        <div class="plan-card-head">
          <div style="flex:1">
            <div class="plan-card-title">
              <button class="plan-company-btn" type="button" data-plan-open-price="${company}">${company || '-'}</button>
              <span class="badge status-${statusClass(status)}">${status}</span>
            </div>
            <div class="plan-subline">계좌: ${escapeHtml(account)} · 입력 방식: ${mode === 'AMOUNT' ? '금액(원)' : '주수(수량)'}</div>
          </div>
        </div>

        <div class="plan-grid">
          <div class="plan-kv">
            <div class="k">수량(주)</div>
            <div class="v">${showQty}</div>
          </div>
          <div class="plan-kv">
            <div class="k">금액(원)</div>
            <div class="v">${showAmt}</div>
          </div>
          <div class="plan-kv">
            <div class="k">구분</div>
            <div class="v">${type === 'BUY' ? '매수' : '매도'}</div>
          </div>
        </div>

        ${note ? `<div class="plan-subline" style="margin-top:10px">📝 ${escapeHtml(note)}</div>` : ''}

        <div class="plan-actions">
          <label class="plan-inline" style="margin-right:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;font-weight:700">
            상태
            <select class="plan-status-select" data-plan-status="${it.id}">
              <option value="대기">대기</option>
              <option value="완료">완료</option>
            </select>
          </label>
          <button class="secondary" type="button" data-plan-edit="${it.id}">수정</button>
          <button class="danger" type="button" data-plan-del="${it.id}">삭제</button>
        </div>
      `;

      const targetWrap = sections.get(status) || wrap;
      targetWrap.appendChild(card);

      const openBtn = card.querySelector('button[data-plan-open-price]');
      if (openBtn) openBtn.addEventListener('click', () => openPriceModal(company));

      const editBtn = card.querySelector('button[data-plan-edit]');
      if (editBtn) editBtn.addEventListener('click', () => {
        const found = arr.find(x => x.id === it.id);
        openPlanModal(type, found || it);
      });

      // 상태는 수정 버튼 없이 바로 변경
      const statusSel = card.querySelector('select[data-plan-status]');
      if (statusSel) {
        statusSel.value = status;
        statusSel.addEventListener('change', () => {
          const v = (statusSel.value || '대기').toString();
          const nextStatus = (v === '완료') ? '완료' : '대기';
          const i2 = arr.findIndex(x => x.id === it.id);
          if (i2 >= 0) {
            arr[i2] = { ...arr[i2], status: nextStatus, updatedAt: Date.now() };
            savePlans(type, arr);
            renderPlans();
          }
        });
      }
      const delBtn = card.querySelector('button[data-plan-del]');
      if (delBtn) delBtn.addEventListener('click', () => {
        const ok = confirm('삭제할까?');
        if (!ok) return;
        const next = arr.filter(x => x.id !== it.id);
        savePlans(type, next);
        renderPlans();
      });
    }
  };

  renderOne('BUY', buy, buyWrap, buyEmpty);
  renderOne('SELL', sell, sellWrap, sellEmpty);
}


function escapeHtml(s) {
  return (s ?? '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setupPlanUI() {
  // 내부 탭
  document.querySelectorAll('.plan-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-plan-tab');
      document.querySelectorAll('.plan-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.plan-page').forEach(p => p.classList.toggle('active', p.id === id));
    });
  });

  document.getElementById('buyPlanAddBtn')?.addEventListener('click', () => openPlanModal('BUY'));
  document.getElementById('sellPlanAddBtn')?.addEventListener('click', () => openPlanModal('SELL'));

  // 모달 닫기
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches('[data-plan-close]')) closePlanModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlanModal();
  });

  // 입력 변경 시 현재가 힌트 업데이트
  document.getElementById('planCompany')?.addEventListener('input', () => { updatePlanCurrentHint(); updatePlanCalcHint(); });
  document.getElementById('planAccountType')?.addEventListener('change', () => {
    const v = (document.getElementById('planAccountType')?.value || 'ISA').toString();
    const wrap = document.getElementById('planAccountOtherWrap');
    const other = document.getElementById('planAccountOther');
    if (wrap) wrap.style.display = (v === '기타') ? '' : 'none';
    if (other && v !== '기타') other.value = '';
  });
  document.getElementById('planMode')?.addEventListener('change', () => {
    const mode = getPlanMode();
    setPlanModeUI(mode);
    updatePlanCalcHint();
  });
  document.getElementById('planQty')?.addEventListener('input', updatePlanCalcHint);
  const planAmtEl = document.getElementById('planAmount');
  if (planAmtEl) {
    bindMoneyCommaInput(planAmtEl);
    planAmtEl.addEventListener('input', updatePlanCalcHint);
  }
  const unitEl = document.getElementById('planUnitPrice');
  if (unitEl) {
    bindMoneyCommaInput(unitEl);
    unitEl.addEventListener('input', updatePlanCalcHint);
  }
  document.getElementById('planFractional')?.addEventListener('change', updatePlanCalcHint);

  // 저장
  document.getElementById('planSaveBtn')?.addEventListener('click', () => {
    const type = planEditing.type;
    const company = normCompany(document.getElementById('planCompany')?.value || '');
    const acctType = (document.getElementById('planAccountType')?.value || 'ISA').toString();
    const acctOther = (document.getElementById('planAccountOther')?.value || '').toString().trim();
    const account = (acctType === '기타') ? (acctOther || '기타') : acctType;
    const mode = getPlanMode();
    const qty = num(document.getElementById('planQty')?.value);
    const amount = num(document.getElementById('planAmount')?.value);
    const isFrac = !!document.getElementById('planFractional')?.checked;
    const unitPrice = num(document.getElementById('planUnitPrice')?.value);
    const note = (document.getElementById('planNote')?.value || '').toString().trim();
    const status = (document.getElementById('planStatus')?.value || '대기').toString();

    if (!company) {
      alert('종목을 입력해줘');
      document.getElementById('planCompany')?.focus();
      return;
    }

    if (acctType === '기타' && !acctOther) {
      alert('기타 계좌명을 입력해줘');
      document.getElementById('planAccountOther')?.focus();
      return;
    }

    // mode별 필수값 체크
    if (mode === 'AMOUNT') {
      if (!Number.isFinite(amount)) {
        alert('투자금액을 숫자로 입력해줘');
        document.getElementById('planAmount')?.focus();
        return;
      }

      if (isFrac) {
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          alert('소수점 거래를 쓰려면 1주 가격(원)을 숫자로 입력해줘');
          document.getElementById('planUnitPrice')?.focus();
          return;
        }
      }
    } else {
      if (!Number.isFinite(qty)) {
        alert('수량을 숫자로 입력해줘');
        document.getElementById('planQty')?.focus();
        return;
      }
    }

    const arr = loadPlans(type);
    const now = Date.now();

    if (planEditing.id) {
      const idx = arr.findIndex(x => x.id === planEditing.id);
      const base = idx >= 0 ? arr[idx] : { id: planEditing.id };
      const next = { ...base, company, account, mode, qty: Number.isFinite(qty) ? qty : null, amount: Number.isFinite(amount) ? amount : null, fractional: isFrac, unitPrice: Number.isFinite(unitPrice) ? unitPrice : null, note, status, updatedAt: now };
      if (idx >= 0) arr[idx] = next;
      else arr.push(next);
    } else {
      arr.push({ id: makeId(), company, account, mode, qty: Number.isFinite(qty) ? qty : null, amount: Number.isFinite(amount) ? amount : null, fractional: isFrac, unitPrice: Number.isFinite(unitPrice) ? unitPrice : null, note, status, createdAt: now, updatedAt: now });
    }

    savePlans(type, arr);
    closePlanModal();
    renderPlans();
  });
}

function buildTable(rows, ledger) {
  const tbody = $("dataTable").querySelector("tbody");
  tbody.innerHTML = "";

  // group indices by date
  const groups = new Map();
  for (let i = 0; i < rows.length; i++) {
    const d = (rows[i].date || "").trim() || "(날짜없음)";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(i);
  }
  const keys = Array.from(groups.keys()).sort((a,b)=>{
    if (a === "(날짜없음)") return 1;
    if (b === "(날짜없음)") return -1;
    return b.localeCompare(a);
  });

  for (const dateKey of keys) {
    // totals per date (amount = buys - sells, realized sum)
    let totBuy = 0, totSell = 0, totReal = 0;
    for (const idx of groups.get(dateKey)) {
      const r = rows[idx];
      const side = normalizeSide(r.side);
      const price = num(r.price);
      const qty = num(r.qty);
      if (Number.isFinite(price) && Number.isFinite(qty)) {
        const amt = price * qty;
        if (side === "BUY") totBuy += amt;
        if (side === "SELL") totSell += amt;
      }
      const pr = ledger.perRow.get(idx);
      if (pr && Number.isFinite(pr.realized)) totReal += pr.realized;
    }

    const trh = document.createElement("tr");
    trh.className = "date-group-row";
    const collapsed = isGroupCollapsed(dateKey);
    trh.innerHTML = `
      <td colspan="11">
        <div class="date-group">
          <button class="toggle-btn" type="button" data-toggle="${dateKey}">${collapsed ? "펼치기" : "접기"}</button>
          <span class="date-pill">${dateKey}</span>
          <span style="opacity:.85;font-size:12px">(${groups.get(dateKey).length}건)</span>
          <div class="group-totals">
            <span>매수: ${fmtMoney(totBuy)}</span>
            <span>매도: ${fmtMoney(totSell)}</span>
            <span>실현손익: ${fmtMoney(totReal)}</span>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(trh);

    for (const idx of groups.get(dateKey)) {
      const r = rows[idx];
      const collapsedNow = collapsed;
      const tr = document.createElement("tr");
      tr.setAttribute("data-date", dateKey);
      if (collapsedNow) tr.classList.add("group-hidden");

      const side = normalizeSide(r.side);
      const price = num(r.price);
      const qty = num(r.qty);
      const amount = (Number.isFinite(price) && Number.isFinite(qty)) ? price * qty * (side === "SELL" ? -1 : 1) : NaN;

      const pr = ledger.perRow.get(idx) || { realized: NaN, cumReal: NaN };

      tr.innerHTML = `
        <td><input type="date" value="${r.date || ""}" data-k="date" data-i="${idx}"></td>
        <td><input type="text" list="closeCompanyList" value="${r.company || ""}" placeholder="예: 삼성전자" data-k="company" data-i="${idx}"
          title="※ 기업명은 정확한 기업명을 입력해야 실시간 주가 팝업이 연동됩니다."></td>
        <td>
          <div class="acct-cell">
            <select data-k="account" data-i="${idx}">
              <option value="">선택</option>
              <option value="ISA">ISA</option>
              <option value="일반">일반</option>
              <option value="기타">기타</option>
            </select>
            <input type="text" class="acct-other" placeholder="기타 계좌명" value="" data-k="accountOther" data-i="${idx}" style="display:none" />
            <button type="button" class="acct-back" data-i="${idx}" title="ISA/일반 선택으로 돌아가기" style="display:none">▾</button>
          </div>
        </td>
        <td>
          <select data-k="side" data-i="${idx}">
            <option value="BUY">매수</option>
            <option value="SELL">매도</option>
          </select>
        </td>
        <td><input type="text" inputmode="decimal" value="${r.price ?? ""}" data-k="price" data-i="${idx}" class="money-like" placeholder="단가"></td>
        <td>
          <div class="qty-cell">
            <div class="qty-row">
              <input type="number" step="any" value="${r.qty ?? ""}" data-k="qty" data-i="${idx}" class="qty-input">
              <label class="frac-toggle"><input type="checkbox" data-k="frac" data-i="${idx}"> 소수점매수</label>
            </div>
            <div class="frac-box" data-role="fracBox" data-i="${idx}" style="display:none">
              <input type="text" inputmode="decimal" value="${r.fracAmt ?? ""}" data-k="fracAmt" data-i="${idx}" class="money-like" placeholder="금액(원)">
              <input type="text" inputmode="decimal" value="${r.fracUnitPrice ?? ""}" data-k="fracUnitPrice" data-i="${idx}" class="money-like" placeholder="1주 가격(원)">
              <div class="frac-hint" data-role="fracHint" data-i="${idx}">예상 수량: -</div>
            </div>
          </div>
        </td>
        <td><span data-role="amount" data-i="${idx}">${Number.isFinite(amount) ? fmtMoney(amount) : "-"}</span></td>
        <td><span data-role="realized" data-i="${idx}">${Number.isFinite(pr.realized) ? fmtMoney(pr.realized) : "-"}</span></td>
        <td><span data-role="cumReal" data-i="${idx}">${Number.isFinite(pr.cumReal) ? fmtMoney(pr.cumReal) : "-"}</span></td>
        <td>
          <div class="row-actions">
            <div class="row-actions-grid">
              <button class="secondary" data-ins-up="${idx}" type="button">위추가</button>
              <button class="secondary" data-ins-down="${idx}" type="button">아래추가</button>
              <button class="secondary" data-move-up="${idx}" type="button">↑</button>
              <button class="secondary" data-move-down="${idx}" type="button">↓</button>
            </div>
            <button class="mini-danger" data-del="${idx}" type="button">삭제</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);

      // 계좌: ISA/일반/기타(직접입력)
      const acctSel = tr.querySelector('select[data-k="account"]');
      const acctOther = tr.querySelector('input[data-k="accountOther"]');
      const acctBack = tr.querySelector('button.acct-back');
      const acctRaw = (r.account ?? '').toString().trim();
      if (acctRaw === 'ISA' || acctRaw === '일반' || acctRaw === '') {
        acctSel.value = acctRaw;
        if (acctOther) { acctOther.value = ''; acctOther.style.display = 'none'; }
        if (acctSel) acctSel.style.visibility = 'visible';
        if (acctBack) acctBack.style.display = 'none';
      } else {
        acctSel.value = '기타';
        if (acctOther) { acctOther.value = acctRaw; acctOther.style.display = 'block'; }
        if (acctSel) acctSel.style.visibility = 'hidden';
        if (acctBack) acctBack.style.display = 'inline-flex';
      }

      // 기타 입력 상태에서 드롭다운으로 되돌리기
      if (acctBack && acctSel && acctOther) {
        acctBack.addEventListener('click', () => {
          acctOther.style.display = 'none';
          acctOther.value = '';
          acctBack.style.display = 'none';
          acctSel.style.visibility = 'visible';
          acctSel.value = '';
          // rows 업데이트
          rows[idx].account = '';
          computeAndRender();
          acctSel.focus();
        });
      }

      tr.querySelector('select[data-k="side"]').value = side || "BUY";

      // 소수점 매수 UI 초기화
      try { updateFracUI(idx); } catch {}
    }
  }

  // wire edits
  tbody.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("input", onCellEdit);
    el.addEventListener("change", onCellEdit);
  });

  // money inputs: show commas while typing (단가)
  tbody.querySelectorAll('input[data-k="price"]').forEach((inp) => bindMoneyCommaInput(inp));
  tbody.querySelectorAll('input[data-k="fracAmt"]').forEach((inp) => bindMoneyCommaInput(inp));
  tbody.querySelectorAll('input[data-k="fracUnitPrice"]').forEach((inp) => bindMoneyCommaInput(inp));

  // row action buttons
  tbody.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-del"));
      rows.splice(i, 1);
      saveRows(rows);
      renderFull();
    });
  });
  tbody.querySelectorAll("button[data-ins-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-ins-up"));
      const seedDate = (rows[i]?.date || "").trim() || ($("asOfDate").value || todayISO());
      insertRowAt(i, seedDate);
    });
  });
  tbody.querySelectorAll("button[data-ins-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-ins-down"));
      const seedDate = (rows[i]?.date || "").trim() || ($("asOfDate").value || todayISO());
      insertRowAt(i + 1, seedDate);
    });
  });
  tbody.querySelectorAll("button[data-move-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-move-up"));
      moveRow(i, i - 1);
    });
  });
  tbody.querySelectorAll("button[data-move-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-move-down"));
      moveRow(i, i + 1);
    });
  });

  // group toggle buttons
  tbody.querySelectorAll("button[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-toggle");
      const now = !isGroupCollapsed(d);
      setGroupCollapsed(d, now);
      document.querySelectorAll(`tr[data-date="${CSS.escape(d)}"]`).forEach(tr => {
        tr.classList.toggle("group-hidden", now);
      });
      btn.textContent = now ? "펼치기" : "접기";
    });
  });
}

function updateRowView(i, ledger) {
  const r = rows[i];
  const side = normalizeSide(r.side);
  const price = num(r.price);
  const qty = num(r.qty);
  const amount = (Number.isFinite(price) && Number.isFinite(qty)) ? price * qty * (side === "SELL" ? -1 : 1) : NaN;

  const pr = ledger.perRow.get(i) || { realized: NaN, cumReal: NaN };

  const elAmt = document.querySelector(`[data-role="amount"][data-i="${i}"]`);
  const elR = document.querySelector(`[data-role="realized"][data-i="${i}"]`);
  const elC = document.querySelector(`[data-role="cumReal"][data-i="${i}"]`);

  if (elAmt) elAmt.textContent = Number.isFinite(amount) ? fmtMoney(amount) : "-";
  if (elR) elR.textContent = Number.isFinite(pr.realized) ? fmtMoney(pr.realized) : "-";
  if (elC) elC.textContent = Number.isFinite(pr.cumReal) ? fmtMoney(pr.cumReal) : "-";
}

// --- 소수점 매수(매매기록) UI ---
function isFracEnabled(r) {
  return r && (r.frac === true || r.frac === '1' || r.frac === 1 || r.frac === 'true');
}

function updateFracUI(i) {
  const r = rows[i] || {};
  const cb = document.querySelector(`input[data-k="frac"][data-i="${i}"]`);
  const box = document.querySelector(`[data-role="fracBox"][data-i="${i}"]`);
  const hint = document.querySelector(`[data-role="fracHint"][data-i="${i}"]`);
  const qtyInp = document.querySelector(`input[data-k="qty"][data-i="${i}"]`);
  const amtInp = document.querySelector(`input[data-k="fracAmt"][data-i="${i}"]`);
  const unitInp = document.querySelector(`input[data-k="fracUnitPrice"][data-i="${i}"]`);
  const priceInp = document.querySelector(`input[data-k="price"][data-i="${i}"]`);

  const enabled = isFracEnabled(r);
  if (cb) cb.checked = enabled;

  if (!enabled) {
    if (box) box.style.display = 'none';
    if (qtyInp) qtyInp.readOnly = false;
    if (hint) hint.textContent = '예상 수량: -';
    return;
  }

  if (box) box.style.display = 'grid';
  if (qtyInp) qtyInp.readOnly = true;

  // 1주 가격 기본값: 단가가 있으면 복사
  const curPrice = stripCommas((priceInp?.value ?? r.price ?? '').toString());
  if (unitInp && !stripCommas((unitInp.value || '').toString()) && curPrice) {
    unitInp.value = curPrice;
    r.fracUnitPrice = curPrice;
  }

  const amt = num(stripCommas((amtInp?.value ?? r.fracAmt ?? '').toString()));
  const unit = num(stripCommas((unitInp?.value ?? r.fracUnitPrice ?? '').toString())) || num(curPrice);

  if (Number.isFinite(amt) && Number.isFinite(unit) && unit > 0) {
    const q = amt / unit;
    const qStr = (Math.round(q * 1e6) / 1e6).toString();
    // qty 입력칸/데이터 업데이트
    if (qtyInp) qtyInp.value = qStr;
    r.qty = qStr;
    // 단가가 비어있으면 1주 가격을 단가로도 채움(실현손익 계산을 위해)
    if (priceInp && !stripCommas((priceInp.value || '').toString())) {
      priceInp.value = unit.toString();
      r.price = unit.toString();
    }
    if (hint) hint.textContent = `예상 수량: ${fmtQty(q)}`;
  } else {
    if (hint) hint.textContent = '예상 수량: -';
  }
}

function onCellEdit(e) {
  const el = e.target;
  const i = Number(el.getAttribute("data-i"));
  const k = el.getAttribute("data-k");
  if (!Number.isFinite(i) || !k) return;

  if (k === "account") {
    const v = (el.value || "").toString();
    // 기타 선택 시: 아래 입력칸을 열고, 실제 값은 기타 입력칸에서 저장
    const other = document.querySelector(`input[data-k="accountOther"][data-i="${i}"]`);
    const backBtn = document.querySelector(`button.acct-back[data-i="${i}"]`);
    if (v === '기타') {
      if (other) {
        other.style.display = 'block';
        other.focus();
      }
      // select는 자리만 유지하고 보이지 않게(테이블 밀림 방지)
      el.style.visibility = 'hidden';
      if (backBtn) backBtn.style.display = 'inline-flex';
      const cur = (rows[i].account ?? '').toString().trim();
      if (cur === 'ISA' || cur === '일반' || cur === '') rows[i].account = '기타';
    } else {
      if (other) { other.value = ''; other.style.display = 'none'; }
      el.style.visibility = 'visible';
      if (backBtn) backBtn.style.display = 'none';
      rows[i].account = normalizeAccount(v);
    }
  } else if (k === "accountOther") {
    const v = (el.value || '').toString().trim();
    rows[i].account = v || '기타';
    // 입력칸을 쓰기 시작하면 select도 기타로 맞춤
    const sel = document.querySelector(`select[data-k="account"][data-i="${i}"]`);
    const backBtn = document.querySelector(`button.acct-back[data-i="${i}"]`);
    if (sel) {
      sel.value = '기타';
      sel.style.visibility = 'hidden';
    }
    if (backBtn) backBtn.style.display = 'inline-flex';
  } else if (k === "frac") {
    rows[i].frac = el.checked ? true : false;
    // 켜면 기본적으로 qty는 자동 계산 모드
    updateFracUI(i);
  } else if (k === "fracAmt") {
    rows[i].fracAmt = stripCommas(el.value);
    updateFracUI(i);
  } else if (k === "fracUnitPrice") {
    rows[i].fracUnitPrice = stripCommas(el.value);
    updateFracUI(i);
  } else if (k === "side") {
    rows[i][k] = normalizeSide(el.value);
  } else if (k === "price") {
    // allow comma-formatted input but store raw number string
    rows[i][k] = stripCommas(el.value);
    // 소수점매수 켜진 경우 1주 가격 기본값/계산 업데이트
    if (isFracEnabled(rows[i])) updateFracUI(i);
  } else {
    rows[i][k] = el.value;
  }

  saveRows(rows);

  // date change affects grouping; company/account/side/price/qty affects realized -> recompute ledger but keep cursor
  if (k === "date") {
    renderFull();
    return;
  }

  const ledger = computeLedger(rows, $("asOfDate").value || todayISO());
  updateRowView(i, ledger);
  updateDerived(ledger);
}

// --- Monthly / Charts ---
let barChart = null;
let lineChart = null;

const valueLabelPlugin = {
  id: "valueLabelPlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((el, index) => {
        const v = dataset.data[index];
        if (!Number.isFinite(v)) return;
        const text = fmtChartPct(v);
        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.fillStyle = v >= 0 ? "#111827" : "#b91c1c";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(text, el.x, el.y - 4);
        ctx.restore();
      });
    });
  }
};

function getMonthEndDate(ym) {
  // Prefer last date in closeMap within the month (YYYY-MM-DD)
  const dates = Object.keys(closeMap || {}).filter(d => d && d.startsWith(ym));
  dates.sort(); // ISO string sort asc
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i];
    const obj = closeMap[d];
    if (obj && Object.keys(obj).length > 0) return d;
  }
  return null;
}

function computeMonthlySummary(rows) {
  // Collect months from trades (YYYY-MM)
  const months = new Set();
  for (const r of rows) {
    const d = (r.date || "").trim();
    if (d && d.length >= 7) months.add(d.slice(0, 7));
  }
  const yms = Array.from(months).sort();

  // Realized + Invest (buy amount) by month/account
  const realizedByMonth = new Map(); // ym -> {isa, gen}
  const investByMonth = new Map();   // ym -> {isa, gen}

  // We need realized per row => compute once (no cutoff needed for per-row realized, it is tied to trade)
  const ledgerAll = computeLedger(rows, $("asOfDate")?.value || todayISO(), null);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const d = (r.date || "").trim();
    if (!d || d.length < 7) continue;
    const ym = d.slice(0, 7);
    const account = normalizeAccount(r.account);
    const side = normalizeSide(r.side);
    const price = num(r.price);
    const qty = num(r.qty);

    if (!investByMonth.has(ym)) investByMonth.set(ym, { isa: 0, gen: 0 });
    if (!realizedByMonth.has(ym)) realizedByMonth.set(ym, { isa: 0, gen: 0 });

    if (side === "BUY" && Number.isFinite(price) && Number.isFinite(qty)) {
      const amt = price * qty;
      if (account === "ISA") investByMonth.get(ym).isa += amt;
      if (account === "일반") investByMonth.get(ym).gen += amt;
    }

    const pr = ledgerAll.perRow.get(i);
    const realized = pr && Number.isFinite(pr.realized) ? pr.realized : 0;
    if (account === "ISA") realizedByMonth.get(ym).isa += realized;
    if (account === "일반") realizedByMonth.get(ym).gen += realized;
  }

  // Build final month array with unrealized at month end
  let cumIsaInvest = 0, cumGenInvest = 0, cumIsaPnl = 0, cumGenPnl = 0;

  const out = [];
  for (const ym of yms) {
    const endDate = getMonthEndDate(ym);
    // If no close date exists for that month, we cannot compute month-end unrealized
    let unrealIsa = NaN, unrealGen = NaN;
    if (endDate) {
      const led = computeLedger(rows, endDate, endDate);
      let uIsa = 0, uGen = 0;
      for (const p of led.positions.values()) {
        const qty = p.qty;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const close = p.lastClose;
        if (!Number.isFinite(close)) continue;
        const avg = p.avg;
        const unreal = (close - (Number.isFinite(avg) ? avg : 0)) * qty;
        if (p.account === "ISA") uIsa += unreal;
        if (p.account === "일반") uGen += unreal;
      }
      unrealIsa = uIsa;
      unrealGen = uGen;
    }

    const inv = investByMonth.get(ym) || { isa: 0, gen: 0 };
    const real = realizedByMonth.get(ym) || { isa: 0, gen: 0 };

    const isaInvest = inv.isa;
    const genInvest = inv.gen;
    const isaPnl = real.isa + (Number.isFinite(unrealIsa) ? unrealIsa : 0);
    const genPnl = real.gen + (Number.isFinite(unrealGen) ? unrealGen : 0);

    const allInvest = isaInvest + genInvest;
    const allPnl = isaPnl + genPnl;

    const isaRoi = isaInvest > 0 ? isaPnl / isaInvest : NaN;
    const genRoi = genInvest > 0 ? genPnl / genInvest : NaN;
    const allRoi = allInvest > 0 ? allPnl / allInvest : NaN;

    cumIsaInvest += isaInvest;
    cumGenInvest += genInvest;
    cumIsaPnl += isaPnl;
    cumGenPnl += genPnl;

    const cumAllInvest = cumIsaInvest + cumGenInvest;
    const cumAllPnl = cumIsaPnl + cumGenPnl;

    const isaCumRoi = cumIsaInvest > 0 ? cumIsaPnl / cumIsaInvest : NaN;
    const genCumRoi = cumGenInvest > 0 ? cumGenPnl / cumGenInvest : NaN;
    const allCumRoi = cumAllInvest > 0 ? cumAllPnl / cumAllInvest : NaN;

    out.push({
      ym,
      isaInvest, isaPnl, isaRoi,
      genInvest, genPnl, genRoi,
      allInvest, allPnl, allRoi,
      isaCumRoi, genCumRoi, allCumRoi,
      endDate: endDate || ""
    });
  }
  return out;
}

function renderMonthlyTable(monthArr) {
  const tbody = $("monthlyTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const it of monthArr) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.ym}</td>
      <td>${fmtMoney(it.isaInvest)}</td>
      <td>${fmtMoney(it.isaPnl)}</td>
      <td>${Number.isFinite(it.isaRoi) ? fmtPct(it.isaRoi) : "-"}</td>
      <td>${fmtMoney(it.genInvest)}</td>
      <td>${fmtMoney(it.genPnl)}</td>
      <td>${Number.isFinite(it.genRoi) ? fmtPct(it.genRoi) : "-"}</td>
      <td>${fmtMoney(it.allInvest)}</td>
      <td>${fmtMoney(it.allPnl)}</td>
      <td>${Number.isFinite(it.allRoi) ? fmtPct(it.allRoi) : "-"}</td>
      <td>${Number.isFinite(it.isaCumRoi) ? fmtPct(it.isaCumRoi) : "-"}</td>
      <td>${Number.isFinite(it.genCumRoi) ? fmtPct(it.genCumRoi) : "-"}</td>
      <td>${Number.isFinite(it.allCumRoi) ? fmtPct(it.allCumRoi) : "-"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderCharts(monthArr) {
  const labels = monthArr.map(x => x.ym);

  // monthly ROI in percentage points for chart labels
  const isa = monthArr.map(x => Number.isFinite(x.isaRoi) ? x.isaRoi * 100 : NaN);
  const gen = monthArr.map(x => Number.isFinite(x.genRoi) ? x.genRoi * 100 : NaN);
  const all = monthArr.map(x => Number.isFinite(x.allRoi) ? x.allRoi * 100 : NaN);

  const cumISA = monthArr.map(x => Number.isFinite(x.isaCumRoi) ? x.isaCumRoi * 100 : NaN);
  const cumGEN = monthArr.map(x => Number.isFinite(x.genCumRoi) ? x.genCumRoi * 100 : NaN);
  const cumALL = monthArr.map(x => Number.isFinite(x.allCumRoi) ? x.allCumRoi * 100 : NaN);

  if (barChart) barChart.destroy();
  if (lineChart) lineChart.destroy();

  barChart = new Chart($("barMonthly"), {
    type: "bar",
    plugins: [valueLabelPlugin],
    data: {
      labels,
      datasets: [
        { label: "ISA 월 수익률(%)", data: isa, borderRadius: 10, borderSkipped: false,
          backgroundColor: (ctx) => (ctx.raw >= 0 ? "#3b82f6" : "#93c5fd") },
        { label: "일반 월 수익률(%)", data: gen, borderRadius: 10, borderSkipped: false,
          backgroundColor: (ctx) => (ctx.raw >= 0 ? "#f43f5e" : "#fda4af") },
        { label: "전체 월 수익률(%)", data: all, borderRadius: 10, borderSkipped: false,
          backgroundColor: (ctx) => (ctx.raw >= 0 ? "#f59e0b" : "#fcd34d") },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtChartPct(ctx.parsed.y)}` } }
      },
      scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}) + "%" } } }
    }
  });

  lineChart = new Chart($("lineCumulative"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "ISA 누적(%)", data: cumISA, tension: 0.25, borderColor:"#2563eb", pointBackgroundColor:"#2563eb", pointBorderColor:"#2563eb", pointRadius:3, pointHoverRadius:4, fill:false },
        { label: "일반 누적(%)", data: cumGEN, tension: 0.25, borderColor:"#dc2626", pointBackgroundColor:"#dc2626", pointBorderColor:"#dc2626", pointRadius:3, pointHoverRadius:4, fill:false },
        { label: "전체 누적(%)", data: cumALL, tension: 0.25, borderColor:"#ea580c", pointBackgroundColor:"#ea580c", pointBorderColor:"#ea580c", pointRadius:3, pointHoverRadius:4, fill:false },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtChartPct(ctx.parsed.y)}` } }
      },
      scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}) + "%" } } }
    }
  });
}

// --- CSV ---
function exportCSV() {
  const header = ["date","company","account","side","price","qty"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const row = [
      r.date || "", r.company || "", normalizeAccount(r.account || ""),
      normalizeSide(r.side || "BUY"), r.price ?? "", r.qty ?? ""
    ].map(v => `"${String(v).replaceAll('"', '""')}"`);
    lines.push(row.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stock_trades.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
function parseCSV(text) {
  const out = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
      else if (ch === "\r") {}
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  return out;
}
function importCSV(file) {
  const rd = new FileReader();
  rd.onload = () => {
    const parsed = parseCSV(String(rd.result || ""));
    if (!parsed.length) return;

    const first = parsed[0].map(x => String(x).toLowerCase());
    let start = 0;
    if (first.includes("date") && first.includes("company") && first.includes("side")) start = 1;

    const newRows = [];
    for (let i = start; i < parsed.length; i++) {
      const [date, company, account, side, price, qty] = parsed[i];
      if (!date && !company) continue;
      newRows.push({
        date: (date || "").trim(),
        company: (company || "").trim(),
        account: normalizeAccount((account || "").trim()),
        side: normalizeSide((side || "BUY").trim()),
        price: (price || "").trim(),
        qty: (qty || "").trim(),
      });
    }
    rows = newRows;
    saveRows(rows);
    renderFull();
  };
  rd.readAsText(file, "utf-8");
}
function clearAll() {
  if (!confirm("전체 데이터를 삭제할까?")) return;
  rows = [];
  saveRows(rows);
  renderFull();
}

// --- Derived / KPIs ---
function sumByScope(items, scope) {
  // NOTE: 각 종목 평가손익은 화면(표)에서 원 단위로 반올림되어 보이므로,
  // KPI 합계도 "종목별 반올림 후 합산" 기준으로 맞춰 1원 오차를 제거한다.
  let cost = 0, unreal = 0, real = 0;
  for (const p of items) {
    if (scope === "ISA" && p.account !== "ISA") continue;
    if (scope === "GEN" && p.account !== "일반") continue;

    cost += p.cost;
    real += p.realizedCum;

    if (Number.isFinite(p.unreal)) {
      unreal += Math.round(p.unreal); // 핵심: 종목별 반올림 후 합산
    }
  }
  const total = real + unreal;
  const ret = (cost !== 0) ? (total / cost) : NaN;
  return { cost, unreal, real, total, ret };
}

function updateDerived(ledger) {
  // positions list
  const items = Array.from(ledger.positions.values())
    .filter(p => (p.company || "").trim().length > 0)
    .map(p => {
      const cost = p.qty * p.avg;
      const close = p.lastClose;
      const unreal = (Number.isFinite(close) ? (close - p.avg) * p.qty : NaN);
      return { ...p, cost, unreal };
    });

  const all = sumByScope(items, "ALL");
  const isa = sumByScope(items, "ISA");
  const gen = sumByScope(items, "GEN");

  setKpi("kpiCostAll", fmtMoney(all.cost));
  setSignedKpi("kpiUnrealAll", all.unreal, fmtMoney);
  setSignedKpi("kpiRealAll", all.real, fmtMoney);
  setSignedKpi("kpiTotalAll", all.total, fmtMoney);
  setSignedKpi("kpiRetAll", all.ret, fmtPct);

  setKpi("kpiCostISA", fmtMoney(isa.cost));
  setSignedKpi("kpiUnrealISA", isa.unreal, fmtMoney);
  setSignedKpi("kpiRealISA", isa.real, fmtMoney);
  setSignedKpi("kpiRetISA", isa.ret, fmtPct);   // ✅ 추가

  setKpi("kpiCostGEN", fmtMoney(gen.cost));
  setSignedKpi("kpiUnrealGEN", gen.unreal, fmtMoney);
  setSignedKpi("kpiRealGEN", gen.real, fmtMoney);
  setSignedKpi("kpiRetGEN", gen.ret, fmtPct);   // ✅ 추가

  buildHoldTables(ledger);

  // monthly (투자금액/손익/수익률)
  const monthArr = computeMonthlySummary(rows);
  renderMonthlyTable(monthArr);
  renderCharts(monthArr);
}

function refreshCompanyDatalist() {
  const asOfIso = $("asOfDate").value || todayISO();
  const ledger = computeLedger(rows, asOfIso);
  const fromTrades = getCompaniesInPortfolio(ledger);
  const fromClose = Object.keys(closeMap[normDateIso(asOfIso)] || {});
  const all = Array.from(new Set([...fromTrades, ...fromClose])).sort((a,b)=>a.localeCompare(b));
  let dl = document.getElementById("closeCompanyList");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "closeCompanyList";
    document.body.appendChild(dl);
  }
  dl.innerHTML = all.map(c => `<option value="${c}">`).join("");
}

function renderFull() {
  const iso = $("asOfDate").value || todayISO();
  const ledger = computeLedger(rows, iso);
  buildTable(rows, ledger);
  updateDerived(ledger);
  refreshCompanyDatalist();
  try { renderPlans(); } catch {}
}

function addEmptyRow() {
  const seed = $("asOfDate").value || todayISO();
  rows.push(blankRow(seed));
  const i = rows.length - 1;
  saveRows(rows);
  renderFull();
  scrollDataEntryToBottom();
  focusCompanyInput(i);
}

// --- Init ---
let rows = [];

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupCloudUI();
  setupEasyLoginUI();
    setupBackupUI();
  setupPlanUI();
    // AUTO_CLOUD_BOOT: URL/토큰이 저장돼 있으면 자동 불러오기
    try {
      cloudCfg = loadCloudCfg();
      if (canCloud()) {
        // 로컬에 수정중(Dirty)이면 덮어쓰지 않고 안내
        if (isDirty()) {
          setCloudStatus('로컬 변경사항이 있어 자동 불러오기를 건너뜀(저장/불러오기 선택)');
        } else {
          cloudLoadAll().catch(e => setCloudStatus(`자동 불러오기 실패 ❌ (${e.message})`, 'err'));
        }
      }
    } catch {}


  rows = loadRows();
    $("asOfDate").value = (localStorage.getItem(ASOF_KEY) || todayISO());

  $("addRowBtn")?.addEventListener("click", addEmptyRow);

  $("clearCloseBtn")?.addEventListener("click", clearCloseForDate);
  $("exportBtn")?.addEventListener("click", exportCSV);
  // 전체삭제 버튼은 제거했어요(실수 방지)
  $("asOfDate")?.addEventListener("change", () => {
    const v = normDateIso($("asOfDate").value || "");
    if (v) localStorage.setItem(ASOF_KEY, v);
    renderFull();
    scheduleCloudUpload();
  });

  $("importFile")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importCSV(f);
    e.target.value = "";
  });

  // hold scope buttons
  const setScope = (s) => {
    holdScope = s;
    $("holdScopeAll").classList.toggle("active", s === "ALL");
    $("holdScopeISA").classList.toggle("active", s === "ISA");
    $("holdScopeGEN").classList.toggle("active", s === "GEN");
    $("holdScopeETC").classList.toggle("active", s === "ETC");
    renderFull();
  };
  $("holdScopeAll").addEventListener("click", () => setScope("ALL"));
  $("holdScopeISA").addEventListener("click", () => setScope("ISA"));
  $("holdScopeGEN").addEventListener("click", () => setScope("GEN"));
  $("holdScopeETC").addEventListener("click", () => setScope("ETC"));

  if (!rows.length) {
    // 첫 실행(로컬 데이터 없음)에는 "화면용 빈 행"만 보여주고,
    // 사용자가 입력/행추가를 하기 전까지는 로컬/클라우드에 저장하지 않음(빈 데이터로 덮어쓰기 방지)
    const seed = $("asOfDate").value || todayISO();
    rows.push(blankRow(seed));
    renderFull();
  } else {
    renderFull();
  }
});

function fmtQty(n) {
  if (n === "" || n === null || n === undefined || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(n));
}
