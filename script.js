'use strict';

// =========================================================================
// КОНСТАНТЫ
// =========================================================================
const DB_NAME = 'my-finance-db';
const DB_VERSION = 1;
const STORES = ['accounts', 'categories', 'operations', 'debts', 'templates', 'archive'];

const DEFAULT_ACCOUNTS = [
  { id: 'acc_card', name: 'Карта', initialBalance: 0, createdAt: Date.now() },
  { id: 'acc_cash', name: 'Наличные', initialBalance: 0, createdAt: Date.now() },
];

const DEFAULT_INCOME_CATEGORIES = [
  { id: 'cat_inc_salary',  type: 'income', name: 'Зарплата',   createdAt: Date.now() },
  { id: 'cat_inc_extra',   type: 'income', name: 'Подработка', createdAt: Date.now() },
  { id: 'cat_inc_gift',    type: 'income', name: 'Подарки',    createdAt: Date.now() },
  { id: 'cat_inc_other',   type: 'income', name: 'Прочее',     createdAt: Date.now() },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'cat_exp_food',      type: 'expense', name: 'Продукты',     createdAt: Date.now() },
  { id: 'cat_exp_transport', type: 'expense', name: 'Транспорт',    createdAt: Date.now() },
  { id: 'cat_exp_utilities', type: 'expense', name: 'Коммуналка',   createdAt: Date.now() },
  { id: 'cat_exp_health',    type: 'expense', name: 'Здоровье',     createdAt: Date.now() },
  { id: 'cat_exp_fun',       type: 'expense', name: 'Развлечения',  createdAt: Date.now() },
  { id: 'cat_exp_other',     type: 'expense', name: 'Прочее',       createdAt: Date.now() },
];

const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_utilities',
    name: 'Коммуналка',
    type: 'expense',
    fields: [
      { id: 'fld_light', name: 'Свет' },
      { id: 'fld_gas',   name: 'Газ' },
      { id: 'fld_water', name: 'Вода' },
      { id: 'fld_trash', name: 'Мусор' },
    ],
    createdAt: Date.now(),
  },
];

// =========================================================================
// СОСТОЯНИЕ
// =========================================================================
const state = {
  db: null,
  accounts: [],
  categories: [],
  operations: [],
  debts: [],
  templates: [],
  archive: [],
  currentScreen: 'dashboard',
  settings: { theme: 'system' },
  dashboardPeriod: 'week',
  selectedOperations: new Set(),
};

// =========================================================================
// УТИЛИТЫ
// =========================================================================
function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatMoney(n) {
  const num = Number(n) || 0;
  // Разделяем целую и дробную часть
  const parts = num.toFixed(2).split('.');
  // Добавляем неразрывный пробел (или обычный) каждые 3 цифры
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join(',');
}
function parseNumber(v) {
  return parseFloat(String(v).replace(',', '.')) || 0;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 6);
  return toISO(d);
}

function startOfMonthISO() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonthISO() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfPrevMonthISO() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

function endOfPrevMonthISO() {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 0));
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// =========================================================================
// INDEXEDDB
// =========================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, item) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =========================================================================
// ТЕМА
// =========================================================================
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const effective = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.setAttribute('data-theme', effective);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#1a1a1a' : '#ffffff');
  $$('input[name="theme"]').forEach(r => { r.checked = (r.value === theme); });
}

function loadTheme() {
  const theme = localStorage.getItem('theme') || 'system';
  state.settings.theme = theme;
  applyTheme(theme);
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  state.settings.theme = theme;
  applyTheme(theme);
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const cur = state.settings.theme || 'system';
  setTheme(order[(order.indexOf(cur) + 1) % order.length]);
}

// =========================================================================
// НАВИГАЦИЯ
// =========================================================================
function switchScreen(name) {
  state.currentScreen = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  $$('[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === name));

  if (name === 'dashboard') renderDashboard();
  if (name === 'history') { fillFilterSelects(); renderOperations(); }
  if (name === 'reports') renderReports();
  if (name === 'archive') renderArchive();
  if (name === 'settings') {
    renderAccounts();
    renderCategories();
    renderTemplates();
    updateStorageInfo();
  }
}

// =========================================================================
// МОДАЛКИ
// =========================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    const form = el.querySelector('form');
    if (form) clearFormDirty(form);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function closeAllModals() {
  $$('.modal').forEach(m => m.classList.add('hidden'));
}

function markFormDirty(form) {
  const modal = form.closest('.modal');
  if (modal) modal.dataset.dirty = 'true';
}

function clearFormDirty(form) {
  const modal = form.closest('.modal');
  if (modal) modal.dataset.dirty = 'false';
}

function isFormDirty(form) {
  const modal = form.closest('.modal');
  return !!modal && modal.dataset.dirty === 'true';
}

function tryCloseModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const form = modal.querySelector('form');
  if (form && isFormDirty(form)) {
    if (!window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
  }
  modal.classList.add('hidden');
  if (form) clearFormDirty(form);
}

// =========================================================================
// СЧЕТА
// =========================================================================
async function loadAccounts() {
  state.accounts = await dbGetAll('accounts');
  if (state.accounts.length === 0) {
    for (const acc of DEFAULT_ACCOUNTS) await dbPut('accounts', acc);
    state.accounts = DEFAULT_ACCOUNTS.map(a => ({ ...a }));
  }
}

function renderAccounts() {
  const list = document.getElementById('accounts-list');
  if (!list) return;
  list.innerHTML = '';
  const tpl = document.getElementById('account-item-template');
  state.accounts.forEach(acc => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = acc.id;
    node.querySelector('.item-name').textContent = acc.name;
    node.querySelector('.item-balance').textContent = formatMoney(acc.initialBalance) + ' ₽';
    node.querySelector('.item-edit').addEventListener('click', () => editAccount(acc.id));
    node.querySelector('.item-delete').addEventListener('click', () => deleteAccount(acc.id));
    list.appendChild(node);
  });
  renderDashboard();
}

async function addAccount() {
  const name = prompt('Название счёта:', '');
  if (name === null) return;
  if (!name.trim()) { alert('Название не может быть пустым.'); return; }
  const balanceStr = prompt('Начальный остаток (₽):', '0');
  if (balanceStr === null) return;
  const acc = {
    id: uid('acc'), name: name.trim(),
    initialBalance: parseNumber(balanceStr), createdAt: Date.now(),
  };
  await dbPut('accounts', acc);
  state.accounts.push(acc);
  renderAccounts();
}

async function editAccount(id) {
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;
  const name = prompt('Название счёта:', acc.name);
  if (name === null) return;
  if (!name.trim()) { alert('Название не может быть пустым.'); return; }
  const balanceStr = prompt('Начальный остаток (₽):', String(acc.initialBalance));
  if (balanceStr === null) return;
  acc.name = name.trim();
  acc.initialBalance = parseNumber(balanceStr);
  await dbPut('accounts', acc);
  renderAccounts();
}

async function deleteAccount(id) {
  if (state.accounts.length <= 1) {
    alert('Нельзя удалить последний счёт — должен остаться хотя бы один.');
    return;
  }
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;
  const linkedOps = state.operations.filter(o => o.accountId === id);
  if (linkedOps.length > 0) {
    if (!window.confirm('На счёте «' + acc.name + '» есть операции (' + linkedOps.length +
                 '). Удалить счёт вместе с операциями?')) return;
    for (const op of linkedOps) await dbDelete('operations', op.id);
    state.operations = state.operations.filter(o => o.accountId !== id);
  } else {
    if (!window.confirm('Удалить счёт «' + acc.name + '»?')) return;
  }
  await dbDelete('accounts', id);
  state.accounts = state.accounts.filter(a => a.id !== id);
  renderAccounts();
  renderOperations();
}

// =========================================================================
// КАТЕГОРИИ
// =========================================================================
async function loadCategories() {
  state.categories = await dbGetAll('categories');
  if (state.categories.length === 0) {
    const seed = [...DEFAULT_INCOME_CATEGORIES, ...DEFAULT_EXPENSE_CATEGORIES];
    for (const cat of seed) await dbPut('categories', cat);
    state.categories = seed.map(c => ({ ...c }));
  }
}

function renderCategories() {
  const incomeList  = document.getElementById('income-categories-list');
  const expenseList = document.getElementById('expense-categories-list');
  if (!incomeList || !expenseList) return;
  incomeList.innerHTML = '';
  expenseList.innerHTML = '';
  const incomeTpl  = document.getElementById('income-category-item-template');
  const expenseTpl = document.getElementById('expense-category-item-template');

  state.categories.forEach(cat => {
    const tpl  = cat.type === 'income' ? incomeTpl : expenseTpl;
    const list = cat.type === 'income' ? incomeList : expenseList;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = cat.id;
    node.querySelector('.item-name').textContent = cat.name;
    node.querySelector('.item-edit').addEventListener('click', () => editCategory(cat.id));
    node.querySelector('.item-delete').addEventListener('click', () => deleteCategory(cat.id));
    list.appendChild(node);
  });
}

async function addCategory(type) {
  const label = type === 'income' ? 'дохода' : 'расхода';
  const name = prompt('Название категории ' + label + ':', '');
  if (name === null) return;
  if (!name.trim()) { alert('Название не может быть пустым.'); return; }
  const cat = { id: uid('cat'), type, name: name.trim(), createdAt: Date.now() };
  await dbPut('categories', cat);
  state.categories.push(cat);
  renderCategories();
}

async function editCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  const name = prompt('Название категории:', cat.name);
  if (name === null) return;
  if (!name.trim()) { alert('Название не может быть пустым.'); return; }
  cat.name = name.trim();
  await dbPut('categories', cat);
  renderCategories();
}

