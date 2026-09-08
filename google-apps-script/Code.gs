/**
 * MONEY TRACKER - Google Apps Script REST API
 *
 * Spreadsheet structure:
 * TRANSAKSI:
 * A ID | B Tanggal | C Jenis | D Kategori | E Deskripsi |
 * F Nominal | G Metode Pembayaran | H Catatan | I Timestamp
 *
 * KATEGORI:
 * A Jenis | B Kategori
 *
 * PENGATURAN:
 * A Parameter | B Nilai
 *
 * Run setupDatabase() ONCE after binding this script to your spreadsheet.
 */

const SHEET_NAMES = {
  TRANSAKSI: "TRANSAKSI",
  KATEGORI: "KATEGORI",
  PENGATURAN: "PENGATURAN"
};

const DEFAULT_CATEGORIES = [
  ["Pemasukan","Gaji"],
  ["Pemasukan","Bonus"],
  ["Pemasukan","Freelance"],
  ["Pemasukan","Bisnis"],
  ["Pemasukan","Investasi"],
  ["Pemasukan","Lainnya"],
  ["Pengeluaran","Makan"],
  ["Pengeluaran","Transportasi"],
  ["Pengeluaran","Belanja"],
  ["Pengeluaran","Tagihan"],
  ["Pengeluaran","Cicilan"],
  ["Pengeluaran","Hiburan"],
  ["Pengeluaran","Kesehatan"],
  ["Pengeluaran","Pendidikan"],
  ["Pengeluaran","Zakat"],
  ["Pengeluaran","Lainnya"]
];

const DEFAULT_SETTINGS = [
  ["Nama Aplikasi","Money Tracker"],
  ["Mata Uang","IDR"],
  ["Nama Pengguna","User"],
  ["Target Tabungan","0"]
];

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  createOrResetHeader_(ss, SHEET_NAMES.TRANSAKSI, [
    "ID","Tanggal","Jenis","Kategori","Deskripsi","Nominal",
    "Metode Pembayaran","Catatan","Timestamp"
  ]);
  const cat = createOrResetHeader_(ss, SHEET_NAMES.KATEGORI, ["Jenis","Kategori"]);
  if (cat.getLastRow() < 2) {
    cat.getRange(2,1,DEFAULT_CATEGORIES.length,2).setValues(DEFAULT_CATEGORIES);
  }
  const settings = createOrResetHeader_(ss, SHEET_NAMES.PENGATURAN, ["Parameter","Nilai"]);
  if (settings.getLastRow() < 2) {
    settings.getRange(2,1,DEFAULT_SETTINGS.length,2).setValues(DEFAULT_SETTINGS);
  }
  ss.getSheetByName(SHEET_NAMES.TRANSAKSI).getRange("B:B").setNumberFormat("dd/MM/yyyy");
  ss.getSheetByName(SHEET_NAMES.TRANSAKSI).getRange("F:F").setNumberFormat("#,##0");
  return {success:true, message:"Database siap digunakan."};
}

function createOrResetHeader_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  sh.setFrozenRows(1);
  return sh;
}

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const p = getParams_(e);
    const action = String(p.action || "").trim();

    switch(action) {
      case "getTransactions": return json_(getTransactions_());
      case "getTransaction": return json_(getTransaction_(p.id));
      case "getCategories": return json_(getCategories_());
      case "getDashboard": return json_(getDashboard_());
      case "addTransaction": return json_(addTransaction_(p));
      case "updateTransaction": return json_(updateTransaction_(p));
      case "deleteTransaction": return json_(deleteTransaction_(p));
      case "updateSetting": return json_(updateSetting_(p));
      default: return json_({success:false, message:"Action tidak dikenal."});
    }
  } catch(err) {
    console.error(err);
    return json_({success:false, message:err.message || "Terjadi kesalahan server."});
  }
}

function getParams_(e) {
  const out = {};
  const q = e && e.parameter ? e.parameter : {};
  Object.keys(q).forEach(k => out[k] = q[k]);
  return out;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("Sheet " + name + " belum dibuat. Jalankan setupDatabase().");
  return sh;
}

