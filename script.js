// LilaCash - Control de gastos (vanilla JS, localStorage)
(function () {
  "use strict";

  // --- Helpers ---
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  let currentCurrency = localStorage.getItem("lilacash:currency") || "ARS";
  const fmtCurrency = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: currentCurrency, maximumFractionDigits: 2 }).format(n);
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });

  const STORAGE_KEY = "lilacash:transactions";

  /**
   * @typedef {Object} Tx
   * @property {string} id
   * @property {"income"|"expense"} type
   * @property {number} amount
   * @property {string} category
   * @property {string} note
   * @property {string} date ISO yyyy-mm-dd
   */

  /** @type {Tx[]} */
  let transactions = [];

  // --- State Elements ---
  const views = {
    splash: $("#view-splash"),
    welcome: $("#view-welcome"),
    list: $("#view-list"),
    form: $("#view-form"),
  };
  const totalBalanceEl = $("#totalBalance");
  const currencySelectEl = $("#currencySelect");
  const listEl = $("#txList");
  const emptyStateEl = $("#emptyState");
  const template = $("#txItemTemplate");
  const liveRegion = $("#liveRegion");
  const monthlyListEl = $("#monthlyList");
  const loaderEl = $("#loader");
  const toastEl = $("#toast");

  // Stats elements
  const statIncomeEl = $("#statIncome");
  const statExpenseEl = $("#statExpense");
  const statTotalEl = $("#statTotal");
  const statCountEl = $("#statCount");
  const statTopCategoryEl = $("#statTopCategory");

  // Filters
  const filterTypeEl = $("#filterType");
  const filterCategoryEl = $("#filterCategory");
  const sortByEl = $("#sortBy");

  // Form
  const formEl = $("#txForm");
  const txIdEl = $("#txId");
  const amountEl = $("#amount");
  const categoryEl = $("#category");
  const noteEl = $("#note");
  const dateEl = $("#date");
  const segButtons = $$(".seg-btn");
  let currentType = "income";
  // Error fields
  const amountErrorEl = $("#amountError");
  const categoryErrorEl = $("#categoryError");
  const dateErrorEl = $("#dateError");

  // --- Storage ---
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  // --- CRUD ---
  function createTx(partial) {
    const tx = {
      id: crypto.randomUUID(),
      type: partial.type,
      amount: Number(partial.amount),
      category: String(partial.category).trim(),
      note: String(partial.note || "").trim(),
      date: partial.date,
    };
    transactions.push(tx);
    save();
    return tx;
  }

  function updateTx(id, updates) {
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    transactions[idx] = { ...transactions[idx], ...updates };
    save();
    return transactions[idx];
  }

  function deleteTx(id) {
    const idx = transactions.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    transactions.splice(idx, 1);
    save();
    return true;
  }

  // --- Derived ---
  function getBalance() {
    let income = 0, expense = 0;
    for (const t of transactions) {
      if (t.type === "income") income += t.amount; else expense += t.amount;
    }
    return { income, expense, total: income - expense };
  }

  function getCategories() {
    const set = new Set(transactions.map((t) => t.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function getTopCategory() {
    const totals = new Map();
    for (const t of transactions) {
      const key = t.category || (t.type === "income" ? "Ingreso" : "Gasto");
      totals.set(key, (totals.get(key) || 0) + t.amount * (t.type === "income" ? 1 : -1));
    }
    let best = null;
    let bestAbs = 0;
    for (const [cat, val] of totals) {
      const abs = Math.abs(val);
      if (abs > bestAbs) { bestAbs = abs; best = { cat, val }; }
    }
    return best ? best.cat : "—";
  }

  // --- UI Render ---
  function renderBalance() {
    const { total } = getBalance();
    totalBalanceEl.textContent = fmtCurrency(total);
  }

  function renderStats() {
    const { income, expense, total } = getBalance();
    statIncomeEl.textContent = fmtCurrency(income);
    statExpenseEl.textContent = fmtCurrency(expense);
    statTotalEl.textContent = fmtCurrency(total);
    statCountEl.textContent = String(transactions.length);
    statTopCategoryEl.textContent = getTopCategory();
  }

  function renderCategoryFilters() {
    // update select options
    const cats = getCategories();
    filterCategoryEl.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "all"; optAll.textContent = "Categorías";
    filterCategoryEl.appendChild(optAll);
    for (const c of cats) {
      const o = document.createElement("option");
      o.value = c; o.textContent = c; filterCategoryEl.appendChild(o);
    }
    // update datalist
    const dataList = $("#categoryList");
    dataList.innerHTML = "";
    for (const c of cats) {
      const o = document.createElement("option");
      o.value = c; dataList.appendChild(o);
    }
  }

  function applyFiltersSort(list) {
    let out = [...list];
    const ft = filterTypeEl.value;
    const fc = filterCategoryEl.value;
    const sb = sortByEl.value;

    if (ft !== "all") out = out.filter((t) => t.type === ft);
    if (fc !== "all") out = out.filter((t) => t.category === fc);

    const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    const byDateAsc = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    const byAmountDesc = (a, b) => b.amount - a.amount || byDateDesc(a, b);
    const byAmountAsc = (a, b) => a.amount - b.amount || byDateDesc(a, b);

    const sorters = { date_desc: byDateDesc, date_asc: byDateAsc, amount_desc: byAmountDesc, amount_asc: byAmountAsc };
    out.sort(sorters[sb] || byDateDesc);
    return out;
  }

  function renderList() {
    const items = applyFiltersSort(transactions);
    listEl.innerHTML = "";
    if (items.length === 0) {
      emptyStateEl.hidden = false;
      return;
    }
    emptyStateEl.hidden = true;
    for (const t of items) {
      const li = template.content.firstElementChild.cloneNode(true);
      li.dataset.id = t.id;
      $(".tx-category", li).textContent = t.category || (t.type === "income" ? "Ingreso" : "Gasto");
      $(".tx-note", li).textContent = t.note || "";
      const amountEl = $(".tx-amount", li);
      amountEl.textContent = fmtCurrency(t.type === "income" ? t.amount : -t.amount);
      amountEl.style.color = t.type === "income" ? "var(--green)" : "var(--red)";
      $(".tx-date", li).textContent = fmtDate(t.date);

      $(".edit", li).addEventListener("click", () => startEdit(t.id));
      $(".delete", li).addEventListener("click", () => onDelete(t.id));
      $(".tx-main", li).addEventListener("click", () => startEdit(t.id));

      listEl.appendChild(li);
    }
  }

  // --- Monthly Summary ---
  function monthKeyFor(dateIso) {
    return dateIso.slice(0, 7); // YYYY-MM
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  }

  function getMonthlySummary() {
    /** @type {Record<string, {income:number, expense:number}>} */
    const map = {};
    for (const t of transactions) {
      const key = monthKeyFor(t.date);
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (t.type === "income") map[key].income += t.amount; else map[key].expense += t.amount;
    }
    const keys = Object.keys(map).sort((a, b) => b.localeCompare(a)); // desc
    return keys.map((k) => ({ key: k, label: monthLabel(k), income: map[k].income, expense: map[k].expense, saving: map[k].income - map[k].expense }));
  }

  function renderMonthlySummary() {
    if (!monthlyListEl) return;
    const months = getMonthlySummary().slice(0, 6);
    monthlyListEl.innerHTML = "";
    if (months.length === 0) return;
    for (const m of months) {
      const card = document.createElement("div");
      card.className = "month-card";
      const savingClass = m.saving >= 0 ? "pos" : "neg";
      card.innerHTML = `
        <div class="month-head">
          <div class="month-name">${m.label}</div>
          <div class="month-saving ${savingClass}">${fmtCurrency(m.saving)}</div>
        </div>
        <div class="month-stats">
          <div>Ingresos: <strong style="color: var(--green)">${fmtCurrency(m.income)}</strong></div>
          <div>Gastos: <strong style="color: var(--red)">${fmtCurrency(m.expense)}</strong></div>
        </div>
      `;
      monthlyListEl.appendChild(card);
    }
  }

  // --- Navigation ---
  function show(view) {
    Object.values(views).forEach((v) => v.classList.remove("is-active"));
    views[view].classList.add("is-active");
  }

  function announce(msg) {
    liveRegion.textContent = msg;
  }

  function haptic(type = "light") {
    try {
      if (navigator.vibrate) {
        if (type === "success") navigator.vibrate([12, 20]);
        else if (type === "warning") navigator.vibrate([20, 40]);
        else navigator.vibrate(10);
      }
    } catch {}
  }

  function showLoader(show = true) {
    if (!loaderEl) return;
    loaderEl.classList.toggle("is-visible", !!show);
  }

  let toastTimer = null;
  function showToast(msg, ms = 1600) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
  }

  // --- Form Logic ---
  function resetForm(type = "income") {
    txIdEl.value = "";
    amountEl.value = "";
    categoryEl.value = "";
    noteEl.value = "";
    dateEl.valueAsDate = new Date();
    setType(type);
    $("#formTitle").textContent = "Nuevo movimiento";
  }

  function setType(type) {
    currentType = type;
    segButtons.forEach((b) => {
      const isActive = b.dataset.type === type;
      b.classList.toggle("is-active", isActive);
      b.setAttribute("aria-selected", String(isActive));
    });
  }

  function startEdit(id) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return;
    txIdEl.value = t.id;
    amountEl.value = String(t.amount);
    categoryEl.value = t.category;
    noteEl.value = t.note || "";
    dateEl.value = t.date;
    setType(t.type);
    $("#formTitle").textContent = "Editar movimiento";
    show("form");
  }

  function onDelete(id) {
    const ok = confirm("¿Eliminar este movimiento? Esta acción no se puede deshacer.");
    if (!ok) return;
    if (deleteTx(id)) {
      renderBalance();
      renderStats();
      renderCategoryFilters();
      renderList();
      renderMonthlySummary();
      announce("Movimiento eliminado");
      haptic("warning");
      showToast("Eliminado");
    }
  }

  // --- Events ---
  $$("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dest = btn.getAttribute("data-nav");
      if (dest === "form") {
        resetForm("income");
      }
      show(dest);
    });
  });

  segButtons.forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));

  filterTypeEl.addEventListener("change", renderList);
  filterCategoryEl.addEventListener("change", renderList);
  sortByEl.addEventListener("change", renderList);

  $("#cancelEdit").addEventListener("click", () => {
    show("list");
  });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    // reset errors
    amountErrorEl.textContent = "";
    categoryErrorEl.textContent = "";
    dateErrorEl.textContent = "";

    const amount = Number(amountEl.value);
    let hasErr = false;
    if (!isFinite(amount) || amount <= 0) {
      amountErrorEl.textContent = "Ingresá un monto válido mayor a 0.";
      hasErr = true;
    }
    if (!categoryEl.value.trim()) {
      categoryErrorEl.textContent = "Ingresá una categoría.";
      hasErr = true;
    }
    if (!dateEl.value) {
      dateErrorEl.textContent = "Seleccioná una fecha.";
      hasErr = true;
    }
    if (hasErr) {
      (amount <= 0 ? amountEl : (!categoryEl.value ? categoryEl : dateEl)).focus();
      return;
    }
    const data = {
      type: currentType,
      amount,
      category: categoryEl.value.trim(),
      note: noteEl.value.trim(),
      date: dateEl.value || new Date().toISOString().slice(0, 10),
    };

    if (txIdEl.value) {
      showLoader(true);
      updateTx(txIdEl.value, data);
      showLoader(false);
      announce("Movimiento actualizado");
      haptic("success");
      showToast("Actualizado");
    } else {
      showLoader(true);
      createTx(data);
      showLoader(false);
      announce("Movimiento agregado");
      haptic("success");
      showToast("Guardado");
    }

    renderBalance();
    renderStats();
    renderCategoryFilters();
    renderList();
    renderMonthlySummary();
    show("list");
    resetForm(currentType);
  });

  // --- Init ---
  function init() {
    transactions = load();
    // Default date today
    if (!dateEl.value) dateEl.valueAsDate = new Date();
    // Ensure loader is hidden on start
    showLoader(false);
    // Initialize currency select
    if (currencySelectEl) {
      currencySelectEl.value = currentCurrency;
      currencySelectEl.addEventListener("change", () => {
        currentCurrency = currencySelectEl.value;
        localStorage.setItem("lilacash:currency", currentCurrency);
        renderBalance();
        renderStats();
        renderList();
        renderMonthlySummary();
      });
    }
    renderBalance();
    renderStats();
    renderCategoryFilters();
    renderList();
    renderMonthlySummary();

    // Splash auto-hide to welcome then list
    show("splash");
    setTimeout(() => {
      show("welcome");
      setTimeout(() => show("list"), 1200);
    }, 900);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


