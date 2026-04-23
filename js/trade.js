/**
 * FX counter flow:
 * - WE BUY: input is foreign amount (customer brings FX, shop pays VUV)
 * - WE SELL: input is VUV amount (customer brings VUV, shop gives FX)
 */
var LOG_KEY = "me2_trades_v1";
var FMT = { d: 4 };
/* null = use localStorage until /api/trades returns */
var __me2LogRows = null;

function getI18n() {
  if (typeof window.ME2_BOOT !== "object" || !window.ME2_BOOT || !window.ME2_BOOT.i18n) {
    return null;
  }
  return window.ME2_BOOT.i18n.en || null;
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function fmtOut(n) {
  if (n == null || !isFinite(n)) return "—";
  if (Number.isInteger(n) && Math.abs(n) < 1e12) return String(n);
  var s = Number(n).toFixed(FMT.d);
  return s.replace(/\.?0+$/, "") || "0";
}

function ymdLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function parseAmt(raw) {
  if (raw == null) return NaN;
  var t = String(raw).trim().replace(/,/g, "");
  if (t === "") return NaN;
  return parseFloat(t);
}

/** Only 0-9 and one "." (no sign, e/E, commas, spaces). */
function sanitizeDecimalInputValue(raw) {
  if (raw == null) return "";
  var t = String(raw);
  t = t.replace(/[^\d.]/g, "");
  var p = t.indexOf(".");
  if (p === -1) return t;
  return t.slice(0, p + 1) + t.slice(p + 1).replace(/\./g, "");
}

async function loadRates() {
  var fromBoot = null;
  try {
    if (window.ME2_BOOT && window.ME2_BOOT.rates) {
      fromBoot = JSON.parse(JSON.stringify(window.ME2_BOOT.rates));
    }
  } catch (e) {
    fromBoot = null;
  }
  try {
    var res = await fetch("data/rates.json", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (e) {}
  if (fromBoot) return fromBoot;
  return { baseCurrency: "VUV", currencies: [] };
}

function findCcy(list, code) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].code === code) return list[i];
  }
  return null;
}

var __me2SaveTimer = null;

function clearStatusLine(id) {
  var st = document.getElementById(id);
  if (st) {
    st.setAttribute("hidden", "");
    st.textContent = "";
    st.className = "fstatus";
  }
}

function clearInlineStatus() {
  clearStatusLine("inlineRateStatus");
  clearStatusLine("globalRateStatus");
}

function applyInlineRateToData() {
  var data = window.__me2TradeData;
  if (!data || !data.currencies) return;
  var sel = document.getElementById("tradeCcy");
  var c = findCcy(data.currencies, sel && sel.value);
  if (!c) return;
  var isBuy = document.getElementById("dirBuy") && document.getElementById("dirBuy").checked;
  var el = document.getElementById("inlineRate");
  if (!el) return;
  var raw = (el.value || "").trim();
  if (raw === "") return;
  var v = parseAmt(el.value);
  if (!isFinite(v) || v <= 0) return;
  if (isBuy) c.weBuyVatu = v;
  else c.weSellVatu = v;
}

function syncInlineInputIfNotFocused() {
  var data = window.__me2TradeData;
  if (!data || !data.currencies) return;
  var sel = document.getElementById("tradeCcy");
  var inp = document.getElementById("inlineRate");
  if (!sel || !inp) return;
  if (document.activeElement === inp) return;
  var c = findCcy(data.currencies, sel.value);
  if (!c) {
    inp.value = "";
    return;
  }
  var isBuy = document.getElementById("dirBuy") && document.getElementById("dirBuy").checked;
  var r = isBuy ? c.weBuyVatu : c.weSellVatu;
  if (r != null && isFinite(r) && r > 0) inp.value = fmtOut(r);
  else inp.value = "";
}

function schedulePersistRates() {
  clearTimeout(__me2SaveTimer);
  __me2SaveTimer = setTimeout(persistRatesToFile, 450);
}

function persistRatesToFile(statusId) {
  var t = getI18n();
  var st = document.getElementById(statusId || "inlineRateStatus");
  var data = window.__me2TradeData;
  if (!data) return;
  function errMsg() {
    return (t && t.tradeRateSaveErr) || "Save failed";
  }
  function okMsg() {
    return (t && t.tradeRateSaveOk) || "Saved";
  }
  function showErr() {
    if (st) {
      st.removeAttribute("hidden");
      st.className = "fstatus fstatus--err";
      st.textContent = errMsg();
    }
  }
  function showOk() {
    if (st) {
      st.removeAttribute("hidden");
      st.className = "fstatus fstatus--ok";
      st.textContent = okMsg();
      setTimeout(function () {
        if (st && st.className.indexOf("fstatus--ok") !== -1) st.setAttribute("hidden", "");
      }, 2000);
    }
  }
  void fetch("api/rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then(function (res) {
      if (res.status === 204 || res.ok) {
        if (t) showOk();
        return;
      }
      showErr();
    })
    .catch(function () {
      showErr();
    });
}

function isAnyGlobalInputFocused() {
  var pr = document.getElementById("panelRates");
  if (pr && (pr.hasAttribute("hidden") || pr.classList.contains("is-hid"))) {
    return false;
  }
  var t = document.getElementById("globalRatesTable");
  if (!t) return false;
  var a = document.activeElement;
  return Boolean(a && t.contains(a));
}

function updateGlobalRowForCode(code) {
  var data = window.__me2TradeData;
  if (!data || !data.currencies) return;
  var c = findCcy(data.currencies, code);
  if (!c) return;
  var tr;
  var rows = document.querySelectorAll("#globalRatesTbody tr");
  for (var j = 0; j < rows.length; j++) {
    if (rows[j].getAttribute("data-code") === code) {
      tr = rows[j];
      break;
    }
  }
  if (!tr) return;
  var b = tr.querySelector('input[data-field="weBuyVatu"]');
  var s2 = tr.querySelector('input[data-field="weSellVatu"]');
  if (b) b.value = c.weBuyVatu != null && isFinite(c.weBuyVatu) ? fmtOut(c.weBuyVatu) : "";
  if (s2) s2.value = c.weSellVatu != null && isFinite(c.weSellVatu) ? fmtOut(c.weSellVatu) : "";
}