function getTransactions_() {
  const sh = getSheet_(SHEET_NAMES.TRANSAKSI);
  const last = sh.getLastRow();
  if (last < 2) return {success:true, data:[]};
  const rows = sh.getRange(2,1,last-1,9).getValues();
  const data = rows.filter(r => r[0] !== "").map(rowToTransaction_);
  data.sort((a,b) => {
    const da = new Date(a.tanggal).getTime() || 0;
    const db = new Date(b.tanggal).getTime() || 0;
    if (db !== da) return db-da;
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
  return {success:true, data:data};
}

function rowToTransaction_(r) {
  return {
    id: String(r[0]),
    tanggal: formatDate_(r[1]),
    jenis: String(r[2]),
    kategori: String(r[3]),
    deskripsi: String(r[4] || ""),
    nominal: Number(r[5]) || 0,
    metodePembayaran: String(r[6] || ""),
    catatan: String(r[7] || ""),
    timestamp: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || "")
  };
}

function getTransaction_(id) {
  validateId_(id);
  const sh = getSheet_(SHEET_NAMES.TRANSAKSI);
  const row = findRowById_(sh, id);
  if (!row) return {success:false, message:"Transaksi tidak ditemukan."};
  return {success:true, data:rowToTransaction_(sh.getRange(row,1,1,9).getValues()[0])};
}

function getCategories_() {
  const sh = getSheet_(SHEET_NAMES.KATEGORI);
  const last = sh.getLastRow();
  const result = {Pemasukan:[], Pengeluaran:[]};
  if (last < 2) return {success:true, data:result};
  sh.getRange(2,1,last-1,2).getValues().forEach(r => {
    const type = String(r[0] || "").trim();
    const cat = String(r[1] || "").trim();
    if ((type === "Pemasukan" || type === "Pengeluaran") && cat && !result[type].includes(cat)) result[type].push(cat);
  });
  return {success:true, data:result};
}

function getSettings_() {
  const sh = getSheet_(SHEET_NAMES.PENGATURAN);
  const out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2,1,sh.getLastRow()-1,2).getValues().forEach(r => {
    if (r[0]) {
      const key = normalizeSettingKey_(r[0]);
      out[key] = r[1];
    }
  });
  out.targetTabungan = Number(out.targetTabungan) || 0;
  out.namaPengguna = String(out.namaPengguna || "User");
  return out;
}

function normalizeSettingKey_(key) {
  const s = String(key).trim().toLowerCase();
  if (s === "nama aplikasi") return "namaAplikasi";
  if (s === "mata uang") return "mataUang";
  if (s === "nama pengguna") return "namaPengguna";
  if (s === "target tabungan") return "targetTabungan";
  return String(key).trim();
}

function getDashboard_() {
  const tx = getTransactions_().data;
  const settings = getSettings_();
  const now = new Date();
  const month = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
  let income = 0, expense = 0, monthIncome = 0, monthExpense = 0;
  const byMonth = {}, byCategory = {};
  tx.forEach(t => {
    const amount = Number(t.nominal) || 0;
    const m = String(t.tanggal).slice(0,7);
    if (t.jenis === "Pemasukan") {
      income += amount;
      if (m === month) monthIncome += amount;
      byMonth[m] = byMonth[m] || {income:0, expense:0};
      byMonth[m].income += amount;
    } else if (t.jenis === "Pengeluaran") {
      expense += amount;
      if (m === month) monthExpense += amount;
      byMonth[m] = byMonth[m] || {income:0, expense:0};
      byMonth[m].expense += amount;
      byCategory[t.kategori] = (byCategory[t.kategori] || 0) + amount;
    }
  });
  return {
    success:true,
    data:{
      settings:settings,
      balance:income-expense,
      monthIncome:monthIncome,
      monthExpense:monthExpense,
      transactionCount:tx.length,
      byMonth:byMonth,
      byCategory:byCategory,
      recent:tx.slice(0,5)
    }
  };
}

