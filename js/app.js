/**
 * English rate board: 5s rotation; hero always matches the highlighted list row.
 */
var ME2_ROTATE_TIMER = null;

function me2SetTableHighlight(index) {
  var tb = document.getElementById("rateBody");
  if (!tb) return;
  for (var j = 0; j < tb.children.length; j++) {
    tb.children[j].classList.toggle("is-highlight", j === index);
  }
}

function fmt(tpl, map) {
  return tpl.replace(/\{(\w+)\}/g, function (_, k) {
    return map[k] != null ? String(map[k]) : "";
  });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** One English line (replaces old zh | en) */
function enLine(s) {
  return (
    '<div class="one-line one-line--en" translate="no">' + '<span class="ol-en" lang="en">' + esc(s) + "</span>" + "</div>"
  );
}

function enPairLine(s) {
  return (
    '<div class="pair-name" lang="en">' + esc(s) + "</div>"
  );
}

function heroEn(s) {
  return (
    '<div class="hero-pair-stacked hero-pair--en" translate="no">' +
    '<div class="hero-pair-en" lang="en">' +
    esc(s) +
    "</div>" +
    "</div>"
  );
}

function getT() {
  if (typeof window.ME2_BOOT !== "object" || !window.ME2_BOOT || !window.ME2_BOOT.i18n) {
    return null;
  }
  return window.ME2_BOOT.i18n.en || null;
}

function me2IsFullscreen() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
  );
}

function me2ExitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.resolve();
}

function me2EnterFullscreen() {
  var el = document.documentElement;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.resolve();
}

function me2UpdateBoardFsButton(t) {
  var b = document.getElementById("btnBoardFs");
  if (!b || !t) return;
  if (me2IsFullscreen()) {
    b.textContent = t.boardExitFullscreen || "Exit full screen";
    b.setAttribute("aria-pressed", "true");
    b.setAttribute("aria-label", t.boardExitFullscreen || "Exit full screen");
  } else {
    b.textContent = t.boardFullscreen || "Full screen";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", t.boardFullscreen || "Full screen");
  }
}

function onBoardFsClick() {
  var t = getT();
  if (me2IsFullscreen()) {
    me2ExitFullscreen()
      .then(function () {
        if (t) me2UpdateBoardFsButton(t);
      })
      .catch(function () {});
  } else {
    me2EnterFullscreen()
      .then(function () {
        if (t) me2UpdateBoardFsButton(t);
      })
      .catch(function () {
        if (t) me2UpdateBoardFsButton(t);
      });
  }
}

function me2SyncSignageLayoutClass() {
  var root = document.documentElement;
  if (!root || !root.classList.contains("view-signage-root")) return;
  if (me2IsFullscreen()) {
    root.classList.add("me2-signage-fullscreen");
  } else {
    root.classList.remove("me2-signage-fullscreen");
  }
}

function onBoardFsChange() {
  var t = getT();
  me2SyncSignageLayoutClass();
  if (t) me2UpdateBoardFsButton(t);
}

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return Number(n).toFixed(2).replace(/\.?0+$/, "");
}

function updateHero(t, cur) {
  if (!cur) return;
  var buyL = fmt(t.toVatuFmt, { code: cur.code });
  var sellL = fmt(t.vatuToFmt, { code: cur.code });
  document.getElementById("mainBuyLabel").innerHTML = heroEn(buyL);
  document.getElementById("mainBuyNum").textContent = fmtNum(cur.weBuyVatu);
  document.getElementById("mainSellLabel").innerHTML = heroEn(sellL);
  document.getElementById("mainSellNum").textContent = fmtNum(cur.weSellVatu);
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
  return {
    brand: { en: "NO. 1 HOLDINGS", zh: "" },
    subtitle: { en: "MONEY EXCHANGE", zh: "" },
    phone: "5310026",
    highlight: "USD",
    currencies: [],
  };
}

