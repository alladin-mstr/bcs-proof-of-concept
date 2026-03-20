import re

import pdfplumber
from models.schemas import Region


def extract_text_from_region(pdf_path: str, region: Region) -> str:
    """Extract text from a normalized region of a PDF page."""
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = region.page - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return ""
        page = pdf.pages[page_idx]
        abs_bbox = (
            region.x * float(page.width),
            region.y * float(page.height),
            (region.x + region.width) * float(page.width),
            (region.y + region.height) * float(page.height),
        )
        cropped = page.crop(abs_bbox)
        return (cropped.extract_text() or "").strip()


def get_page_count(pdf_path: str) -> int:
    with pdfplumber.open(pdf_path) as pdf:
        return len(pdf.pages)


def _group_words_into_lines(words: list[dict]) -> list[list[dict]]:
    """Group words into lines by similar y positions (within 3pt tolerance)."""
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (round(float(w["top"]) / 3), float(w["x0"]))):
        placed = False
        for line in lines:
            if abs(float(word["top"]) - float(line[0]["top"])) < 3:
                line.append(word)
                placed = True
                break
        if not placed:
            lines.append([word])
    return lines


def _find_matching_lines(
    lines: list[list[dict]], expected_text: str
) -> list[list[dict]]:
    """Return lines whose text matches the expected anchor text."""
    norm_expected = expected_text.lower().strip().rstrip(":").strip()
    matches = []
    for line in lines:
        line_text = " ".join(w["text"] for w in line)
        norm_line = line_text.lower().strip().rstrip(":").strip()
        if norm_expected in norm_line or norm_line in norm_expected:
            matches.append(line)
    return matches


def search_anchor_slide(
    pdf_path: str,
    anchor_region: Region,
    expected_text: str,
    slide_tolerance: float = 0.3,
) -> dict | None:
    """Search for anchor text by sliding the anchor region vertically.

    Expands the anchor region vertically by +/-slide_tolerance (normalized),
    then searches within that expanded area for the expected text.

    Returns dict with:
      - found_y: normalized y position where anchor was found
      - dy: normalized vertical offset from original position
      - actual_text: text found at that position
    Or None if not found.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = anchor_region.page - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        # Expand the search area vertically
        search_y_top = max(0.0, anchor_region.y - slide_tolerance)
        search_y_bottom = min(1.0, anchor_region.y + anchor_region.height + slide_tolerance)

        search_bbox = (
            anchor_region.x * pw,
            search_y_top * ph,
            (anchor_region.x + anchor_region.width) * pw,
            search_y_bottom * ph,
        )

        # Get all words in the search area
        # pdfplumber crop keeps coordinates in the original page coordinate system
        cropped = page.crop(search_bbox)
        words = cropped.extract_words()
        if not words:
            return None

        lines = _group_words_into_lines(words)
        matching_lines = _find_matching_lines(lines, expected_text)

        if not matching_lines:
            return None

        # Pick the line closest to the original anchor y position
        original_y_abs = anchor_region.y * ph
        best_line = min(
            matching_lines,
            key=lambda line: abs(float(line[0]["top"]) - original_y_abs),
        )

        # word["top"] is in original page coordinates (crop does not translate)
        found_y_norm = float(best_line[0]["top"]) / ph
        original_y = anchor_region.y
        dy = found_y_norm - original_y

        line_text = " ".join(w["text"] for w in best_line)

        return {
            "found_y": found_y_norm,
            "dy": dy,
            "actual_text": line_text.strip(),
        }


def search_anchor_fullpage(
    pdf_path: str,
    page_num: int,
    expected_text: str,
    original_anchor_region: Region,
) -> dict | None:
    """Search the entire page for the expected anchor text.

    Returns dict with:
      - found_x: normalized x position
      - found_y: normalized y position
      - dx: normalized horizontal offset from original position
      - dy: normalized vertical offset from original position
      - actual_text: text found
    Or None if not found.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        # No crop -- coordinates are already in page space
        words = page.extract_words()
        if not words:
            return None

        lines = _group_words_into_lines(words)
        matching_lines = _find_matching_lines(lines, expected_text)

        if not matching_lines:
            return None

        # Build candidate results and rank by distance from original position
        matches = []
        for line in matching_lines:
            found_x = float(line[0]["x0"]) / pw
            found_y = float(line[0]["top"]) / ph

            dx = found_x - original_anchor_region.x
            dy = found_y - original_anchor_region.y

            distance = (dx ** 2 + dy ** 2) ** 0.5
            line_text = " ".join(w["text"] for w in line)

            matches.append({
                "found_x": found_x,
                "found_y": found_y,
                "dx": dx,
                "dy": dy,
                "actual_text": line_text.strip(),
                "distance": distance,
            })

        # Return the closest match
        matches.sort(key=lambda m: m["distance"])
        best = matches[0]
        del best["distance"]
        return best


