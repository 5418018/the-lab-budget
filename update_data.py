import glob
import json
import os
import subprocess
import sys
from datetime import datetime

import openpyxl
from openpyxl.utils.cell import range_boundaries


sys.stdout.reconfigure(encoding='utf-8')

base_dir = os.path.dirname(os.path.abspath(__file__))
excel_files = glob.glob(os.path.join(base_dir, '*.xlsx'))
if not excel_files:
    print('엑셀 파일을 찾을 수 없습니다. 기존 data.js를 유지합니다.')
    sys.exit(0)

def last_excel_commit(path):
    result = subprocess.run(
        ['git', 'log', '-1', '--format=%ct', '--', os.path.basename(path)],
        cwd=base_dir, capture_output=True, text=True, check=True,
    )
    return int(result.stdout.strip() or 0)


# git 커밋 기록이 없거나(아직 커밋 안 한 최신 수정본) 여러 개가 0으로 동률일 때를 대비해
# 파일 자체의 수정시각(mtime)도 함께 비교 기준으로 사용합니다.
def sort_key(path):
    return (last_excel_commit(path), os.path.getmtime(path))


target_file = max(excel_files, key=sort_key)
print(f'변환 대상 파일: {os.path.basename(target_file)}')

wb = openpyxl.load_workbook(target_file, data_only=True)

# 1. 5. 대시보드
ws_dash = wb['5. 대시보드']
dashboard_items = []
for r in range(11, 30):
    guan = ws_dash.cell(row=r, column=2).value
    item = ws_dash.cell(row=r, column=3).value
    budget = ws_dash.cell(row=r, column=4).value
    spent = ws_dash.cell(row=r, column=5).value
    rem = ws_dash.cell(row=r, column=6).value
    rate = ws_dash.cell(row=r, column=7).value
    if item:
        dashboard_items.append({
            'guan': str(guan).strip() if guan else '',
            'item': str(item).strip(),
            'budget': float(budget) if budget is not None else 0,
            'spent': float(spent) if spent is not None else 0,
            'remaining': float(rem) if rem is not None else 0,
            'rate': float(rate) if rate is not None else 0,
        })

# 2. 3. 5기 수입지출장부
ws_ledger = wb['3. 5기 수입지출장부']

# --- 변경된 부분 시작 ---
# 엑셀 "표(Table)" 범위는 데이터를 표 밖에 입력하면 자동으로 확장되지 않아
# 최신 행이 누락될 수 있습니다. 표가 있으면 시작 행(헤더 다음 행)만 표에서 가져오고,
# 끝 행은 시트에 실제로 값이 있는 곳까지 직접 스캔합니다.
ledger_table = ws_ledger.tables.get('Table_1')
if ledger_table:
    _min_col, header_row, _max_col, table_last_row = range_boundaries(ledger_table.ref)
    first_row = header_row + 1
else:
    first_row = 5
    table_last_row = None

# 실제 마지막 데이터 행을 A~K열 기준으로 직접 탐색 (표 범위와 무관하게)
actual_last_row = first_row - 1
empty_streak = 0
MAX_EMPTY_STREAK = 20  # 연속으로 이 값만큼 빈 행이 나오면 데이터 끝으로 간주
scan_end = max(ws_ledger.max_row, table_last_row or 0)
for r in range(first_row, scan_end + 1):
    row_values = [ws_ledger.cell(row=r, column=c).value for c in range(1, 12)]
    if any(v not in (None, '') for v in row_values):
        actual_last_row = r
        empty_streak = 0
    else:
        empty_streak += 1
        if empty_streak >= MAX_EMPTY_STREAK:
            break

last_row = actual_last_row

if table_last_row is not None and last_row > table_last_row:
    print(
        f'[경고] 엑셀 표(Table_1) 범위({table_last_row}행)보다 실제 데이터가 더 있습니다 '
        f'({last_row}행까지). 엑셀에서 표 범위를 확장해 주세요. '
        f'(스크립트는 실제 데이터 끝까지 반영했습니다.)'
    )
# --- 변경된 부분 끝 ---

