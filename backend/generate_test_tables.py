"""Generate varied table PDFs to stress-test table extraction."""
import os
import uuid
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "storage", "uploads")
META_PATH = os.path.join(UPLOAD_DIR, "_metadata.json")

styles = getSampleStyleSheet()

def save_pdf(doc_func, filename):
    """Generate a PDF via doc_func and register it in metadata."""
    pdf_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{pdf_id}.pdf")
    doc_func(path)
    # Update metadata
    meta = {}
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            meta = json.load(f)
    meta[pdf_id] = {"filename": filename, "page_count": 1}
    # Count pages properly
    from pdfplumber import open as popen
    with popen(path) as pdf:
        meta[pdf_id]["page_count"] = len(pdf.pages)
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  {pdf_id} -> {filename}")
    return pdf_id


# ── 1. Simple 3-column table ──
def gen_simple_3col(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        ["Item", "Qty", "Price"],
        ["Widget A", "10", "$25.00"],
        ["Widget B", "5", "$42.50"],
        ["Gadget C", "20", "$12.75"],
        ["Total", "35", "$80.25"],
    ]
    t = Table(data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    doc.build([
        Paragraph("Simple Invoice", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 2. Wide table with many columns (8 cols) ──
def gen_wide_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter, leftMargin=0.5*inch, rightMargin=0.5*inch)
    headers = ["ID", "Name", "Dept", "Role", "Start", "Salary", "Bonus", "Total"]
    rows = [
        ["001", "Alice Johnson", "Engineering", "Senior Dev", "2019-03-15", "$120,000", "$15,000", "$135,000"],
        ["002", "Bob Smith", "Marketing", "Manager", "2020-07-01", "$95,000", "$10,000", "$105,000"],
        ["003", "Carol Davis", "Finance", "Analyst", "2021-01-20", "$85,000", "$8,000", "$93,000"],
        ["004", "Dan Wilson", "Engineering", "Lead", "2018-11-05", "$140,000", "$20,000", "$160,000"],
        ["005", "Eve Brown", "HR", "Director", "2017-06-12", "$110,000", "$12,000", "$122,000"],
        ["006", "Frank Lee", "Engineering", "Junior Dev", "2023-02-28", "$75,000", "$5,000", "$80,000"],
    ]
    data = [headers] + rows
    t = Table(data, colWidths=[0.5*inch, 1.2*inch, 1*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.8*inch, 0.9*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a56db")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
    ]))
    doc.build([
        Paragraph("Employee Compensation Report", styles["Title"]),
        Spacer(1, 15),
        t,
    ])


# ── 3. Table with empty cells and sparse data ──
def gen_sparse_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        ["Product", "Q1", "Q2", "Q3", "Q4"],
        ["Alpha", "$1,200", "", "$3,400", "$2,100"],
        ["Beta", "", "$5,600", "", ""],
        ["Gamma", "$800", "$900", "$1,100", "$1,300"],
        ["Delta", "", "", "", "$7,500"],
        ["Epsilon", "$2,000", "$2,200", "$2,400", "$2,600"],
        ["Zeta", "", "", "", ""],
    ]
    t = Table(data, colWidths=[1.5*inch, 1.2*inch, 1.2*inch, 1.2*inch, 1.2*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    doc.build([
        Paragraph("Quarterly Revenue (Sparse)", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 4. Table with long text / multi-line cells ──
def gen_multiline_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    cell_style = ParagraphStyle("cell", parent=styles["Normal"], fontSize=9, leading=11)
    data = [
        ["Task", "Description", "Status", "Due Date"],
        [
            Paragraph("API Redesign", cell_style),
            Paragraph("Refactor the entire REST API to use GraphQL with proper schema validation and authentication middleware", cell_style),
            Paragraph("In Progress", cell_style),
            Paragraph("2026-04-15", cell_style),
        ],
        [
            Paragraph("Database Migration", cell_style),
            Paragraph("Migrate from PostgreSQL 12 to 16 with zero downtime, including schema changes and data backfill for new columns", cell_style),
            Paragraph("Planned", cell_style),
            Paragraph("2026-05-01", cell_style),
        ],
        [
            Paragraph("Security Audit", cell_style),
            Paragraph("Full penetration testing and vulnerability assessment of all public endpoints", cell_style),
            Paragraph("Complete", cell_style),
            Paragraph("2026-03-20", cell_style),
        ],
        [
            Paragraph("UI Overhaul", cell_style),
            Paragraph("Redesign dashboard with new component library. Must be responsive and accessible (WCAG 2.1 AA)", cell_style),
            Paragraph("In Progress", cell_style),
            Paragraph("2026-06-01", cell_style),
        ],
    ]
    t = Table(data, colWidths=[1.2*inch, 3*inch, 0.9*inch, 0.9*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c4b5fd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    doc.build([
        Paragraph("Project Tasks - Detailed", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 5. Narrow 2-column key-value style table ──
def gen_narrow_2col(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        ["Metric", "Value"],
        ["Total Users", "12,847"],
        ["Active Users (30d)", "8,392"],
        ["Revenue (MTD)", "$487,293.00"],
        ["Churn Rate", "2.3%"],
        ["Avg Session Duration", "14m 32s"],
        ["Support Tickets", "342"],
        ["NPS Score", "72"],
        ["Uptime", "99.97%"],
        ["API Calls (24h)", "2,847,391"],
        ["Error Rate", "0.12%"],
    ]
    t = Table(data, colWidths=[2.5*inch, 2.5*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 1), (0, -1), colors.HexColor("#334155")),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    doc.build([
        Paragraph("Dashboard KPIs", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 6. Multiple tables on one page ──
def gen_multi_tables(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    elements = []
    elements.append(Paragraph("Financial Summary", styles["Title"]))
    elements.append(Spacer(1, 15))

    # Table 1: Income
    elements.append(Paragraph("Income", styles["Heading2"]))
    data1 = [
        ["Source", "Amount"],
        ["Product Sales", "$245,000"],
        ["Services", "$128,000"],
        ["Licensing", "$67,000"],
        ["Total Income", "$440,000"],
    ]
    t1 = Table(data1, colWidths=[3*inch, 2*inch])
    t1.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#166534")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(t1)
    elements.append(Spacer(1, 25))

    # Table 2: Expenses
    elements.append(Paragraph("Expenses", styles["Heading2"]))
    data2 = [
        ["Category", "Amount"],
        ["Salaries", "$180,000"],
        ["Rent", "$24,000"],
        ["Marketing", "$35,000"],
        ["Cloud Infra", "$18,500"],
        ["Legal", "$12,000"],
        ["Total Expenses", "$269,500"],
    ]
    t2 = Table(data2, colWidths=[3*inch, 2*inch])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#991b1b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(t2)
    elements.append(Spacer(1, 25))

    # Table 3: Summary
    elements.append(Paragraph("Net Position", styles["Heading2"]))
    data3 = [
        ["", "Amount"],
        ["Total Income", "$440,000"],
        ["Total Expenses", "$269,500"],
        ["Net Profit", "$170,500"],
    ]
    t3 = Table(data3, colWidths=[3*inch, 2*inch])
    t3.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#dbeafe")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(t3)
    doc.build(elements)


# ── 7. Table with uneven column widths (extreme ratio) ──
def gen_uneven_columns(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        ["#", "Full Description of the Line Item Including Details", "Amt"],
        ["1", "Annual software license renewal for enterprise CRM platform", "$24,999"],
        ["2", "Cloud hosting - AWS EC2 instances (m5.xlarge x4)", "$8,640"],
        ["3", "Consulting: Architecture review and performance optimization", "$15,000"],
        ["4", "Hardware: Dell PowerEdge R750 rack server", "$12,500"],
        ["5", "Training: Team certification program (10 seats)", "$7,500"],
    ]
    t = Table(data, colWidths=[0.4*inch, 5*inch, 0.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#78350f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
    ]))
    doc.build([
        Paragraph("Purchase Order - Uneven Columns", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 8. Large table (many rows) ──
def gen_large_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    headers = ["Row", "Code", "Description", "Quantity", "Unit Price", "Total"]
    rows = []
    for i in range(1, 51):
        rows.append([
            str(i),
            f"SKU-{1000 + i}",
            f"Product item number {i} with standard packaging",
            str((i * 7) % 100 + 1),
            f"${(i * 3.5 + 10):.2f}",
            f"${((i * 7 % 100 + 1) * (i * 3.5 + 10)):.2f}",
        ])
    data = [headers] + rows
    t = Table(data, colWidths=[0.4*inch, 0.8*inch, 2.5*inch, 0.7*inch, 0.8*inch, 0.9*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eff6ff")]),
        ("ALIGN", (3, 0), (5, -1), "RIGHT"),
    ]))
    doc.build([
        Paragraph("Inventory Report - 50 Rows", styles["Title"]),
        Spacer(1, 10),
        t,
    ])


# ── 9. Table with no grid lines (borderless) ──
def gen_borderless_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        ["Date", "Event", "Location", "Attendees"],
        ["2026-04-01", "Q2 Kickoff", "Main Auditorium", "250"],
        ["2026-04-15", "Design Sprint", "Room 3B", "12"],
        ["2026-05-01", "Board Meeting", "Executive Suite", "8"],
        ["2026-05-10", "Hackathon", "Open Floor", "60"],
        ["2026-06-01", "All Hands", "Virtual", "500"],
    ]
    t = Table(data, colWidths=[1.2*inch, 1.8*inch, 1.5*inch, 1*inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#6b21a8")),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#6b21a8")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#d8b4fe")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    doc.build([
        Paragraph("Upcoming Events", styles["Title"]),
        Spacer(1, 20),
        t,
    ])


# ── 10. Mixed content: text above/below + table in middle ──
def gen_surrounded_table(path):
    doc = SimpleDocTemplate(path, pagesize=letter)
    elements = []
    elements.append(Paragraph("Monthly Performance Report", styles["Title"]))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        "This report summarizes the key performance indicators for the month of March 2026. "
        "All figures are preliminary and subject to final audit adjustments. Please review "
        "the data below and report any discrepancies to the finance team by April 5th.",
        styles["Normal"]
    ))
    elements.append(Spacer(1, 15))
    elements.append(Paragraph("Department Breakdown", styles["Heading2"]))
    elements.append(Spacer(1, 8))

    data = [
        ["Department", "Budget", "Actual", "Variance", "% Used"],
        ["Engineering", "$500,000", "$487,320", "$12,680", "97.5%"],
        ["Marketing", "$200,000", "$213,450", "-$13,450", "106.7%"],
        ["Sales", "$150,000", "$142,800", "$7,200", "95.2%"],
        ["Operations", "$300,000", "$289,100", "$10,900", "96.4%"],
        ["Support", "$100,000", "$98,750", "$1,250", "98.8%"],
    ]
    t = Table(data, colWidths=[1.3*inch, 1.1*inch, 1.1*inch, 1.1*inch, 0.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0369a1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bae6fd")),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 15))
    elements.append(Paragraph(
        "Note: Marketing exceeded budget by 6.7% due to the unplanned social media campaign "
        "launched in mid-March. This has been pre-approved by the CFO. Engineering came in under "
        "budget primarily due to delayed hiring of two senior positions.",
        styles["Normal"]
    ))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        "Next steps: Budget reallocation proposals are due by April 10th. Department heads should "
        "submit updated forecasts for Q2 using the standard template.",
        styles["Normal"]
    ))
    doc.build(elements)


if __name__ == "__main__":
    print("Generating stress-test table PDFs...")
    save_pdf(gen_simple_3col, "table_test_01_simple_3col.pdf")
    save_pdf(gen_wide_table, "table_test_02_wide_8col.pdf")
    save_pdf(gen_sparse_table, "table_test_03_sparse_cells.pdf")
    save_pdf(gen_multiline_table, "table_test_04_multiline_cells.pdf")
    save_pdf(gen_narrow_2col, "table_test_05_narrow_2col_kv.pdf")
    save_pdf(gen_multi_tables, "table_test_06_multi_tables.pdf")
    save_pdf(gen_uneven_columns, "table_test_07_uneven_columns.pdf")
    save_pdf(gen_large_table, "table_test_08_large_50rows.pdf")
    save_pdf(gen_borderless_table, "table_test_09_borderless.pdf")
    save_pdf(gen_surrounded_table, "table_test_10_surrounded_by_text.pdf")
    print("\nDone! 10 test PDFs generated.")