async function deleteCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  const linked = state.operations.filter(o => o.categoryId === id);
  if (linked.length > 0) {
    const choice = window.confirm('Категория используется в ' + linked.length +
      ' операциях. Нажмите ОК, чтобы оставить операции без категории, или Отмена, чтобы отменить удаление.');
    if (!choice) return;
    for (const op of linked) {
      op.categoryId = '';
      await dbPut('operations', op);
    }
  } else {
    if (!window.confirm('Удалить категорию «' + cat.name + '»?')) return;
  }
  await dbDelete('categories', id);
  state.categories = state.categories.filter(c => c.id !== id);
  renderCategories();
  renderOperations();
}

// =========================================================================
// ШАБЛОНЫ
// =========================================================================
async function loadTemplates() {
  state.templates = await dbGetAll('templates');
  if (state.templates.length === 0) {
    for (const t of DEFAULT_TEMPLATES) await dbPut('templates', t);
    state.templates = DEFAULT_TEMPLATES.map(t => ({
      ...t, fields: t.fields.map(f => ({ ...f })),
    }));
  }
}

function renderTemplates() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  list.innerHTML = '';
  const tpl = document.getElementById('template-item-template');
  state.templates.forEach(t => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = t.id;
    node.querySelector('.item-name').textContent = t.name;
    node.querySelector('.item-fields-count').textContent =
      '(' + (t.fields ? t.fields.length : 0) + ' полей)';
    node.querySelector('.item-edit').addEventListener('click',
      () => alert('Редактирование шаблонов — в следующих частях.'));
    node.querySelector('.item-copy').addEventListener('click',
      () => alert('Копирование шаблонов — в следующих частях.'));
    node.querySelector('.item-delete').addEventListener('click', () => deleteTemplate(t.id));
    list.appendChild(node);
  });
}

async function deleteTemplate(id) {
  const t = state.templates.find(x => x.id === id);
  if (!t) return;
  if (!window.confirm('Удалить шаблон «' + t.name + '»?')) return;
  await dbDelete('templates', id);
  state.templates = state.templates.filter(x => x.id !== id);
  renderTemplates();
}

// =========================================================================
// ДОЛГИ: РАСЧЁТЫ
// =========================================================================
async function loadDebts() {
  state.debts = await dbGetAll('debts');
}

function getDebtRemaining(debt) {
  let paid = 0;
  state.operations.forEach(o => {
    if (o.linkedDebtId !== debt.id) return;
    if (o.isPlanned) return;
    paid += o.amount;
  });
  const remaining = (debt.initialAmount || 0) - paid;
  return Math.max(0, remaining);
}

function getDebtsTotal(direction) {
  let total = 0;
  state.debts.forEach(d => {
    if (d.isPlanned) return;
    if (d.direction !== direction) return;
    total += getDebtRemaining(d);
  });
  return total;
}

// =========================================================================
// ОПЕРАЦИИ: ЗАГРУЗКА И РАСЧЁТЫ
// =========================================================================
async function loadOperations() {
  state.operations = await dbGetAll('operations');
}

function getOperationsBalance(accountId) {
  let total = 0;
  state.operations.forEach(o => {
    if (o.accountId !== accountId) return;
    if (o.isPlanned) return;
    if (o.excludeFromBalance) return;
    total += o.type === 'income' ? o.amount : -o.amount;
  });
  return total;
}

function getPeriodStats(fromISO, toISOVal) {
  let income = 0, expense = 0;
  state.operations.forEach(o => {
    if (o.isPlanned) return;
    if (o.excludeFromBalance) return;
    if (!o.date) return;
    if (o.date < fromISO || o.date > toISOVal) return;
    if (o.type === 'income') income += o.amount;
    else expense += o.amount;
  });
  return { income, expense };
}

function getPlannedExpensesTotal() {
  let total = 0;
  state.operations.forEach(o => {
    if (!o.isPlanned) return;
    if (o.type === 'expense') total += o.amount;
  });
  return total;
}

// =========================================================================
// ДАШБОРД
// =========================================================================
function renderDashboard() {
  const accountsBox = document.getElementById('balance-accounts');
  if (accountsBox) {
    accountsBox.innerHTML = '';
    let total = 0;
    state.accounts.forEach(acc => {
      const balance = acc.initialBalance + getOperationsBalance(acc.id);
      const row = document.createElement('div');
      row.className = 'account-line';
      const n = document.createElement('span');
      n.textContent = acc.name;
      const v = document.createElement('span');
      v.textContent = formatMoney(balance) + ' ₽';
      row.appendChild(n);
      row.appendChild(v);
      accountsBox.appendChild(row);
      total += balance;
    });
    const totalEl = document.getElementById('balance-total');
    if (totalEl) totalEl.textContent = formatMoney(total);
  }

  const debtIOwe = document.getElementById('debts-i-owe');
  const debtOwed = document.getElementById('debts-owed-to-me');
  if (debtIOwe) debtIOwe.textContent = formatMoney(getDebtsTotal('i-owe'));
  if (debtOwed) debtOwed.textContent = formatMoney(getDebtsTotal('owed-to-me'));

  const plannedEl = document.getElementById('dash-planned-expenses');
  if (plannedEl) plannedEl.textContent = formatMoney(getPlannedExpensesTotal());

  updateDashboardPeriodStats();
}

function updateDashboardPeriodStats() {
  let from, to, label;
  if (state.dashboardPeriod === 'week') {
    from = startOfWeekISO(); to = todayISO(); label = 'за неделю';
  } else if (state.dashboardPeriod === 'month') {
    from = startOfMonthISO(); to = todayISO(); label = 'за месяц';
  } else {
    from = document.getElementById('dashboard-date-from').value || todayISO();
    to = document.getElementById('dashboard-date-to').value || todayISO();
    label = 'за период';
  }
  const periodLabel = document.getElementById('period-label');
  if (periodLabel) periodLabel.textContent = label;
  const { income, expense } = getPeriodStats(from, to);
  const incEl = document.getElementById('dash-income');
  const expEl = document.getElementById('dash-expense');
  if (incEl) incEl.textContent = formatMoney(income);
  if (expEl) expEl.textContent = formatMoney(expense);
}

// =========================================================================
// ФОРМА ДОЛГА
// =========================================================================
function resetDebtForm() {
  document.getElementById('debt-id').value = '';
  document.getElementById('debt-form-title').textContent = 'Новый долг';
  document.getElementById('debt-direction').value = 'i-owe';
  document.getElementById('debt-name').value = '';
  document.getElementById('debt-amount').value = '';
  document.getElementById('debt-is-planned').checked = false;
  document.getElementById('debt-is-credit').checked = false;
  document.getElementById('credit-block').classList.add('hidden');
  document.getElementById('debt-term').value = '';
  document.getElementById('debt-rate').value = '';
  document.getElementById('debt-total').value = '';
  document.getElementById('debt-due-date').value = '';
  document.getElementById('debt-comment').value = '';
}