transactions = []
for r in range(first_row, last_row + 1):
    d = ws_ledger.cell(row=r, column=1).value
    cat = ws_ledger.cell(row=r, column=2).value
    item = ws_ledger.cell(row=r, column=3).value
    inc = ws_ledger.cell(row=r, column=4).value
    exp = ws_ledger.cell(row=r, column=5).value
    bal = ws_ledger.cell(row=r, column=7).value
    desc = ws_ledger.cell(row=r, column=8).value
    pay_date = ws_ledger.cell(row=r, column=9).value
    payer = ws_ledger.cell(row=r, column=10).value
    bank = ws_ledger.cell(row=r, column=11).value

    if not any(value not in (None, '') for value in (d, cat, item, inc, exp)):
        continue

    date_str = d.strftime('%Y-%m-%d') if isinstance(d, datetime) else str(d)[:10] if d else ''
    pay_date_str = pay_date.strftime('%Y-%m-%d') if isinstance(pay_date, datetime) else str(pay_date)[:10] if pay_date else ''
    transactions.append({
        'id': len(transactions) + 1,
        'date': date_str,
        'category': str(cat).strip() if cat else '',
        'item': str(item).strip() if item else '',
        'income': float(inc) if inc is not None else 0,
        'expense': float(exp) if exp is not None else 0,
        'balance': float(bal) if bal is not None else 0,
        'description': str(desc).strip() if desc else '',
        'paymentDate': pay_date_str,
        'payer': str(payer).strip() if payer else '',
        'bank': str(bank).strip() if bank else '',
    })

# 3. 4. 5기 수입상세 및 인원변동
ws_members = wb['4. 5기 수입상세 및 인원변동']
member_stats = []
for r in range(6, 18):
    month = ws_members.cell(row=r, column=2).value
    org_count = ws_members.cell(row=r, column=3).value
    spon_count = ws_members.cell(row=r, column=4).value
    org_inc = ws_members.cell(row=r, column=5).value
    spon_inc = ws_members.cell(row=r, column=6).value
    tot_inc = ws_members.cell(row=r, column=7).value
    note = ws_members.cell(row=r, column=8).value
    if month and tot_inc is not None:
        member_stats.append({
            'month': str(month).strip(),
            'orgCount': int(org_count) if org_count is not None else 0,
            'sponsorCount': int(spon_count) if spon_count is not None else 0,
            'orgIncome': float(org_inc) if org_inc is not None else 0,
            'sponsorIncome': float(spon_inc) if spon_inc is not None else 0,
            'totalIncome': float(tot_inc),
            'note': str(note).strip() if note else '',
        })

last_balance = transactions[-1]['balance'] if transactions else 0
official_spent = sum(item['spent'] for item in dashboard_items)
total_budget = float(ws_dash['B5'].value or 0)
provisional_spent = sum(
    transaction['expense'] for transaction in transactions
    if transaction['category'] == '가예산'
)

dataset = {
    'updatedAt': datetime.now().strftime('%Y-%m-%d'),
    'title': 'THE 연구소 5기 회계 및 실시간 예산 현황',
    'kpi': {
        'totalBudget': total_budget,
        'officialSpent': official_spent,
        'provisionalSpent': provisional_spent,
        'totalSpent': official_spent + provisional_spent,
        'balance': last_balance,
        'burnRate': official_spent / total_budget if total_budget else 0,
        'fiscalElapsed': 0.67,
    },
    'expenseBudgets': dashboard_items,
    'transactions': transactions,
    'memberStats': member_stats,
}

web_dir = os.path.join(base_dir, 'web_dashboard')
os.makedirs(web_dir, exist_ok=True)

out_js = os.path.join(web_dir, 'data.js')
with open(out_js, 'w', encoding='utf-8') as f:
    f.write('window.INITIAL_BUDGET_DATA = ' + json.dumps(dataset, ensure_ascii=False, indent=2) + ';\n')

out_json = os.path.join(web_dir, 'data.json')
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=2)

print(f'업데이트 완료: {out_js}, {out_json}')
print(f'총 거래 건수: {len(transactions)}건, 마지막 행: {last_row}')
