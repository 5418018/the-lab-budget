// THE 연구소 5기 회계 및 실시간 예산 대시보드 애플리케이션 로직

let state = {
  data: window.INITIAL_BUDGET_DATA || null,
  activeTab: 'budget',
  ledgerFilter: 'ALL',
  ledgerSearchTerm: '',
  budgetSort: 'rateDesc',
  charts: {}
};

// =============================================================================
// 1. 초기화 및 이벤트 리스너
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  
  // 구글 시트 저장된 URL 확인 및 로드
  const savedUrl = localStorage.getItem('google_sheets_csv_url');
  if (savedUrl) {
    document.getElementById('googleSheetUrlInput').value = savedUrl;
    await syncGoogleSheetData(savedUrl);
  } else {
    initDashboard();
  }
});

function initDashboard() {
  if (!state.data) return;
  renderKPIs();
  renderAlertBanner();
  renderCategoryChart();
  renderBudgetList();
  renderLedgerList();
  renderMonthlyCharts();
  renderPayerRanks();
  renderMembers();
  lucide.createIcons();
}

// =============================================================================
// 2. 탭 전환
// =============================================================================
function switchTab(tabName) {
  state.activeTab = tabName;
  
  const tabs = ['budget', 'ledger', 'analytics', 'members'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn-${t}`);
    const content = document.getElementById(`tabContent-${t}`);
    
    if (t === tabName) {
      btn.classList.add('active', 'text-blue-600', 'border-b-2', 'border-blue-600');
      btn.classList.remove('text-slate-500');
      content.classList.remove('hidden');
    } else {
      btn.classList.remove('active', 'text-blue-600', 'border-b-2', 'border-blue-600');
      btn.classList.add('text-slate-500');
      content.classList.add('hidden');
    }
  });

  // 차트 리사이즈 트리거
  if (tabName === 'budget' && state.charts.category) {
    state.charts.category.resize();
  } else if (tabName === 'analytics') {
    if (state.charts.monthlyFlow) state.charts.monthlyFlow.resize();
    if (state.charts.balanceTrend) state.charts.balanceTrend.resize();
  }

  lucide.createIcons();
}

// =============================================================================
// 3. KPI 및 Alert 배너 렌더링
// =============================================================================
function formatWon(num) {
  if (num === null || num === undefined) return '0';
  return Math.round(num).toLocaleString('ko-KR');
}

function formatWonShort(num) {
  if (!num) return '0만';
  const man = (num / 10000).toFixed(1);
  return `${man}만`;
}

function renderKPIs() {
  const kpi = state.data.kpi;
  document.getElementById('kpiBalance').innerText = formatWon(kpi.balance);
  document.getElementById('kpiBurnRate').innerText = `${(kpi.burnRate * 100).toFixed(1)}%`;
  document.getElementById('kpiProgressBar').style.width = `${Math.min(kpi.burnRate * 100, 100)}%`;
  document.getElementById('kpiOfficialSpent').innerText = `${formatWonShort(kpi.officialSpent)}원`;
  document.getElementById('kpiTotalBudget').innerText = `${formatWonShort(kpi.totalBudget)}원`;
  document.getElementById('kpiProvisionalSpent').innerText = `${formatWon(kpi.provisionalSpent)}원`;
  document.getElementById('lastUpdatedTime').innerText = `${state.data.updatedAt || '09-04'} 기준`;
}

function renderAlertBanner() {
  // 집행률 70% 이상인 항목 자동 감지
  const critical = state.data.expenseBudgets.filter(b => b.rate >= 0.7 && b.budget > 0);
  const banner = document.getElementById('alertBanner');
  
  if (critical.length > 0) {
    const top = critical[0];
    banner.innerHTML = `
      <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"></i>
      <div class="text-xs">
        <strong class="font-semibold text-amber-900 block mb-0.5">예산 소진 주의 (${critical.length}개 항목)</strong>
        <p class="text-amber-800 leading-relaxed">
          <strong>${top.item}</strong>이 예산 ${formatWonShort(top.budget)}원 중 <span class="font-bold text-amber-900">${(top.rate * 100).toFixed(1)}%(${formatWonShort(top.spent)}원)</span> 소진되었습니다. (잔여: ${formatWon(top.remaining)}원)
        </p>
      </div>
    `;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// =============================================================================
// 4. TAB 1: 예산 현황 (Budget)
// =============================================================================
function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  // 관별 집계 (사업비, 운영비, 경조금)
  const categories = {};
  state.data.expenseBudgets.forEach(item => {
    const guan = item.guan || '기타';
    if (!categories[guan]) categories[guan] = { budget: 0, spent: 0 };
    categories[guan].budget += item.budget;
    categories[guan].spent += item.spent;
  });

  const labels = Object.keys(categories);
  const spentData = labels.map(l => categories[l].spent);
  const remData = labels.map(l => categories[l].budget - categories[l].spent);

  if (state.charts.category) state.charts.category.destroy();

  state.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          label: '실제 지출액',
          data: spentData,
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            font: { size: 11, family: 'Pretendard' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ` 지출: ${formatWon(ctx.raw)}원`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

function renderBudgetList() {
  const container = document.getElementById('budgetItemsList');
  if (!container) return;

  const sortVal = document.getElementById('budgetSortSelect').value;
  let items = [...state.data.expenseBudgets];

  if (sortVal === 'rateDesc') {
    items.sort((a, b) => b.rate - a.rate);
  } else if (sortVal === 'budgetDesc') {
    items.sort((a, b) => b.budget - a.budget);
  } else if (sortVal === 'spentDesc') {
    items.sort((a, b) => b.spent - a.spent);
  } else if (sortVal === 'remDesc') {
    items.sort((a, b) => b.remaining - a.remaining);
  }

  container.innerHTML = items.map(item => {
    const ratePct = (item.rate * 100).toFixed(1);
    let barColor = 'bg-emerald-500';
    let badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    
    if (item.rate >= 0.7) {
      barColor = 'bg-rose-500';
      badgeColor = 'text-rose-700 bg-rose-50 border-rose-200 font-bold';
    } else if (item.rate >= 0.4) {
      barColor = 'bg-amber-500';
      badgeColor = 'text-amber-700 bg-amber-50 border-amber-200';
    } else if (item.rate === 0) {
      barColor = 'bg-slate-300';
      badgeColor = 'text-slate-400 bg-slate-50 border-slate-200';
    }

    return `
      <div class="bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/70 rounded-xl p-3 transition">
        <div class="flex justify-between items-start mb-1.5">
          <div>
            <div class="flex items-center space-x-1.5">
              <span class="text-xs font-bold text-slate-800">${item.item}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600">${item.guan}</span>
            </div>
            <span class="text-[11px] text-slate-400">예산: ${formatWon(item.budget)}원</span>
          </div>
          <span class="text-[11px] border px-2 py-0.5 rounded-full ${badgeColor}">
            ${ratePct}%
          </span>
        </div>

        <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-2">
          <div class="${barColor} h-full rounded-full progress-bar-fill" style="width: ${Math.min(item.rate * 100, 100)}%;"></div>
        </div>

        <div class="flex justify-between items-center text-[11px] text-slate-600">
          <span>지출: <strong class="text-slate-900">${formatWon(item.spent)}원</strong></span>
          <span>잔액: <strong class="${item.remaining < 1000000 && item.budget > 0 ? 'text-rose-600' : 'text-slate-700'}">${formatWon(item.remaining)}원</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// 5. TAB 2: 수입지출 장부 (Ledger)
// =============================================================================
function setLedgerFilter(filterName) {
  state.ledgerFilter = filterName;
  
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('bg-blue-600', 'text-white');
    chip.classList.add('bg-slate-100', 'text-slate-600');
  });
  
  const activeChip = document.getElementById(`filterChip-${filterName}`);
  if (activeChip) {
    activeChip.classList.remove('bg-slate-100', 'text-slate-600');
    activeChip.classList.add('bg-blue-600', 'text-white');
  }

  renderLedgerList();
}