function renderGlobalRatesTable() {
  var data = window.__me2TradeData;
  var tbody = document.getElementById("globalRatesTbody");
  if (!tbody || !data || !data.currencies) return;
  tbody.innerHTML = "";
  var i;
  for (i = 0; i < data.currencies.length; i++) {
    var c = data.currencies[i];
    var tr = document.createElement("tr");
    tr.setAttribute("data-code", c.code);
    var td0 = document.createElement("td");
    td0.className = "gr-code";
    td0.textContent = c.code;
    var td1 = document.createElement("td");
    var in1 = document.createElement("input");
    in1.type = "text";
    in1.className = "tinp gr-inp";
    in1.setAttribute("data-field", "weBuyVatu");
    in1.setAttribute("inputmode", "decimal");
    in1.setAttribute("autocomplete", "off");
    in1.value = c.weBuyVatu != null && isFinite(c.weBuyVatu) ? fmtOut(c.weBuyVatu) : "";
    var td2 = document.createElement("td");
    var in2 = document.createElement("input");
    in2.type = "text";
    in2.className = "tinp gr-inp";
    in2.setAttribute("data-field", "weSellVatu");
    in2.setAttribute("inputmode", "decimal");
    in2.setAttribute("autocomplete", "off");
    in2.value = c.weSellVatu != null && isFinite(c.weSellVatu) ? fmtOut(c.weSellVatu) : "";
    td1.appendChild(in1);
    td2.appendChild(in2);
    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
}

function applyGlobalTableToData() {
  var data = window.__me2TradeData;
  if (!data || !data.currencies) return;
  var list = document.querySelectorAll("#globalRatesTbody tr");
  for (var i = 0; i < list.length; i++) {
    var tr = list[i];
    var code = tr.getAttribute("data-code");
    if (!code) continue;
    var c = findCcy(data.currencies, code);
    if (!c) continue;
    var b = tr.querySelector('input[data-field="weBuyVatu"]');
    var s2 = tr.querySelector('input[data-field="weSellVatu"]');
    if (b) {
      var v = parseAmt(b.value);
      if (isFinite(v) && v > 0) c.weBuyVatu = v;
    }
    if (s2) {
      var v2 = parseAmt(s2.value);
      if (isFinite(v2) && v2 > 0) c.weSellVatu = v2;
    }
  }
}

function applyPhoneFieldToData() {
  var data = window.__me2TradeData;
  if (!data) return;
  var inp = document.getElementById("shopPhone");
  if (!inp) return;
  data.phone = String(inp.value || "").trim();
}

function deltaVatuShop(isBuy, xInput, r) {
  if (!isFinite(xInput) || xInput < 0 || !isFinite(r) || r <= 0) return 0;
  // Shop view:
  // - WE BUY: customer brings FX, shop pays VUV  -> negative VUV delta
  // - WE SELL: customer brings VUV, shop receives -> positive VUV delta
  if (isBuy) return -xInput * r;
  return xInput;
}

function computeLegsFx(c, base, isBuy, r, x) {
  if (!c || r == null || !isFinite(r) || r <= 0) {
    return { ok: false, legC: "—", legS: "—" };
  }
  if (x == null || !isFinite(x) || x < 0) {
    return { ok: false, legC: "—", legS: "—" };
  }
  if (x === 0) {
    if (isBuy) return { ok: true, legC: "0 " + c.code, legS: "0 " + base };
    return { ok: true, legC: "0 " + base, legS: "0 " + c.code };
  }
  if (isBuy) {
    var v = x * r;
    return { ok: true, legC: fmtOut(x) + " " + c.code, legS: fmtOut(v) + " " + base };
  }
  var fxOut = x / r;
  return { ok: true, legC: fmtOut(x) + " " + base, legS: fmtOut(fxOut) + " " + c.code };
}

function refreshAmountInputLabel() {
  var t = getI18n();
  if (!t) return;
  var isBuy = document.getElementById("dirBuy") && document.getElementById("dirBuy").checked;
  setText("lblAmtPair", isBuy ? t.tradeInForeign : t.tradeInVuv);
}

function recompute() {
  var t = getI18n();
  if (!t) return;
  var data = window.__me2TradeData;
  if (!data || !data.currencies) return;
  var sccy = document.getElementById("tradeCcy");
  if (!sccy) return;
  var c = findCcy(data.currencies, sccy.value);
  var base = data.baseCurrency || "VUV";
  var isBuy = document.getElementById("dirBuy").checked;
  refreshAmountInputLabel();
  function touchGlobalRow() {
    if (sccy && sccy.value && !isAnyGlobalInputFocused()) {
      updateGlobalRowForCode(sccy.value);
    }
  }
  syncInlineInputIfNotFocused();
  if (c) applyInlineRateToData();
  var r = isBuy ? c && c.weBuyVatu : c && c.weSellVatu;
  var raw = (document.getElementById("amt") && document.getElementById("amt").value) || "";
  var x = parseAmt(raw);

  window.__me2LastSnap = { valid: false };

  if (!c) {
    setPair("—");
    setDeal(false);
    touchGlobalRow();
    return;
  }

  if (r == null || !isFinite(r) || r <= 0) {
    setPair(t.tradeErrorRate);
    setDeal(false);
    touchGlobalRow();
    return;
  }

  if (raw === "" || String(raw).trim() === "") {
    setPair("—");
    setDeal(false);
    touchGlobalRow();
    return;
  }
  if (!isFinite(x) || x < 0) {
    setPair(t.tradeEnterAmount);
    setDeal(false);
    touchGlobalRow();
    return;
  }

  var legs = computeLegsFx(c, base, isBuy, r, x);
  setText("legRecvVal", legs.legC);
  setText("legPayVal", legs.legS);
  if (!legs.ok) {
    setDeal(false);
    touchGlobalRow();
    return;
  }
  var dV = deltaVatuShop(isBuy, x, r);
  window.__me2LastSnap = {
    valid: true,
    cCode: c.code,
    isBuy: isBuy,
    inVuv: false,
    x: x,
    rate: r,
    base: base,
    legC: legs.legC,
    legS: legs.legS,
    dV: dV,
  };
  setDeal(x > 0 && legs.ok);
  touchGlobalRow();
}

/** Receivable / Payable: same value on both, or a single error line. */
function setPair(s) {
  var t = s == null ? "—" : s;
  setText("legRecvVal", t);
  setText("legPayVal", t);
}

function setText(id, t) {
  var e = document.getElementById(id);
  if (e) e.textContent = t == null ? "" : t;
}

function setDeal(on) {
  var b = document.getElementById("btnDeal");
  if (b) b.disabled = !on;
}

function loadLogFromStorage() {
  try {
    var raw = localStorage.getItem(LOG_KEY);
    if (!raw) return { rows: [] };
    var o = JSON.parse(raw);
    if (o && Array.isArray(o.rows)) return o;
  } catch (e) {}
  return { rows: [] };
}

function loadLog() {
  if (__me2LogRows !== null) {
    return { rows: __me2LogRows.slice() };
  }
  return loadLogFromStorage();
}

function saveLog(rows) {
  var copy = rows.slice();
  __me2LogRows = copy;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify({ rows: copy }));
  } catch (e) {}
  void fetch("api/trades", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: copy }),
  }).catch(function () {});
}

