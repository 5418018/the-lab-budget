import glob
import json
import os
import subprocess
import sys
from datetime import date, datetime

import openpyxl


sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def last_excel_commit(path):
    """해당 엑셀 파일을 마지막으로 변경한 Git 커밋 시각을 반환합니다."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", os.path.basename(path)],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            check=True,
        )
        return int(result.stdout.strip() or 0)
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0


def excel_sort_key(path):
    # GitHub Actions에서는 커밋 시각을 우선하고, 로컬 실행에서는 수정 시각도 사용합니다.
    return (last_excel_commit(path), os.path.getmtime(path))


def to_number(value, default=0):
    """숫자, 쉼표가 포함된 숫자 문자열, 빈 셀을 안전하게 변환합니다."""
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().replace(",", "")
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def to_date_string(value):
    """실제 거래 날짜만 YYYY-MM-DD 문자열로 변환합니다."""
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")

    if isinstance(value, str):
        text = value.strip()[:10]
        for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
            try:
                return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass
    return ""


excel_files = [
    path
    for path in glob.glob(os.path.join(BASE_DIR, "*.xlsx"))
    if not os.path.basename(path).startswith("~$")
]

if not excel_files:
    print("엑셀 파일을 찾을 수 없습니다. 기존 data.js를 유지합니다.")
    sys.exit(0)

target_file = max(excel_files, key=excel_sort_key)
print(f"변환 대상 파일: {os.path.basename(target_file)}")

wb = openpyxl.load_workbook(target_file, data_only=True)

required_sheets = (
    "5. 대시보드",
    "3. 5기 수입지출장부",
    "4. 5기 수입상세 및 인원변동",
)
missing_sheets = [name for name in required_sheets if name not in wb.sheetnames]
if missing_sheets:
    raise RuntimeError("필수 시트가 없습니다: " + ", ".join(missing_sheets))


# 1. 대시보드
ws_dash = wb["5. 대시보드"]
dashboard_items = []
for r in range(11, 30):
    guan = ws_dash.cell(row=r, column=2).value
    item = ws_dash.cell(row=r, column=3).value
    budget = ws_dash.cell(row=r, column=4).value
    spent = ws_dash.cell(row=r, column=5).value
    remaining = ws_dash.cell(row=r, column=6).value
    rate = ws_dash.cell(row=r, column=7).value

    if item not in (None, ""):
        dashboard_items.append(
            {
                "guan": str(guan).strip() if guan else "",
                "item": str(item).strip(),
                "budget": to_number(budget),
                "spent": to_number(spent),
                "remaining": to_number(remaining),
                "rate": to_number(rate),
            }
        )


# 2. 수입지출장부
ws_ledger = wb["3. 5기 수입지출장부"]

# 표 범위가 최신 거래를 포함하지 않아도 시트 전체를 검사합니다.
# A열이 실제 날짜인 행만 거래로 인정하여 장부 아래쪽 분류표를 제외합니다.
first_row = 5
transactions = []
last_transaction_row = first_row - 1

for r in range(first_row, ws_ledger.max_row + 1):
    date_value = ws_ledger.cell(row=r, column=1).value
    date_str = to_date_string(date_value)

    if not date_str:
        continue

    category = ws_ledger.cell(row=r, column=2).value
    item = ws_ledger.cell(row=r, column=3).value
    income = to_number(ws_ledger.cell(row=r, column=4).value)
    expense = to_number(ws_ledger.cell(row=r, column=5).value)
    balance = to_number(ws_ledger.cell(row=r, column=7).value)
    description = ws_ledger.cell(row=r, column=8).value
    payment_date = ws_ledger.cell(row=r, column=9).value
    payer = ws_ledger.cell(row=r, column=10).value
    bank = ws_ledger.cell(row=r, column=11).value

    # 날짜만 있고 거래 내용과 금액이 모두 없는 행은 제외합니다.
    if not any(
        value not in (None, "", 0, 0.0)
        for value in (category, item, income, expense, description)
    ):
        continue

    transactions.append(
        {
            "id": len(transactions) + 1,
            "date": date_str,
            "category": str(category).strip() if category else "",
            "item": str(item).strip() if item else "",
            "income": income,
            "expense": expense,
            "balance": balance,
            "description": str(description).strip() if description else "",
            "paymentDate": to_date_string(payment_date),
            "payer": str(payer).strip() if payer else "",
            "bank": str(bank).strip() if bank else "",
        }
    )
    last_transaction_row = r

if not transactions:
    raise RuntimeError("수입지출장부에서 유효한 거래를 찾지 못했습니다.")


# 3. 수입상세 및 인원변동
ws_members = wb["4. 5기 수입상세 및 인원변동"]
member_stats = []

for r in range(6, 18):
    month = ws_members.cell(row=r, column=2).value
    org_count = ws_members.cell(row=r, column=3).value
    sponsor_count = ws_members.cell(row=r, column=4).value
    org_income = ws_members.cell(row=r, column=5).value
    sponsor_income = ws_members.cell(row=r, column=6).value
    total_income = ws_members.cell(row=r, column=7).value
    note = ws_members.cell(row=r, column=8).value

    if month not in (None, "") and total_income not in (None, ""):
        member_stats.append(
            {
                "month": str(month).strip(),
                "orgCount": int(to_number(org_count)),
                "sponsorCount": int(to_number(sponsor_count)),
                "orgIncome": to_number(org_income),
                "sponsorIncome": to_number(sponsor_income),
                "totalIncome": to_number(total_income),
                "note": str(note).strip() if note else "",
            }
        )


last_balance = transactions[-1]["balance"]
official_spent = sum(item["spent"] for item in dashboard_items)
total_budget = to_number(ws_dash["B5"].value)

provisional_spent = sum(
    transaction["expense"]
    for transaction in transactions
    if transaction["category"] == "가예산"
)

dataset = {
    "updatedAt": datetime.now().strftime("%Y-%m-%d"),
    "title": "THE 연구소 5기 회계 및 실시간 예산 현황",
    "kpi": {
        "totalBudget": total_budget,
        "officialSpent": official_spent,
        "provisionalSpent": provisional_spent,
        "totalSpent": official_spent + provisional_spent,
        "balance": last_balance,
        "burnRate": official_spent / total_budget if total_budget else 0,
        "fiscalElapsed": 0.67,
    },
    "expenseBudgets": dashboard_items,
    "transactions": transactions,
    "memberStats": member_stats,
}

web_dir = os.path.join(BASE_DIR, "web_dashboard")
os.makedirs(web_dir, exist_ok=True)

out_js = os.path.join(web_dir, "data.js")
with open(out_js, "w", encoding="utf-8") as file:
    file.write(
        "window.INITIAL_BUDGET_DATA = "
        + json.dumps(dataset, ensure_ascii=False, indent=2)
        + ";\n"
    )

out_json = os.path.join(web_dir, "data.json")
with open(out_json, "w", encoding="utf-8") as file:
    json.dump(dataset, file, ensure_ascii=False, indent=2)

print(f"업데이트 완료: {out_js}, {out_json}")
print(
    f"총 거래 건수: {len(transactions)}건, "
    f"마지막 거래 행: {last_transaction_row}행, "
    f"마지막 거래일: {transactions[-1]['date']}"
)