function fillDebtForm(debt) {
  document.getElementById('debt-id').value = debt.id;
  document.getElementById('debt-form-title').textContent = 'Редактировать долг';
  document.getElementById('debt-direction').value = debt.direction;
  document.getElementById('debt-name').value = debt.name || '';
  document.getElementById('debt-amount').value = debt.initialAmount != null ? debt.initialAmount.toFixed(2) : '';
  document.getElementById('debt-is-planned').checked = !!debt.isPlanned;
  document.getElementById('debt-is-credit').checked = !!debt.isCredit;
  document.getElementById('debt-due-date').value = debt.dueDate || '';
  document.getElementById('debt-comment').value = debt.comment || '';

  if (debt.isCredit) {
    document.getElementById('credit-block').classList.remove('hidden');
    document.getElementById('debt-term').value = debt.termMonths || '';
    document.getElementById('debt-rate').value = debt.interestRate != null ? debt.interestRate : '';
    document.getElementById('debt-total').value = debt.totalWithInterest != null ? debt.totalWithInterest.toFixed(2) : '';
  } else {
    document.getElementById('credit-block').classList.add('hidden');
    document.getElementById('debt-term').value = '';
    document.getElementById('debt-rate').value = '';
    document.getElementById('debt-total').value = '';
  }
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
  const totalEl = document.getElementById('debt-total');
  if (!totalEl) return;
  if (!amount || !term || !rate) { totalEl.value = ''; return; }
  const total = amount + amount * (rate / 100) * (term / 12);
  totalEl.value = total.toFixed(2);
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
  const dueDate = document.getElementById('debt-due-date').value;
  const comment = document.getElementById('debt-comment').value.trim();

  if (!name) { alert('Введите название долга.'); return; }
  if (isPlanned && !initialAmount) {
  } else if (!initialAmount) {
    alert('Введите сумму долга.'); return;
  }

  const debt = {
    id, direction, name, initialAmount,
    isPlanned, isCredit, dueDate, comment,
    termMonths: isCredit ? parseNumber(document.getElementById('debt-term').value) : null,
    interestRate: isCredit ? parseNumber(document.getElementById('debt-rate').value) : null,
    totalWithInterest: isCredit ? parseNumber(document.getElementById('debt-total').value) : null,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  await dbPut('debts', debt);
  if (existing) {
    const idx = state.debts.findIndex(d => d.id === id);
    if (idx >= 0) state.debts[idx] = debt;
  } else {
    state.debts.push(debt);
  }

  const form = document.getElementById('debt-form');
  clearFormDirty(form);
  closeModal('modal-debt');
  renderDashboard();
  fillDebtSelect();
}

async function deleteDebt(id) {
  const debt = state.debts.find(d => d.id === id);
  if (!debt) return;
  const linked = state.operations.filter(o => o.linkedDebtId === id);
  if (linked.length > 0) {
    const choice = window.confirm(
      'Долг «' + debt.name + '» связан с ' + linked.length + ' операциями. ' +
      'При удалении долга операции останутся, но потеряют привязку. Продолжить?'
    );
    if (!choice) return;
    for (const op of linked) {
      op.linkedDebtId = '';
      await dbPut('operations', op);
    }
  } else {
    if (!window.confirm('Удалить долг «' + debt.name + '»?')) return;
  }
  await dbDelete('debts', id);
  state.debts = state.debts.filter(d => d.id !== id);
  renderDashboard();
  renderOperations();
  fillDebtSelect();
}

// =========================================================================
// ФОРМА ОПЕРАЦИИ
// =========================================================================
function isManualSum() {
  return !document.getElementById('manual-sum-indicator').classList.contains('hidden');
}

function showManualIndicator(show) {
  const el = document.getElementById('manual-sum-indicator');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function disableNestedInputs(disable) {
  $$('#nested-fields-list input').forEach(inp => { inp.disabled = disable; });
  $$('#nested-fields-list .nested-remove').forEach(btn => { btn.disabled = disable; });
}

function recalcNestedTotal() {
  if (isManualSum()) return;
  let total = 0;
  $$('#nested-fields-list .nested-value').forEach(inp => {
    total += parseNumber(inp.value);
  });
  const amountEl = document.getElementById('op-amount');
  if (amountEl) amountEl.value = total ? total.toFixed(2) : '';
}

function addNestedField(name = '', value = '') {
  const list = document.getElementById('nested-fields-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'nested-field-row';

  const nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.className = 'nested-name';
  nameInp.placeholder = 'Название';
  nameInp.value = name;

  const valInp = document.createElement('input');
  valInp.type = 'number';
  valInp.className = 'nested-value';
  valInp.step = '0.01';
  valInp.inputMode = 'decimal';
  valInp.placeholder = '0.00';
  valInp.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-small nested-remove';
  removeBtn.textContent = '×';

  div.appendChild(nameInp);
  div.appendChild(valInp);
  div.appendChild(removeBtn);
  list.appendChild(div);

  valInp.addEventListener('input', () => { if (!isManualSum()) recalcNestedTotal(); });
  removeBtn.addEventListener('click', () => {
    div.remove();
    if (!isManualSum()) recalcNestedTotal();
  });
  if (isManualSum()) {
    nameInp.disabled = true;
    valInp.disabled = true;
    removeBtn.disabled = true;
  }
}

function clearNestedFields() {
  const list = document.getElementById('nested-fields-list');
  if (list) list.innerHTML = '';
}

function fillOperationSelects() {
  const accSel = document.getElementById('op-account');
  if (accSel) {
    accSel.innerHTML = '';
    state.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      accSel.appendChild(opt);
    });
  }
  fillCategorySelect();
  fillDebtSelect();
  fillTemplateSelect();
}

function fillCategorySelect(selectedId = '') {
  const sel = document.getElementById('op-category');
  if (!sel) return;
  const type = document.getElementById('op-type').value;
  sel.innerHTML = '';
  state.categories.filter(c => c.type === type).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function fillDebtSelect(selectedId = '') {
  const sel = document.getElementById('op-linked-debt');
  if (!sel) return;
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— Не связывать —';
  sel.appendChild(none);
  state.debts.forEach(d => {
    const remaining = getDebtRemaining(d);
    if (!d.isPlanned && remaining <= 0) return;
    const opt = document.createElement('option');
    opt.value = d.id;
    const dir = d.direction === 'i-owe' ? 'Я должна' : 'Мне должны';
    opt.textContent = dir + ': ' + d.name +
      (d.isPlanned ? ' (план)' : ' · остаток ' + formatMoney(remaining) + ' ₽');
    if (d.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function fillTemplateSelect() {
  const sel = document.getElementById('op-template');
  if (!sel) return;
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— Без шаблона —';
  sel.appendChild(none);
  state.templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

function resetOperationForm() {
  document.getElementById('operation-id').value = '';
  document.getElementById('operation-form-title').textContent = 'Новая операция';
  document.getElementById('op-type').value = 'expense';
  document.getElementById('op-amount').value = '';
  document.getElementById('op-comment').value = '';
  document.getElementById('op-date').value = todayISO();
  document.getElementById('op-is-planned').checked = false;
  document.getElementById('op-exclude-balance').checked = false;
  document.getElementById('op-template').value = '';
  document.getElementById('op-linked-debt').value = '';
  clearNestedFields();
  showManualIndicator(false);
  disableNestedInputs(false);
  fillOperationSelects();
}

function fillOperationForm(op) {
  document.getElementById('operation-id').value = op.id;
  document.getElementById('operation-form-title').textContent = 'Редактировать операцию';
  document.getElementById('op-type').value = op.type;
  fillCategorySelect(op.categoryId || '');
  document.getElementById('op-amount').value = op.amount != null ? op.amount.toFixed(2) : '';
  document.getElementById('op-account').value = op.accountId || '';
  document.getElementById('op-comment').value = op.comment || '';
  document.getElementById('op-date').value = op.date || '';
  document.getElementById('op-is-planned').checked = !!op.isPlanned;
  document.getElementById('op-exclude-balance').checked = !!op.excludeFromBalance;
  fillDebtSelect(op.linkedDebtId || '');
  document.getElementById('op-linked-debt').value = op.linkedDebtId || '';
  document.getElementById('op-template').value = '';

  clearNestedFields();
  if (op.nested && op.nested.length > 0) {
    op.nested.forEach(f => addNestedField(f.name, f.value ? f.value.toFixed(2) : ''));
    if (op.manualSum) {
      showManualIndicator(true);
      disableNestedInputs(true);
    } else {
      showManualIndicator(false);
      disableNestedInputs(false);
    }
  } else {
    showManualIndicator(false);
    disableNestedInputs(false);
  }
}

function openOperationForm(op = null) {
  fillOperationSelects();
  if (op) fillOperationForm(op);
  else resetOperationForm();
  openModal('modal-operation');
}

async function saveOperationWithDebtCheck(e) {
  e.preventDefault();
  const id = document.getElementById('operation-id').value || uid('op');
  const existing = state.operations.find(o => o.id === id);
  const type = document.getElementById('op-type').value;
  const amount = parseNumber(document.getElementById('op-amount').value);
  const accountId = document.getElementById('op-account').value;
  const categoryId = document.getElementById('op-category').value;
  const date = document.getElementById('op-date').value;
  const comment = document.getElementById('op-comment').value.trim();
  const isPlanned = document.getElementById('op-is-planned').checked;
  const excludeFromBalance = document.getElementById('op-exclude-balance').checked;
  const linkedDebtId = document.getElementById('op-linked-debt').value || '';
  const manualSum = isManualSum();

  const nested = [];
  $$('#nested-fields-list .nested-field-row').forEach(row => {
    const name = row.querySelector('.nested-name').value.trim();
    const value = parseNumber(row.querySelector('.nested-value').value);
    if (name || value) nested.push({ name, value });
  });

  if (!accountId) { alert('Выберите счёт.'); return; }
  if (!amount) { alert('Введите сумму.'); return; }

  if (linkedDebtId && !isPlanned) {
    const debt = state.debts.find(d => d.id === linkedDebtId);
    if (debt) {
      const remaining = getDebtRemaining(debt);
      if (amount > remaining + 0.0001) {
        const overpay = amount - remaining;
        const ok = window.confirm(
          'Сумма операции (' + formatMoney(amount) + ' ₽) больше остатка долга («' +
          debt.name + '», остаток ' + formatMoney(remaining) + ' ₽).\n\n' +
          'Нажмите ОК — долг будет закрыт на ' + formatMoney(remaining) + ' ₽, ' +
          'а переплата ' + formatMoney(overpay) + ' ₽ будет записана отдельной операцией без привязки к долгу.\n\n' +
          'Нажмите Отмена — вернуться и исправить сумму.'
        );
        if (!ok) return;

        const payOp = {
          id: uid('op'), type,
          amount: remaining,
          accountId, categoryId, date, comment: (comment ? comment + ' · ' : '') + 'Погашение долга',
          isPlanned: false, excludeFromBalance,
          linkedDebtId,
          nested, manualSum,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        await dbPut('operations', payOp);
        state.operations.push(payOp);

        const overOp = {
          id: uid('op'), type,
          amount: overpay,
          accountId, categoryId, date, comment: (comment ? comment + ' · ' : '') + 'Переплата по долгу',
          isPlanned: false, excludeFromBalance,
          linkedDebtId: '',
          nested: [], manualSum: false,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        await dbPut('operations', overOp);
        state.operations.push(overOp);

        const form = document.getElementById('operation-form');
        clearFormDirty(form);
        closeModal('modal-operation');
        renderDashboard();
        renderOperations();
        fillDebtSelect();
        return;
      }
    }
  }

  const op = {
    id, type, amount,
    accountId, categoryId, date, comment,
    isPlanned, excludeFromBalance,
    linkedDebtId,
    nested, manualSum,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  await dbPut('operations', op);
  if (existing) {
    const idx = state.operations.findIndex(o => o.id === id);
    if (idx >= 0) state.operations[idx] = op;
  } else {
    state.operations.push(op);
  }

  const form = document.getElementById('operation-form');
  clearFormDirty(form);
  closeModal('modal-operation');
  renderDashboard();
  renderOperations();
  fillDebtSelect();
}

async function deleteOperation(id) {
  const op = state.operations.find(o => o.id === id);
  if (!op) return;
  let msg = 'Удалить операцию?';
  if (op.linkedDebtId) {
    const debt = state.debts.find(d => d.id === op.linkedDebtId);
    msg = 'Эта операция связана с долгом «' + (debt ? debt.name : '—') +
          '». Удалить? Остаток долга будет пересчитан.';
  }
  if (!window.confirm(msg)) return;
  await dbDelete('operations', id);
  state.operations = state.operations.filter(o => o.id !== id);
  renderDashboard();
  renderOperations();
  fillDebtSelect();
}

function copyOperation(id) {
  const op = state.operations.find(o => o.id === id);
  if (!op) return;
  const copy = { ...op, id: null };
  fillOperationSelects();
  fillOperationForm({ ...copy, id: '' });
  document.getElementById('operation-form-title').textContent = 'Копия операции';
  document.getElementById('op-date').value = todayISO();
  openModal('modal-operation');
}

// =========================================================================
// ИСТОРИЯ
// =========================================================================
function fillFilterSelects() {
  const accSel = document.getElementById('filter-account');
  if (accSel) {
    const cur = accSel.value;
    accSel.innerHTML = '<option value="">Все счета</option>';
    state.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      accSel.appendChild(opt);
    });
    accSel.value = cur;
  }
  const catSel = document.getElementById('filter-category');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Все категории</option>';
    state.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.type === 'income' ? ' (доход)' : ' (расход)');
      catSel.appendChild(opt);
    });
    catSel.value = cur;
  }
}

function getFilteredOperations() {
  let ops = [...state.operations];

  const search = (document.getElementById('filter-search').value || '').toLowerCase().trim();
  if (search) {
    ops = ops.filter(o => {
      const cat = state.categories.find(c => c.id === o.categoryId);
      const debt = state.debts.find(d => d.id === o.linkedDebtId);
      return (o.comment || '').toLowerCase().includes(search) ||
             (cat && cat.name.toLowerCase().includes(search)) ||
             (debt && debt.name.toLowerCase().includes(search));
    });
  }

  const type = document.getElementById('filter-type').value;
  if (type === 'income' || type === 'expense') ops = ops.filter(o => o.type === type);
  if (type === 'debt') ops = ops.filter(o => !!o.linkedDebtId);

  const acc = document.getElementById('filter-account').value;
  if (acc) ops = ops.filter(o => o.accountId === acc);

  const cat = document.getElementById('filter-category').value;
  if (cat) ops = ops.filter(o => o.categoryId === cat);

  const status = document.getElementById('filter-status').value;
  if (status === 'fact') ops = ops.filter(o => !o.isPlanned);
  if (status === 'plan') ops = ops.filter(o => o.isPlanned);

  const period = document.getElementById('filter-period').value;
  if (period !== 'all') {
    let from, to;
    if (period === 'current-month') { from = startOfMonthISO(); to = endOfMonthISO(); }
    else if (period === 'previous-month') { from = startOfPrevMonthISO(); to = endOfPrevMonthISO(); }
    else if (period === 'custom') {
      from = document.getElementById('filter-date-from').value;
      to = document.getElementById('filter-date-to').value;
    }
    if (from) ops = ops.filter(o => o.date && o.date >= from);
    if (to) ops = ops.filter(o => o.date && o.date <= to);
  }

  if (document.getElementById('filter-has-debt').checked) ops = ops.filter(o => !!o.linkedDebtId);
  if (document.getElementById('filter-has-nested').checked) ops = ops.filter(o => o.nested && o.nested.length > 0);

  const sumFrom = document.getElementById('filter-sum-from').value;
  const sumTo = document.getElementById('filter-sum-to').value;
  if (sumFrom !== '') ops = ops.filter(o => o.amount >= parseNumber(sumFrom));
  if (sumTo !== '') ops = ops.filter(o => o.amount <= parseNumber(sumTo));

  ops.sort((a, b) => {
    const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0);
    const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0);
    if (kb !== ka) return kb - ka;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return ops;
}

function renderOperations() {
  const list = document.getElementById('operations-list');
  const empty = document.getElementById('operations-empty');
  if (!list) return;

  const ops = getFilteredOperations();
  list.innerHTML = '';

  if (ops.length === 0) {
    if (empty) empty.classList.remove('hidden');
    updateMassActionsVisibility();
    return;
  }
  if (empty) empty.classList.add('hidden');

  const tpl = document.getElementById('operation-item-template');

  ops.forEach(op => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = op.id;

    const account = state.accounts.find(a => a.id === op.accountId);
    const category = state.categories.find(c => c.id === op.categoryId);
    const debt = state.debts.find(d => d.id === op.linkedDebtId);

    const amountEl = node.querySelector('.op-amount');
    const sign = op.type === 'income' ? '+' : '−';
    amountEl.textContent = sign + formatMoney(op.amount) + ' ₽';
    amountEl.classList.add(op.type === 'income' ? 'income' : 'expense');

    node.querySelector('.op-category').textContent = category ? category.name : 'Без категории';
    node.querySelector('.op-account').textContent = account ? account.name : '—';
    node.querySelector('.op-date').textContent = op.date || 'Без даты';

    let commentText = op.comment || '';
    if (debt) commentText = (commentText ? commentText + ' · ' : '') + 'Долг: ' + debt.name;
    node.querySelector('.op-comment').textContent = commentText;

    const badge = node.querySelector('.op-badge-plan');
    if (op.isPlanned) badge.classList.remove('hidden');

    const cb = node.querySelector('.op-select');
    cb.checked = state.selectedOperations.has(op.id);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedOperations.add(op.id);
      else state.selectedOperations.delete(op.id);
      updateMassActionsVisibility();
    });

    node.querySelector('.op-edit').addEventListener('click', () => openOperationForm(op));
    node.querySelector('.op-copy').addEventListener('click', () => copyOperation(op.id));
    node.querySelector('.op-delete').addEventListener('click', () => deleteOperation(op.id));

    list.appendChild(node);
  });

  updateMassActionsVisibility();
}

function updateMassActionsVisibility() {
  const el = document.getElementById('mass-actions');
  const cnt = document.getElementById('selected-count');
  const n = state.selectedOperations.size;
  if (el) el.classList.toggle('hidden', n === 0);
  if (cnt) cnt.textContent = String(n);
}

async function deleteSelectedOperations() {
  const ids = Array.from(state.selectedOperations);
  if (ids.length === 0) return;
  if (!window.confirm('Удалить выбранные операции (' + ids.length + ')?')) return;
  for (const id of ids) await dbDelete('operations', id);
  state.operations = state.operations.filter(o => !state.selectedOperations.has(o.id));
  state.selectedOperations.clear();
  renderDashboard();
  renderOperations();
  fillDebtSelect();
}

// =========================================================================
// ОТЧЁТЫ
// =========================================================================
function getReportPeriod() {
  const sel = document.getElementById('report-period-select');
  const mode = sel ? sel.value : 'current-month';
  if (mode === 'all') return { from: null, to: null, label: 'Всё время' };
  if (mode === 'custom') {
    const from = document.getElementById('report-date-from').value || null;
    const to = document.getElementById('report-date-to').value || null;
    return { from, to };
  }
  return { from: startOfMonthISO(), to: endOfMonthISO() };
}

function operationInPeriod(op, from, to) {
  if (!op.date) return false;
  if (from && op.date < from) return false;
  if (to && op.date > to) return false;
  return true;
}

function renderReportFact(from, to) {
  const ops = state.operations.filter(o =>
    !o.isPlanned && !o.excludeFromBalance && operationInPeriod(o, from, to)
  );

  let totalIncome = 0, totalExpense = 0;
  const byCategory = {};
  const byAccount = {};

  ops.forEach(o => {
    const cat = state.categories.find(c => c.id === o.categoryId);
    const acc = state.accounts.find(a => a.id === o.accountId);
    const catName = cat ? cat.name : 'Без категории';
    const catKey = o.type + '|' + (o.categoryId || '');
    if (!byCategory[catKey]) byCategory[catKey] = { name: catName, type: o.type, sum: 0 };
    byCategory[catKey].sum += o.amount;

    const accKey = o.accountId || '';
    if (!byAccount[accKey]) byAccount[accKey] = { name: acc ? acc.name : '—', income: 0, expense: 0 };
    if (o.type === 'income') {
      totalIncome += o.amount;
      byAccount[accKey].income += o.amount;
    } else {
      totalExpense += o.amount;
      byAccount[accKey].expense += o.amount;
    }
  });

  const incomeCats = Object.values(byCategory).filter(c => c.type === 'income').sort((a, b) => b.sum - a.sum);
  const expenseCats = Object.values(byCategory).filter(c => c.type === 'expense').sort((a, b) => b.sum - a.sum);

  let html = '<div class="card"><h3>Итого</h3>';
  html += '<div>Доходы: <span class="income">' + formatMoney(totalIncome) + ' ₽</span></div>';
  html += '<div>Расходы: <span class="expense">' + formatMoney(totalExpense) + ' ₽</span></div>';
  html += '<div class="total">Баланс: ' + formatMoney(totalIncome - totalExpense) + ' ₽</div></div>';

  html += '<div class="card"><h3>Доходы по категориям</h3>';
  if (incomeCats.length === 0) html += '<div class="hint">Нет данных за период.</div>';
  else incomeCats.forEach(c => {
    html += '<div class="account-line"><span>' + escapeHtml(c.name) + '</span><span class="income">' + formatMoney(c.sum) + ' ₽</span></div>';
  });
  html += '</div>';

  html += '<div class="card"><h3>Расходы по категориям</h3>';
  if (expenseCats.length === 0) html += '<div class="hint">Нет данных за период.</div>';
  else expenseCats.forEach(c => {
    html += '<div class="account-line"><span>' + escapeHtml(c.name) + '</span><span class="expense">' + formatMoney(c.sum) + ' ₽</span></div>';
  });
  html += '</div>';

  html += '<div class="card"><h3>По счетам</h3>';
  const accList = Object.values(byAccount);
  if (accList.length === 0) html += '<div class="hint">Нет данных за период.</div>';
  else accList.forEach(a => {
    html += '<div class="account-line"><span>' + escapeHtml(a.name) + '</span><span>+' + formatMoney(a.income) + ' / −' + formatMoney(a.expense) + ' ₽</span></div>';
  });
  html += '</div>';

  return html;
}

function renderReportPlan(from, to) {
  const plannedOps = state.operations.filter(o => o.isPlanned && operationInPeriod(o, from, to));
  const plannedDebts = state.debts.filter(d => d.isPlanned);

  let planIncome = 0, planExpense = 0;
  plannedOps.forEach(o => {
    if (o.type === 'income') planIncome += o.amount;
    else planExpense += o.amount;
  });

  let html = '<div class="card"><h3>План на период</h3>';
  html += '<div>Плановые доходы: <span class="income">' + formatMoney(planIncome) + ' ₽</span></div>';
  html += '<div>Плановые расходы: <span class="expense">' + formatMoney(planExpense) + ' ₽</span></div></div>';

  html += '<div class="card"><h3>Плановые операции</h3>';
  if (plannedOps.length === 0) html += '<div class="hint">Нет плановых операций за период.</div>';
  else {
    const sorted = [...plannedOps].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    sorted.forEach(o => {
      const cat = state.categories.find(c => c.id === o.categoryId);
      const debt = state.debts.find(d => d.id === o.linkedDebtId);
      const sign = o.type === 'income' ? '+' : '−';
      const cls = o.type === 'income' ? 'income' : 'expense';
      let line = (o.date || 'Без даты') + ' · ' + escapeHtml(cat ? cat.name : 'Без категории');
      if (debt) line += ' · Долг: ' + escapeHtml(debt.name);
      if (o.comment) line += ' · ' + escapeHtml(o.comment);
      html += '<div class="account-line"><span>' + line + '</span><span class="' + cls + '">' + sign + formatMoney(o.amount) + ' ₽</span></div>';
    });
  }
  html += '</div>';

  html += '<div class="card"><h3>Планируемые долги (без суммы)</h3>';
  if (plannedDebts.length === 0) html += '<div class="hint">Нет планируемых долгов.</div>';
  else plannedDebts.forEach(d => {
    const dir = d.direction === 'i-owe' ? 'Я должна' : 'Мне должны';
    html += '<div class="account-line"><span>' + dir + ': ' + escapeHtml(d.name) + '</span><span class="hint">' + (d.initialAmount ? formatMoney(d.initialAmount) + ' ₽' : 'без суммы') + '</span></div>';
  });
  html += '</div>';
  return html;
}

function renderReportDebts() {
  const openDebts = state.debts.filter(d => !d.isPlanned);
  const closedDebts = state.debts.filter(d => !d.isPlanned && getDebtRemaining(d) <= 0);
  const iOwe = openDebts.filter(d => d.direction === 'i-owe' && getDebtRemaining(d) > 0);
  const owedToMe = openDebts.filter(d => d.direction === 'owed-to-me' && getDebtRemaining(d) > 0);

  let html = '<div class="card"><h3>Итого</h3>';
  html += '<div>Я должна: <span class="expense">' + formatMoney(getDebtsTotal('i-owe')) + ' ₽</span></div>';
  html += '<div>Мне должны: <span class="income">' + formatMoney(getDebtsTotal('owed-to-me')) + ' ₽</span></div></div>';

  html += '<div class="card"><h3>Я должна</h3>';
  if (iOwe.length === 0) html += '<div class="hint">Нет открытых долгов.</div>';
  else iOwe.forEach(d => {
    const remaining = getDebtRemaining(d);
    const paid = (d.initialAmount || 0) - remaining;
    html += '<div class="account-line"><span>' + escapeHtml(d.name) + (d.dueDate ? ' · до ' + d.dueDate : '') + '</span><span class="expense">' + formatMoney(remaining) + ' ₽</span></div>';
    if (paid > 0) html += '<div class="hint">Выплачено: ' + formatMoney(paid) + ' из ' + formatMoney(d.initialAmount) + ' ₽</div>';
  });
  html += '</div>';

  html += '<div class="card"><h3>Мне должны</h3>';
  if (owedToMe.length === 0) html += '<div class="hint">Нет открытых долгов.</div>';
  else owedToMe.forEach(d => {
    const remaining = getDebtRemaining(d);
    const paid = (d.initialAmount || 0) - remaining;
    html += '<div class="account-line"><span>' + escapeHtml(d.name) + (d.dueDate ? ' · до ' + d.dueDate : '') + '</span><span class="income">' + formatMoney(remaining) + ' ₽</span></div>';
    if (paid > 0) html += '<div class="hint">Получено: ' + formatMoney(paid) + ' из ' + formatMoney(d.initialAmount) + ' ₽</div>';
  });
  html += '</div>';

  if (closedDebts.length > 0) {
    html += '<div class="card"><h3>Закрытые долги</h3>';
    closedDebts.forEach(d => {
      const dir = d.direction === 'i-owe' ? 'Я должна' : 'Мне должны';
      html += '<div class="account-line"><span>' + dir + ': ' + escapeHtml(d.name) + '</span><span class="hint">закрыт · ' + formatMoney(d.initialAmount) + ' ₽</span></div>';
    });
    html += '</div>';
  }
  return html;
}

function renderReports() {
  const box = document.getElementById('report-content');
  if (!box) return;
  const activeTab = document.querySelector('.report-tabs button.active');
  const tab = activeTab ? activeTab.dataset.report : 'fact';
  const { from, to } = getReportPeriod();

  if (tab === 'fact') box.innerHTML = renderReportFact(from, to);
  else if (tab === 'plan') box.innerHTML = renderReportPlan(from, to);
  else box.innerHTML = renderReportDebts();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

// =========================================================================
// АРХИВ
// =========================================================================
async function loadArchive() {
  state.archive = await dbGetAll('archive');
}

function isOlderThanOneYear(dateISO) {
  if (!dateISO) return false;
  const d = new Date(dateISO);
  if (isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return d < cutoff;
}

function isCreatedOlderThanOneYear(createdAt) {
  if (!createdAt) return false;
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  return createdAt < cutoff;
}

function operationToArchiveItem(op, archiveYear, fromAuto = false) {
  return {
    id: op.id,
    type: op.type,
    amount: op.amount,
    accountId: op.accountId,
    accountName: (state.accounts.find(a => a.id === op.accountId) || {}).name || '—',
    categoryId: op.categoryId,
    categoryName: (state.categories.find(c => c.id === op.categoryId) || {}).name || 'Без категории',
    date: op.date || '',
    comment: op.comment || '',
    isPlanned: !!op.isPlanned,
    linkedDebtId: op.linkedDebtId || '',
    nested: op.nested || [],
    archiveYear: archiveYear,
    archivedAt: Date.now(),
    fromAuto: fromAuto,
  };
}

function archiveYearForOperation(op) {
  if (op.date) return new Date(op.date).getFullYear();
  return new Date().getFullYear();
}

async function archiveOperations(ops, yearByOp) {
  for (const op of ops) {
    const year = yearByOp[op.id] || archiveYearForOperation(op);
    const item = operationToArchiveItem(op, year, false);
    await dbPut('archive', item);
    await dbDelete('operations', op.id);
  }
  state.operations = state.operations.filter(o => !ops.find(x => x.id === o.id));
  state.archive = await dbGetAll('archive');
  state.selectedOperations.clear();
  renderDashboard();
  renderOperations();
  renderArchive();
}

async function archiveSelectedOperations() {
  const ids = Array.from(state.selectedOperations);
  if (ids.length === 0) return;
  const ops = state.operations.filter(o => ids.includes(o.id));
  if (ops.length === 0) return;

  const withoutDate = ops.filter(o => !o.date);
  let yearByOp = {};
  let msg = 'Архивировать выбранные операции (' + ops.length + ')?';
  if (withoutDate.length > 0) {
    msg += '\n\nУ ' + withoutDate.length + ' записей нет даты. По умолчанию они уйдут в архив за ' + new Date().getFullYear() + ' год. Продолжить?';
  }
  if (!window.confirm(msg)) return;

  if (withoutDate.length > 0) {
    const yearStr = window.prompt('В какой год архива отправить записи без даты?\n(по умолчанию ' + new Date().getFullYear() + ')', String(new Date().getFullYear()));
    if (yearStr === null) return;
    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 1900 || year > 2100) { alert('Неверный год.'); return; }
    withoutDate.forEach(o => { yearByOp[o.id] = year; });
  }
  await archiveOperations(ops, yearByOp);
}

async function autoArchiveOldOperations() {
  const old = state.operations.filter(o => o.date && isOlderThanOneYear(o.date));
  if (old.length === 0) return;
  for (const op of old) {
    const item = operationToArchiveItem(op, archiveYearForOperation(op), true);
    await dbPut('archive', item);
    await dbDelete('operations', op.id);
  }
  state.operations = state.operations.filter(o => !old.find(x => x.id === o.id));
  state.archive = await dbGetAll('archive');
  renderDashboard();
  renderOperations();
  renderArchive();
}

function getOldUndatedOperations() {
  return state.operations.filter(o => !o.date && isCreatedOlderThanOneYear(o.createdAt));
}

function showArchiveNotificationIfNeeded() {
  const old = getOldUndatedOperations();
  const existing = document.getElementById('archive-notification');
  if (existing) existing.remove();
  if (old.length === 0) return;

  const dashboard = document.getElementById('screen-dashboard');
  if (!dashboard) return;

  const box = document.createElement('div');
  box.id = 'archive-notification';
  box.className = 'card';
  box.style.border = '2px solid var(--accent)';
  box.innerHTML =
    '<h3>Готовы к архивации</h3>' +
    '<div class="hint">Есть ' + old.length + ' записей без даты, которые старше года. Отправить их в архив?</div>' +
    '<div class="form-buttons" style="margin-top:8px;">' +
    '  <button class="btn-primary" id="arch-notif-open">Выбрать</button>' +
    '  <button class="btn-secondary" id="arch-notif-later">Позже</button>' +
    '</div>';

  dashboard.insertBefore(box, dashboard.firstChild);

  document.getElementById('arch-notif-later').addEventListener('click', () => box.remove());
  document.getElementById('arch-notif-open').addEventListener('click', () => {
    box.remove();
    switchScreen('history');
    const panel = document.getElementById('filters-panel');
    if (panel && panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      document.getElementById('btn-toggle-filters').textContent = 'Фильтры ▴';
    }
    state.selectedOperations.clear();
    old.forEach(o => state.selectedOperations.add(o.id));
    renderOperations();
  });
}

function renderArchive() {
  const yearsBox = document.getElementById('archive-years');
  const listBox = document.getElementById('archive-list');
  const empty = document.getElementById('archive-empty');
  if (!yearsBox || !listBox) return;

  const years = [...new Set(state.archive.map(a => a.archiveYear))].sort((a, b) => b - a);
  yearsBox.innerHTML = '';
  if (years.length === 0) {
    listBox.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const current = state.currentArchiveYear || years[0];
  state.currentArchiveYear = current;

  years.forEach(y => {
    const btn = document.createElement('button');
    btn.className = 'btn-small' + (y === current ? ' btn-primary' : '');
    btn.textContent = String(y);
    btn.addEventListener('click', () => { state.currentArchiveYear = y; renderArchive(); });
    yearsBox.appendChild(btn);
  });

  const items = state.archive.filter(a => a.archiveYear === current).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  listBox.innerHTML = '';
  const tpl = document.getElementById('archive-item-template');
  items.forEach(a => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const sign = a.type === 'income' ? '+' : '−';
    const cls = a.type === 'income' ? 'income' : 'expense';
    const amtEl = node.querySelector('.arch-amount');
    amtEl.textContent = sign + formatMoney(a.amount) + ' ₽';
    amtEl.classList.add(cls);
    node.querySelector('.arch-category').textContent = a.categoryName || 'Без категории';
    node.querySelector('.arch-date').textContent = a.date || 'Без даты';
    node.querySelector('.arch-note').textContent = a.comment || '';
    node.querySelector('.arch-restore').addEventListener('click', () => restoreFromArchive(a.id));
    listBox.appendChild(node);
  });
}

async function restoreFromArchive(archiveId) {
  const item = state.archive.find(a => a.id === archiveId);
  if (!item) return;
  if (!window.confirm('Восстановить запись из архива в активные? Дата сохранится.')) return;

  const op = {
    id: item.id, type: item.type, amount: item.amount,
    accountId: item.accountId, categoryId: item.categoryId,
    date: item.date || '', comment: item.comment || '',
    isPlanned: item.isPlanned || false, excludeFromBalance: false,
    linkedDebtId: item.linkedDebtId || '', nested: item.nested || [],
    manualSum: false, createdAt: item.archivedAt || Date.now(), updatedAt: Date.now(),
  };
  await dbPut('operations', op);
  await dbDelete('archive', item.id);
  state.operations.push(op);
  state.archive = state.archive.filter(a => a.id !== item.id);
  renderDashboard(); renderOperations(); renderArchive();
}

async function exportArchiveJSON() {
  const years = [...new Set(state.archive.map(a => a.archiveYear))].sort((a, b) => b - a);
  if (years.length === 0) { alert('Архив пуст.'); return; }

  const input = prompt('За какой год выгрузить архив?\nДоступные: ' + years.join(', ') + '\n(оставьте пусто — выгрузить всё)', '');
  if (input === null) return;

  let items, filename;
  if (input.trim() === '') { items = state.archive; filename = 'archive-all.json'; }
  else {
    const y = parseInt(input, 10);
    if (isNaN(y)) { alert('Неверный год.'); return; }
    items = state.archive.filter(a => a.archiveYear === y);
    if (items.length === 0) { alert('За ' + y + ' год записей нет.'); return; }
    filename = 'archive-' + y + '.json';
  }

  const data = { version: 1, exportedAt: Date.now(), items: items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);

  if (window.confirm('Экспорт выполнен: ' + filename + '\n\nУдалить эти записи из архива в приложении?')) {
    for (const it of items) await dbDelete('archive', it.id);
    state.archive = state.archive.filter(a => !items.find(x => x.id === a.id));
    renderArchive();
    alert('Записи удалены из архива. Файл сохранён на диск.');
  }
}

async function importArchiveJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : (data.items || []);
    if (items.length === 0) { alert('В файле нет записей.'); return; }
    if (!window.confirm('Импортировать ' + items.length + ' записей в архив? Они не попадут в активные.')) return;

    for (const it of items) {
      const item = {
        id: it.id || uid('arch'), type: it.type || 'expense', amount: Number(it.amount) || 0,
        accountId: it.accountId || '', accountName: it.accountName || '—',
        categoryId: it.categoryId || '', categoryName: it.categoryName || 'Без категории',
        date: it.date || '', comment: it.comment || '',
        isPlanned: !!it.isPlanned, linkedDebtId: it.linkedDebtId || '', nested: it.nested || [],
        archiveYear: it.archiveYear || new Date().getFullYear(),
        archivedAt: it.archivedAt || Date.now(), fromAuto: false,
      };
      await dbPut('archive', item);
    }
    state.archive = await dbGetAll('archive');
    renderArchive();
    alert('Импорт завершён. Записей в архиве: ' + state.archive.length);
  } catch (err) { alert('Ошибка импорта: ' + err.message); }
}