function validateTransaction_(p, isUpdate) {
  const jenis = String(p.jenis || "").trim();
  const kategori = String(p.kategori || "").trim();
  const tanggal = String(p.tanggal || "").trim();
  const nominal = Number(p.nominal);
  const metode = String(p.metodePembayaran || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error("Tanggal wajib valid.");
  if (!["Pemasukan","Pengeluaran"].includes(jenis)) throw new Error("Jenis transaksi tidak valid.");
  if (!kategori) throw new Error("Kategori wajib diisi.");
  if (!Number.isFinite(nominal) || nominal <= 0) throw new Error("Nominal harus lebih dari 0.");
  if (!["Tunai","Transfer","E-Wallet","Debit","Kartu Kredit","Lainnya"].includes(metode)) throw new Error("Metode pembayaran tidak valid.");
  if (String(p.deskripsi || "").length > 150) throw new Error("Deskripsi terlalu panjang.");
  if (String(p.catatan || "").length > 300) throw new Error("Catatan terlalu panjang.");
  if (isUpdate) validateId_(p.id);
  validateCategory_(jenis, kategori);
  return {
    tanggal:tanggal,
    jenis:jenis,
    kategori:kategori,
    deskripsi:String(p.deskripsi || "").trim(),
    nominal:Math.round(nominal),
    metodePembayaran:metode,
    catatan:String(p.catatan || "").trim()
  };
}

function validateCategory_(jenis, kategori) {
  const cats = getCategories_().data[jenis] || [];
  if (!cats.includes(kategori)) throw new Error("Kategori tidak tersedia untuk jenis transaksi tersebut.");
}

function addTransaction_(p) {
  const v = validateTransaction_(p, false);
  const sh = getSheet_(SHEET_NAMES.TRANSAKSI);
  const id = nextTransactionId_(sh);
  const timestamp = new Date();
  sh.appendRow([id, new Date(v.tanggal+"T00:00:00"), v.jenis, v.kategori, v.deskripsi, v.nominal, v.metodePembayaran, v.catatan, timestamp]);
  return {success:true, message:"Transaction saved", data:{id:id}};
}

function updateTransaction_(p) {
  const v = validateTransaction_(p, true);
  const sh = getSheet_(SHEET_NAMES.TRANSAKSI);
  const row = findRowById_(sh, p.id);
  if (!row) return {success:false, message:"Transaksi tidak ditemukan."};
  const oldTimestamp = sh.getRange(row,9).getValue() || new Date();
  sh.getRange(row,1,1,9).setValues([[
    p.id, new Date(v.tanggal+"T00:00:00"), v.jenis, v.kategori, v.deskripsi,
    v.nominal, v.metodePembayaran, v.catatan, oldTimestamp
  ]]);
  return {success:true, message:"Transaction updated", data:{id:p.id}};
}

function deleteTransaction_(p) {
  validateId_(p.id);
  const sh = getSheet_(SHEET_NAMES.TRANSAKSI);
  const row = findRowById_(sh, p.id);
  if (!row) return {success:false, message:"Transaksi tidak ditemukan."};
  sh.deleteRow(row);
  return {success:true, message:"Transaction deleted", data:{id:p.id}};
}

function updateSetting_(p) {
  const parameter = String(p.parameter || "").trim();
  const value = String(p.value ?? "").trim();
  const allowed = ["Nama Pengguna","Target Tabungan"];
  if (!allowed.includes(parameter)) throw new Error("Parameter pengaturan tidak boleh diubah melalui API.");
  if (parameter === "Target Tabungan" && (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 0)) throw new Error("Target tabungan tidak valid.");

  const sh = getSheet_(SHEET_NAMES.PENGATURAN);
  const last = sh.getLastRow();
  for (let r=2; r<=last; r++) {
    if (String(sh.getRange(r,1).getValue()).trim() === parameter) {
      sh.getRange(r,2).setValue(parameter === "Target Tabungan" ? Number(value) : value);
      return {success:true, message:"Setting updated"};
    }
  }
  sh.appendRow([parameter, parameter === "Target Tabungan" ? Number(value) : value]);
  return {success:true, message:"Setting created"};
}

function validateId_(id) {
  if (!/^TRX\d{3,}$/.test(String(id || ""))) throw new Error("ID transaksi tidak valid.");
}

function findRowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const ids = sh.getRange(2,1,last-1,1).getValues().flat();
  const target = String(id);
  const index = ids.findIndex(x => String(x) === target);
  return index === -1 ? null : index + 2;
}

function nextTransactionId_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return "TRX001";
  const ids = sh.getRange(2,1,last-1,1).getValues().flat();
  let max = 0;
  ids.forEach(id => {
    const m = String(id).match(/^TRX(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return "TRX" + String(max + 1).padStart(3,"0");
}

function formatDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const s = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return s;
}
