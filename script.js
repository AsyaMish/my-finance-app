'use strict';

const DB_NAME = 'my-finance-db';
const DB_VERSION = 1;
const STORES = ['accounts', 'categories', 'operations', 'debts', 'templates', 'archive'];

const DEFAULT_ACCOUNTS = [
  { id: 'acc_card', name: 'Карта', initialBalance: 0, createdAt: Date.now() },
  { id: 'acc_cash', name: 'Наличные', initialBalance: 0, createdAt: Date.now() },
];

const DEFAULT_INCOME_CATEGORIES = [
  { id: 'cat_inc_salary', type: 'income', name: 'Зарплата', createdAt: Date.now() },
  { id: 'cat_inc_extra', type: 'income', name: 'Подработка', createdAt: Date.now() },
  { id: 'cat_inc_gift', type: 'income', name: 'Подарки', createdAt: Date.now() },
  { id: 'cat_inc_other', type: 'income', name: 'Прочее', createdAt: Date.now() },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'cat_exp_food', type: 'expense', name: 'Продукты', createdAt: Date.now() },
  { id: 'cat_exp_transport', type: 'expense', name: 'Транспорт', createdAt: Date.now() },
  { id: 'cat_exp_utilities', type: 'expense', name: 'Коммуналка', createdAt: Date.now() },
  { id: 'cat_exp_health', type: 'expense', name: 'Здоровье', createdAt: Date.now() },
  { id: 'cat_exp_fun', type: 'expense', name: 'Развлечения', createdAt: Date.now() },
  { id: 'cat_exp_other', type: 'expense', name: 'Прочее', createdAt: Date.now() },
];

const DEFAULT_TEMPLATES = [{
  id: 'tpl_utilities', name: 'Коммуналка', type: 'expense',
  fields: [ { id: 'fld_light', name: 'Свет' }, { id: 'fld_gas', name: 'Газ' }, { id: 'fld_water', name: 'Вода' }, { id: 'fld_trash', name: 'Мусор' } ],
  createdAt: Date.now(),
}];

const state = {
  db: null, accounts: [], categories: [], operations: [], debts: [], templates: [], archive: [],
  currentScreen: 'dashboard', settings: { theme: 'system' }, dashboardPeriod: 'week', selectedOperations: new Set(),
};