// =========================================================================
// ЭКСПОРТ / ИМПОРТ ДАННЫХ
// =========================================================================
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJSON() {
  const data = {
    version: 1, exportedAt: Date.now(),
    accounts: state.accounts, categories: state.categories,
    operations: state.operations, debts: state.debts,
    templates: state.templates, archive: state.archive,
  };
  const filename = 'finance-backup-' + todayISO() + '.json';
  downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
  alert('Резервная копия сохранена: ' + filename);
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Неверный формат файла');
    if (!window.confirm('Импорт заменит ВСЕ текущие данные приложения. Продолжить?')) return;

    for (const store of STORES) {
      const all = await dbGetAll(store);
      for (const item of all) await dbDelete(store, item.id);
    }

    const load = async (store, items) => { if (Array.isArray(items)) for (const item of items) await dbPut(store, item); };
    await load('accounts', data.accounts);
    await load('categories', data.categories);
    await load('operations', data.operations);
    await load('debts', data.debts);
    await load('templates', data.templates);
    await load('archive', data.archive);

    await loadAccounts(); await loadCategories(); await loadOperations(); await loadDebts(); await loadTemplates(); await loadArchive();

    renderDashboard(); renderOperations(); renderArchive(); renderCategories(); renderAccounts(); renderTemplates();
    alert('Импорт завершён.');
  } catch (err) { alert('Ошибка импорта: ' + err.message); }
}