function handleLedgerSearch() {
  state.ledgerSearchTerm = document.getElementById('ledgerSearchInput').value.trim().toLowerCase();
  renderLedgerList();
}

function renderLedgerList() {
  const container = document.getElementById('ledgerTransactionList');
  if (!container) return;

  let txs = [...state.data.transactions];

  // 최신 거래가 위로 오도록 역순 정렬
  txs.reverse();

  // Filter by Type/Category
  if (state.ledgerFilter === 'EXPENSE') {
    txs = txs.filter(t => t.expense > 0);
  } else if (state.ledgerFilter === 'INCOME') {
    txs = txs.filter(t => t.income > 0);
  } else if (state.ledgerFilter !== 'ALL') {
    txs = txs.filter(t => t.item.includes(state.ledgerFilter) || t.category.includes(state.ledgerFilter));
  }

  // Filter by Search Term
  if (state.ledgerSearchTerm) {
    txs = txs.filter(t => 
      (t.description && t.description.toLowerCase().includes(state.ledgerSearchTerm)) ||
      (t.payer && t.payer.toLowerCase().includes(state.ledgerSearchTerm)) ||
      (t.item && t.item.toLowerCase().includes(state.ledgerSearchTerm)) ||
      (t.category && t.category.toLowerCase().includes(state.ledgerSearchTerm)) ||
      (t.bank && t.bank.toLowerCase().includes(state.ledgerSearchTerm))
    );
  }

  document.getElementById('ledgerFilteredCount').innerText = txs.length;

  if (txs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 text-xs">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
        검색 결과가 없습니다.
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = txs.map(t => {
    const isIncome = t.income > 0;
    const amountStr = isIncome ? `+${formatWon(t.income)}원` : `-${formatWon(t.expense)}원`;
    const amountColor = isIncome ? 'text-emerald-600' : 'text-slate-900';
    const tagBg = isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600';

    return `
      <div onclick="openTxModalById(${t.id})" class="glass-card hover:border-blue-300 rounded-xl p-3 cursor-pointer active:scale-[0.99] transition">
        <div class="flex justify-between items-start mb-1">
          <div class="flex items-center space-x-1.5">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${tagBg}">
              ${t.category} > ${t.item}
            </span>
            <span class="text-[11px] text-slate-400">${t.date}</span>
          </div>
          <span class="text-xs font-extrabold ${amountColor}">${amountStr}</span>
        </div>

        <p class="text-xs font-medium text-slate-800 line-clamp-1 mb-1">
          ${t.description || (isIncome ? '정기 수입' : '활동 지출')}
        </p>

        <div class="flex justify-between items-center text-[10px] text-slate-400">
          <span>${t.payer ? `집행자: ${t.payer}` : ''} ${t.bank ? `(${t.bank})` : ''}</span>
          <span>잔액: ${formatWon(t.balance)}원</span>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function openTxModalById(id) {
  const tx = state.data.transactions.find(t => t.id === id);
  if (!tx) return;

  const isIncome = tx.income > 0;
  const badge = document.getElementById('modalTxTypeBadge');
  badge.innerText = isIncome ? '수입' : '지출';
  badge.className = isIncome 
    ? 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800' 
    : 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800';

  document.getElementById('modalTxDate').innerText = tx.date;
  document.getElementById('modalTxItem').innerText = `${tx.category} > ${tx.item}`;
  document.getElementById('modalTxAmount').innerText = isIncome ? `+${formatWon(tx.income)}원` : `-${formatWon(tx.expense)}원`;
  document.getElementById('modalTxDesc').innerText = tx.description || '-';
  document.getElementById('modalTxPayer').innerText = tx.payer || '-';
  document.getElementById('modalTxBank').innerText = tx.bank || '-';
  document.getElementById('modalTxBalance').innerText = `${formatWon(tx.balance)}원`;

  document.getElementById('txModal').classList.remove('hidden');
}

function closeTxModal() {
  document.getElementById('txModal').classList.add('hidden');
}

// =============================================================================
// 6. TAB 3: 통계 및 추이 (Analytics)
// =============================================================================
function renderMonthlyCharts() {
  const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const incomeData = [26736391, 1850000, 1855000, 1860000, 1873300, 1865000, 5178400, 0];
  const expenseData = [2913740, 1098500, 2149400, 515000, 1054300, 977700, 895880, 141800];
  const balanceData = [23822651, 24574151, 24279751, 25624751, 26443751, 27331051, 31613571, 31471771];

  // 월별 수입 vs 지출 차트
  const ctxFlow = document.getElementById('monthlyFlowChart');
  if (ctxFlow) {
    if (state.charts.monthlyFlow) state.charts.monthlyFlow.destroy();
    state.charts.monthlyFlow = new Chart(ctxFlow, {
      type: 'bar',
      data: {
        labels: ['2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월'],
        datasets: [
          {
            label: '지출',
            data: expenseData,
            backgroundColor: '#ef4444',
            borderRadius: 6
          },
          {
            label: '수입 (이월금 제외시 약 186만)',
            data: incomeData,
            backgroundColor: '#3b82f6',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatWon(ctx.raw)}원`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { 
            ticks: { 
              callback: v => `${(v/10000).toFixed(0)}만` 
            } 
          }
        }
      }
    });
  }

  // 잔액 추이 차트
  const ctxBal = document.getElementById('balanceTrendChart');
  if (ctxBal) {
    if (state.charts.balanceTrend) state.charts.balanceTrend.destroy();
    state.charts.balanceTrend = new Chart(ctxBal, {
      type: 'line',
      data: {
        labels: ['2월말', '3월말', '4월말', '5월말', '6월말', '7월말', '8월말', '현재'],
        datasets: [
          {
            label: '통장 잔액',
            data: balanceData,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#2563eb'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` 잔액: ${formatWon(ctx.raw)}원`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { 
            ticks: { 
              callback: v => `${(v/10000).toFixed(0)}만` 
            } 
          }
        }
      }
    });
  }
}