def extract_text_from_shifted_region(
    pdf_path: str,
    region: Region,
    dx: float,
    dy: float,
) -> str:
    """Extract text from a region shifted by (dx, dy) in normalized coordinates."""
    shifted = Region(
        page=region.page,
        x=max(0.0, min(1.0, region.x + dx)),
        y=max(0.0, min(1.0, region.y + dy)),
        width=region.width,
        height=region.height,
    )
    return extract_text_from_region(pdf_path, shifted)


def detect_value_format(text: str) -> str:
    """Detect the format of an extracted value.

    Returns: "currency", "number", "integer", "date", or "string"
    """
    stripped = text.strip()
    if not stripped:
        return "string"

    # Currency: starts with currency symbol or ends with currency-like pattern
    currency_pattern = r'^[\$€£¥₹]\s*[\d,]+\.?\d*$|^[\d,]+\.?\d*\s*[\$€£¥₹]$'
    if re.match(currency_pattern, stripped):
        return "currency"

    # Also check for patterns like "$1,234.56" with commas
    cleaned = stripped
    for symbol in ["$", "€", "£", "¥", "₹"]:
        cleaned = cleaned.replace(symbol, "")
    cleaned = cleaned.strip().replace(",", "")
    if cleaned:
        try:
            float_val = float(cleaned)
            # If original had currency symbol, it's currency
            if stripped[0] in "$€£¥₹" or stripped[-1] in "$€£¥₹":
                return "currency"
            # Check if integer
            if float_val == int(float_val) and "." not in cleaned:
                return "integer"
            return "number"
        except ValueError:
            pass

    # Date patterns
    date_patterns = [
        r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}",
        r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}",
        r"[A-Za-z]+ \d{1,2},? \d{4}",
        r"\d{1,2} [A-Za-z]+ \d{4}",
    ]
    if any(re.search(p, stripped) for p in date_patterns):
        return "date"

    return "string"


def matches_format(text: str, fmt: str) -> bool:
    """Check if text matches the expected format."""
    detected = detect_value_format(text)
    if fmt == detected:
        return True
    # Number matches currency and integer too
    if fmt == "number" and detected in ("currency", "integer", "number"):
        return True
    # Currency: also accept plain numbers
    if fmt == "currency" and detected in ("number", "integer"):
        return True
    return False


def search_value_near_anchor(
    pdf_path: str,
    page_num: int,
    anchor_x: float,
    anchor_y: float,
    anchor_width: float,
    value_format: str | None,
    search_direction: str = "right",
) -> str | None:
    """Search for a value near a found anchor position.

    Scans the same line as the anchor, looking to the right (or specified direction)
    for text that matches the expected value format.

    Args:
        pdf_path: Path to PDF file
        page_num: 1-indexed page number
        anchor_x: normalized x position of found anchor
        anchor_y: normalized y position of found anchor
        anchor_width: normalized width of anchor region
        value_format: expected format ("currency", "number", "date", etc.) or None
        search_direction: "right" (default) -- where to look relative to anchor

    Returns dict with text, x, y, width (normalized) or None if not found.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        # Get all words on the page
        words = page.extract_words()
        if not words:
            return None

        anchor_y_abs = anchor_y * ph
        anchor_right_abs = (anchor_x + anchor_width) * pw

        # Find words on the same line as the anchor (within 5pt y tolerance)
        same_line_words = []
        for w in words:
            if abs(float(w["top"]) - anchor_y_abs) < 5:
                same_line_words.append(w)

        if not same_line_words:
            return None

        # Sort by x position
        same_line_words.sort(key=lambda w: float(w["x0"]))

        if search_direction == "right":
            # Get words to the right of the anchor
            right_words = [w for w in same_line_words if float(w["x0"]) > anchor_right_abs - 5]
            if not right_words:
                return None

            # Build text from consecutive right-side words
            # Group into clusters (words within 15pt of each other)
            clusters: list[list[dict]] = []
            for w in right_words:
                if clusters and float(w["x0"]) - float(clusters[-1][-1]["x1"]) < 15:
                    clusters[-1].append(w)
                else:
                    clusters.append([w])

            # Try each cluster
            for cluster in clusters:
                text = " ".join(w["text"] for w in cluster).strip()
                if not text:
                    continue

                if value_format:
                    if matches_format(text, value_format):
                        cx = float(cluster[0]["x0"]) / pw
                        cy = float(cluster[0]["top"]) / ph
                        cw = (float(cluster[-1]["x1"]) - float(cluster[0]["x0"])) / pw
                        return {"text": text, "x": cx, "y": cy, "width": cw}
                else:
                    cx = float(cluster[0]["x0"]) / pw
                    cy = float(cluster[0]["top"]) / ph
                    cw = (float(cluster[-1]["x1"]) - float(cluster[0]["x0"])) / pw
                    return {"text": text, "x": cx, "y": cy, "width": cw}

        return None