function csvEscape(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function exportCSV() {
  const rows = [];
  rows.push(['Дата', 'Тип', 'Сумма', 'Счёт', 'Категория', 'Плановое', 'Не в балансе', 'Долг', 'Комментарий'].join(';'));
  const sorted = [...state.operations].sort((a, b) => {
    const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0);
    const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0);
    return ka - kb;
  });
  sorted.forEach(o => {
    const acc = state.accounts.find(a => a.id === o.accountId);
    const cat = state.categories.find(c => c.id === o.categoryId);
    const debt = state.debts.find(d => d.id === o.linkedDebtId);
    rows.push([
      o.date || '', o.type === 'income' ? 'Доход' : 'Расход',
      Number(o.amount).toFixed(2), acc ? acc.name : '', cat ? cat.name : '',
      o.isPlanned ? 'да' : 'нет', o.excludeFromBalance ? 'да' : 'нет',
      debt ? debt.name : '', o.comment || '',
    ].map(csvEscape).join(';'));
  });
  const filename = 'finance-operations-' + todayISO() + '.csv';
  downloadBlob('\uFEFF' + rows.join('\r\n'), filename, 'text/csv;charset=utf-8');
  alert('CSV сохранён: ' + filename);
}

async function importCSV(file) {
  try {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Файл пуст или без данных');
    const header = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const iDate  = idx('дата'), iType  = idx('тип'), iAmt   = idx('сумма'),
          iAcc   = idx('счёт'), iCat   = idx('категория'), iPlan  = idx('плановое'),
          iExc   = idx('не в балансе'), iDebt  = idx('долг'), iCom   = idx('комментарий');
    if (iType < 0 || iAmt < 0) throw new Error('В CSV нет колонок «Тип» или «Сумма»');
    if (!window.confirm('Импортировать операции из CSV? Это добавит записи к текущим (не заменит).')) return;

    const splitLine = (line) => {
      const result = []; let cur = ''; let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes;
        } else if (ch === ';' && !inQuotes) { result.push(cur); cur = ''; } else { cur += ch; }
      }
      result.push(cur); return result;
    };

    let added = 0;
    for (let li = 1; li < lines.length; li++) {
      const cells = splitLine(lines[li]);
      const typeRaw = (cells[iType] || '').toLowerCase();
      const type = typeRaw.startsWith('дох') ? 'income' : 'expense';
      const amount = parseFloat((cells[iAmt] || '0').replace(',', '.')) || 0;
      if (!amount) continue;
      const dateStr = iDate >= 0 ? (cells[iDate] || '').trim() : '';
      const accName = iAcc >= 0 ? (cells[iAcc] || '').trim() : '';
      const catName = iCat >= 0 ? (cells[iCat] || '').trim() : '';
      const debtName = iDebt >= 0 ? (cells[iDebt] || '').trim() : '';
      const comment = iCom >= 0 ? (cells[iCom] || '').trim() : '';
      const isPlanned = iPlan >= 0 && /^(да|yes|1|true)$/i.test((cells[iPlan] || '').trim());
      const exclude = iExc >= 0 && /^(да|yes|1|true)$/i.test((cells[iExc] || '').trim());

      let acc = state.accounts.find(a => a.name === accName);
      if (!acc && state.accounts.length > 0) acc = state.accounts[0];
      let cat = state.categories.find(c => c.name === catName && c.type === type);
      if (!cat && catName) {
        cat = { id: uid('cat'), type, name: catName, createdAt: Date.now() };
        await dbPut('categories', cat); state.categories.push(cat);
      }
      const debt = debtName ? state.debts.find(d => d.name === debtName) : null;

      const op = {
        id: uid('op'), type, amount, accountId: acc ? acc.id : '',
        categoryId: cat ? cat.id : '', date: dateStr, comment,
        isPlanned, excludeFromBalance: exclude, linkedDebtId: debt ? debt.id : '',
        nested: [], manualSum: false, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await dbPut('operations', op); state.operations.push(op); added++;
    }
    renderDashboard(); renderOperations(); renderCategories();
    alert('Импортировано операций: ' + added);
  } catch (err) { alert('Ошибка импорта CSV: ' + err.message); }
}

