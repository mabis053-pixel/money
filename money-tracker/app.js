/* MONEY TRACKER - Frontend
   1) Ganti API_URL dengan URL Web App Google Apps Script.
   2) Semua request menggunakan endpoint ini.
*/
const API_URL = "https://script.google.com/macros/s/AKfycbypwOVyzvh4HGFqO8yaBp9rSv6yl1WpT8R7ib9NOLUqY8emKMNuN4LTtKcXwWqLl2a1RA/exec";

const state = {
  transactions: [],
  categories: { Pemasukan: [], Pengeluaran: [] },
  settings: { namaAplikasi: "Money Tracker", mataUang: "IDR", namaPengguna: "User", targetTabungan: 0 },
  reportPeriod: "month",
  charts: {}
};

const $ = (id) => document.getElementById(id);
const rupiah = (n) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(Number(n) || 0);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}
function localDateInput(d = new Date()) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}
function dateKey(v) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0,10);
  return localDateInput(d);
}
function formatDate(v) {
  const k = dateKey(v);
  if (!k) return "-";
  const d = new Date(`${k}T00:00:00`);
  return d.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
}
function monthKey(v) { return dateKey(v).slice(0,7); }
function parseAmount(v) {
  if (typeof v === "number") return Math.round(v);
  return Number(String(v || "").replace(/[^\d]/g, "")) || 0;
}
function formatAmountInput(v) {
  const n = parseAmount(v);
  return n ? new Intl.NumberFormat("id-ID").format(n) : "";
}

async function api(action, params = {}, method = "GET") {
  if (!API_URL || API_URL.includes("YOUR_GOOGLE")) {
    throw new Error("API_URL belum dikonfigurasi di app.js");
  }
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  let response;
  if (method === "GET") {
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  } else {
    // URLSearchParams membuat POST tetap sederhana dan menghindari preflight CORS.
    const body = new URLSearchParams({ action, ...params });
    response = await fetch(url.toString(), {
      method: "POST",
      body,
      cache: "no-store"
    });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "API error");
  return data;
}

