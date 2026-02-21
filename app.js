const STORAGE_KEY = "stockTradeRows.v1";
const CLOSE_KEY = "stockTradeCloseByDate.v1";

const COLLAPSE_KEY = "stockTradeCollapseDates.v1";
const $ = (id) => document.getElementById(id);

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
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
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
}
let collapsedDates = loadCollapsed();
let closeMap = loadCloseMap();
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
  const d = closeMap?.[asOfIso] || {};
  const v = d[company];
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function setCloseFor(asOfIso, company, value) {
  if (!closeMap[asOfIso]) closeMap[asOfIso] = {};
  if (!Number.isFinite(value)) {
    delete closeMap[asOfIso][company];
  } else {
    closeMap[asOfIso][company] = value;
  }
  saveCloseMap(closeMap);
}

function buildCloseTable(ledger) {
  const asOfIso = $("asOfDate").value || todayISO();
  const tbody = $("closeTable").querySelector("tbody");
  tbody.innerHTML = "";

  const companies = getCompaniesInPortfolio(ledger);
  if (!companies.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color:#64748b">기업명을 입력하면 여기에서 기준일 종가를 한 번만 입력할 수 있어요.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const c of companies) {
    const v = getCloseFor(asOfIso, c);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:left">${c}</td>
      <td><input type="number" step="any" data-close-company="${c}" value="${Number.isFinite(v) ? v : ""}" placeholder="미입력은 -"></td>
      <td style="color:#475569; font-variant-numeric: tabular-nums">${asOfIso}</td>
    `;
    tbody.appendChild(tr);
  }

  // IMPORTANT: 입력 중 포커스가 날아가지 않게, 여기서는 renderFull()을 호출하지 않음.
  // closeMap만 업데이트하고, 파생(평가손익/대시보드)만 다시 계산한다.
  tbody.querySelectorAll("input[data-close-company]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const company = inp.getAttribute("data-close-company");
      const v = Number(inp.value);
      if (inp.value === "") setCloseFor(asOfIso, company, NaN);
      else setCloseFor(asOfIso, company, v);

      const ledger2 = computeLedger(rows, asOfIso);
      updateDerived(ledger2);
    });
  });
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
let holdScope = "ALL"; // ALL | ISA | GEN

function buildHoldTables(ledger) {
  const allItems = Array.from(ledger.positions.values())
    .filter(p => (p.company || "").trim().length > 0)
    .filter(p => {
      if (holdScope === "ISA") return p.account === "ISA";
      if (holdScope === "GEN") return p.account === "일반";
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
  renderHoldTableTo("holdTableClosed", closed, "전량 매도한 종목이 여기에 표시돼요.");
}

function renderHoldTableTo(tableId, items, emptyMsg) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="10" style="color:#64748b">${emptyMsg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const p of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.company}</td>
      <td>${p.account}</td>
      <td>${fmtQty(p.qty)}</td>
      <td>${Number.isFinite(p.avg) ? fmtMoney(p.avg) : "-"}</td>
      <td>${fmtMoney(p.cost)}</td>
      <td>${Number.isFinite(p.close) ? fmtMoney(p.close) : "-"}</td>
      <td>${Number.isFinite(p.unreal) ? fmtMoney(p.unreal) : "-"}</td>
      <td>${fmtMoney(p.realizedCum)}</td>
      <td>${fmtMoney(p.total)}</td>
      <td>${Number.isFinite(p.ret) ? fmtPct(p.ret) : "-"}</td>
    `;
    tbody.appendChild(tr);
  }
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
        <td><input type="text" value="${r.company || ""}" placeholder="예: 삼성전자" data-k="company" data-i="${idx}"></td>
        <td>
          <select data-k="account" data-i="${idx}">
            <option value="">선택</option>
            <option value="ISA">ISA</option>
            <option value="일반">일반</option>
          </select>
        </td>
        <td>
          <select data-k="side" data-i="${idx}">
            <option value="BUY">매수</option>
            <option value="SELL">매도</option>
          </select>
        </td>
        <td><input type="number" step="any" value="${r.price ?? ""}" data-k="price" data-i="${idx}"></td>
        <td><input type="number" step="any" value="${r.qty ?? ""}" data-k="qty" data-i="${idx}"></td>
        <td><span data-role="amount" data-i="${idx}">${Number.isFinite(amount) ? fmtMoney(amount) : "-"}</span></td>
        <td><span data-role="realized" data-i="${idx}">${Number.isFinite(pr.realized) ? fmtMoney(pr.realized) : "-"}</span></td>
        <td><span data-role="cumReal" data-i="${idx}">${Number.isFinite(pr.cumReal) ? fmtMoney(pr.cumReal) : "-"}</span></td>
        <td>
          <div class="row-actions">
            <button class="secondary" data-ins-up="${idx}" type="button">위추가</button>
            <button class="secondary" data-ins-down="${idx}" type="button">아래추가</button>
            <button class="secondary" data-move-up="${idx}" type="button">↑</button>
            <button class="secondary" data-move-down="${idx}" type="button">↓</button>
            <button class="mini-danger" data-del="${idx}" type="button">삭제</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);

      tr.querySelector('select[data-k="account"]').value = normalizeAccount(r.account);
      tr.querySelector('select[data-k="side"]').value = side || "BUY";
    }
  }

  // wire edits
  tbody.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("input", onCellEdit);
    el.addEventListener("change", onCellEdit);
  });

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

function onCellEdit(e) {
  const el = e.target;
  const i = Number(el.getAttribute("data-i"));
  const k = el.getAttribute("data-k");
  if (!Number.isFinite(i) || !k) return;

  if (k === "account") rows[i][k] = normalizeAccount(el.value);
  else if (k === "side") rows[i][k] = normalizeSide(el.value);
  else rows[i][k] = el.value;

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

function renderFull() {
  const iso = $("asOfDate").value || todayISO();
  const ledger = computeLedger(rows, iso);
  buildTable(rows, ledger);
  buildCloseTable(ledger);
  updateDerived(ledger);
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
  rows = loadRows();
  $("asOfDate").value = todayISO();

  $("addRowBtn").addEventListener("click", addEmptyRow);
  $("applyBulkCloseBtn").addEventListener("click", applyBulkClose);
  $("clearCloseBtn").addEventListener("click", clearCloseForDate);
  $("exportBtn").addEventListener("click", exportCSV);
  $("clearBtn").addEventListener("click", clearAll);
  $("asOfDate").addEventListener("change", renderFull);

  $("importFile").addEventListener("change", (e) => {
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
    renderFull();
  };
  $("holdScopeAll").addEventListener("click", () => setScope("ALL"));
  $("holdScopeISA").addEventListener("click", () => setScope("ISA"));
  $("holdScopeGEN").addEventListener("click", () => setScope("GEN"));

  if (!rows.length) addEmptyRow();
  else renderFull();
});

function fmtQty(n) {
  if (n === "" || n === null || n === undefined || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(n));
}
