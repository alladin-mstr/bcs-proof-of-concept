"""Generate two PDFs with identical table structure but varying content.

PDF A: shorter text, narrower columns
PDF B: longer text, wider columns, multi-line rows
"""
import os
import uuid
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "storage", "uploads")
META_PATH = os.path.join(UPLOAD_DIR, "_metadata.json")

styles = getSampleStyleSheet()
cell_style = ParagraphStyle("cell", parent=styles["Normal"], fontSize=9, leading=12)
cell_bold = ParagraphStyle("cellbold", parent=cell_style, fontName="Helvetica-Bold")

TABLE_STYLE = TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, 0), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
])

HEADERS = ["Item #", "Description", "Category", "Qty", "Unit Price", "Total"]
COL_WIDTHS = [0.5*inch, 2.8*inch, 1.2*inch, 0.6*inch, 0.8*inch, 0.8*inch]


def save_pdf(doc_func, filename):
    pdf_id = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, f"{pdf_id}.pdf")
    doc_func(path)
    meta = {}
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            meta = json.load(f)
    meta[pdf_id] = {"filename": filename, "page_count": 1}
    from pdfplumber import open as popen
    with popen(path) as pdf:
        meta[pdf_id]["page_count"] = len(pdf.pages)
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  {pdf_id} -> {filename}")
    return pdf_id


def p(text):
    return Paragraph(text, cell_style)


def gen_pdf_a(path):
    """Shorter content, single-line rows."""
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        HEADERS,
        ["001", p("Steel bolts M8x40"), "Fasteners", "200", "$0.45", "$90.00"],
        ["002", p("Rubber gasket 50mm"), "Seals", "50", "$1.20", "$60.00"],
        ["003", p("Copper wire 2.5mm"), "Electrical", "100", "$3.80", "$380.00"],
        ["004", p("PVC pipe 3/4 inch"), "Plumbing", "30", "$5.50", "$165.00"],
        ["005", p("LED panel light 40W"), "Lighting", "10", "$28.00", "$280.00"],
        ["006", p("Thermal paste 5g"), "Electronics", "25", "$4.50", "$112.50"],
        ["007", p("Cable ties 200mm"), "Fasteners", "500", "$0.08", "$40.00"],
        ["008", p("Aluminium sheet 1mm"), "Raw Material", "15", "$12.00", "$180.00"],
        ["009", p("Nylon washer M10"), "Fasteners", "300", "$0.15", "$45.00"],
        ["010", p("Solder wire 1mm"), "Electronics", "20", "$6.75", "$135.00"],
    ]
    t = Table(data, colWidths=COL_WIDTHS)
    t.setStyle(TABLE_STYLE)
    doc.build([
        Paragraph("Purchase Order #PO-2026-0441", styles["Title"]),
        Spacer(1, 6),
        Paragraph("Vendor: FastParts Industrial Supply Co.", styles["Normal"]),
        Spacer(1, 15),
        t,
        Spacer(1, 15),
        Paragraph("Subtotal: $1,487.50 | Tax (8%): $119.00 | Total: $1,606.50", styles["Normal"]),
    ])


def gen_pdf_b(path):
    """Longer content, multi-line rows, wider description column."""
    doc = SimpleDocTemplate(path, pagesize=letter)
    data = [
        HEADERS,
        ["001", p("High-tensile stainless steel hex bolts M8x40, Grade A4-80, "
                   "suitable for marine and corrosive environments. "
                   "DIN 933 full thread, with certificate of conformity."),
         "Fasteners", "200", "$1.85", "$370.00"],
        ["002", p("EPDM rubber gasket, 50mm OD x 35mm ID x 3mm thick, "
                   "temperature range -40C to +150C, FDA approved for food contact."),
         "Seals", "50", "$3.40", "$170.00"],
        ["003", p("Oxygen-free copper wire 2.5mm², PVC insulated, "
                   "rated 450/750V. Color: brown. Compliant with IEC 60227. "
                   "Sold per meter, minimum order 100m."),
         "Electrical", "100", "$5.20", "$520.00"],
        ["004", p("Schedule 40 CPVC pipe, 3/4 inch nominal diameter, "
                   "hot and cold water rated up to 93°C at 100 psi. "
                   "ASTM D2846 certified. 10-foot lengths."),
         "Plumbing", "30", "$11.50", "$345.00"],
        ["005", p("Recessed LED panel light, 40W equivalent, 4000K neutral white, "
                   "CRI >90, dimmable 0-10V. "
                   "600x600mm ceiling tile replacement with integrated driver."),
         "Lighting", "10", "$52.00", "$520.00"],
        ["006", p("Arctic Silver 5 thermal compound, 5g tube. "
                   "Thermal conductivity >8.7 W/mK. "
                   "Non-electrically conductive, non-curing."),
         "Electronics", "25", "$8.90", "$222.50"],
        ["007", p("UV-resistant nylon cable ties, 200mm x 4.8mm, "
                   "black, tensile strength 22kg. "
                   "Suitable for outdoor use. UL94 V-2 rated. Bag of 100."),
         "Fasteners", "500", "$0.18", "$90.00"],
        ["008", p("5052-H32 aluminium alloy sheet, 1mm thickness, "
                   "1220x2440mm. Excellent corrosion resistance and formability. "
                   "Mill finish, protective PE film on one side."),
         "Raw Material", "15", "$34.00", "$510.00"],
        ["009", p("Nylon 6/6 flat washer, M10 (10.5mm ID x 20mm OD x 2mm), "
                   "natural white color. Electrically insulating, "
                   "chemical resistant. Operating temp up to 120°C."),
         "Fasteners", "300", "$0.35", "$105.00"],
        ["010", p("Lead-free solder wire, Sn99.3Cu0.7, 1.0mm diameter, "
                   "rosin flux core (2.2%), 500g spool. "
                   "Melting point 227°C. RoHS compliant."),
         "Electronics", "20", "$18.50", "$370.00"],
    ]
    t = Table(data, colWidths=COL_WIDTHS)
    t.setStyle(TABLE_STYLE)
    doc.build([
        Paragraph("Purchase Order #PO-2026-0441", styles["Title"]),
        Spacer(1, 6),
        Paragraph("Vendor: PremiumSpec Industrial Materials Ltd.", styles["Normal"]),
        Spacer(1, 15),
        t,
        Spacer(1, 15),
        Paragraph("Subtotal: $3,222.50 | Tax (8%): $257.80 | Total: $3,480.30", styles["Normal"]),
    ])


if __name__ == "__main__":
    print("Generating comparison table PDFs...")
    save_pdf(gen_pdf_a, "comparison_table_A_short.pdf")
    save_pdf(gen_pdf_b, "comparison_table_B_detailed.pdf")
    print("\nDone! 2 comparison PDFs generated.")