async function exportTXT() {
  const lines = [];
  lines.push('Мои финансы — отчёт по операциям');
  lines.push('Сформирован: ' + new Date().toLocaleString('ru-RU'));
  lines.push('Всего операций: ' + state.operations.length);

  const totalIncome = state.operations.filter(o => !o.isPlanned && o.type === 'income').reduce((s, o) => s + o.amount, 0);
  const totalExpense = state.operations.filter(o => !o.isPlanned && o.type === 'expense').reduce((s, o) => s + o.amount, 0);
  lines.push('Доходы (факт): ' + formatMoney(totalIncome) + ' ₽');
  lines.push('Расходы (факт): ' + formatMoney(totalExpense) + ' ₽');
  lines.push('Баланс: ' + formatMoney(totalIncome - totalExpense) + ' ₽');
  lines.push('--- Операции ---');

  const sorted = [...state.operations].sort((a, b) => {
    const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0);
    const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0);
    return kb - ka;
  });
  sorted.forEach(o => {
    const acc = state.accounts.find(a => a.id === o.accountId);
    const cat = state.categories.find(c => c.id === o.categoryId);
    const debt = state.debts.find(d => d.id === o.linkedDebtId);
    const sign = o.type === 'income' ? '+' : '−';
    let line = (o.date || 'без даты') + ' | ' + sign + formatMoney(o.amount) + ' ₽ | ' +
               (cat ? cat.name : 'без категории') + ' | ' + (acc ? acc.name : '') +
               (o.isPlanned ? ' | ПЛАН' : '') + (o.excludeFromBalance ? ' | не в балансе' : '');
    if (debt) line += ' | долг: ' + debt.name;
    if (o.comment) line += ' | ' + o.comment;
    lines.push(line);
  });
  const filename = 'finance-report-' + todayISO() + '.txt';
  downloadBlob(lines.join('\r\n'), filename, 'text/plain;charset=utf-8');
  alert('TXT сохранён: ' + filename);
}