function setLoading(show, text = "Memuat...") {
  $("loading").classList.toggle("hidden", !show);
  $("loading").querySelector("span").textContent = text;
}
let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(`page-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "report") renderReport();
}

function openModal(edit = null) {
  $("transactionModal").classList.remove("hidden");
  $("transactionForm").reset();
  $("editId").value = edit?.id || "";
  $("formTitle").textContent = edit ? "Edit Transaksi" : "Tambah Transaksi";
  $("dateInput").value = edit ? dateKey(edit.tanggal) : localDateInput();
  $("typeInput").value = edit?.jenis || "";
  populateCategoryInput();
  $("categoryInput").value = edit?.kategori || "";
  $("descriptionInput").value = edit?.deskripsi || "";
  $("amountInput").value = edit ? formatAmountInput(edit.nominal) : "";
  $("paymentInput").value = edit?.metodePembayaran || "";
  $("noteInput").value = edit?.catatan || "";
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("transactionModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function populateCategoryInput() {
  const type = $("typeInput").value;
  const current = $("categoryInput").value;
  const cats = state.categories[type] || [];
  $("categoryInput").innerHTML = `<option value="">Pilih kategori</option>` +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (cats.includes(current)) $("categoryInput").value = current;
}
function populateCategoryFilter() {
  const current = $("categoryFilter").value;
  const all = [...new Set([...state.categories.Pemasukan, ...state.categories.Pengeluaran])].sort();
  $("categoryFilter").innerHTML = `<option value="">Semua kategori</option>` +
    all.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("categoryFilter").value = current;
}

async function loadInitial() {
  setLoading(true, "Mengambil data...");
  try {
    const [cat, trx, dash] = await Promise.all([
      api("getCategories"),
      api("getTransactions"),
      api("getDashboard")
    ]);
    state.categories = cat.data || state.categories;
    state.transactions = (trx.data || []).map(normalizeTransaction);
    state.settings = { ...state.settings, ...(dash.data?.settings || {}) };
    populateCategoryInput();
    populateCategoryFilter();
    renderDashboard(dash.data);
    renderTransactions();
    renderSettings();
    $("apiStatus").textContent = "API terhubung.";
  } catch (err) {
    console.error(err);
    $("apiStatus").textContent = "API belum terhubung atau terjadi error.";
    toast(err.message.includes("API_URL") ? err.message : "Gagal mengambil data. Periksa koneksi internet.");
  } finally {
    setLoading(false);
  }
}

function normalizeTransaction(t) {
  return {
    id: t.id ?? t.ID ?? "",
    tanggal: t.tanggal ?? t.Tanggal ?? "",
    jenis: t.jenis ?? t.Jenis ?? "",
    kategori: t.kategori ?? t.Kategori ?? "",
    deskripsi: t.deskripsi ?? t.Deskripsi ?? "",
    nominal: parseAmount(t.nominal ?? t.Nominal),
    metodePembayaran: t.metodePembayaran ?? t["Metode Pembayaran"] ?? "",
    catatan: t.catatan ?? t.Catatan ?? "",
    timestamp: t.timestamp ?? t.Timestamp ?? ""
  };
}

function getTotals(items) {
  return items.reduce((a,t) => {
    if (t.jenis === "Pemasukan") a.income += t.nominal;
    if (t.jenis === "Pengeluaran") a.expense += t.nominal;
    return a;
  }, {income:0, expense:0});
}

function renderDashboard(serverDash = null) {
  const now = new Date();
  $("currentMonthLabel").textContent = now.toLocaleDateString("id-ID", { month:"long", year:"numeric" });
  $("greeting").textContent = `Halo, ${state.settings.namaPengguna || "User"} 👋`;

  const totals = getTotals(state.transactions);
  const month = monthKey(now);
  const mt = getTotals(state.transactions.filter(t => monthKey(t.tanggal) === month));
  $("balance").textContent = rupiah(totals.income - totals.expense);
  $("monthIncome").textContent = rupiah(mt.income);
  $("monthExpense").textContent = rupiah(mt.expense);
  $("transactionCount").textContent = state.transactions.length.toLocaleString("id-ID");

  const target = Number(state.settings.targetTabungan) || 0;
  const balance = totals.income - totals.expense;
  const percent = target > 0 ? Math.min(100, Math.max(0, balance / target * 100)) : 0;
  $("targetAmount").textContent = rupiah(target);
  $("targetPercent").textContent = `${Math.round(percent)}%`;
  $("targetProgress").style.width = `${percent}%`;
  $("savingProgressText").textContent = `${rupiah(Math.max(0,balance))} / ${rupiah(target)}`;
  $("targetStatus").textContent = target > 0 && balance >= target ? "Target tercapai 🎉" : "";
  $("recentTransactions").innerHTML = renderTransactionItems([...state.transactions].sort(sortNewest).slice(0,5), false);

  drawMonthlyChart($("monthlyChart"), state.transactions);
  drawCategoryChart($("categoryChart"), state.transactions);
}
function sortNewest(a,b) {
  return (dateKey(b.tanggal) + String(b.timestamp)).localeCompare(dateKey(a.tanggal) + String(a.timestamp));
}

function renderTransactions() {
  const q = $("searchInput").value.trim().toLowerCase();
  const type = $("typeFilter").value;
  const cat = $("categoryFilter").value;
  const month = $("monthFilter").value;
  let items = state.transactions.filter(t => {
    const hay = `${t.deskripsi} ${t.kategori} ${t.metodePembayaran} ${t.catatan} ${t.id}`.toLowerCase();
    return (!q || hay.includes(q)) &&
      (!type || t.jenis === type) &&
      (!cat || t.kategori === cat) &&
      (!month || monthKey(t.tanggal) === month);
  }).sort(sortNewest);
  $("allTransactions").innerHTML = renderTransactionItems(items, true);
}
function renderTransactionItems(items, actions) {
  if (!items.length) return `<div class="empty">Belum ada transaksi.</div>`;
  return items.map(t => `
    <div class="transaction-item">
      <div class="transaction-main">
        <div class="transaction-title">${esc(t.deskripsi || t.kategori || "Transaksi")}</div>
        <div class="transaction-meta">${esc(formatDate(t.tanggal))} • ${esc(t.kategori)} • ${esc(t.metodePembayaran)}</div>
      </div>
      <div class="transaction-amount ${t.jenis === "Pemasukan" ? "income" : "expense"}">
        ${t.jenis === "Pemasukan" ? "+" : "-"} ${rupiah(t.nominal)}
      </div>
      ${actions ? `<div class="transaction-actions">
        <button class="action-btn" data-edit="${esc(t.id)}">Edit</button>
        <button class="action-btn danger" data-delete="${esc(t.id)}">Hapus</button>
      </div>` : ""}
    </div>
  `).join("");
}

function aggregateByMonth(items) {
  const map = {};
  items.forEach(t => {
    const k = monthKey(t.tanggal);
    if (!k) return;
    map[k] ||= { income:0, expense:0 };
    if (t.jenis === "Pemasukan") map[k].income += t.nominal;
    else if (t.jenis === "Pengeluaran") map[k].expense += t.nominal;
  });
  return map;
}
function aggregateCategory(items) {
  const map = {};
  items.filter(t => t.jenis === "Pengeluaran").forEach(t => {
    map[t.kategori] = (map[t.kategori] || 0) + t.nominal;
  });
  return map;
}
function clearCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(280, rect.width), h = Number(canvas.getAttribute("height")) || 220;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d"); ctx.scale(dpr,dpr);
  return {ctx,w,h};
}
function drawMonthlyChart(canvas, items) {
  const {ctx,w,h} = clearCanvas(canvas);
  const map = aggregateByMonth(items);
  let keys = Object.keys(map).sort().slice(-6);
  if (!keys.length) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted"); ctx.fillText("Belum ada data", 20, 35); return; }
  const max = Math.max(1, ...keys.flatMap(k => [map[k].income,map[k].expense]));
  const pad = {l:30,r:10,t:20,b:35}, chartH=h-pad.t-pad.b, chartW=w-pad.l-pad.r;
  const groupW=chartW/keys.length, barW=Math.min(22, groupW*.28);
  ctx.font="10px system-ui"; ctx.textAlign="center";
  keys.forEach((k,i)=>{
    const x=pad.l+groupW*i+groupW/2;
    const a=map[k].income/max*chartH, b=map[k].expense/max*chartH;
    ctx.fillStyle="#16a34a"; ctx.fillRect(x-barW-2,pad.t+chartH-a,barW,a);
    ctx.fillStyle="#dc2626"; ctx.fillRect(x+2,pad.t+chartH-b,barW,b);
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");
    ctx.fillText(new Date(k+"-01T00:00:00").toLocaleDateString("id-ID",{month:"short"}),x,h-12);
  });
  ctx.textAlign="left"; ctx.fillStyle="#16a34a"; ctx.fillText("● Pemasukan",8,11); ctx.fillStyle="#dc2626"; ctx.fillText("● Pengeluaran",90,11);
}
function drawCategoryChart(canvas, items) {
  const {ctx,w,h} = clearCanvas(canvas);
  const entries = Object.entries(aggregateCategory(items)).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (!entries.length) { ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted"); ctx.fillText("Belum ada data",20,35); return; }
  const max=Math.max(1,...entries.map(x=>x[1])), barH=24, gap=11;
  ctx.font="11px system-ui";
  entries.forEach(([name,val],i)=>{
    const y=25+i*(barH+gap), width=(w-120)*(val/max);
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--surface-2"); ctx.fillRect(105,y,w-120,barH);
    ctx.fillStyle="#2563eb"; ctx.fillRect(105,y,width,barH);
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--text"); ctx.textAlign="right"; ctx.fillText(name.length>15?name.slice(0,14)+"…":name,100,y+16);
    ctx.textAlign="left"; ctx.fillText(rupiah(val),110+width,y+16);
  });
}

function renderReport() {
  const items = filterReportItems();
  const totals = getTotals(items);
  $("reportIncome").textContent = rupiah(totals.income);
  $("reportExpense").textContent = rupiah(totals.expense);
  $("reportNet").textContent = rupiah(totals.income - totals.expense);
  drawMonthlyChart($("reportMonthlyChart"), items);
  drawCategoryChart($("reportCategoryChart"), items);
  const entries = Object.entries(aggregateCategory(items)).sort((a,b)=>b[1]-a[1]);
  const total = totals.expense || 1;
  $("categoryReport").innerHTML = entries.length ? entries.map(([name,val])=>`
    <div class="report-row"><span>${esc(name)}</span><strong>${rupiah(val)} · ${Math.round(val/total*100)}%</strong></div>
  `).join("") : `<div class="empty">Belum ada data untuk periode ini.</div>`;
}
function filterReportItems() {
  const now = new Date(), today = localDateInput(now);
  if (state.reportPeriod === "today") return state.transactions.filter(t => dateKey(t.tanggal) === today);
  if (state.reportPeriod === "week") {
    const d = new Date(now); const day = d.getDay(); const diff = day === 0 ? 6 : day-1;
    const start = new Date(d); start.setDate(d.getDate()-diff); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
    return state.transactions.filter(t => { const x=new Date(dateKey(t.tanggal)+"T00:00:00"); return x>=start && x<=end; });
  }
  if (state.reportPeriod === "month") return state.transactions.filter(t => monthKey(t.tanggal) === monthKey(now));
  if (state.reportPeriod === "year") return state.transactions.filter(t => dateKey(t.tanggal).startsWith(String(now.getFullYear())));
  if (state.reportPeriod === "custom") {
    const s=$("reportStart").value, e=$("reportEnd").value;
    return state.transactions.filter(t => { const k=dateKey(t.tanggal); return (!s || k>=s) && (!e || k<=e); });
  }
  return state.transactions;
}

function renderSettings() {
  $("userName").value = state.settings.namaPengguna || "User";
  $("targetInput").value = Number(state.settings.targetTabungan) || 0;
}
async function saveSetting(param, value) {
  await api("updateSetting", { parameter:param, value:String(value) }, "POST");
}
async function refreshAll() { await loadInitial(); }

async function submitTransaction(e) {
  e.preventDefault();
  const id = $("editId").value.trim();
  const payload = {
    id,
    tanggal: $("dateInput").value,
    jenis: $("typeInput").value,
    kategori: $("categoryInput").value,
    deskripsi: $("descriptionInput").value.trim(),
    nominal: String(parseAmount($("amountInput").value)),
    metodePembayaran: $("paymentInput").value,
    catatan: $("noteInput").value.trim()
  };
  if (!payload.tanggal || !payload.jenis || !payload.kategori || !payload.metodePembayaran || Number(payload.nominal) <= 0) {
    toast("Lengkapi data wajib dan pastikan nominal lebih dari 0.");
    return;
  }
  setLoading(true, id ? "Mengubah transaksi..." : "Menyimpan transaksi...");
  try {
    await api(id ? "updateTransaction" : "addTransaction", payload, "POST");
    toast(id ? "Transaksi berhasil diubah" : "Transaksi berhasil disimpan");
    closeModal();
    await refreshAll();
    showPage("dashboard");
  } catch (err) {
    console.error(err);
    toast("Transaksi gagal disimpan.");
  } finally { setLoading(false); }
}

async function deleteTransaction(id) {
  const trx = state.transactions.find(t => t.id === id);
  if (!trx) return;
  if (!confirm(`Apakah Anda yakin ingin menghapus transaksi ini?\n\n${trx.deskripsi || trx.kategori} — ${rupiah(trx.nominal)}`)) return;
  setLoading(true, "Menghapus...");
  try {
    await api("deleteTransaction", {id}, "POST");
    toast("Transaksi berhasil dihapus");
    await refreshAll();
  } catch (err) {
    console.error(err); toast("Transaksi gagal dihapus.");
  } finally { setLoading(false); }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("moneyTrackerTheme", theme);
  $("themeBtn").textContent = theme === "dark" ? "☀" : "☾";
}
function initTheme() {
  const saved = localStorage.getItem("moneyTrackerTheme");
  applyTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
}

document.addEventListener("click", async e => {
  const nav=e.target.closest("[data-page]");
  if (nav) showPage(nav.dataset.page);
  if (e.target.closest("#themeBtn")) applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  if (e.target.closest("#addBtn") || e.target.closest("#addFab")) openModal();
  if (e.target.closest("[data-close-modal]")) closeModal();
  const edit=e.target.closest("[data-edit]");
  if (edit) openModal(state.transactions.find(t=>t.id===edit.dataset.edit));
  const del=e.target.closest("[data-delete]");
  if (del) await deleteTransaction(del.dataset.delete);
  const period=e.target.closest(".period");
  if (period) {
    document.querySelectorAll(".period").forEach(x=>x.classList.remove("active"));
    period.classList.add("active");
    state.reportPeriod=period.dataset.period;
    $("customPeriod").classList.toggle("hidden", state.reportPeriod !== "custom");
    renderReport();
  }
  const theme=e.target.closest(".theme-option");
  if (theme) applyTheme(theme.dataset.theme);
});
$("typeInput").addEventListener("change", populateCategoryInput);
$("amountInput").addEventListener("input", e => {
  const raw=e.target.value.replace(/[^\d]/g,"");
  e.target.value=raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
});
["searchInput","typeFilter","categoryFilter","monthFilter"].forEach(id => $(id).addEventListener("input", renderTransactions));
$("transactionForm").addEventListener("submit", submitTransaction);
$("refreshBtn").addEventListener("click", refreshAll);
$("applyCustom").addEventListener("click", renderReport);
$("saveSettings").addEventListener("click", async () => {
  const name=$("userName").value.trim() || "User";
  const target=Math.max(0, Number($("targetInput").value)||0);
  setLoading(true,"Menyimpan pengaturan...");
  try {
    await Promise.all([
      saveSetting("Nama Pengguna",name),
      saveSetting("Target Tabungan",target)
    ]);
    state.settings.namaPengguna=name; state.settings.targetTabungan=target;
    renderDashboard(); toast("Pengaturan berhasil disimpan");
  } catch(e) { console.error(e); toast("Pengaturan gagal disimpan."); }
  finally { setLoading(false); }
});
window.addEventListener("resize", () => {
  if ($("page-dashboard").classList.contains("active")) renderDashboard();
  if ($("page-report").classList.contains("active")) renderReport();
});
initTheme();
$("dateInput").value = localDateInput();
loadInitial();