function renderPayerRanks() {
  const container = document.getElementById('payerRankList');
  if (!container) return;

  const payers = [
    { name: '김성복', amount: 4723580, count: 62 },
    { name: '박보규', amount: 2357740, count: 31 },
    { name: '최명규', amount: 870300, count: 3 },
    { name: '홍성민', amount: 575100, count: 22 },
    { name: '박태순', amount: 523400, count: 1 }
  ];

  const maxAmt = payers[0].amount;

  container.innerHTML = payers.map((p, idx) => {
    const pct = ((p.amount / maxAmt) * 100).toFixed(0);
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-bold text-slate-800">${idx + 1}. ${p.name} <span class="text-[10px] text-slate-400 font-normal">(${p.count}건)</span></span>
          <span class="font-bold text-slate-900">${formatWon(p.amount)}원</span>
        </div>
        <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div class="bg-blue-600 h-full rounded-full" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// 7. TAB 4: 인원 및 회비 (Members)
// =============================================================================
function renderMembers() {
  const tbody = document.getElementById('memberTableBody');
  const notesContainer = document.getElementById('memberNotesList');
  if (!tbody || !notesContainer) return;

  tbody.innerHTML = state.data.memberStats.map(m => `
    <tr>
      <td class="py-2.5 font-medium">${m.month}</td>
      <td class="py-2.5 text-center text-blue-600 font-semibold">${m.orgCount}명</td>
      <td class="py-2.5 text-center text-indigo-600 font-semibold">${m.sponsorCount}명</td>
      <td class="py-2.5 text-right font-bold text-slate-900">${formatWon(m.totalIncome)}원</td>
    </tr>
  `).join('');

  const notes = state.data.memberStats.filter(m => m.note);
  notesContainer.innerHTML = notes.map(m => `
    <div class="border-l-2 border-blue-500 pl-2.5 py-0.5">
      <strong class="text-slate-900 block text-xs mb-0.5">${m.month} 변동 메모</strong>
      <p class="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">${m.note}</p>
    </div>
  `).join('');
}

// =============================================================================
// 8. 구글 스프레드시트 실시간 동기화
// =============================================================================
async function syncGoogleSheetData(csvUrl) {
  const dot = document.getElementById('syncStatusDot');
  const text = document.getElementById('syncStatusText');
  
  dot.className = 'w-2 h-2 rounded-full bg-amber-500 badge-pulse inline-block';
  text.innerText = '동기화 중...';

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error('네트워크 응답 오류');
    const csvText = await res.text();

    Papa.parse(csvText, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        parseGoogleSheetsCSV(results.data);
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500 badge-pulse inline-block';
        text.innerText = '실시간 동기화됨';
        const now = new Date();
        document.getElementById('lastUpdatedTime').innerText = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} 동기화`;
      },
      error: (err) => {
        throw err;
      }
    });
  } catch (err) {
    console.warn('구글 시트 연동 실패, 기본 데이터 사용:', err);
    dot.className = 'w-2 h-2 rounded-full bg-blue-500 inline-block';
    text.innerText = '로컬 데이터';
    initDashboard();
  }
}

function parseGoogleSheetsCSV(rows) {
  // 시트에서 수입지출 행 파싱
  const newTxs = [];
  let bal = 0;
  
  rows.forEach((row, idx) => {
    // 5행 이후부터 데이터 행으로 판별
    const d = row[0];
    const cat = row[1];
    const item = row[2];
    const inc = parseFloat(String(row[3]).replace(/,/g, '')) || 0;
    const exp = parseFloat(String(row[4]).replace(/,/g, '')) || 0;
    const b = parseFloat(String(row[6]).replace(/,/g, '')) || 0;
    const desc = row[7];
    const payer = row[9];
    const bank = row[10];

    if ((inc > 0 || exp > 0) && (d || cat)) {
      if (b > 0) bal = b;
      newTxs.push({
        id: idx,
        date: String(d).slice(0, 10),
        category: cat || '',
        item: item || '',
        income: inc,
        expense: exp,
        balance: b || bal,
        description: desc || '',
        payer: payer || '',
        bank: bank || ''
      });
    }
  });

  if (newTxs.length > 0) {
    state.data.transactions = newTxs;
    // 잔액 갱신
    state.data.kpi.balance = newTxs[newTxs.length - 1].balance || state.data.kpi.balance;
  }

  initDashboard();
}

// =============================================================================
// 9. 설정 모달 및 새로고침
// =============================================================================
function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveGoogleSheetUrl() {
  const url = document.getElementById('googleSheetUrlInput').value.trim();
  const msg = document.getElementById('settingsMsg');
  
  if (!url) {
    msg.innerText = 'URL을 입력해주세요.';
    msg.className = 'text-[11px] text-center text-rose-500';
    return;
  }

  localStorage.setItem('google_sheets_csv_url', url);
  msg.innerText = '저장되었습니다. 실시간 동기화를 시작합니다.';
  msg.className = 'text-[11px] text-center text-emerald-600';
  
  setTimeout(() => {
    closeSettingsModal();
    syncGoogleSheetData(url);
  }, 800);
}

function resetToInitialData() {
  localStorage.removeItem('google_sheets_csv_url');
  document.getElementById('googleSheetUrlInput').value = '';
  const msg = document.getElementById('settingsMsg');
  msg.innerText = '기본 데이터로 초기화되었습니다.';
  msg.className = 'text-[11px] text-center text-blue-600';
  
  state.data = JSON.parse(JSON.stringify(window.INITIAL_BUDGET_DATA));
  initDashboard();
  
  setTimeout(() => {
    closeSettingsModal();
  }, 600);
}

async function handleRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('animate-spin');
  
  const savedUrl = localStorage.getItem('google_sheets_csv_url');
  if (savedUrl) {
    await syncGoogleSheetData(savedUrl);
  } else {
    initDashboard();
  }
  
  setTimeout(() => {
    btn.classList.remove('animate-spin');
  }, 600);
}