async function exportPDF() {
  const win = window.open('', '_blank');
  if (!win) { alert('Браузер заблокировал открытие окна. Разрешите всплывающие окна.'); return; }

  const totalIncome = state.operations.filter(o => !o.isPlanned && o.type === 'income').reduce((s, o) => s + o.amount, 0);
  const totalExpense = state.operations.filter(o => !o.isPlanned && o.type === 'expense').reduce((s, o) => s + o.amount, 0);

  const rowsHtml = [...state.operations].sort((a, b) => {
    const ka = a.date ? new Date(a.date).getTime() : (a.createdAt || 0);
    const kb = b.date ? new Date(b.date).getTime() : (b.createdAt || 0);
    return kb - ka;
  }).map(o => {
    const acc = state.accounts.find(a => a.id === o.accountId);
    const cat = state.categories.find(c => c.id === o.categoryId);
    const sign = o.type === 'income' ? '+' : '−';
    const color = o.type === 'income' ? '#2a7a4a' : '#c0392b';
    return '<tr><td>' + escapeHtml(o.date || '') + '</td><td>' + escapeHtml(cat ? cat.name : '') +
           '</td><td>' + escapeHtml(acc ? acc.name : '') + '</td><td style="color:' + color + ';text-align:right;">' +
           sign + formatMoney(o.amount) + ' ₽</td><td>' + escapeHtml(o.comment || '') +
           (o.isPlanned ? ' <i>(план)</i>' : '') + '</td></tr>';
  }).join('');

  const html = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">' +
    '<title>Мои финансы — отчёт</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#222;}' +
    'h1{font-size:20px;}table{width:100%;border-collapse:collapse;font-size:13px;}' +
    'th,td{border:1px solid #ccc;padding:6px;text-align:left;}th{background:#f0f0f0;}' +
    '.summary{margin:12px 0;padding:10px;background:#f8f8f8;border-radius:6px;}' +
    '@media print{body{padding:0;} .no-print{display:none;}}</style></head><body>' +
    '<h1>Мои финансы — отчёт по операциям</h1><div class="summary">' +
    '<div>Сформирован: ' + new Date().toLocaleString('ru-RU') + '</div>' +
    '<div>Доходы (факт): <b style="color:#2a7a4a;">' + formatMoney(totalIncome) + ' ₽</b></div>' +
    '<div>Расходы (факт): <b style="color:#c0392b;">' + formatMoney(totalExpense) + ' ₽</b></div>' +
    '<div>Баланс: <b>' + formatMoney(totalIncome - totalExpense) + ' ₽</b></div></div>' +
    '<table><thead><tr><th>Дата</th><th>Категория</th><th>Счёт</th><th>Сумма</th><th>Комментарий</th></tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody></table>' +
    '<p class="no-print" style="margin-top:20px;"><button onclick="window.print()">Печать / Сохранить как PDF</button></p>' +
    '</body></html>';

  win.document.write(html);
  win.document.close();
}

async function updateStorageInfo() {
  const infoEl = document.getElementById('storage-info');
  const fillEl = document.getElementById('storage-bar-fill');
  if (!infoEl) return;
  try {
    const est = await navigator.storage.estimate();
    const used = est.usage || 0;
    const quota = est.quota || 0;
    const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
    infoEl.textContent = 'Занято: ' + formatBytes(used) + ' из ' + formatBytes(quota) + ' (' + pct.toFixed(2) + '%)';
    if (fillEl) fillEl.style.width = pct + '%';
  } catch (e) {
    infoEl.textContent = 'Не удалось получить информацию о хранилище.';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(2) + ' ' + units[i];
}

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) {
    alert('Браузер не поддерживает постоянное хранилище.'); return;
  }
  const granted = await navigator.storage.persist();
  if (granted) alert('Постоянное хранилище разрешено. Данные не будут удалены браузером автоматически.');
  else alert('Браузер не дал разрешение. Данные могут быть удалены при нехватке места.');
  updateStorageInfo();
}

// =========================================================================
// ОБРАБОТЧИКИ
// =========================================================================
function setupNavigation() {
  $$('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

function setupModals() {
  const fab = document.getElementById('fab-add');
  if (fab) fab.addEventListener('click', () => openModal('modal-add-choice'));

  $$('.modal-close').forEach(btn => { btn.addEventListener('click', () => closeAllModals()); });

  $$('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.add;
      closeModal('modal-add-choice');
      if (type === 'debt') openDebtForm();
      else {
        openOperationForm();
        document.getElementById('op-type').value = type;
        fillCategorySelect();
      }
    });
  });

  const cancelOp = document.getElementById('btn-cancel-operation');
  const cancelDebt = document.getElementById('btn-cancel-debt');
  if (cancelOp) cancelOp.addEventListener('click', () => tryCloseModal('modal-operation'));
  if (cancelDebt) cancelDebt.addEventListener('click', () => tryCloseModal('modal-debt'));

  const opForm = document.getElementById('operation-form');
  const debtForm = document.getElementById('debt-form');
  if (opForm) opForm.addEventListener('submit', saveOperationWithDebtCheck);
  if (debtForm) debtForm.addEventListener('submit', saveDebt);
}