function uid(prefix = 'id') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function formatMoney(n) {
  const num = Number(n) || 0;
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join(',');
}
function parseNumber(v) { return parseFloat(String(v).replace(',', '.')) || 0; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function startOfWeekISO() { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 6); return toISO(d); }
function startOfMonthISO() { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonthISO() { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function startOfPrevMonthISO() { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
function endOfPrevMonthISO() { const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 0)); }
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function openDB() { return new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, DB_VERSION); r.onupgradeneeded = (e) => { const db = e.target.result; for (const n of STORES) { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' }); } }; r.onsuccess = (e) => res(e.target.result); r.onerror = (e) => rej(e.target.error); }); }
function dbGetAll(store) { return new Promise((res, rej) => { const r = state.db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); }
function dbPut(store, item) { return new Promise((res, rej) => { const tx = state.db.transaction(store, 'readwrite'); tx.objectStore(store).put(item); tx.oncomplete = () => res(item); tx.onerror = () => rej(tx.error); }); }
function dbDelete(store, id) { return new Promise((res, rej) => { const tx = state.db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

function getSystemTheme() { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme(theme) { const eff = theme === 'system' ? getSystemTheme() : theme; document.documentElement.setAttribute('data-theme', eff); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', eff === 'dark' ? '#121212' : '#F5F6F5'); $$('input[name="theme"]').forEach(r => r.checked = (r.value === theme)); }
function loadTheme() { const t = localStorage.getItem('theme') || 'system'; state.settings.theme = t; applyTheme(t); }
function setTheme(t) { localStorage.setItem('theme', t); state.settings.theme = t; applyTheme(t); }
function cycleTheme() { const o = ['system', 'light', 'dark']; setTheme(o[(o.indexOf(state.settings.theme) + 1) % o.length]); }

function switchScreen(name) {
  state.currentScreen = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  $$('[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'history') { fillFilterSelects(); renderOperations(); }
  if (name === 'reports') renderReports();
  if (name === 'archive') renderArchive();
  if (name === 'settings') { renderAccounts(); renderCategories(); renderTemplates(); updateStorageInfo(); }
}

function openModal(id) { const el = document.getElementById(id); if (el) { el.classList.remove('hidden'); const f = el.querySelector('form'); if (f) clearFormDirty(f); } }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function closeAllModals() { $$('.modal').forEach(m => m.classList.add('hidden')); }
function markFormDirty(f) { const m = f.closest('.modal'); if (m) m.dataset.dirty = 'true'; }
function clearFormDirty(f) { const m = f.closest('.modal'); if (m) m.dataset.dirty = 'false'; }
function isFormDirty(f) { const m = f.closest('.modal'); return !!m && m.dataset.dirty === 'true'; }
function tryCloseModal(id) { const m = document.getElementById(id); if (!m) return; const f = m.querySelector('form'); if (f && isFormDirty(f)) { if (!window.confirm('Закрыть без сохранения?')) return; } m.classList.add('hidden'); if (f) clearFormDirty(f); }

async function loadAccounts() { state.accounts = await dbGetAll('accounts'); if (!state.accounts.length) { for (const a of DEFAULT_ACCOUNTS) await dbPut('accounts', a); state.accounts = [...DEFAULT_ACCOUNTS]; } }
function renderAccounts() { const l = document.getElementById('accounts-list'); if (!l) return; l.innerHTML = ''; const t = document.getElementById('account-item-template'); state.accounts.forEach(a => { const n = t.content.firstElementChild.cloneNode(true); n.dataset.id = a.id; n.querySelector('.item-name').textContent = a.name; n.querySelector('.item-balance').textContent = formatMoney(a.initialBalance) + ' ₽'; n.querySelector('.item-edit').onclick = () => editAccount(a.id); n.querySelector('.item-delete').onclick = () => deleteAccount(a.id); l.appendChild(n); }); renderDashboard(); }
async function addAccount() { const name = prompt('Название счёта:', ''); if (!name?.trim()) return; const bStr = prompt('Начальный остаток:', '0'); if (bStr === null) return; const acc = { id: uid('acc'), name: name.trim(), initialBalance: parseNumber(bStr), createdAt: Date.now() }; await dbPut('accounts', acc); state.accounts.push(acc); renderAccounts(); }
async function editAccount(id) { const a = state.accounts.find(x => x.id === id); if (!a) return; const name = prompt('Название:', a.name); if (!name?.trim()) return; const bStr = prompt('Остаток:', String(a.initialBalance)); if (bStr === null) return; a.name = name.trim(); a.initialBalance = parseNumber(bStr); await dbPut('accounts', a); renderAccounts(); }
async function deleteAccount(id) { if (state.accounts.length <= 1) return alert('Последний счёт нельзя удалить.'); const a = state.accounts.find(x => x.id === id); if (!a) return; const ops = state.operations.filter(o => o.accountId === id); if (ops.length) { if (!window.confirm('Удалить счёт и его операции?')) return; for (const o of ops) await dbDelete('operations', o.id); state.operations = state.operations.filter(o => o.accountId !== id); } else { if (!window.confirm('Удалить счёт?')) return; } await dbDelete('accounts', id); state.accounts = state.accounts.filter(x => x.id !== id); renderAccounts(); renderOperations(); }

async function loadCategories() { state.categories = await dbGetAll('categories'); if (!state.categories.length) { const s = [...DEFAULT_INCOME_CATEGORIES, ...DEFAULT_EXPENSE_CATEGORIES]; for (const c of s) await dbPut('categories', c); state.categories = [...s]; } }
function renderCategories() {
  const iL = document.getElementById('income-categories-list'), eL = document.getElementById('expense-categories-list');
  if (!iL || !eL) return; iL.innerHTML = ''; eL.innerHTML = '';
  const iT = document.getElementById('income-category-item-template'), eT = document.getElementById('expense-category-item-template');
  state.categories.sort((a,b) => (a.order || 0) - (b.order || 0));
  state.categories.forEach(c => {
    const t = c.type === 'income' ? iT : eT; const l = c.type === 'income' ? iL : eL;
    const n = t.content.firstElementChild.cloneNode(true); n.dataset.id = c.id; n.querySelector('.item-name').textContent = c.name;
    n.querySelector('.item-up').onclick = () => moveCategory(c.id, -1);
    n.querySelector('.item-down').onclick = () => moveCategory(c.id, 1);
    n.querySelector('.item-edit').onclick = () => editCategory(c.id);
    n.querySelector('.item-delete').onclick = () => deleteCategory(c.id);
    l.appendChild(n);
  });
}
async function addCategory(type) { const name = prompt('Название категории:', ''); if (!name?.trim()) return; const cat = { id: uid('cat'), type, name: name.trim(), createdAt: Date.now(), order: Date.now() }; await dbPut('categories', cat); state.categories.push(cat); renderCategories(); }
async function editCategory(id) { const c = state.categories.find(x => x.id === id); if (!c) return; const name = prompt('Название:', c.name); if (!name?.trim()) return; c.name = name.trim(); await dbPut('categories', c); renderCategories(); }
async function deleteCategory(id) { const c = state.categories.find(x => x.id === id); if (!c) return; const ops = state.operations.filter(o => o.categoryId === id); if (ops.length) { if (!window.confirm('Оставить операции без категории?')) return; for (const o of ops) { o.categoryId = ''; await dbPut('operations', o); } } else { if (!window.confirm('Удалить категорию?')) return; } await dbDelete('categories', id); state.categories = state.categories.filter(x => x.id !== id); renderCategories(); renderOperations(); }
async function moveCategory(id, dir) {
  const c = state.categories.find(x => x.id === id); if (!c) return;
  const t = state.categories.filter(x => x.type === c.type).sort((a,b) => (a.order || 0) - (b.order || 0));
  const i = t.findIndex(x => x.id === id); const ni = i + dir; if (ni < 0 || ni >= t.length) return;
  const tempOrder = t[i].order || 0; t[i].order = t[ni].order || 0; t[ni].order = tempOrder;
  if (t[i].order === t[ni].order) { t[i].order = i; t[ni].order = ni; }
  await dbPut('categories', t[i]); await dbPut('categories', t[ni]); renderCategories();
}

async function loadTemplates() { state.templates = await dbGetAll('templates'); if (!state.templates.length) { for (const t of DEFAULT_TEMPLATES) await dbPut('templates', t); state.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)); } }
function renderTemplates() {
  const l = document.getElementById('templates-list'); if (!l) return; l.innerHTML = ''; const t = document.getElementById('template-item-template');
  state.templates.sort((a,b) => (a.createdAt||0) - (b.createdAt||0)).forEach(tpl => {
    const n = t.content.firstElementChild.cloneNode(true); n.querySelector('.item-name').textContent = tpl.name; n.querySelector('.item-fields-count').textContent = `(${tpl.fields.length} полей)`;
    const btnEdit = n.querySelector('.item-edit');
    if (btnEdit) btnEdit.onclick = () => openTemplateForm(tpl); 
    n.querySelector('.item-delete').onclick = () => deleteTemplate(tpl.id); l.appendChild(n);
  });
}
function openTemplateForm(t = null) {
  document.getElementById('template-id').value = t ? t.id : ''; document.getElementById('template-form-title').textContent = t ? 'Редактировать' : 'Новый';
  document.getElementById('template-name').value = t ? t.name : ''; document.getElementById('template-type').value = t ? t.type : 'expense';
  const l = document.getElementById('template-fields-list'); l.innerHTML = '';
  if (t?.fields) t.fields.forEach(f => addTemplateFieldInput(f.name)); else addTemplateFieldInput('');
  openModal('modal-template');
}
function addTemplateFieldInput(v = '') { const l = document.getElementById('template-fields-list'); const d = document.createElement('div'); d.className = 'nested-field-row'; d.innerHTML = `<input type="text" class="template-field-name" placeholder="Название поля" value="${v}"><button type="button" class="btn-small">×</button>`; d.querySelector('button').onclick = () => d.remove(); l.appendChild(d); }
async function saveTemplate(e) {
  e.preventDefault(); const id = document.getElementById('template-id').value || uid('tpl'); const existing = state.templates.find(x => x.id === id);
  const name = document.getElementById('template-name').value.trim(); const type = document.getElementById('template-type').value;
  if (!name) return alert('Введите имя'); const fields = [];
  $$('#template-fields-list .template-field-name').forEach((inp, i) => { if (inp.value.trim()) fields.push({ id: 'fld_' + uid(), name: inp.value.trim() }); });
  if (!fields.length) return alert('Добавьте поля');
  const t = { id, name, type, fields, createdAt: existing ? existing.createdAt : Date.now() };
  await dbPut('templates', t); if (existing) state.templates[state.templates.findIndex(x => x.id === id)] = t; else state.templates.push(t);
  clearFormDirty(document.getElementById('template-form')); closeModal('modal-template'); renderTemplates(); fillTemplateSelect();
}
async function deleteTemplate(id) { if (!window.confirm('Удалить шаблон?')) return; await dbDelete('templates', id); state.templates = state.templates.filter(x => x.id !== id); renderTemplates(); fillTemplateSelect(); }

async function loadDebts() { state.debts = await dbGetAll('debts'); }
function resetDebtForm() {
  const id = document.getElementById('debt-id'); if (id) id.value = '';
  const t = document.getElementById('debt-form-title'); if (t) t.textContent = 'Новый долг';
  const dir = document.getElementById('debt-direction'); if (dir) dir.value = 'i-owe';
  const n = document.getElementById('debt-name'); if (n) n.value = '';
  const a = document.getElementById('debt-amount'); if (a) a.value = '';
  const p = document.getElementById('debt-is-planned'); if (p) p.checked = false;
  const c = document.getElementById('debt-is-credit'); if (c) { c.checked = false; }
  const cb = document.getElementById('credit-block'); if (cb) cb.classList.add('hidden');
  const term = document.getElementById('debt-term'); if (term) term.value = '';
  const rate = document.getElementById('debt-rate'); if (rate) rate.value = '';
  const tot = document.getElementById('debt-total'); if (tot) tot.value = '';
  const dd = document.getElementById('debt-due-date'); if (dd) dd.value = '';
  const cm = document.getElementById('debt-comment'); if (cm) cm.value = '';
}

function fillDebtForm(debt) {
  document.getElementById('debt-id').value = debt.id;
  document.getElementById('debt-form-title').textContent = 'Редактировать долг';
  document.getElementById('debt-direction').value = debt.direction || 'i-owe';
  document.getElementById('debt-name').value = debt.name || '';
  document.getElementById('debt-amount').value = debt.initialAmount ? debt.initialAmount.toFixed(2) : '';
  document.getElementById('debt-is-planned').checked = !!debt.isPlanned;
  document.getElementById('debt-is-credit').checked = !!debt.isCredit;
  const cb = document.getElementById('credit-block');
  if (cb) cb.classList.toggle('hidden', !debt.isCredit);
  document.getElementById('debt-term').value = debt.term || '';
  document.getElementById('debt-rate').value = debt.rate || '';
  document.getElementById('debt-total').value = debt.totalAmount ? debt.totalAmount.toFixed(2) : '';
  document.getElementById('debt-due-date').value = debt.dueDate || '';
  document.getElementById('debt-comment').value = debt.comment || '';
}

function openDebtForm(debt = null) {
  if (debt) fillDebtForm(debt);
  else resetDebtForm();
  openModal('modal-debt');
}

function calcCreditTotal() {
  const amount = parseNumber(document.getElementById('debt-amount').value);
  const term = parseNumber(document.getElementById('debt-term').value);
  const rate = parseNumber(document.getElementById('debt-rate').value);
  // Упрощённый расчёт: сумма + проценты за весь срок
  const total = amount + (amount * (rate / 100) * (term / 12));
  const el = document.getElementById('debt-total');
  if (el) el.value = total ? total.toFixed(2) : '';
}

async function saveDebt(e) {
  e.preventDefault();
  const id = document.getElementById('debt-id').value || uid('debt');
  const existing = state.debts.find(d => d.id === id);
  
  const direction = document.getElementById('debt-direction').value;
  const name = document.getElementById('debt-name').value.trim();
  const initialAmount = parseNumber(document.getElementById('debt-amount').value);
  const isPlanned = document.getElementById('debt-is-planned').checked;
  const isCredit = document.getElementById('debt-is-credit').checked;
  const term = isCredit ? parseNumber(document.getElementById('debt-term').value) : 0;
  const rate = isCredit ? parseNumber(document.getElementById('debt-rate').value) : 0;
  const totalAmount = isCredit ? parseNumber(document.getElementById('debt-total').value) : initialAmount;
  const dueDate = document.getElementById('debt-due-date').value;
  const comment = document.getElementById('debt-comment').value.trim();
  
  if (!name) return alert('Введите название долга.');
  
  const debt = {
    id, direction, name, initialAmount, isPlanned, isCredit,
    term, rate, totalAmount, dueDate, comment,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  
  await dbPut('debts', debt);
  if (existing) state.debts[state.debts.findIndex(d => d.id === id)] = debt;
  else state.debts.push(debt);
  
  clearFormDirty(document.getElementById('debt-form'));
  closeModal('modal-debt');
  renderDashboard();
  renderOperations();
  fillDebtSelect();
  renderReports();
}

async function deleteDebt(id) {
  const debt = state.debts.find(d => d.id === id);
  if (!debt) return;
  
  const linkedOps = state.operations.filter(o => o.linkedDebtId === id);
  let msg = `Удалить долг «${debt.name}»?`;
  if (linkedOps.length) {
    msg += `\nС ним связано ${linkedOps.length} операций. Связь с долгом будет удалена.`;
  }
  if (!window.confirm(msg)) return;
  
  // Отвязываем операции от удаляемого долга
  for (const op of linkedOps) {
    op.linkedDebtId = '';
    await dbPut('operations', op);
  }
  
  await dbDelete('debts', id);
  state.debts = state.debts.filter(d => d.id !== id);
  renderDashboard();
  renderOperations();
  fillDebtSelect();
  renderReports();
}
function getDebtRemaining(d) { let p = 0; state.operations.forEach(o => { if (o.linkedDebtId === d.id && !o.isPlanned) p += o.amount; }); return Math.max(0, (d.initialAmount || 0) - p); }
function getDebtsTotal(dir) { let t = 0; state.debts.forEach(d => { if (!d.isPlanned && d.direction === dir) t += getDebtRemaining(d); }); return t; }

async function loadOperations() { state.operations = await dbGetAll('operations'); }
function getOperationsBalance(accId) { let t = 0; state.operations.forEach(o => { if (o.accountId === accId && !o.isPlanned && !o.excludeFromBalance) t += o.type === 'income' ? o.amount : -o.amount; }); return t; }
function getPeriodStats(f, t) { let i = 0, e = 0; state.operations.forEach(o => { if (o.isPlanned || o.excludeFromBalance || !o.date || o.date < f || o.date > t) return; if (o.type === 'income') i += o.amount; else e += o.amount; }); return { income: i, expense: e }; }
function getPlannedExpensesTotal() { let t = 0; state.operations.forEach(o => { if (o.isPlanned && o.type === 'expense') t += o.amount; }); return t; }

function renderDashboard() {
  const aB = document.getElementById('balance-accounts'); if (aB) {
    aB.innerHTML = ''; let tot = 0; state.accounts.forEach(a => {
      const b = a.initialBalance + getOperationsBalance(a.id); const r = document.createElement('div'); r.className = 'account-line';
      r.innerHTML = `<span>${a.name}</span><span>${formatMoney(b)} ₽</span>`; aB.appendChild(r); tot += b;
    }); document.getElementById('balance-total').textContent = formatMoney(tot);
  }
  document.getElementById('debts-i-owe').textContent = formatMoney(getDebtsTotal('i-owe'));
  document.getElementById('debts-owed-to-me').textContent = formatMoney(getDebtsTotal('owed-to-me'));
  document.getElementById('dash-planned-expenses').textContent = formatMoney(getPlannedExpensesTotal());
  updateDashboardPeriodStats();
}
function updateDashboardPeriodStats() {
  let f, t, l; if (state.dashboardPeriod === 'week') { f = startOfWeekISO(); t = todayISO(); l = 'за неделю'; }
  else if (state.dashboardPeriod === 'month') { f = startOfMonthISO(); t = todayISO(); l = 'за месяц'; }
  else { f = document.getElementById('dashboard-date-from').value || todayISO(); t = document.getElementById('dashboard-date-to').value || todayISO(); l = 'за период'; }
  document.getElementById('period-label').textContent = l;
  const s = getPeriodStats(f, t); document.getElementById('dash-income').textContent = formatMoney(s.income); document.getElementById('dash-expense').textContent = formatMoney(s.expense);
}

function isManualSum() { return !document.getElementById('manual-sum-indicator').classList.contains('hidden'); }
function showManualIndicator(s) { document.getElementById('manual-sum-indicator').classList.toggle('hidden', !s); }
function disableNestedInputs(d) { $$('#nested-fields-list input').forEach(i => i.disabled = d); $$('#nested-fields-list button').forEach(b => b.disabled = d); }
function recalcNestedTotal() { if (isManualSum()) return; let tot = 0; $$('#nested-fields-list .nested-value').forEach(i => tot += parseNumber(i.value)); const a = document.getElementById('op-amount'); if (a) a.value = tot ? tot.toFixed(2) : ''; }
function addNestedField(n = '', v = '') {
  const l = document.getElementById('nested-fields-list'); if (!l) return; const d = document.createElement('div'); d.className = 'nested-field-row';
  d.innerHTML = `<input type="text" class="nested-name" placeholder="Название" value="${n}"><input type="number" class="nested-value" step="0.01" placeholder="0.00" value="${v}"><button type="button" class="btn-small nested-remove">×</button>`;
  l.appendChild(d);
  d.querySelector('.nested-value').oninput = () => { if (!isManualSum()) recalcNestedTotal(); };
  d.querySelector('.nested-remove').onclick = () => { d.remove(); if (!isManualSum()) recalcNestedTotal(); };
  if (isManualSum()) { d.querySelectorAll('input, button').forEach(el => el.disabled = true); }
}
function clearNestedFields() { const l = document.getElementById('nested-fields-list'); if (l) l.innerHTML = ''; }
function fillOperationSelects() {
  const aS = document.getElementById('op-account'); if (aS) { aS.innerHTML = ''; state.accounts.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; aS.appendChild(o); }); }
  fillCategorySelect(); fillDebtSelect(); fillTemplateSelect();
}
function fillCategorySelect(sel = '') { const s = document.getElementById('op-category'); if (!s) return; const t = document.getElementById('op-type').value; s.innerHTML = ''; state.categories.filter(c => c.type === t).forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; if (c.id === sel) o.selected = true; s.appendChild(o); }); }
function fillDebtSelect(sel = '') { const s = document.getElementById('op-linked-debt'); if (!s) return; s.innerHTML = '<option value="">— Не связывать —</option>'; state.debts.forEach(d => { const r = getDebtRemaining(d); if (!d.isPlanned && r <= 0) return; const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.direction === 'i-owe' ? 'Я должна' : 'Мне должны'}: ${d.name} ${d.isPlanned ? '(план)' : `· остаток ${formatMoney(r)} ₽`}`; if (d.id === sel) o.selected = true; s.appendChild(o); }); }
function fillTemplateSelect() { const s = document.getElementById('op-template'); if (!s) return; s.innerHTML = '<option value="">— Без шаблона —</option>'; state.templates.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; s.appendChild(o); }); }

function resetOperationForm() {
  document.getElementById('operation-id').value = ''; document.getElementById('operation-form-title').textContent = 'Новая операция';
  document.getElementById('op-type').value = 'expense'; document.getElementById('op-amount').value = ''; document.getElementById('op-comment').value = ''; document.getElementById('op-date').value = todayISO();
  document.getElementById('op-is-planned').checked = false; document.getElementById('op-exclude-balance').checked = false; document.getElementById('op-template').value = ''; document.getElementById('op-linked-debt').value = '';
  clearNestedFields(); showManualIndicator(false); disableNestedInputs(false); fillOperationSelects();
}
function fillOperationForm(op) {
  document.getElementById('operation-id').value = op.id; document.getElementById('operation-form-title').textContent = 'Редактировать операцию';
  document.getElementById('op-type').value = op.type; fillCategorySelect(op.categoryId || ''); document.getElementById('op-amount').value = op.amount != null ? op.amount.toFixed(2) : '';
  document.getElementById('op-account').value = op.accountId || ''; document.getElementById('op-comment').value = op.comment || ''; document.getElementById('op-date').value = op.date || '';
  document.getElementById('op-is-planned').checked = !!op.isPlanned; document.getElementById('op-exclude-balance').checked = !!op.excludeFromBalance;
  fillDebtSelect(op.linkedDebtId || ''); document.getElementById('op-linked-debt').value = op.linkedDebtId || ''; document.getElementById('op-template').value = '';
  clearNestedFields(); if (op.nested?.length) { op.nested.forEach(f => addNestedField(f.name, f.value ? f.value.toFixed(2) : '')); if (op.manualSum) { showManualIndicator(true); disableNestedInputs(true); } else { showManualIndicator(false); disableNestedInputs(false); } } else { showManualIndicator(false); disableNestedInputs(false); }
}
function openOperationForm(op = null) { fillOperationSelects(); if (op) fillOperationForm(op); else resetOperationForm(); openModal('modal-operation'); }

async function saveOperationWithDebtCheck(e) {
  e.preventDefault(); const id = document.getElementById('operation-id').value || uid('op'); const existing = state.operations.find(o => o.id === id);
  const type = document.getElementById('op-type').value; const amount = parseNumber(document.getElementById('op-amount').value); const accountId = document.getElementById('op-account').value;
  const categoryId = document.getElementById('op-category').value; const date = document.getElementById('op-date').value; const comment = document.getElementById('op-comment').value.trim();
  const isPlanned = document.getElementById('op-is-planned').checked; const excludeFromBalance = document.getElementById('op-exclude-balance').checked;
  const linkedDebtId = document.getElementById('op-linked-debt').value || ''; const manualSum = isManualSum();
  const nested = []; $$('#nested-fields-list .nested-field-row').forEach(r => { const n = r.querySelector('.nested-name').value.trim(); const v = parseNumber(r.querySelector('.nested-value').value); if (n || v) nested.push({ name: n, value: v }); });
  if (!accountId) return alert('Выберите счёт.'); if (!amount) return alert('Введите сумму.');
  if (linkedDebtId && !isPlanned) {
    const debt = state.debts.find(d => d.id === linkedDebtId); if (debt) {
      const remaining = getDebtRemaining(debt); if (amount > remaining + 0.0001) {
        const overpay = amount - remaining; if (!window.confirm(`Переплата! Закрыть долг на ${formatMoney(remaining)} ₽, а переплату ${formatMoney(overpay)} ₽ записать отдельно?`)) return;
        const p = { id: uid('op'), type, amount: remaining, accountId, categoryId, date, comment: (comment ? comment + ' · ' : '') + 'Погашение', isPlanned: false, excludeFromBalance, linkedDebtId, nested, manualSum, createdAt: Date.now(), updatedAt: Date.now() };
        await dbPut('operations', p); state.operations.push(p);
        const o = { id: uid('op'), type, amount: overpay, accountId, categoryId, date, comment: (comment ? comment + ' · ' : '') + 'Переплата', isPlanned: false, excludeFromBalance, linkedDebtId: '', nested: [], manualSum: false, createdAt: Date.now(), updatedAt: Date.now() };
        await dbPut('operations', o); state.operations.push(o);
        clearFormDirty(document.getElementById('operation-form')); closeModal('modal-operation'); renderDashboard(); renderOperations(); fillDebtSelect(); return;
      }
    }
  }
  const op = { id, type, amount, accountId, categoryId, date, comment, isPlanned, excludeFromBalance, linkedDebtId, nested, manualSum, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now() };
  await dbPut('operations', op); if (existing) state.operations[state.operations.findIndex(o => o.id === id)] = op; else state.operations.push(op);
  clearFormDirty(document.getElementById('operation-form')); closeModal('modal-operation'); renderDashboard(); renderOperations(); fillDebtSelect();
}
async function deleteOperation(id) { const op = state.operations.find(o => o.id === id); if (!op) return; let msg = 'Удалить операцию?'; if (op.linkedDebtId) { const d = state.debts.find(x => x.id === op.linkedDebtId); msg = `Связана с долгом «${d ? d.name : '—'}». Удалить?`; } if (!window.confirm(msg)) return; await dbDelete('operations', id); state.operations = state.operations.filter(o => o.id !== id); renderDashboard(); renderOperations(); fillDebtSelect(); }
function copyOperation(id) { const op = state.operations.find(o => o.id === id); if (!op) return; fillOperationSelects(); fillOperationForm({ ...op, id: '' }); document.getElementById('operation-form-title').textContent = 'Копия'; document.getElementById('op-date').value = todayISO(); openModal('modal-operation'); }

function fillFilterSelects() {
  const aS = document.getElementById('filter-account'); if (aS) { aS.innerHTML = '<option value="">Все счета</option>'; state.accounts.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; aS.appendChild(o); }); }
  const cS = document.getElementById('filter-category'); if (cS) { cS.innerHTML = '<option value="">Все категории</option>'; state.categories.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; cS.appendChild(o); }); }
}
function getFilteredOperations() {
  let ops = [...state.operations];
  // ДОБАВЛЯЕМ ДОЛГИ В ИСТОРИЮ (как псевдо-операции для отображения)
  const fakeDebts = state.debts.filter(d => d.isPlanned).map(d => ({
    id: d.id, isDebt: true, type: d.direction === 'i-owe' ? 'expense' : 'income', amount: d.initialAmount || 0, date: d.dueDate || '', comment: d.comment || '', isPlanned: true, excludeFromBalance: true, accountId: '', categoryId: '', linkedDebtId: d.id
  }));
  ops = [...ops, ...fakeDebts];

  const search = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
  if (search) ops = ops.filter(o => (o.comment||'').toLowerCase().includes(search) || (state.categories.find(c=>c.id===o.categoryId)?.name||'').toLowerCase().includes(search) || (state.debts.find(d=>d.id===o.linkedDebtId)?.name||'').toLowerCase().includes(search));
  const type = document.getElementById('filter-type').value; if (type === 'income' || type === 'expense') ops = ops.filter(o => o.type === type); if (type === 'debt') ops = ops.filter(o => !!o.linkedDebtId || o.isDebt);
  const acc = document.getElementById('filter-account').value; if (acc) ops = ops.filter(o => o.accountId === acc);
  const cat = document.getElementById('filter-category').value; if (cat) ops = ops.filter(o => o.categoryId === cat);
  const status = document.getElementById('filter-status').value; if (status === 'fact') ops = ops.filter(o => !o.isPlanned); if (status === 'plan') ops = ops.filter(o => o.isPlanned);
  const period = document.getElementById('filter-period').value; if (period !== 'all') { let f, t; if (period === 'current-month') { f = startOfMonthISO(); t = endOfMonthISO(); } else if (period === 'previous-month') { f = startOfPrevMonthISO(); t = endOfPrevMonthISO(); } else if (period === 'custom') { f = document.getElementById('filter-date-from').value; t = document.getElementById('filter-date-to').value; } if (f) ops = ops.filter(o => o.date && o.date >= f); if (t) ops = ops.filter(o => o.date && o.date <= t); }
  
  const fHasDebt = document.getElementById('filter-has-debt');
  if (fHasDebt && fHasDebt.checked) ops = ops.filter(o => !!o.linkedDebtId || o.isDebt);
  const fHasNested = document.getElementById('filter-has-nested');
  if (fHasNested && fHasNested.checked) ops = ops.filter(o => o.nested && o.nested.length > 0);
  const sumFrom = document.getElementById('filter-sum-from')?.value || '';
  const sumTo = document.getElementById('filter-sum-to')?.value || '';
  if (sumFrom !== '') ops = ops.filter(o => o.amount >= parseNumber(sumFrom));
  if (sumTo !== '') ops = ops.filter(o => o.amount <= parseNumber(sumTo));

  ops.sort((a, b) => { const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0); const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0); return kb - ka; });
  return ops;
}
function renderOperations() {
  const l = document.getElementById('operations-list'); const e = document.getElementById('operations-empty'); if (!l) return; l.innerHTML = '';
  const ops = getFilteredOperations(); if (!ops.length) { e.classList.remove('hidden'); updateMassActionsVisibility(); return; } e.classList.add('hidden');
  const t = document.getElementById('operation-item-template');
  ops.forEach(op => {
    const n = t.content.firstElementChild.cloneNode(true); n.dataset.id = op.id;
    const acc = state.accounts.find(a => a.id === op.accountId); const cat = state.categories.find(c => c.id === op.categoryId); const debt = state.debts.find(d => d.id === op.linkedDebtId);
    const aE = n.querySelector('.op-amount'); aE.textContent = (op.type === 'income' ? '+' : '−') + formatMoney(op.amount) + ' ₽'; aE.classList.add(op.type === 'income' ? 'income' : 'expense');
    n.querySelector('.op-category').textContent = cat ? cat.name : (op.isDebt ? 'Долг' : 'Без категории'); n.querySelector('.op-account').textContent = acc ? acc.name : '—'; n.querySelector('.op-date').textContent = op.date || 'Без даты';
    let cT = op.comment || ''; if (debt && !op.isDebt) cT = (cT ? cT + ' · ' : '') + 'Долг: ' + debt.name; if (op.isDebt && debt) cT = `Долг: ${debt.name} ${cT}`; n.querySelector('.op-comment').textContent = cT;
    if (op.isPlanned) n.querySelector('.op-badge-plan').classList.remove('hidden');
    const cb = n.querySelector('.op-select'); if (op.isDebt) cb.style.display = 'none'; else { cb.checked = state.selectedOperations.has(op.id); cb.onchange = () => { if (cb.checked) state.selectedOperations.add(op.id); else state.selectedOperations.delete(op.id); updateMassActionsVisibility(); }; }
    
    n.querySelector('.op-main').onclick = (ev) => {
      if (ev.target.tagName === 'INPUT') return;
      if (op.isDebt) openDebtForm(debt);
      else openOperationForm(op);
    };
    
    n.querySelector('.op-edit').onclick = () => op.isDebt ? openDebtForm(debt) : openOperationForm(op);
    n.querySelector('.op-copy').onclick = () => { if (!op.isDebt) copyOperation(op.id); };
    n.querySelector('.op-delete').onclick = () => { if (op.isDebt) deleteDebt(op.id); else deleteOperation(op.id); };
    l.appendChild(n);
  }); updateMassActionsVisibility();
}
function updateMassActionsVisibility() { document.getElementById('mass-actions').classList.toggle('hidden', state.selectedOperations.size === 0); document.getElementById('selected-count').textContent = state.selectedOperations.size; }
async function deleteSelectedOperations() { const ids = Array.from(state.selectedOperations); if (!ids.length) return; if (!window.confirm('Удалить выбранные?')) return; for (const id of ids) await dbDelete('operations', id); state.operations = state.operations.filter(o => !state.selectedOperations.has(o.id)); state.selectedOperations.clear(); renderDashboard(); renderOperations(); fillDebtSelect(); }

function getReportPeriod() { const s = document.getElementById('report-period-select'); const m = s ? s.value : 'current-month'; if (m === 'all') return { from: null, to: null }; if (m === 'custom') return { from: document.getElementById('report-date-from').value || null, to: document.getElementById('report-date-to').value || null }; return { from: startOfMonthISO(), to: endOfMonthISO() }; }
function operationInPeriod(o, f, t) { if (!o.date) return false; if (f && o.date < f) return false; if (t && o.date > t) return false; return true; }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }

function renderReportFact(f, t) {
  const ops = state.operations.filter(o => !o.isPlanned && !o.excludeFromBalance && operationInPeriod(o, f, t));
  let tI = 0, tE = 0; const bC = {}, bA = {};
  ops.forEach(o => {
    const c = state.categories.find(x => x.id === o.categoryId); const a = state.accounts.find(x => x.id === o.accountId);
    const cK = o.type + '|' + (o.categoryId || ''); if (!bC[cK]) bC[cK] = { name: c ? c.name : 'Без категории', type: o.type, sum: 0, ops: [] }; bC[cK].sum += o.amount; bC[cK].ops.push(o);
    const aK = o.accountId || ''; if (!bA[aK]) bA[aK] = { name: a ? a.name : '—', inc: 0, exp: 0 }; if (o.type === 'income') { tI += o.amount; bA[aK].inc += o.amount; } else { tE += o.amount; bA[aK].exp += o.amount; }
  });
  const iC = Object.values(bC).filter(c => c.type === 'income').sort((a, b) => b.sum - a.sum); const eC = Object.values(bC).filter(c => c.type === 'expense').sort((a, b) => b.sum - a.sum);
  let h = `<div class="card"><h3>Итого</h3><div>Доходы: <span class="income">${formatMoney(tI)} ₽</span></div><div>Расходы: <span class="expense">${formatMoney(tE)} ₽</span></div><div class="total">Баланс: ${formatMoney(tI - tE)} ₽</div></div>`;
  
  h += `<div class="card"><h3>Доходы по категориям</h3>`; if (!iC.length) h += '<div class="hint">Нет данных.</div>'; else iC.forEach(c => { 
    h += `<div class="report-row" onclick="this.nextElementSibling.classList.toggle('hidden')"><span>${escapeHtml(c.name)}</span><span class="income">${formatMoney(c.sum)} ₽</span></div><div class="hidden" style="padding: 10px; background: var(--bg); border-radius: 8px; margin-bottom: 8px;">`;
    c.ops.forEach(o => { h += `<div style="padding: 4px 0; display:flex; justify-content:space-between; font-size:14px;"><span>${o.comment || o.date || 'Без имени'}</span><span>${formatMoney(o.amount)} ₽</span></div>`; });
    h += `</div>`; 
  }); h += `</div>`;
  
  h += `<div class="card"><h3>Расходы по категориям</h3>`; if (!eC.length) h += '<div class="hint">Нет данных.</div>'; else eC.forEach(c => { 
    h += `<div class="report-row" onclick="this.nextElementSibling.classList.toggle('hidden')"><span>${escapeHtml(c.name)}</span><span class="expense">${formatMoney(c.sum)} ₽</span></div><div class="hidden" style="padding: 10px; background: var(--bg); border-radius: 8px; margin-bottom: 8px;">`;
    c.ops.forEach(o => { h += `<div style="padding: 4px 0; display:flex; justify-content:space-between; font-size:14px;"><span>${o.comment || o.date || 'Без имени'}</span><span>${formatMoney(o.amount)} ₽</span></div>`; });
    h += `</div>`; 
  }); h += `</div>`;

  h += `<div class="card"><h3>По счетам</h3>`; const aL = Object.values(bA); if (!aL.length) h += '<div class="hint">Нет данных.</div>'; else aL.forEach(a => { h += `<div class="account-line"><span>${escapeHtml(a.name)}</span><span>+${formatMoney(a.inc)} / −${formatMoney(a.exp)} ₽</span></div>`; }); h += `</div>`;
  return h;
}

function renderReportPlan(f, t) {
  const pO = state.operations.filter(o => o.isPlanned && operationInPeriod(o, f, t)); const pD = state.debts.filter(d => d.isPlanned);
  let pI = 0, pE = 0; pO.forEach(o => { if (o.type === 'income') pI += o.amount; else pE += o.amount; });
  let h = `<div class="card"><h3>План на период</h3><div>Доходы: <span class="income">${formatMoney(pI)} ₽</span></div><div>Расходы: <span class="expense">${formatMoney(pE)} ₽</span></div></div>`;
  
  h += `<div class="card"><h3>Плановые операции (нажмите для перехода)</h3>`; if (!pO.length) h += '<div class="hint">Нет данных.</div>'; else pO.sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(o => {
    const c = state.categories.find(x => x.id === o.categoryId); const d = state.debts.find(x => x.id === o.linkedDebtId);
    let l = `${o.date || 'Без даты'} · ${escapeHtml(c ? c.name : 'Без кат.')}`; if (d) l += ` · Долг: ${escapeHtml(d.name)}`; if (o.comment) l += ` · ${escapeHtml(o.comment)}`;
    h += `<div class="report-row" onclick="openOperationForm(state.operations.find(x => x.id === '${o.id}'))"><span>${l}</span><span class="${o.type === 'income' ? 'income' : 'expense'}">${o.type === 'income' ? '+' : '−'}${formatMoney(o.amount)} ₽</span></div>`;
  }); h += `</div>`;

  h += `<div class="card"><h3>Планируемые долги</h3>`; if (!pD.length) h += '<div class="hint">Нет данных.</div>'; else pD.forEach(d => {
    h += `<div class="report-row" onclick="openDebtForm(state.debts.find(x => x.id === '${d.id}'))"><span>${d.direction === 'i-owe' ? 'Я должна' : 'Мне должны'}: ${escapeHtml(d.name)}</span><span class="hint">${d.initialAmount ? formatMoney(d.initialAmount) + ' ₽' : 'без суммы'}</span></div>`;
  }); h += `</div>`;
  return h;
}

function renderReportDebts() {
  const oD = state.debts.filter(d => !d.isPlanned); const cD = state.debts.filter(d => !d.isPlanned && getDebtRemaining(d) <= 0);
  const iO = oD.filter(d => d.direction === 'i-owe' && getDebtRemaining(d) > 0); const oM = oD.filter(d => d.direction === 'owed-to-me' && getDebtRemaining(d) > 0);
  let h = `<div class="card"><h3>Итого</h3><div>Я должна: <span class="expense">${formatMoney(getDebtsTotal('i-owe'))} ₽</span></div><div>Мне должны: <span class="income">${formatMoney(getDebtsTotal('owed-to-me'))} ₽</span></div></div>`;
  h += `<div class="card"><h3>Я должна</h3>`; if (!iO.length) h += '<div class="hint">Нет долгов.</div>'; else iO.forEach(d => { h += `<div class="report-row" onclick="openDebtForm(state.debts.find(x => x.id === '${d.id}'))"><span>${escapeHtml(d.name)} ${d.dueDate ? '· до ' + d.dueDate : ''}</span><span class="expense">${formatMoney(getDebtRemaining(d))} ₽</span></div>`; }); h += `</div>`;
  h += `<div class="card"><h3>Мне должны</h3>`; if (!oM.length) h += '<div class="hint">Нет долгов.</div>'; else oM.forEach(d => { h += `<div class="report-row" onclick="openDebtForm(state.debts.find(x => x.id === '${d.id}'))"><span>${escapeHtml(d.name)} ${d.dueDate ? '· до ' + d.dueDate : ''}</span><span class="income">${formatMoney(getDebtRemaining(d))} ₽</span></div>`; }); h += `</div>`;
  if (cD.length) { h += `<div class="card"><h3>Закрытые долги</h3>`; cD.forEach(d => { h += `<div class="report-row" onclick="openDebtForm(state.debts.find(x => x.id === '${d.id}'))"><span>${d.direction === 'i-owe' ? 'Я должна' : 'Мне должны'}: ${escapeHtml(d.name)}</span><span class="hint">закрыт</span></div>`; }); h += `</div>`; }
  return h;
}
function renderReports() {
  const b = document.getElementById('report-content'); if (!b) return; const a = document.querySelector('.report-tabs button.active'); const tab = a ? a.dataset.report : 'fact'; const p = getReportPeriod();
  if (tab === 'fact') b.innerHTML = renderReportFact(p.from, p.to); else if (tab === 'plan') b.innerHTML = renderReportPlan(p.from, p.to); else b.innerHTML = renderReportDebts();
}

async function loadArchive() { state.archive = await dbGetAll('archive'); }
function isOlderThanOneYear(dateISO) { if (!dateISO) return false; const d = new Date(dateISO); const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1); return d < cutoff; }
function isCreatedOlderThanOneYear(createdAt) { return createdAt && createdAt < Date.now() - 365 * 24 * 60 * 60 * 1000; }
function operationToArchiveItem(op, year, fromAuto = false) {
  return { id: op.id, type: op.type, amount: op.amount, accountId: op.accountId, accountName: (state.accounts.find(a => a.id === op.accountId) || {}).name || '—', categoryId: op.categoryId, categoryName: (state.categories.find(c => c.id === op.categoryId) || {}).name || 'Без кат.', date: op.date || '', comment: op.comment || '', isPlanned: !!op.isPlanned, linkedDebtId: op.linkedDebtId || '', nested: op.nested || [], archiveYear: year, archivedAt: Date.now(), fromAuto };
}
function archiveYearForOperation(op) { return op.date ? new Date(op.date).getFullYear() : new Date().getFullYear(); }
async function archiveOperations(ops, yearByOp) {
  for (const op of ops) { const y = yearByOp[op.id] || archiveYearForOperation(op); await dbPut('archive', operationToArchiveItem(op, y, false)); await dbDelete('operations', op.id); }
  state.operations = state.operations.filter(o => !ops.find(x => x.id === o.id)); state.archive = await dbGetAll('archive'); state.selectedOperations.clear(); renderDashboard(); renderOperations(); renderArchive();
}
async function archiveSelectedOperations() {
  const ids = Array.from(state.selectedOperations); if (!ids.length) return; const ops = state.operations.filter(o => ids.includes(o.id));
  const wD = ops.filter(o => !o.date); let msg = `Архивировать ${ops.length} операций?`; if (wD.length) msg += `\nУ ${wD.length} записей нет даты.`; if (!window.confirm(msg)) return;
  let yB = {}; if (wD.length) { const yS = window.prompt(`В какой год архива? (по умолч. ${new Date().getFullYear()})`, String(new Date().getFullYear())); if (yS === null) return; const y = parseInt(yS); if (isNaN(y)) return; wD.forEach(o => yB[o.id] = y); }
  await archiveOperations(ops, yB);
}
async function autoArchiveOldOperations() {
  const old = state.operations.filter(o => o.date && isOlderThanOneYear(o.date)); if (!old.length) return;
  for (const op of old) { await dbPut('archive', operationToArchiveItem(op, archiveYearForOperation(op), true)); await dbDelete('operations', op.id); }
  state.operations = state.operations.filter(o => !old.find(x => x.id === o.id)); state.archive = await dbGetAll('archive'); renderDashboard(); renderOperations(); renderArchive();
}
function getOldUndatedOperations() { return state.operations.filter(o => !o.date && isCreatedOlderThanOneYear(o.createdAt)); }
function showArchiveNotificationIfNeeded() {
  const old = getOldUndatedOperations(); const ex = document.getElementById('archive-notification'); if (ex) ex.remove(); if (!old.length) return;
  const d = document.getElementById('screen-dashboard'); if (!d) return; const b = document.createElement('div'); b.id = 'archive-notification'; b.className = 'card'; b.style.border = '2px solid var(--accent)';
  b.innerHTML = `<h3>Готовы к архивации</h3><div class="hint">Есть ${old.length} записей без даты старше года.</div><div class="form-buttons"><button class="btn-primary" id="arch-notif-open">Выбрать</button><button class="btn-secondary" id="arch-notif-later">Позже</button></div>`;
  d.insertBefore(b, d.firstChild);
  document.getElementById('arch-notif-later').onclick = () => b.remove();
  document.getElementById('arch-notif-open').onclick = () => { b.remove(); switchScreen('history'); document.getElementById('filters-panel').classList.remove('hidden'); state.selectedOperations.clear(); old.forEach(o => state.selectedOperations.add(o.id)); renderOperations(); };
}
function renderArchive() {
  const yB = document.getElementById('archive-years'); const lB = document.getElementById('archive-list'); const e = document.getElementById('archive-empty'); if (!yB || !lB) return;
  const years = [...new Set(state.archive.map(a => a.archiveYear))].sort((a, b) => b - a); yB.innerHTML = ''; if (!years.length) { lB.innerHTML = ''; e.classList.remove('hidden'); return; } e.classList.add('hidden');
  const cur = state.currentArchiveYear || years[0]; state.currentArchiveYear = cur;
  years.forEach(y => { const b = document.createElement('button'); b.className = 'btn-small' + (y === cur ? ' btn-primary' : ''); b.textContent = y; b.onclick = () => { state.currentArchiveYear = y; renderArchive(); }; yB.appendChild(b); });
  const items = state.archive.filter(a => a.archiveYear === cur).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)); lB.innerHTML = ''; const t = document.getElementById('archive-item-template');
  items.forEach(a => { const n = t.content.firstElementChild.cloneNode(true); const aE = n.querySelector('.arch-amount'); aE.textContent = (a.type === 'income' ? '+' : '−') + formatMoney(a.amount) + ' ₽'; aE.classList.add(a.type === 'income' ? 'income' : 'expense'); n.querySelector('.arch-category').textContent = a.categoryName; n.querySelector('.arch-date').textContent = a.date || 'Без даты'; n.querySelector('.arch-note').textContent = a.comment || ''; n.querySelector('.arch-restore').onclick = () => restoreFromArchive(a.id); lB.appendChild(n); });
}
async function restoreFromArchive(id) { const i = state.archive.find(a => a.id === id); if (!i) return; if (!window.confirm('Восстановить?')) return; const op = { id: i.id, type: i.type, amount: i.amount, accountId: i.accountId, categoryId: i.categoryId, date: i.date || '', comment: i.comment || '', isPlanned: i.isPlanned || false, excludeFromBalance: false, linkedDebtId: i.linkedDebtId || '', nested: i.nested || [], manualSum: false, createdAt: i.archivedAt || Date.now(), updatedAt: Date.now() }; await dbPut('operations', op); await dbDelete('archive', i.id); state.operations.push(op); state.archive = state.archive.filter(a => a.id !== i.id); renderDashboard(); renderOperations(); renderArchive(); }
async function exportArchiveJSON() { const y = [...new Set(state.archive.map(a => a.archiveYear))].sort((a, b) => b - a); if (!y.length) return alert('Пусто'); const i = prompt(`За какой год? (${y.join(', ')})`, ''); if (i === null) return; let it, f; if (i.trim() === '') { it = state.archive; f = 'archive-all.json'; } else { const yr = parseInt(i); if (isNaN(yr)) return; it = state.archive.filter(a => a.archiveYear === yr); if (!it.length) return alert('Нет данных'); f = 'archive-' + yr + '.json'; } const d = { version: 1, exportedAt: Date.now(), items: it }; const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = f; l.click(); URL.revokeObjectURL(u); if (window.confirm('Экспорт выполнен. Удалить из архива?')) { for (const itm of it) await dbDelete('archive', itm.id); state.archive = state.archive.filter(a => !it.find(x => x.id === a.id)); renderArchive(); } }
async function importArchiveJSON(file) { try { const t = await file.text(); const d = JSON.parse(t); const it = Array.isArray(d) ? d : (d.items || []); if (!it.length) return alert('Нет записей'); if (!window.confirm(`Импортировать ${it.length} записей?`)) return; for (const i of it) { const itm = { id: i.id || uid('arch'), type: i.type || 'expense', amount: Number(i.amount) || 0, accountId: i.accountId || '', accountName: i.accountName || '—', categoryId: i.categoryId || '', categoryName: i.categoryName || 'Без кат.', date: i.date || '', comment: i.comment || '', isPlanned: !!i.isPlanned, linkedDebtId: i.linkedDebtId || '', nested: i.nested || [], archiveYear: i.archiveYear || new Date().getFullYear(), archivedAt: i.archivedAt || Date.now(), fromAuto: false }; await dbPut('archive', itm); } state.archive = await dbGetAll('archive'); renderArchive(); alert('Импорт завершён'); } catch (e) { alert('Ошибка: ' + e.message); } }

function downloadBlob(c, f, m) { const b = new Blob([c], { type: m }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = f; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
async function exportJSON() { const d = { version: 1, exportedAt: Date.now(), accounts: state.accounts, categories: state.categories, operations: state.operations, debts: state.debts, templates: state.templates, archive: state.archive }; downloadBlob(JSON.stringify(d, null, 2), 'finance-backup-' + todayISO() + '.json', 'application/json'); alert('JSON сохранён'); }
async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Неверный формат файла');
    
    if (!window.confirm('Объединить данные из файла с текущими?\n\nСуществующие записи будут обновлены, новые — добавлены. Данные, которые есть только на этом устройстве, НЕ удалятся.')) return;

    const mergeStore = async (storeName, items) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        await dbPut(storeName, item); 
      }
    };

    await mergeStore('accounts', data.accounts);
    await mergeStore('categories', data.categories);
    await mergeStore('operations', data.operations);
    await mergeStore('debts', data.debts);
    await mergeStore('templates', data.templates);
    await mergeStore('archive', data.archive);

    await loadAccounts(); await loadCategories(); await loadOperations(); await loadDebts(); await loadTemplates(); await loadArchive();

    renderDashboard(); renderOperations(); renderArchive(); renderCategories(); renderAccounts(); renderTemplates();
    alert('Слияние завершено успешно! Все данные объединены.');
  } catch (err) { 
    alert('Ошибка слияния: ' + err.message); 
  }
}
function csvEscape(v) { const s = String(v == null ? '' : v); return s.includes(';') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; }
async function exportCSV() { const r = [['Дата', 'Тип', 'Сумма', 'Счёт', 'Категория', 'Плановое', 'Не в балансе', 'Долг', 'Комментарий'].join(';')]; const s = [...state.operations].sort((a, b) => { const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0); const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0); return ka - kb; }); s.forEach(o => { const a = state.accounts.find(x => x.id === o.accountId); const c = state.categories.find(x => x.id === o.categoryId); const d = state.debts.find(x => x.id === o.linkedDebtId); r.push([o.date || '', o.type === 'income' ? 'Доход' : 'Расход', Number(o.amount).toFixed(2), a ? a.name : '', c ? c.name : '', o.isPlanned ? 'да' : 'нет', o.excludeFromBalance ? 'да' : 'нет', d ? d.name : '', o.comment || ''].map(csvEscape).join(';')); }); downloadBlob('\uFEFF' + r.join('\r\n'), 'finance-' + todayISO() + '.csv', 'text/csv;charset=utf-8'); alert('CSV сохранён'); }
async function importCSV(file) { try { const t = await file.text(); const l = t.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim()); if (l.length < 2) throw new Error('Пустой файл'); const h = l[0].split(';').map(x => x.replace(/^"|"$/g, '').trim().toLowerCase()); const ix = n => h.indexOf(n); const iD = ix('дата'), iT = ix('тип'), iA = ix('сумма'), iAc = ix('счёт'), iC = ix('категория'), iP = ix('плановое'), iE = ix('не в балансе'), iDbt = ix('долг'), iCm = ix('комментарий'); if (iT < 0 || iA < 0) throw new Error('Нет колонок'); if (!window.confirm('Импортировать CSV?')) return; const sl = line => { const r = []; let c = '', i = false; for (let j = 0; j < line.length; j++) { const ch = line[j]; if (ch === '"') { if (i && line[j + 1] === '"') { c += '"'; j++; } else i = !i; } else if (ch === ';' && !i) { r.push(c); c = ''; } else c += ch; } r.push(c); return r; }; let add = 0; for (let j = 1; j < l.length; j++) { const c = sl(l[j]); const tr = (c[iT] || '').toLowerCase(); const ty = tr.startsWith('дох') ? 'income' : 'expense'; const am = parseFloat((c[iA] || '0').replace(',', '.')) || 0; if (!am) continue; let ac = state.accounts.find(x => x.name === (c[iAc] || '').trim()); if (!ac && state.accounts.length) ac = state.accounts[0]; let ct = state.categories.find(x => x.name === (c[iC] || '').trim() && x.type === ty); if (!ct && c[iC]) { ct = { id: uid('cat'), type: ty, name: c[iC].trim(), createdAt: Date.now() }; await dbPut('categories', ct); state.categories.push(ct); } const dbt = c[iDbt] ? state.debts.find(x => x.name === c[iDbt].trim()) : null; const op = { id: uid('op'), type: ty, amount: am, accountId: ac ? ac.id : '', categoryId: ct ? ct.id : '', date: (c[iD] || '').trim(), comment: (c[iCm] || '').trim(), isPlanned: iP >= 0 && /^(да|yes|1)$/i.test((c[iP] || '').trim()), excludeFromBalance: iE >= 0 && /^(да|yes|1)$/i.test((c[iE] || '').trim()), linkedDebtId: dbt ? dbt.id : '', nested: [], manualSum: false, createdAt: Date.now(), updatedAt: Date.now() }; await dbPut('operations', op); state.operations.push(op); add++; } renderDashboard(); renderOperations(); renderCategories(); alert('Импортировано: ' + add); } catch (e) { alert('Ошибка: ' + e.message); } }
async function exportTXT() { const l = ['Мои финансы', 'Сформирован: ' + new Date().toLocaleString('ru-RU'), 'Операций: ' + state.operations.length]; const tI = state.operations.filter(o => !o.isPlanned && o.type === 'income').reduce((s, o) => s + o.amount, 0); const tE = state.operations.filter(o => !o.isPlanned && o.type === 'expense').reduce((s, o) => s + o.amount, 0); l.push('Доходы: ' + formatMoney(tI), 'Расходы: ' + formatMoney(tE), 'Баланс: ' + formatMoney(tI - tE), '---'); const s = [...state.operations].sort((a, b) => { const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0); const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0); return kb - ka; }); s.forEach(o => { const a = state.accounts.find(x => x.id === o.accountId); const c = state.categories.find(x => x.id === o.categoryId); const d = state.debts.find(x => x.id === o.linkedDebtId); let x = (o.date || 'без даты') + ' | ' + (o.type === 'income' ? '+' : '−') + formatMoney(o.amount) + ' | ' + (c ? c.name : '') + ' | ' + (a ? a.name : '') + (o.isPlanned ? ' | ПЛАН' : ''); if (d) x += ' | долг: ' + d.name; if (o.comment) x += ' | ' + o.comment; l.push(x); }); downloadBlob(l.join('\r\n'), 'finance-' + todayISO() + '.txt', 'text/plain;charset=utf-8'); alert('TXT сохранён'); }
async function exportPDF() { const w = window.open('', '_blank'); if (!w) return alert('Разрешите окна'); const tI = state.operations.filter(o => !o.isPlanned && o.type === 'income').reduce((s, o) => s + o.amount, 0); const tE = state.operations.filter(o => !o.isPlanned && o.type === 'expense').reduce((s, o) => s + o.amount, 0); const rH = [...state.operations].sort((a, b) => { const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0); const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0); return kb - ka; }).map(o => { const a = state.accounts.find(x => x.id === o.accountId); const c = state.categories.find(x => x.id === o.categoryId); const cl = o.type === 'income' ? '#1E563E' : '#C94C4C'; return `<tr><td>${escapeHtml(o.date || '')}</td><td>${escapeHtml(c ? c.name : '')}</td><td>${escapeHtml(a ? a.name : '')}</td><td style="color:${cl};text-align:right;">${o.type === 'income' ? '+' : '−'}${formatMoney(o.amount)} ₽</td><td>${escapeHtml(o.comment || '')}${o.isPlanned ? ' (план)' : ''}</td></tr>`; }).join(''); const h = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Отчёт</title><style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;font-size:13px;}th,td{border:1px solid #ccc;padding:6px;text-align:left;}th{background:#f0f0f0;} .sum{margin:12px 0;padding:10px;background:#f8f8f8;} @media print{.no-print{display:none;}}</style></head><body><h1>Мои финансы</h1><div class="sum"><div>Сформирован: ${new Date().toLocaleString('ru-RU')}</div><div>Доходы: <b style="color:#1E563E;">${formatMoney(tI)} ₽</b></div><div>Расходы: <b style="color:#C94C4C;">${formatMoney(tE)} ₽</b></div><div>Баланс: <b>${formatMoney(tI - tE)} ₽</b></div></div><table><thead><tr><th>Дата</th><th>Категория</th><th>Счёт</th><th>Сумма</th><th>Комментарий</th></tr></thead><tbody>${rH}</tbody></table><p class="no-print" style="margin-top:20px;"><button onclick="window.print()">Печать / PDF</button></p></body></html>`; w.document.write(h); w.document.close(); }
async function updateStorageInfo() { const i = document.getElementById('storage-info'); const f = document.getElementById('storage-bar-fill'); if (!i) return; try { const e = await navigator.storage.estimate(); const u = e.usage || 0; const q = e.quota || 0; const p = q ? Math.min(100, (u / q) * 100) : 0; i.textContent = 'Занято: ' + formatBytes(u) + ' из ' + formatBytes(q) + ' (' + p.toFixed(2) + '%)'; if (f) f.style.width = p + '%'; } catch (e) { i.textContent = 'Ошибка'; } }
function formatBytes(b) { if (!b) return '0 Б'; const u = ['Б', 'КБ', 'МБ', 'ГБ']; let i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(2) + ' ' + u[i]; }
async function requestPersistentStorage() { if (!navigator.storage || !navigator.storage.persist) return alert('Не поддерживается'); const g = await navigator.storage.persist(); alert(g ? 'Разрешено' : 'Запрещено'); updateStorageInfo(); }

function setupNavigation() { $$('[data-screen]').forEach(b => b.onclick = () => switchScreen(b.dataset.screen)); }
function setupModals() {
  document.getElementById('fab-add-center').onclick = () => openModal('modal-add-choice');
  $$('.modal-close').forEach(b => b.onclick = () => closeAllModals());
  $$('[data-add]').forEach(b => { b.onclick = () => { const t = b.dataset.add; closeModal('modal-add-choice'); if (t === 'debt') openDebtForm(); else { openOperationForm(); document.getElementById('op-type').value = t; fillCategorySelect(); } }; });
  document.getElementById('btn-cancel-operation').onclick = () => tryCloseModal('modal-operation');
  document.getElementById('btn-cancel-debt').onclick = () => tryCloseModal('modal-debt');
  document.getElementById('operation-form').onsubmit = saveOperationWithDebtCheck;
  document.getElementById('debt-form').onsubmit = saveDebt;
  document.getElementById('template-form').onsubmit = saveTemplate;
  document.getElementById('btn-add-template-field').onclick = () => addTemplateFieldInput();
  document.getElementById('btn-cancel-template').onclick = () => tryCloseModal('modal-template');
}
function setupModalXButtons() { $$('.modal-x').forEach(b => b.onclick = () => tryCloseModal(b.closest('.modal').id)); }
function setupOverlayClose() { $$('.modal').forEach(m => m.onclick = (e) => { if (e.target === m) tryCloseModal(m.id); }); }
function setupFormDirtyTracking() { ['operation-form', 'debt-form', 'template-form'].forEach(id => { const f = document.getElementById(id); if (f) { f.oninput = () => markFormDirty(f); f.onchange = () => markFormDirty(f); } }); }
function setupTheme() { $$('input[name="theme"]').forEach(r => r.onchange = () => { if (r.checked) setTheme(r.value); }); const b = document.getElementById('btn-theme-toggle'); if (b) b.onclick = cycleTheme; window.matchMedia('(prefers-color-scheme: dark)').onchange = () => { if (state.settings.theme === 'system') applyTheme('system'); }; }
function setupSettingsButtons() {
  document.getElementById('btn-add-account').onclick = addAccount;
  document.getElementById('btn-add-income-category').onclick = () => addCategory('income');
  document.getElementById('btn-add-expense-category').onclick = () => addCategory('expense');
  document.getElementById('btn-add-template').onclick = () => openTemplateForm();
  document.getElementById('btn-export-json').onclick = exportJSON; document.getElementById('btn-import-json').onclick = () => document.getElementById('import-json-input').click();
  document.getElementById('import-json-input').onchange = (e) => { const f = e.target.files[0]; if (f) importJSON(f); e.target.value = ''; };
  document.getElementById('btn-export-csv').onclick = exportCSV; document.getElementById('btn-import-csv').onclick = () => document.getElementById('import-csv-input').click();
  document.getElementById('import-csv-input').onchange = (e) => { const f = e.target.files[0]; if (f) importCSV(f); e.target.value = ''; };
  document.getElementById('btn-export-txt').onclick = exportTXT; document.getElementById('btn-export-pdf').onclick = exportPDF;
  document.getElementById('btn-request-persist').onclick = requestPersistentStorage;
  updateStorageInfo();
}
function setupDebtForm() {
  document.getElementById('debt-is-credit').onchange = (e) => { document.getElementById('credit-block').classList.toggle('hidden', !e.target.checked); };
  ['debt-amount', 'debt-term', 'debt-rate'].forEach(id => document.getElementById(id).oninput = () => { if (document.getElementById('debt-is-credit').checked) calcCreditTotal(); });
  document.getElementById('debt-date-clear').onclick = () => document.getElementById('debt-due-date').value = '';
}
function setupOperationForm() {
  document.getElementById('op-type').onchange = () => fillCategorySelect();
  document.getElementById('op-is-planned').onchange = (e) => { if (e.target.checked) document.getElementById('op-exclude-balance').checked = true; };
  document.getElementById('op-date-clear').onclick = () => document.getElementById('op-date').value = '';
  document.getElementById('btn-add-nested-field').onclick = () => { if (isManualSum()) { showManualIndicator(false); disableNestedInputs(false); } addNestedField(); };
  document.getElementById('btn-recalc').onclick = () => { showManualIndicator(false); disableNestedInputs(false); recalcNestedTotal(); };
  document.getElementById('op-amount').oninput = () => { const n = $$('#nested-fields-list .nested-field-row').length > 0; if (n) { showManualIndicator(true); disableNestedInputs(true); } };
  document.getElementById('op-template').onchange = (e) => { const t = state.templates.find(x => x.id === e.target.value); if (!t) return; document.getElementById('op-type').value = t.type; fillCategorySelect(); clearNestedFields(); showManualIndicator(false); disableNestedInputs(false); t.fields.forEach(f => addNestedField(f.name, '')); recalcNestedTotal(); };
}
function setupDashboardPeriod() {
  $$('[data-dashboard-period]').forEach(b => b.onclick = () => { const p = b.dataset.dashboardPeriod; state.dashboardPeriod = p; $$('[data-dashboard-period]').forEach(x => x.classList.toggle('active', x === b)); document.getElementById('dashboard-custom-period').classList.toggle('hidden', p !== 'custom'); updateDashboardPeriodStats(); });
  ['dashboard-date-from', 'dashboard-date-to'].forEach(id => document.getElementById(id).onchange = updateDashboardPeriodStats);
}
function setupHistoryFilters() {
  document.getElementById('btn-toggle-filters').onclick = () => { const p = document.getElementById('filters-panel'); p.classList.toggle('hidden'); document.getElementById('btn-toggle-filters').textContent = p.classList.contains('hidden') ? 'Фильтры ▾' : 'Фильтры ▴'; };
  ['filter-search', 'filter-type', 'filter-account', 'filter-category', 'filter-status', 'filter-period', 'filter-date-from', 'filter-date-to'].forEach(id => { const el = document.getElementById(id); if (el) { el.oninput = renderOperations; el.onchange = renderOperations; } });
  document.getElementById('filter-period').onchange = (e) => { document.getElementById('filter-custom-period').classList.toggle('hidden', e.target.value !== 'custom'); renderOperations(); };
  document.getElementById('btn-reset-filters').onclick = () => { ['filter-search', 'filter-type', 'filter-account', 'filter-category', 'filter-sum-from', 'filter-sum-to'].forEach(id => document.getElementById(id).value = ''); document.getElementById('filter-period').value = 'all'; document.getElementById('filter-status').value = 'all'; renderOperations(); };
  document.getElementById('btn-mass-cancel').onclick = () => { state.selectedOperations.clear(); renderOperations(); };
  document.getElementById('btn-mass-delete').onclick = deleteSelectedOperations;
  document.getElementById('btn-mass-archive').onclick = archiveSelectedOperations;
}
function setupReports() { $$('.report-tabs button').forEach(b => b.onclick = () => { $$('.report-tabs button').forEach(x => x.classList.toggle('active', x === b)); renderReports(); }); document.getElementById('report-period-select').onchange = (e) => { document.getElementById('report-custom-period').classList.toggle('hidden', e.target.value !== 'custom'); renderReports(); }; ['report-date-from', 'report-date-to'].forEach(id => document.getElementById(id).onchange = renderReports); }
function setupArchive() {
  document.getElementById('btn-manual-archive').onclick = archiveSelectedOperations; document.getElementById('btn-export-archive').onclick = exportArchiveJSON;
  document.getElementById('btn-import-archive').onclick = () => document.getElementById('archive-file-input').click();
  document.getElementById('archive-file-input').onchange = (e) => { const f = e.target.files[0]; if (f) importArchiveJSON(f); e.target.value = ''; };
}

async function init() {
  loadTheme(); state.db = await openDB();
  await loadAccounts(); await loadCategories(); await loadTemplates(); await loadOperations(); await loadDebts(); await loadArchive();
  setupNavigation(); setupModals(); setupModalXButtons(); setupOverlayClose(); setupFormDirtyTracking(); setupTheme(); setupSettingsButtons(); setupDebtForm(); setupOperationForm(); setupDashboardPeriod(); setupHistoryFilters(); setupReports(); setupArchive();
  switchScreen('dashboard');
  await autoArchiveOldOperations(); showArchiveNotificationIfNeeded();
}

document.addEventListener('submit', (e) => { e.preventDefault(); }, true);
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js')); }
document.addEventListener('DOMContentLoaded', init);