function initTradeLogFromServer() {
  return fetch("api/trades", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("no api");
      return res.json();
    })
    .then(function (p) {
      var remote = p && Array.isArray(p.rows) ? p.rows : [];
      var local = loadLogFromStorage().rows;
      if (remote.length > 0) {
        __me2LogRows = remote;
      } else if (local.length > 0) {
        __me2LogRows = local;
        saveLog(__me2LogRows);
      } else {
        __me2LogRows = [];
      }
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify({ rows: __me2LogRows }));
      } catch (e) {}
    })
    .catch(function () {
      __me2LogRows = loadLogFromStorage().rows.slice();
    });
}

function escCsv(s) {
  if (s == null) return "";
  var t = String(s);
  if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

/** Today yyyy-mm-dd; cannot pick future dates. Range: from <= to, both <= today. */
function refreshLogDateBounds() {
  var today = ymdLocal(new Date());
  var one = document.getElementById("fDateOne");
  var fr = document.getElementById("fDateFrom");
  var toEl = document.getElementById("fDateTo");
  if (one) {
    one.setAttribute("max", today);
    if (one.value && one.value > today) one.value = today;
  }
  if (!fr || !toEl) return;
  fr.setAttribute("max", today);
  toEl.setAttribute("max", today);
  if (fr.value && fr.value > today) fr.value = today;
  if (toEl.value && toEl.value > today) toEl.value = today;
  var fv = fr.value;
  var tv = toEl.value;
  if (fv && tv && fv > tv) {
    toEl.value = fv;
    tv = fv;
  }
  fv = fr.value;
  tv = toEl.value;
  var frMax = today;
  if (tv) {
    frMax = tv < today ? tv : today;
  }
  fr.setAttribute("max", frMax);
  if (fv) {
    toEl.setAttribute("min", fv);
  } else {
    toEl.removeAttribute("min");
  }
  toEl.setAttribute("max", today);
}

function getFilteredRows() {
  var pack = loadLog();
  var rows = pack.rows.slice();
  if (document.getElementById("fOne") && document.getElementById("fOne").checked) {
    var d1 = (document.getElementById("fDateOne") && document.getElementById("fDateOne").value) || "";
    if (!d1) {
      return rows;
    }
    return rows.filter(function (r) {
      return ymdLocal(new Date(r.t)) === d1;
    });
  }
  var from = (document.getElementById("fDateFrom") && document.getElementById("fDateFrom").value) || "";
  var to = (document.getElementById("fDateTo") && document.getElementById("fDateTo").value) || "";
  return rows.filter(function (r) {
    var y = ymdLocal(new Date(r.t));
    if (!from && !to) return true;
    if (from && y < from) return false;
    if (to && y > to) return false;
    return true;
  });
}

function findRowById(id) {
  var pack = loadLog();
  for (var i = 0; i < pack.rows.length; i++) {
    if (pack.rows[i].id === id) return pack.rows[i];
  }
  return null;
}

function deleteLogRow(rowId) {
  var pack = loadLog();
  pack.rows = pack.rows.filter(function (x) {
    return x.id !== rowId;
  });
  saveLog(pack.rows);
  renderLogTable();
}

function onDeleteRow(ev) {
  var id = ev.currentTarget.getAttribute("data-del");
  if (!id) return;
  var t = getI18n() || {};
  if (t.tradeConfirmDeleteRow) {
    if (!window.confirm(t.tradeConfirmDeleteRow)) return;
  }
  deleteLogRow(id);
}

/**
 * Per-row net foreign amount (customer→shop) for that ccy: buy +x, sell -x.
 */
function netFxInflowCcy(rw) {
  if (!rw || !rw.cCode) return 0;
  var x = rw.x;
  if (x == null || !isFinite(x)) return 0;
  return rw.isBuy ? x : -x;
}

/**
 * Fills a single mixed summary table: first row = base (VUV) total, then one row per dealt FX ccy.
 */
function renderLogSummaryTables(list, t) {
  if (!t) return;
  var tb = document.getElementById("logSumTbody");
  if (!tb) return;
  if (!list.length) {
    tb.innerHTML = "<tr><td colspan=\"4\" class=\"m\">\u2014</td></tr>";
    return;
  }
  var base = (window.__me2TradeData && window.__me2TradeData.baseCurrency) || "VUV";
  var vuvCcy = t.tradeSumCcyVuv != null && t.tradeSumCcyVuv !== "" ? t.tradeSumCcyVuv : "VUV";
  var i;
  var sumDv = 0;
  var byCcy = {};
  var cntByCcy = {};
  var netFxByCcy = {};
  for (i = 0; i < list.length; i++) {
    var r0 = list[i];
    if (r0 && isFinite(r0.dV)) sumDv += r0.dV;
    if (!r0 || !r0.cCode) continue;
    var dv0 = r0.dV;
    if (!isFinite(dv0)) dv0 = 0;
    byCcy[r0.cCode] = (byCcy[r0.cCode] || 0) + dv0;
    cntByCcy[r0.cCode] = (cntByCcy[r0.cCode] || 0) + 1;
    netFxByCcy[r0.cCode] = (netFxByCcy[r0.cCode] || 0) + netFxInflowCcy(r0);
  }
  var n = list.length;
  var sAll = sumDv >= 0 ? "+" : "";
  var netVstr = sAll + fmtOut(sumDv);
  var inflowVuv = sAll + fmtOut(sumDv) + " " + base;
  var sl = t.tradeSumLines != null && t.tradeSumLines !== "" ? t.tradeSumLines : "trades";
  var cnt1 = n + " " + sl;
  var rows = [];
  rows.push(
    "<tr><td>" +
      esc(vuvCcy) +
      "</td><td class=\"m\">" +
      esc(cnt1) +
      "</td><td class=\"m\">" +
      esc(netVstr) +
      "</td><td class=\"m\">" +
      esc(inflowVuv) +
      "</td></tr>"
  );
  var keys = Object.keys(byCcy).sort();
  for (var k = 0; k < keys.length; k++) {
    var c = keys[k];
    var v = byCcy[c];
    var cn = cntByCcy[c] || 0;
    var sg = v >= 0 ? "+" : "";
    var cc1 = cn + " " + sl;
    var nf = netFxByCcy[c] != null && isFinite(netFxByCcy[c]) ? netFxByCcy[c] : 0;
    var sNf = nf >= 0 ? "+" : "";
    var nfStr = sNf + fmtOut(nf) + " " + c;
    rows.push(
      "<tr><td>" +
        esc(c) +
        "</td><td class=\"m\">" +
        esc(cc1) +
        "</td><td class=\"m\">" +
        esc(sg + fmtOut(v)) +
        "</td><td class=\"m\">" +
        esc(nfStr) +
        "</td></tr>"
    );
  }
  tb.innerHTML = rows.join("");
}

function renderLogTable() {
  refreshLogDateBounds();
  var t = getI18n();
  if (!t) return;
  var tbody = document.getElementById("logTbody");
  var emptyP = document.getElementById("logEmpty");
  if (!tbody) return;
  var totalAll = loadLog().rows.length;
  var list = getFilteredRows().sort(function (a, b) {
    return b.t - a.t;
  });
  if (list.length === 0) {
    tbody.innerHTML = "";
    if (emptyP) {
      if (totalAll > 0) {
        emptyP.textContent = t.tradeLogFilteredEmpty || "";
      } else {
        emptyP.textContent = t.tradeLogEmpty || "";
      }
      emptyP.style.display = "block";
    }
  } else {
    if (emptyP) emptyP.style.display = "none";
    var h = "";
    for (var j = 0; j < list.length; j++) {
      var r = list[j];
      var side = r.isBuy ? t.tradeLogSideBuy : t.tradeLogSideSell;
      var tStr = new Date(r.t).toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      h +=
        "<tr><td>" +
        esc(tStr) +
        "</td><td>" +
        esc(side) +
        "</td><td>" +
        esc(r.cCode) +
        "</td><td class='m'>" +
        esc(r.legC) +
        "</td><td class='m'>" +
        esc(r.legS) +
        "</td><td><button type='button' class='dbtn' data-del=" +
        JSON.stringify(r.id) +
        ">" +
        esc(t.tradeDelete) +
        "</button></td><td><button type='button' class='pbtn' data-rid=" +
        JSON.stringify(r.id) +
        ">" +
        esc(t.tradePrint) +
        "</button></td></tr>";
    }
    tbody.innerHTML = h;
    var btns = tbody.querySelectorAll("button.pbtn");
    for (var k = 0; k < btns.length; k++) {
      btns[k].addEventListener("click", onPrintRow);
    }
    var dels = tbody.querySelectorAll("button.dbtn");
    for (var d = 0; d < dels.length; d++) {
      dels[d].addEventListener("click", onDeleteRow);
    }
  }
  renderLogSummaryTables(list, t);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyAfterPrintCleanup(ctx) {
  if (ctx === "log") {
    document.body.className = "trade-app trade-mode-log me2-locale-en";
    setTab("log");
  } else {
    document.body.className = "trade-app me2-locale-en";
    setTab("calc");
    var am = document.getElementById("amt");
    if (am) am.value = "";
    recompute();
  }
}

/**
 * English-only receipt: 58mm thermal width, left+top on A4; also fits 58mm roll if driver uses narrow paper.
 */
function buildReceiptHtmlDocumentEn(r, data) {
  var ten = getI18n() || {};
  var brand = esc((data && data.brand && data.brand.en) || "MONEY EXCHANGE");
  var sub = esc((data && data.subtitle && data.subtitle.en) || "");
  var phoneRaw = data && data.phone != null && data.phone !== "" ? String(data.phone) : "";
  var phone = esc(phoneRaw);
  var when = esc(
    new Date(r.t).toLocaleString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
  );
  var side = r.isBuy ? (ten.tradeLogSideBuy || "We buy FX from you") : (ten.tradeLogSideSell || "We sell FX to you");
  var legIn = ten.legFromCustomer || "From customer (IN to shop)";
  var legOut = ten.legFromShop || "From shop (OUT to customer)";
  var ccy = esc(r.cCode || "—");
  var legC = esc(r.legC != null ? r.legC : "");
  var legS = esc(r.legS != null ? r.legS : "");
  var note = esc(ten.tradeNote || "For reference only. Confirm at the counter.");
  var rateBlock = "";
  if (r.rate != null && isFinite(r.rate) && r.base) {
    rateBlock =
      "<div class=\"rateb\"><span class=\"ratel\">Ref. (1 " +
      esc(r.cCode) +
      ")</span><span class=\"rater\">" +
      esc(fmtOut(r.rate)) +
      " " +
      esc(r.base) +
      "</span></div>";
  }
  var telP = phoneRaw
    ? "<p class=\"tel\">Tel: " + phone + "</p>"
    : "";
  var subP = sub
    ? "<p class=\"sub\">" + sub + "</p>"
    : "";
  var styles =
    "*{box-sizing:border-box}" +
    "html,body{min-height:auto; margin:0}" +
    "@page{size:A4 portrait; margin:6mm 10mm 14mm 10mm}" +
    "body{margin:0;padding:0;text-align:left;font:9.5pt/1.3 system-ui,'Segoe UI',Arial,sans-serif;color:#000;background:#fff}" +
    "/* 58mm receipt: black/white for screen + print; no color fills */" +
    ".receipt{width:58mm; max-width:58mm; min-width:0; margin:0; padding:0; text-align:left;}" +
    ".hdr{margin:0 0 0.3rem; padding:0 0 0.45rem; border-bottom:1.2pt solid #000;}" +
    ".h{margin:0 0 0.05rem; font-size:13.5pt; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#000; line-height:1.1; word-wrap:break-word;}" +
    ".sub{margin:0.1rem 0 0.05rem; font-size:8.5pt; font-weight:600; color:#000;}" +
    ".tel{margin:0.1rem 0 0; font-size:8.25pt; color:#333;}" +
    ".time{margin:0.35rem 0 0.2rem; font-size:7.5pt; color:#333; line-height:1.25;}" +
    ".side{margin:0.1rem 0; font-size:9.5pt; font-weight:800; color:#000; line-height:1.2; word-wrap:break-word;}" +
    ".ccy{margin:0.05rem 0 0.3rem; font-size:8.5pt; font-weight:600; color:#000;}" +
    ".rateb{display:flex; flex-direction:column; align-items:stretch; gap:0.12rem; margin:0 0 0.35rem; padding:0.2rem 0.25rem; border:0.5pt solid #000; border-radius:0; background:#fff; -webkit-print-color-adjust:economy; print-color-adjust:economy;}" +
    ".ratel{font-size:7.25pt; font-weight:600; color:#000; line-height:1.2; word-wrap:break-word;}" +
    ".rater{font-size:8.5pt; font-weight:800; text-align:right; font-variant-numeric:tabular-nums; white-space:pre-wrap; word-wrap:break-word; color:#000;}" +
    ".inout{margin:0.2rem 0 0.4rem; border:0.5pt solid #000; border-radius:0; overflow:hidden; background:#fff; -webkit-print-color-adjust:economy; print-color-adjust:economy;}" +
    ".io{display:block; padding:0.2rem 0.25rem; border-top:0.5pt solid #000; word-wrap:break-word;}" +
    ".io:first-child{border-top:0}" +
    ".iol{display:block; font-size:6.9pt; font-weight:700; line-height:1.2; color:#000; margin-bottom:0.08rem; word-wrap:break-word;}" +
    ".iov{display:block; font-size:8.25pt; font-weight:700; text-align:right; line-height:1.2; white-space:pre-wrap; word-wrap:break-word; font-variant-numeric:tabular-nums; color:#000;}" +
    ".note{margin:0.3rem 0 0; padding-top:0.3rem; border-top:0.4pt solid #000; font-size:6.8pt; line-height:1.3; color:#333;}" +
    "@media print{html{filter:grayscale(100%)}.receipt{width:58mm; max-width:58mm; margin:0; page-break-inside:avoid;}.hdr{border-bottom-color:#000}}";
  return (
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Receipt</title><style>" +
    styles +
    '</style></head><body><div class="receipt">' +
    "<header class=\"hdr\">" +
    "<h1 class=\"h\">" +
    brand +
    "</h1>" +
    subP +
    telP +
    "</header>" +
    "<p class=\"time\">" +
    when +
    "</p>" +
    "<p class=\"side\">" +
    esc(side) +
    "</p>" +
    "<p class=\"ccy\">Currency: " +
    ccy +
    "</p>" +
    rateBlock +
    "<div class=\"inout\">" +
    "<div class=\"io\"><span class=\"iol\">" +
    esc(legIn) +
    ":</span><span class=\"iov\">" +
    legC +
    "</span></div>" +
    "<div class=\"io\"><span class=\"iol\">" +
    esc(legOut) +
    ":</span><span class=\"iov\">" +
    legS +
    "</span></div>" +
    "</div>" +
    "<p class=\"note\">" +
    note +
    "</p>" +
    "</div>" +
    "</body></html>"
  );
}

/**
 * Renders the receipt in a zero-size hidden iframe, then print()s it.
 * Avoids window.open+document.write+named "me2-receipt" reuse, which in Edge/Chrome
 * can hand back the wrong window, overwrite the trade page, or leave the opener dead.
 */
function openReceiptPrintWindow(r, ctx) {
  var data = window.__me2TradeData || {};
  var html = buildReceiptHtmlDocumentEn(r, data);
  var done = false;
  var fallbackTid;
  var iframe = document.createElement("iframe");
  iframe.setAttribute("title", "receipt print");
  iframe.setAttribute("aria-hidden", "true");
  /* Off-screen, no hit-testing — does not replace or navigate the main document */
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;margin:0;padding:0;opacity:0;pointer-events:none;visibility:hidden";
  document.body.appendChild(iframe);
  var w = iframe.contentWindow;
  if (!w) {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch (e) {
      /* ignore */
    }
    window.alert("Could not prepare print frame.");
    return;
  }
  var d = w.document;
  d.open();
  d.write(html);
  d.close();
  function onAfterPrint() {
    w.removeEventListener("afterprint", onAfterPrint);
    if (done) return;
    if (fallbackTid != null) clearTimeout(fallbackTid);
    setTimeout(finish, 0);
  }
  function finish() {
    if (done) return;
    done = true;
    if (fallbackTid != null) clearTimeout(fallbackTid);
    try {
      w.removeEventListener("afterprint", onAfterPrint);
    } catch (e) {
      /* ignore */
    }
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch (e) {
      /* ignore */
    }
    try {
      window.focus();
    } catch (e) {
      /* ignore */
    }
    applyAfterPrintCleanup(ctx);
  }
  w.addEventListener("afterprint", onAfterPrint, false);
  fallbackTid = setTimeout(finish, 3e4);
  setTimeout(function () {
    try {
      w.focus();
      w.print();
    } catch (e) {
      finish();
    }
  }, 0);
}

function onPrintRow(ev) {
  var id = ev.currentTarget.getAttribute("data-rid");
  if (!id) return;
  var r = findRowById(id);
  if (r) {
    openReceiptPrintWindow(r, "log");
  }
}

function exportCsv() {
  var t = getI18n();
  if (!t) return;
  function stripTrailingCurrency(v) {
    var s = v == null ? "" : String(v).trim();
    // Stored legs look like "100 USD" / "80500 VUV"; export numbers only.
    return s.replace(/\s+[A-Za-z]{3,5}$/, "");
  }
  var list = getFilteredRows().sort(function (a, b) {
    return a.t - b.t;
  });
  var base = (window.__me2TradeData && window.__me2TradeData.baseCurrency) || "VUV";
  var h = [
    t.tradeColTime,
    t.tradeColDir,
    t.tradeColCcy,
    t.tradeColIn,
    t.tradeColOut,
  ];
  var lines = [h.map(escCsv).join(",")];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var side = r.isBuy ? t.tradeLogSideBuy : t.tradeLogSideSell;
    var ccyFlow = r.isBuy ? String(r.cCode || "—") + " TO " + base : base + " TO " + String(r.cCode || "—");
    lines.push(
      [new Date(r.t).toISOString(), side, ccyFlow, stripTrailingCurrency(r.legC), stripTrailingCurrency(r.legS)]
        .map(escCsv)
        .join(",")
    );
  }
  var blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "me2-log-" + ymdLocal(new Date()) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Exports the merged VUV+per-ccy table (same columns as on screen). */
function exportSummaryCsv() {
  var t = getI18n();
  if (!t) return;
  var list = getFilteredRows();
  if (!list.length) {
    return;
  }
  var sl = t.tradeSumLines != null && t.tradeSumLines !== "" ? t.tradeSumLines : "trades";
  var base = (window.__me2TradeData && window.__me2TradeData.baseCurrency) || "VUV";
  var vuvCcy = t.tradeSumCcyVuv != null && t.tradeSumCcyVuv !== "" ? t.tradeSumCcyVuv : "VUV";
  var i;
  var sumDv = 0;
  var byCcy = {};
  var cntByCcy = {};
  var netFxByCcy = {};
  for (i = 0; i < list.length; i++) {
    var rw0 = list[i];
    if (rw0 && isFinite(rw0.dV)) sumDv += rw0.dV;
    if (!rw0 || !rw0.cCode) continue;
    var dv0 = rw0.dV;
    if (!isFinite(dv0)) dv0 = 0;
    byCcy[rw0.cCode] = (byCcy[rw0.cCode] || 0) + dv0;
    cntByCcy[rw0.cCode] = (cntByCcy[rw0.cCode] || 0) + 1;
    netFxByCcy[rw0.cCode] = (netFxByCcy[rw0.cCode] || 0) + netFxInflowCcy(rw0);
  }
  var n = list.length;
  var sAll = sumDv >= 0 ? "+" : "";
  var netVstr = sAll + fmtOut(sumDv);
  var inflowVuv = sAll + fmtOut(sumDv) + " " + base;
  var lines = [];
  var tc =
    t.tradeSumThCount != null && t.tradeSumThCount !== ""
      ? t.tradeSumThCount
      : "Trades";
  var hdr = [t.tradeColCcy, tc, t.tradeSumThNet, t.tradeSumThNf];
  lines.push(hdr.map(escCsv).join(","));
  var cntZ = n + " " + sl;
  lines.push(
    [vuvCcy, cntZ, netVstr, inflowVuv].map(escCsv).join(",")
  );
  var keys = Object.keys(byCcy).sort();
  for (var k = 0; k < keys.length; k++) {
    var code = keys[k];
    var v2 = byCcy[code];
    var cn = cntByCcy[code] || 0;
    var cntA = cn + " " + sl;
    var sg2 = v2 >= 0 ? "+" : "";
    var nf = netFxByCcy[code] != null && isFinite(netFxByCcy[code]) ? netFxByCcy[code] : 0;
    var sNf = nf >= 0 ? "+" : "";
    var nfStr = sNf + fmtOut(nf) + " " + code;
    lines.push([code, cntA, sg2 + fmtOut(v2), nfStr].map(escCsv).join(","));
  }
  var blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "me2-summary-" + ymdLocal(new Date()) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function setTab(w) {
  var onCalc = w === "calc";
  var onRates = w === "rates";
  var onLog = w === "log";
  var pC = document.getElementById("panelCalc");
  var pR = document.getElementById("panelRates");
  var pL = document.getElementById("panelLog");
  var tC = document.getElementById("tabCalc");
  var tR = document.getElementById("tabRates");
  var tL = document.getElementById("tabLog");
  if (pC) {
    pC.classList.toggle("is-on", onCalc);
    pC.classList.toggle("is-hid", !onCalc);
    pC.toggleAttribute("hidden", !onCalc);
  }
  if (pR) {
    pR.classList.toggle("is-on", onRates);
    pR.classList.toggle("is-hid", !onRates);
    pR.toggleAttribute("hidden", !onRates);
  }
  if (pL) {
    pL.classList.toggle("is-on", onLog);
    pL.classList.toggle("is-hid", !onLog);
    pL.toggleAttribute("hidden", !onLog);
  }
  if (tC) {
    tC.classList.toggle("is-on", onCalc);
    tC.setAttribute("aria-selected", onCalc);
  }
  if (tR) {
    tR.classList.toggle("is-on", onRates);
    tR.setAttribute("aria-selected", onRates);
  }
  if (tL) {
    tL.classList.toggle("is-on", onLog);
    tL.setAttribute("aria-selected", onLog);
  }
  document.body.classList.toggle("trade-mode-log", onLog);
  document.body.classList.toggle("trade-mode-rates", onRates);
  if (onLog) renderLogTable();
  if (onRates) renderGlobalRatesTable();
}

function onDeal() {
  var s = window.__me2LastSnap;
  if (!s || !s.valid) return;
  var id = "l" + Date.now() + "_" + ((Math.random() * 1e6) | 0);
  var pack = loadLog();
  var row = {
    id: id,
    t: Date.now(),
    cCode: s.cCode,
    isBuy: s.isBuy,
    inVuv: false,
    x: s.x,
    rate: s.rate,
    base: s.base,
    legC: s.legC,
    legS: s.legS,
    dV: s.dV,
  };
  pack.rows.push(row);
  saveLog(pack.rows);
  window.__me2LastDealRow = row;
  var t0 = getI18n();
  if (t0) {
    setText("mQ", t0.tradeAfterPrintQ);
    setText("mYes", t0.tradePrintNow);
    setText("mNo", t0.tradePrintLater);
  }
  var mod = document.getElementById("printModal");
  if (mod) {
    mod.hidden = false;
  }
}

function closeModal() {
  var mod = document.getElementById("printModal");
  if (mod) mod.hidden = true;
}

function doPrintReceipt() {
  var r = window.__me2LastDealRow;
  if (!r) {
    closeModal();
    return;
  }
  closeModal();
  openReceiptPrintWindow(r, "deal");
}

function afterPrintChoiceNo() {
  closeModal();
  var am = document.getElementById("amt");
  if (am) am.value = "";
  recompute();
  setTab("calc");
}

function setDefaultFilterDates() {
  var t = ymdLocal(new Date());
  var a = document.getElementById("fDateOne");
  var f = document.getElementById("fDateFrom");
  var t2 = document.getElementById("fDateTo");
  if (a) a.value = t;
  if (f) f.value = t;
  if (t2) t2.value = t;
  refreshLogDateBounds();
}

function fillCcy(data) {
  var sel = document.getElementById("tradeCcy");
  if (!sel) return;
  var v = sel.value;
  sel.innerHTML = "";
  var list = data.currencies || [];
  var j;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    var opt = document.createElement("option");
    opt.value = o.code;
    opt.textContent = o.code + " — " + (o.nameEn != null && o.nameEn !== "" ? o.nameEn : o.nameZh);
    sel.appendChild(opt);
  }
  if (v) {
    for (j = 0; j < sel.options.length; j++) {
      if (sel.options[j].value === v) {
        sel.selectedIndex = j;
        return;
      }
    }
  }
  if (data.highlight) {
    for (j = 0; j < sel.options.length; j++) {
      if (sel.options[j].value === data.highlight) {
        sel.selectedIndex = j;
        break;
      }
    }
  }
}

function applyLabels() {
  var t = getI18n();
  if (!t) {
    setText("tradeHeader", "Load boot-data.js (run build_boot.py)");
    return false;
  }
  setText("tradePageTitle", t.tradePageTitle);
  setText("tTabX", t.tradeTabX);
  setText("tTabR", t.tradeTabR || "Rates");
  setText("tTabH", t.tradeTabH);
  setText("lblWhat", "");
  var lblWhat = document.getElementById("lblWhat");
  if (lblWhat) lblWhat.setAttribute("hidden", "");
  var lblWhatE = document.getElementById("lblWhatE");
  if (lblWhatE) {
    setText("lblWhatE", "");
    lblWhatE.setAttribute("hidden", "");
  }
  setText("sSellZ", t.tradeCustSells);
  if (document.getElementById("sSellE")) setText("sSellE", "");
  setText("sBuyZ", t.tradeCustBuys);
  if (document.getElementById("sBuyE")) setText("sBuyE", "");
  setText("lblShopRecvZ", (t.tradeShopRecv || "Receivable") + ":");
  setText("lblShopPayZ", (t.tradeShopPay || "Payable") + ":");
  if (document.getElementById("lblShopRecvE")) setText("lblShopRecvE", "");
  if (document.getElementById("lblShopPayE")) setText("lblShopPayE", "");
  setText("lblCcyPair", t.tradePickCcy);
  setText("lblRateInline", t.tradeRateWord || "Rate");
  refreshAmountInputLabel();
  setText("globalRatesTtl", t.tradeGlobalRatesTtl);
  setText("lblShopPhone", t.tradeShopPhone || "Shop phone");
  if (t.tradeGlobalRatesHint == null || String(t.tradeGlobalRatesHint).trim() === "") {
    setText("globalRatesHint", "");
  } else {
    setText("globalRatesHint", t.tradeGlobalRatesHint);
  }
  setText("btnSaveGlobalRates", t.tradeGlobalRatesSave);
  setText("thGlobalCcy", t.tradeGlobalThCcy);
  setText("thGlobalBuy", t.tradeGlobalThBuy);
  setText("thGlobalSell", t.tradeGlobalThSell);
  setText("btnClear", t.tradeClear);
  setText("btnDeal", t.tradeDeal);
  if (t.tradeDeal && document.getElementById("btnDeal")) {
    document.getElementById("btnDeal").setAttribute("title", t.tradeDeal);
  }
  setText("logH", t.tradeAllTx);
  setText("logFilterDateNote", t.tradeFilterDatesNote);
  setText("logSumTableCap", t.tradeLogSumTableCap);
  setText("thSumCcy", t.tradeColCcy);
  setText("thSumCount", t.tradeSumThCount != null && t.tradeSumThCount !== "" ? t.tradeSumThCount : "Trades");
  setText("thSumNet", t.tradeSumThNet);
  setText("thSumNf", t.tradeSumThNf);
  setText("thLDel", t.tradeDelete);
  setText("fOneLZh", t.tradeOneDay);
  if (document.getElementById("fOneLEn")) setText("fOneLEn", "");
  setText("fRangeLZh", t.tradePeriod);
  if (document.getElementById("fRangeLEn")) setText("fRangeLEn", "");
  setText("thLTime", t.tradeColTime);
  setText("thLDir", t.tradeColDir);
  setText("thLCcy", t.tradeColCcy);
  setText("thLIn", t.tradeColIn);
  setText("thLOut", t.tradeColOut);
  if (t.tradePrint) setText("thPrint", t.tradePrint);
  setText("logEmpty", t.tradeLogEmpty);
  setText("btnCsvLog", t.tradeExportLogCsv);
  setText("btnCsvSummary", t.tradeExportSummaryCsv);
  setText("btnLogClear", t.tradeClearAllLog);
  setText("linkToBoard", t.tradeBackToBoard || "Back to rate board");
  if (t.tradeAfterPrintQ) {
    setText("mQ", t.tradeAfterPrintQ);
    setText("mYes", t.tradePrintNow);
    setText("mNo", t.tradePrintLater);
  }
  clearInlineStatus();
  return true;
}

function applyHeader(data) {
  var b = (data.brand && (data.brand.en != null && data.brand.en !== "" ? data.brand.en : data.brand.zh)) || "";
  var s = (data.subtitle && (data.subtitle.en != null && data.subtitle.en !== "" ? data.subtitle.en : data.subtitle.zh)) || "";
  var line = b + (s ? " · " + s : "");
  setText("tradeHeader", line);
}

function onFilterMode() {
  if (document.getElementById("fOne") && document.getElementById("fOne").checked) {
    if (document.getElementById("fBlockOne")) document.getElementById("fBlockOne").removeAttribute("hidden");
    if (document.getElementById("fBlockRange")) document.getElementById("fBlockRange").setAttribute("hidden", "");
  } else {
    if (document.getElementById("fBlockOne")) document.getElementById("fBlockOne").setAttribute("hidden", "");
    if (document.getElementById("fBlockRange")) document.getElementById("fBlockRange").removeAttribute("hidden");
  }
  refreshLogDateBounds();
  renderLogTable();
}

function main() {
  if (!getI18n()) return;
  setDefaultFilterDates();
  document.getElementById("fOne").addEventListener("change", onFilterMode);
  document.getElementById("fRange").addEventListener("change", onFilterMode);
  ["fDateOne", "fDateFrom", "fDateTo"].forEach(function (id) {
    var de = document.getElementById(id);
    if (de) de.addEventListener("change", renderLogTable);
  });
  document.getElementById("tabCalc").addEventListener("click", function () {
    setTab("calc");
  });
  var tR = document.getElementById("tabRates");
  if (tR) {
    tR.addEventListener("click", function () {
      setTab("rates");
    });
  }
  document.getElementById("tabLog").addEventListener("click", function () {
    setTab("log");
  });
  document.getElementById("dirBuy").addEventListener("change", recompute);
  document.getElementById("dirSell").addEventListener("change", recompute);
  document.getElementById("btnDeal").addEventListener("click", onDeal);
  document.getElementById("mYes").addEventListener("click", doPrintReceipt);
  document.getElementById("mNo").addEventListener("click", afterPrintChoiceNo);
  document.getElementById("printModal").addEventListener("click", function (e) {
    if (e.target.getAttribute("data-close") != null) afterPrintChoiceNo();
  });
  var bLog = document.getElementById("btnCsvLog");
  if (bLog) bLog.addEventListener("click", exportCsv);
  var bSum = document.getElementById("btnCsvSummary");
  if (bSum) bSum.addEventListener("click", exportSummaryCsv);
  document.getElementById("btnLogClear").addEventListener("click", function () {
    var tc = getI18n();
    if (tc && !window.confirm(tc.tradeConfirmClear)) return;
    saveLog([]);
    renderLogTable();
  });
  var bc = document.getElementById("btnClear");
  if (bc) {
    bc.addEventListener("click", function () {
      var a = document.getElementById("amt");
      if (a) a.value = "";
      recompute();
    });
  }
  var sel = document.getElementById("tradeCcy");
  if (sel) {
    sel.addEventListener("change", recompute);
  }
  var am = document.getElementById("amt");
  if (am) {
    am.addEventListener("input", function () {
      var s = sanitizeDecimalInputValue(am.value);
      if (s !== am.value) am.value = s;
      recompute();
    });
  }

  var ir = document.getElementById("inlineRate");
  if (ir) {
    ir.addEventListener("input", function () {
      var s2 = sanitizeDecimalInputValue(ir.value);
      if (s2 !== ir.value) ir.value = s2;
      clearInlineStatus();
      applyInlineRateToData();
      recompute();
      schedulePersistRates();
    });
    ir.addEventListener("blur", function () {
      clearTimeout(__me2SaveTimer);
      clearInlineStatus();
      applyInlineRateToData();
      recompute();
      persistRatesToFile("inlineRateStatus");
    });
  }

  var bsg = document.getElementById("btnSaveGlobalRates");
  if (bsg) {
    bsg.addEventListener("click", function () {
      clearStatusLine("inlineRateStatus");
      applyGlobalTableToData();
      applyPhoneFieldToData();
      recompute();
      persistRatesToFile("globalRateStatus");
    });
  }

  var grTbl = document.getElementById("globalRatesTable");
  if (grTbl) {
    grTbl.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || t.nodeName !== "INPUT" || !t.classList || !t.classList.contains("gr-inp")) return;
      var s = sanitizeDecimalInputValue(t.value);
      if (s !== t.value) t.value = s;
    });
  }

  loadRates().then(function (data) {
    window.__me2TradeData = deepCopy(data);
    if (!applyLabels()) return Promise.resolve();
    applyHeader(data);
    var phoneInput = document.getElementById("shopPhone");
    if (phoneInput) {
      phoneInput.value = data && data.phone != null ? String(data.phone) : "";
    }
    fillCcy(window.__me2TradeData);
    renderGlobalRatesTable();
    recompute();
    return initTradeLogFromServer();
  }).then(function () {
    onFilterMode();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