function setupModalXButtons() {
  $$('.modal-x').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) tryCloseModal(modal.id);
    });
  });
}

function setupOverlayClose() {
  $$('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) tryCloseModal(modal.id);
    });
  });
}

function setupFormDirtyTracking() {
  const opForm = document.getElementById('operation-form');
  const debtForm = document.getElementById('debt-form');
  [opForm, debtForm].forEach(form => {
    if (!form) return;
    form.addEventListener('input',  () => markFormDirty(form));
    form.addEventListener('change', () => markFormDirty(form));
  });
}

function setupTheme() {
  $$('input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) setTheme(r.value); });
  });
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.addEventListener('click', cycleTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') applyTheme('system');
  });
}

function setupSettingsButtons() {
  const addAcc = document.getElementById('btn-add-account');
  if (addAcc) addAcc.addEventListener('click', addAccount);

  const addInc = document.getElementById('btn-add-income-category');
  if (addInc) addInc.addEventListener('click', () => addCategory('income'));

  const addExp = document.getElementById('btn-add-expense-category');
  if (addExp) addExp.addEventListener('click', () => addCategory('expense'));

  const addTpl = document.getElementById('btn-add-template');
  if (addTpl) addTpl.addEventListener('click', () => alert('Создание шаблонов — в следующих частях.'));
}

function setupDebtForm() {
  const isCredit = document.getElementById('debt-is-credit');
  const creditBlock = document.getElementById('credit-block');
  if (isCredit && creditBlock) {
    isCredit.addEventListener('change', () => {
      creditBlock.classList.toggle('hidden', !isCredit.checked);
      if (!isCredit.checked) {
        document.getElementById('debt-term').value = '';
        document.getElementById('debt-rate').value = '';
        document.getElementById('debt-total').value = '';
      }
    });
  }
  ['debt-amount','debt-term','debt-rate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (document.getElementById('debt-is-credit').checked) calcCreditTotal();
    });
  });
  const dateClear = document.getElementById('debt-date-clear');
  if (dateClear) dateClear.addEventListener('click', () => { document.getElementById('debt-due-date').value = ''; });
}

function setupOperationForm() {
  const typeSel = document.getElementById('op-type');
  if (typeSel) typeSel.addEventListener('change', () => fillCategorySelect());

  const planned = document.getElementById('op-is-planned');
  const exclude = document.getElementById('op-exclude-balance');
  if (planned && exclude) {
    planned.addEventListener('change', () => { if (planned.checked) exclude.checked = true; });
  }

  const dateClear = document.getElementById('op-date-clear');
  if (dateClear) dateClear.addEventListener('click', () => { document.getElementById('op-date').value = ''; });

  const addNested = document.getElementById('btn-add-nested-field');
  if (addNested) addNested.addEventListener('click', () => {
    if (isManualSum()) { showManualIndicator(false); disableNestedInputs(false); }
    addNestedField();
  });

  const recalcBtn = document.getElementById('btn-recalc');
  if (recalcBtn) recalcBtn.addEventListener('click', () => {
    showManualIndicator(false); disableNestedInputs(false); recalcNestedTotal();
  });

  const amountInp = document.getElementById('op-amount');
  if (amountInp) amountInp.addEventListener('input', () => {
    const hasNested = $$('#nested-fields-list .nested-field-row').length > 0;
    if (hasNested) { showManualIndicator(true); disableNestedInputs(true); }
  });

  const tplSel = document.getElementById('op-template');
  if (tplSel) tplSel.addEventListener('change', () => {
    const tplId = tplSel.value;
    if (!tplId) return;
    const t = state.templates.find(x => x.id === tplId);
    if (!t) return;
    document.getElementById('op-type').value = t.type;
    fillCategorySelect();
    clearNestedFields(); showManualIndicator(false); disableNestedInputs(false);
    t.fields.forEach(f => addNestedField(f.name, ''));
    recalcNestedTotal();
  });
}

function setupDashboardPeriod() {
  $$('[data-dashboard-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.dashboardPeriod;
      state.dashboardPeriod = p;
      $$('[data-dashboard-period]').forEach(b => b.classList.toggle('active', b === btn));
      const custom = document.getElementById('dashboard-custom-period');
      if (custom) custom.classList.toggle('hidden', p !== 'custom');
      updateDashboardPeriodStats();
    });
  });
  ['dashboard-date-from','dashboard-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateDashboardPeriodStats);
  });
}

function setupHistoryFilters() {
  const toggle = document.getElementById('btn-toggle-filters');
  if (toggle) toggle.addEventListener('click', () => {
    const panel = document.getElementById('filters-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    toggle.textContent = panel.classList.contains('hidden') ? 'Фильтры ▾' : 'Фильтры ▴';
  });

  const ids = ['filter-search','filter-type','filter-account','filter-category','filter-status','filter-period','filter-date-from','filter-date-to','filter-has-debt','filter-has-nested','filter-sum-from','filter-sum-to'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    ['input','change'].forEach(ev => el.addEventListener(ev, renderOperations));
  });

  const periodSel = document.getElementById('filter-period');
  if (periodSel) periodSel.addEventListener('change', () => {
    const custom = document.getElementById('filter-custom-period');
    if (custom) custom.classList.toggle('hidden', periodSel.value !== 'custom');
  });

  const reset = document.getElementById('btn-reset-filters');
  if (reset) reset.addEventListener('click', () => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = false; else el.value = '';
    });
    document.getElementById('filter-period').value = 'all';
    document.getElementById('filter-status').value = 'all';
    const custom = document.getElementById('filter-custom-period');
    if (custom) custom.classList.add('hidden');
    renderOperations();
  });

  const massCancel = document.getElementById('btn-mass-cancel');
  if (massCancel) massCancel.addEventListener('click', () => { state.selectedOperations.clear(); renderOperations(); });

  const massDelete = document.getElementById('btn-mass-delete');
  if (massDelete) massDelete.addEventListener('click', deleteSelectedOperations);
}

function setupReports() {
  $$('.report-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.report-tabs button').forEach(b => b.classList.toggle('active', b === btn));
      renderReports();
    });
  });
  const periodSel = document.getElementById('report-period-select');
  if (periodSel) periodSel.addEventListener('change', () => {
    const custom = document.getElementById('report-custom-period');
    if (custom) custom.classList.toggle('hidden', periodSel.value !== 'custom');
    renderReports();
  });
  ['report-date-from','report-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderReports);
  });
}

function setupArchive() {
  const manualBtn = document.getElementById('btn-manual-archive');
  if (manualBtn) manualBtn.addEventListener('click', archiveSelectedOperations);
  const exportBtn = document.getElementById('btn-export-archive');
  if (exportBtn) exportBtn.addEventListener('click', exportArchiveJSON);
  const importBtn = document.getElementById('btn-import-archive');
  const fileInput = document.getElementById('archive-file-input');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) importArchiveJSON(f);
      fileInput.value = '';
    });
  }
  const massArchive = document.getElementById('btn-mass-archive');
  if (massArchive) massArchive.addEventListener('click', archiveSelectedOperations);
}

function setupExportImport() {
  const expJson = document.getElementById('btn-export-json');
  const impJson = document.getElementById('btn-import-json');
  const impJsonInput = document.getElementById('import-json-input');
  if (expJson) expJson.addEventListener('click', exportJSON);
  if (impJson && impJsonInput) {
    impJson.addEventListener('click', () => impJsonInput.click());
    impJsonInput.addEventListener('change', () => {
      const f = impJsonInput.files[0];
      if (f) importJSON(f);
      impJsonInput.value = '';
    });
  }

  const expCsv = document.getElementById('btn-export-csv');
  const impCsv = document.getElementById('btn-import-csv');
  const impCsvInput = document.getElementById('import-csv-input');
  if (expCsv) expCsv.addEventListener('click', exportCSV);
  if (impCsv && impCsvInput) {
    impCsv.addEventListener('click', () => impCsvInput.click());
    impCsvInput.addEventListener('change', () => {
      const f = impCsvInput.files[0];
      if (f) importCSV(f);
      impCsvInput.value = '';
    });
  }

  const expTxt = document.getElementById('btn-export-txt');
  if (expTxt) expTxt.addEventListener('click', exportTXT);

  const expPdf = document.getElementById('btn-export-pdf');
  if (expPdf) expPdf.addEventListener('click', exportPDF);

  const persistBtn = document.getElementById('btn-request-persist');
  if (persistBtn) persistBtn.addEventListener('click', requestPersistentStorage);

  updateStorageInfo();
}

// =========================================================================
// ИНИЦИАЛИЗАЦИЯ
// =========================================================================
async function init() {
  loadTheme();
  state.db = await openDB();
  await loadAccounts();
  await loadCategories();
  await loadTemplates();
  await loadOperations();
  await loadDebts();
  await loadArchive();

  setupNavigation();
  setupModals();
  setupModalXButtons();
  setupOverlayClose();
  setupFormDirtyTracking();
  setupTheme();
  setupSettingsButtons();
  setupDebtForm();
  setupOperationForm();
  setupDashboardPeriod();
  setupHistoryFilters();
  setupReports();
  setupArchive();
  setupExportImport();

  switchScreen('dashboard');

  await autoArchiveOldOperations();
  showArchiveNotificationIfNeeded();
}

// Страховка: блокируем нативную отправку любых форм.
document.addEventListener('submit', (e) => { e.preventDefault(); }, true);
// Регистрация Service Worker для работы офлайн
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('Офлайн-режим готов'))
      .catch((err) => console.log('Ошибка Service Worker:', err));
  });
}
document.addEventListener('DOMContentLoaded', init);