function startPairRotation(data, t, list) {
  if (ME2_ROTATE_TIMER) {
    clearInterval(ME2_ROTATE_TIMER);
    ME2_ROTATE_TIMER = null;
  }

  var tbody = document.getElementById("rateBody");
  var listView = document.getElementById("listView");
  if (!tbody || !listView || list.length === 0) return;

  listView.classList.remove("list-view--static");

  /* Always rotate through pairs so TV boards behave the same for every customer.
     If the user prefers reduced motion, we only skip smooth scrolling — not the rotation. */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FOCUS_MS = 5000;

  var h = data && data.highlight != null ? String(data.highlight) : "";
  var startIdx = 0;
  for (var s = 0; s < list.length; s++) {
    if (list[s].code === h) {
      startIdx = s;
      break;
    }
  }

  function focusIndex(index) {
    var cur = list[index];
    if (!cur) return;
    updateHero(t, cur);
    me2SetTableHighlight(index);
    var tr = tbody.children[index];
    if (tr) {
      tr.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
  }

  var i = startIdx;
  focusIndex(i);
  ME2_ROTATE_TIMER = window.setInterval(function () {
    i = (i + 1) % list.length;
    focusIndex(i);
  }, FOCUS_MS);
}

function render(data) {
  var t = getT();
  if (!t) {
    var le = document.getElementById("listTitle");
    if (le) {
      le.textContent = "Load boot-data.js (run build_boot.py) first";
    } else {
      var hb = document.getElementById("headerBlock");
      if (hb) hb.textContent = "Load boot-data.js (run build_boot.py) first";
    }
    return;
  }
  me2UpdateBoardFsButton(t);

  var brand = (data.brand && (data.brand.en || data.brand.zh)) || "";
  var sub = (data.subtitle && (data.subtitle.en || data.subtitle.zh)) || "";
  var phone = data.phone;

  var listTitle = document.getElementById("listTitle");
  if (listTitle) {
    listTitle.innerHTML = enLine(t.listTitle);
  }

  var foot = fmt(t.footerLineFmt, { brand: brand, sub: sub, phone: phone });
  document.getElementById("footerText").innerHTML =
    '<div class="dual dual--en" lang="en"><div class="d-en">' + esc(foot) + "</div></div>";
  var ltr = document.getElementById("linkToTrade");
  if (ltr) ltr.textContent = t.boardToTrade || "Open trade";

  document.getElementById("thPair").innerHTML = enLine(t.thCcy);
  document.getElementById("thBuy").innerHTML = enLine(t.weBuy);
  document.getElementById("thSell").innerHTML = enLine(t.weSell);

  var list = data.currencies || [];

  if (list.length === 0) {
    document.getElementById("mainBuyNum").textContent = "--";
    document.getElementById("mainSellNum").textContent = "--";
    document.getElementById("mainBuyLabel").innerHTML = heroEn(t.empty);
    document.getElementById("mainSellLabel").innerHTML = heroEn(t.empty);
    document.getElementById("rateBody").innerHTML = "";
    return;
  }

  var tbody = document.getElementById("rateBody");
  tbody.innerHTML = "";
  for (var r = 0; r < list.length; r++) {
    var c = list[r];
    var tr = document.createElement("tr");
    var nm = c.nameEn != null && String(c.nameEn) !== "" ? c.nameEn : c.nameZh;

    var pairHtml =
      '<td><div class="pair-cell">' + '<span class="cc">' + esc(c.code) + "</span>" + enPairLine(nm) + "</div></td>";
    var buyL = fmt(t.toVatuFmt, { code: c.code });
    var sellL = fmt(t.vatuToFmt, { code: c.code });
    tr.innerHTML =
      pairHtml +
      "<td><div class=\"cell-stack\">" +
      enPairLine(buyL) +
      '<span class="num">' +
      esc(fmtNum(c.weBuyVatu)) +
      "</span></div></td>" +
      "<td><div class=\"cell-stack\">" +
      enPairLine(sellL) +
      '<span class="frac">' +
      esc(fmtNum(c.weSellVatu)) +
      "</span></div></td>";
    var tds = tr.querySelectorAll("td");
    if (tds[1]) tds[1].setAttribute("data-lbl-buy", t.weBuy);
    if (tds[2]) tds[2].setAttribute("data-lbl-sell", t.weSell);
    tbody.appendChild(tr);
  }

  startPairRotation(data, t, list);
}

function main() {
  if (!getT()) return;
  me2SyncSignageLayoutClass();
  var bfs = document.getElementById("btnBoardFs");
  if (bfs) bfs.addEventListener("click", onBoardFsClick);
  document.addEventListener("fullscreenchange", onBoardFsChange);
  document.addEventListener("webkitfullscreenchange", onBoardFsChange);
  try {
    document.addEventListener("MSFullscreenChange", onBoardFsChange);
  } catch (e) {
    /* ignore */
  }
  loadRates().then(function (data) {
    render(data);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
