import re

import pdfplumber
from models.schemas import Region


def _clean_utf16_text(text: str) -> str:
    """Strip UTF-16 encoding artifacts (BOM markers, null bytes) from text."""
    if '\x00' in text or '\ufffd' in text:
        return text.replace('\ufffd', '').replace('\x00', '')
    return text


def _get_form_field_words(page, pw: float, ph: float) -> list[dict]:
    """Extract form field values as word-like dicts from PDF annotations.

    PDF form fields (Widget annotations) store values separately from
    the page text stream. This function reads those values and returns
    them in the same format as pdfplumber's extract_words(), so they
    can be used alongside regular text extraction.
    """
    words = []
    annots = page.annots if hasattr(page, 'annots') and page.annots else []
    for annot in annots:
        data = annot.get('data', {})
        if str(data.get('Subtype', '')) != "/'Widget'":
            continue
        v = data.get('V', '')
        if isinstance(v, bytes):
            # Try UTF-16 first (PDF form fields may use UTF-16 BE with BOM)
            if v[:2] in (b'\xfe\xff', b'\xff\xfe'):
                v = v.decode('utf-16', errors='replace')
            else:
                v = v.decode('utf-8', errors='replace')
        v = str(v).strip()
        # PDF checkbox/radio values come as PDF name objects like /'Off', /'Yes', /'1'
        if v.startswith("/'") and v.endswith("'"):
            v = v[2:-1]  # strip /' and trailing '
        elif v.startswith('/'):
            v = v[1:]
        # Map common checkbox states to readable values
        if v.lower() in ('off', ''):
            continue  # unchecked — skip
        if v.lower() in ('yes', '1', 'on', 'true'):
            v = 'Ja'
        if not v or v in ('Kies...',):
            continue
        rect = data.get('Rect', [])
        if len(rect) < 4:
            continue
        x0, y0_pdf, x1, y1_pdf = [float(r) for r in rect]
        # PDF annotations use bottom-left origin; convert to top-left
        top = ph - y1_pdf
        bottom = ph - y0_pdf
        for token in v.split():
            words.append({
                'text': token,
                'x0': x0,
                'x1': x1,
                'top': top,
                'bottom': bottom,
                '_form_field': True,
            })
    return words


def _extract_form_field_text_in_bbox(page, abs_bbox: tuple, pw: float, ph: float) -> str:
    """Extract form field values that fall within a bounding box."""
    x0, y0, x1, y1 = abs_bbox
    texts = []
    for w in _get_form_field_words(page, pw, ph):
        # Use midpoint check — widget Rects can overlap between fields
        wmx = (float(w['x0']) + float(w['x1'])) / 2
        wmy = (float(w['top']) + float(w['bottom'])) / 2
        if wmx >= x0 and wmx <= x1 and wmy >= y0 and wmy <= y1:
            texts.append(w['text'])
    return " ".join(texts)


def extract_text_from_region(pdf_path: str, region: Region) -> str:
    """Extract text from a normalized region of a PDF page.

    Uses character-level filtering: only characters whose x-midpoint falls
    within the region are included. This gives exact-box extraction — if the
    box cuts through a word, only the characters inside are returned.

    Extracts both regular page text and form field (annotation) values.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = region.page - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return ""
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)
        abs_bbox = (
            region.x * pw,
            region.y * ph,
            (region.x + region.width) * pw,
            (region.y + region.height) * ph,
        )
        x0, y0, x1, y1 = abs_bbox

        # Character-level extraction for exact box cutting
        chars = page.chars
        matched = []
        for c in chars:
            cx = (float(c['x0']) + float(c['x1'])) / 2
            cy = (float(c['top']) + float(c['bottom'])) / 2
            if cx >= x0 and cx <= x1 and cy >= y0 and cy <= y1:
                matched.append(c)

        # Also collect form field words in the region
        form_words = _get_form_field_words(page, pw, ph)
        form_matched = []
        for w in form_words:
            wmx = (float(w['x0']) + float(w['x1'])) / 2
            wmy = (float(w['top']) + float(w['bottom'])) / 2
            if wmx >= x0 and wmx <= x1 and wmy >= y0 and wmy <= y1:
                form_matched.append(w)

        # Merge chars and form field words into unified line-based output
        if matched or form_matched:
            # Build list of (top, x0, text_fragment) items for sorting
            items: list[tuple[float, float, str]] = []

            if matched:
                matched.sort(key=lambda c: (float(c['top']), float(c['x0'])))
                current_line: list[dict] = []
                last_top = None
                for c in matched:
                    ctop = round(float(c['top']), 1)
                    if last_top is not None and abs(ctop - last_top) > 3:
                        items.append((float(current_line[0]['top']), float(current_line[0]['x0']), _chars_to_text(current_line)))
                        current_line = []
                    current_line.append(c)
                    last_top = ctop
                if current_line:
                    items.append((float(current_line[0]['top']), float(current_line[0]['x0']), _chars_to_text(current_line)))

            for w in form_matched:
                # Form field Rect x0 spans the whole widget box, which often
                # starts before the visible label chars.  Use x1 (right edge)
                # as sort key so form values land after label text.
                items.append((float(w['top']), float(w['x1']), w['text']))

            # Group items into lines using vertical proximity, then sort
            # each line by horizontal position.
            # First, sort by y to cluster.
            items.sort(key=lambda t: t[0])
            line_groups: list[list[tuple[float, float, str]]] = []
            for item in items:
                placed = False
                for group in line_groups:
                    # Use vertical midpoint of the group for comparison
                    group_y = sum(i[0] for i in group) / len(group)
                    if abs(item[0] - group_y) <= 6:
                        group.append(item)
                        placed = True
                        break
                if not placed:
                    line_groups.append([item])
            # Sort groups by their top-most y, then items within by x
            line_groups.sort(key=lambda g: min(i[0] for i in g))
            lines: list[str] = []
            for group in line_groups:
                group.sort(key=lambda t: t[1])
                lines.append(" ".join(t[2] for t in group))
            text = "\n".join(lines).strip()
            if text:
                return text

        return ""


def _chars_to_text(chars: list[dict]) -> str:
    """Convert a list of character dicts to text, inserting spaces at gaps."""
    if not chars:
        return ""
    chars.sort(key=lambda c: float(c['x0']))
    parts = []
    for i, c in enumerate(chars):
        if i > 0:
            gap = float(c['x0']) - float(chars[i - 1]['x1'])
            avg_width = (float(c['x1']) - float(c['x0']))
            if gap > avg_width * 0.3:
                parts.append(" ")
        parts.append(c.get('text', ''))
    return _clean_utf16_text("".join(parts))


def resolve_extraction_region(
    pdf_path: str, region: Region, extraction_mode: str
) -> tuple[Region, str]:
    """Expand a region according to extraction_mode and extract text.

    Returns (resolved_region, text). For 'strict' mode, resolved_region == region.
    """
    if extraction_mode == "strict":
        text = extract_text_from_region(pdf_path, region)
        return (region, text)

    if extraction_mode == "edge":
        expanded = Region(
            page=region.page, x=region.x, y=region.y,
            width=1.0 - region.x, height=region.height,
        )
        text = extract_text_from_region(pdf_path, expanded)
        return (expanded, text)

    from pdfminer.layout import LTTextBox, LTTextLine

    with pdfplumber.open(pdf_path, laparams={
        "boxes_flow": 0.5, "line_margin": 1.0, "word_margin": 0.1,
    }) as pdf:
        page_idx = region.page - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return (region, "")
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        # Absolute bbox of the drawn region
        ax0 = region.x * pw
        ay0 = region.y * ph
        ax1 = (region.x + region.width) * pw
        ay1 = (region.y + region.height) * ph

        if extraction_mode == "word":
            words = page.extract_words() + _get_form_field_words(page, pw, ph)
            # Find words whose horizontal midpoint falls within the drawn region
            matched = []
            for w in words:
                wx0, wx1 = float(w['x0']), float(w['x1'])
                wy0 = float(w['top'])
                wy1 = float(w['bottom'])
                wmx = (wx0 + wx1) / 2
                if w.get('_form_field'):
                    # Form field words share the widget Rect which can be
                    # imprecise / overlapping — require vertical midpoint
                    # to fall inside the region.
                    wmy = (wy0 + wy1) / 2
                    if wmx >= ax0 and wmx <= ax1 and wmy >= ay0 and wmy <= ay1:
                        matched.append(w)
                else:
                    if wmx >= ax0 and wmx <= ax1 and wy1 > ay0 and wy0 < ay1:
                        matched.append(w)
            if not matched:
                text = extract_text_from_region(pdf_path, region)
                return (region, text)
            # Expand right edge to include full words (only page words, not form fields
            # whose x1 spans the entire widget box)
            page_word_x1s = [float(w['x1']) for w in matched if not w.get('_form_field')]
            new_x1 = max(page_word_x1s) if page_word_x1s else ax1
            new_x1 = max(new_x1, ax1)  # Never shrink
            expanded = Region(
                page=region.page,
                x=region.x, y=region.y,
                width=new_x1 / pw - region.x,
                height=region.height,
            )
            text = " ".join(w['text'] for w in sorted(matched, key=lambda w: (float(w['top']), float(w['x0']))))
            return (expanded, _clean_utf16_text(text))

        if extraction_mode == "line":
            # Find LTTextLine elements overlapping the drawn region
            new_x1 = ax1
            found_lines = []
            for element in page.layout:
                if not isinstance(element, LTTextBox):
                    continue
                for child in element:
                    if not isinstance(child, LTTextLine):
                        continue
                    lb = child.bbox  # (x0, y0_bottom, x1, y1_top) — bottom-left origin
                    lx0, ly0, lx1, ly1 = lb[0], (ph - lb[3]), lb[2], (ph - lb[1])
                    # Check vertical + horizontal overlap
                    if lx1 > ax0 and lx0 < ax1 and ly1 > ay0 and ly0 < ay1:
                        new_x1 = max(new_x1, lx1)
                        found_lines.append(child)
            if not found_lines:
                text = extract_text_from_region(pdf_path, region)
                return (region, text)
            expanded = Region(
                page=region.page,
                x=region.x, y=region.y,
                width=new_x1 / pw - region.x,
                height=region.height,
            )
            text = extract_text_from_region(pdf_path, expanded)
            return (expanded, text)

        if extraction_mode == "paragraph":
            # Find LTTextBox block overlapping the drawn region
            best_block = None
            best_overlap = 0
            for element in page.layout:
                if not isinstance(element, LTTextBox):
                    continue
                bb = element.bbox  # (x0, y0_bottom, x1, y1_top)
                bx0, by0, bx1, by1 = bb[0], (ph - bb[3]), bb[2], (ph - bb[1])
                # Check overlap
                ox0, oy0 = max(bx0, ax0), max(by0, ay0)
                ox1, oy1 = min(bx1, ax1), min(by1, ay1)
                if ox0 < ox1 and oy0 < oy1:
                    overlap = (ox1 - ox0) * (oy1 - oy0)
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_block = element
            if best_block is None:
                text = extract_text_from_region(pdf_path, region)
                return (region, text)
            bb = best_block.bbox
            expanded = Region(
                page=region.page,
                x=bb[0] / pw,
                y=(ph - bb[3]) / ph,
                width=(bb[2] - bb[0]) / pw,
                height=(bb[3] - bb[1]) / ph,
            )
            text = _clean_utf16_text(best_block.get_text().strip())
            return (expanded, text)

    # Fallback
    text = extract_text_from_region(pdf_path, region)
    return (region, text)


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


def find_end_anchor_y(
    pdf_path: str,
    page_num: int,
    expected_text: str,
    below_y: float = 0.0,
) -> float | None:
    """Search for text on a page and return its top-y (normalized).

    Only considers matches whose top-y is at or below `below_y`.
    Returns the y-position of the closest match below `below_y`, or None.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        words = page.extract_words()
        if not words:
            return None

        lines = _group_words_into_lines(words)
        matching_lines = _find_matching_lines(lines, expected_text)

        if not matching_lines:
            return None

        candidates = []
        for line in matching_lines:
            line_y = float(line[0]["top"]) / ph
            if line_y >= below_y - 0.01:  # small tolerance
                candidates.append(line_y)

        if not candidates:
            return None

        # Return the closest match below the start y
        candidates.sort()
        return candidates[0]


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


def search_anchor_word_position(
    pdf_path: str,
    page_num: int,
    expected_text: str,
    original_x: float = 0.0,
    original_y: float = 0.0,
    constrain_region: Region | None = None,
    prefer_axis: str | None = None,
) -> dict | None:
    """Search for anchor text and return the position of the matching WORDS, not the line.

    Unlike search_anchor_fullpage which returns line-start position, this returns
    the exact position of the matching word sequence. Critical for bracket intersection
    where we need the column position of a specific header word.

    If constrain_region is provided, only searches within that region.

    prefer_axis controls disambiguation when multiple matches exist:
      - "x": prefer matches at similar x to original (for column anchors — same column)
      - "y": prefer matches at similar y to original (for row anchors — same row)
      - None: rank by Euclidean distance (default)

    Returns dict with found_x, found_y, dx, dy, actual_text, width, height, or None.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        if constrain_region:
            search_bbox = (
                constrain_region.x * pw,
                constrain_region.y * ph,
                (constrain_region.x + constrain_region.width) * pw,
                (constrain_region.y + constrain_region.height) * ph,
            )
            cropped = page.crop(search_bbox)
            words = cropped.extract_words()
        else:
            words = page.extract_words()
        if not words:
            return None

        norm_expected = expected_text.lower().strip().rstrip(":").strip()
        lines = _group_words_into_lines(words)
        matches = []

        for line in lines:
            line_text = " ".join(w["text"] for w in line).lower().strip()
            if norm_expected not in line_text:
                continue
            # Find the shortest matching word sequence that fully contains expected text
            best_in_line = None
            for start_idx in range(len(line)):
                for end_idx in range(start_idx + 1, len(line) + 1):
                    sub_text = " ".join(w["text"] for w in line[start_idx:end_idx])
                    sub_norm = sub_text.lower().strip().rstrip(":").strip()
                    # sub must contain expected (not the reverse — prevents partial matches)
                    if norm_expected in sub_norm:
                        word_count = end_idx - start_idx
                        if best_in_line is None or word_count < best_in_line[0]:
                            sub_words = line[start_idx:end_idx]
                            best_in_line = (word_count, sub_words, sub_text)
            if best_in_line:
                _, sub_words, sub_text = best_in_line
                fx = float(sub_words[0]["x0"]) / pw
                fy = float(sub_words[0]["top"]) / ph
                fw = (float(sub_words[-1]["x1"]) - float(sub_words[0]["x0"])) / pw
                fh = (float(sub_words[0]["bottom"]) - float(sub_words[0]["top"])) / ph
                dist = ((fx - original_x) ** 2 + (fy - original_y) ** 2) ** 0.5
                # Axis-weighted distance for bracket disambiguation
                if prefer_axis == "x":
                    # Column anchor: prioritize same x (same column), y can differ
                    axis_dist = abs(fx - original_x) * 10 + abs(fy - original_y)
                elif prefer_axis == "y":
                    # Row anchor: prioritize same y (same row), x can differ
                    axis_dist = abs(fy - original_y) * 10 + abs(fx - original_x)
                else:
                    axis_dist = dist
                matches.append({
                    "found_x": fx, "found_y": fy,
                    "width": fw, "height": fh,
                    "dx": fx - original_x, "dy": fy - original_y,
                    "actual_text": sub_text.strip(),
                    "distance": axis_dist,
                })

        if not matches:
            return None

        matches.sort(key=lambda m: m["distance"])
        best = matches[0]
        del best["distance"]
        return best


def search_anchor_in_region(
    pdf_path: str,
    page_num: int,
    expected_text: str,
    search_region: Region,
    original_x: float = 0.0,
    original_y: float = 0.0,
) -> dict | None:
    """Search for anchor text within a bounded region of the page.

    Like search_anchor_fullpage but constrained to search_region.
    Returns dict with found_x, found_y, dx, dy, actual_text, or None.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return None
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        search_bbox = (
            search_region.x * pw,
            search_region.y * ph,
            (search_region.x + search_region.width) * pw,
            (search_region.y + search_region.height) * ph,
        )
        cropped = page.crop(search_bbox)
        words = cropped.extract_words()
        if not words:
            return None

        lines = _group_words_into_lines(words)
        matching_lines = _find_matching_lines(lines, expected_text)
        if not matching_lines:
            return None

        matches = []
        for line in matching_lines:
            found_x = float(line[0]["x0"]) / pw
            found_y = float(line[0]["top"]) / ph
            dx = found_x - original_x
            dy = found_y - original_y
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

        # Get all words on the page (including form field values)
        words = page.extract_words()
        words.extend(_get_form_field_words(page, pw, ph))
        if not words:
            return None

        anchor_y_abs = anchor_y * ph
        anchor_right_abs = (anchor_x + anchor_width) * pw

        # Find words on the same line as the anchor (within 10pt y tolerance).
        # Form field annotations can be offset a few points from the label text,
        # so we use a slightly wider tolerance than pure text matching.
        same_line_words = []
        for w in words:
            if abs(float(w["top"]) - anchor_y_abs) < 10:
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


def get_page_layout(pdf_path: str, page_num: int, line_margin: float = 1.0) -> list[dict]:
    """Extract layout blocks from a PDF page using pdfminer's LTTextBox tree.

    Uses pdfminer's layout analysis to group text into LTTextBox → LTTextLine
    hierarchy. The line_margin parameter controls grouping tightness:
      - 0.5: tight (many small blocks)
      - 1.0: default (good section-level grouping)
      - 2.0+: loose (large merged blocks)

    Returns a list of blocks, each with:
      - id: unique block identifier (b0, b1, ...)
      - text: full text of the block
      - bbox: { x, y, width, height } in normalized 0-1 coordinates
      - lines: list of { text, bbox } for each LTTextLine within the block
    """
    from pdfminer.layout import LTTextBox, LTTextLine

    with pdfplumber.open(pdf_path, laparams={
        "boxes_flow": 0.5,
        "line_margin": line_margin,
        "word_margin": 0.1,
    }) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return []
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        blocks = []
        block_idx = 0
        for element in page.layout:
            if not isinstance(element, LTTextBox):
                continue
            text = element.get_text().strip()
            if not text:
                continue

            # pdfminer bbox: (x0, y0_bottom, x1, y1_top) — bottom-left origin
            bb = element.bbox
            block = {
                "id": f"b{block_idx}",
                "text": text,
                "bbox": {
                    "x": bb[0] / pw,
                    "y": (ph - bb[3]) / ph,
                    "width": (bb[2] - bb[0]) / pw,
                    "height": (bb[3] - bb[1]) / ph,
                },
                "lines": [],
            }

            for child in element:
                if not isinstance(child, LTTextLine):
                    continue
                line_text = child.get_text().strip()
                if not line_text:
                    continue
                lb = child.bbox
                block["lines"].append({
                    "text": line_text,
                    "bbox": {
                        "x": lb[0] / pw,
                        "y": (ph - lb[3]) / ph,
                        "width": (lb[2] - lb[0]) / pw,
                        "height": (lb[3] - lb[1]) / ph,
                    },
                })

            blocks.append(block)
            block_idx += 1

        return blocks


def get_page_words(pdf_path: str, page_num: int) -> list[dict]:
    """Extract individual words with bounding boxes from a PDF page.

    Returns a list of dicts with:
      - text: the word text
      - x, y, width, height: normalized 0-1 coordinates
    """
    with pdfplumber.open(pdf_path) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return []
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        raw_words = page.extract_words() + _get_form_field_words(page, pw, ph)
        result = []
        for w in raw_words:
            x0 = float(w['x0']) / pw
            y0 = float(w['top']) / ph
            x1 = float(w['x1']) / pw
            y1 = float(w['bottom']) / ph
            result.append({
                "text": w['text'],
                "x": x0,
                "y": y0,
                "width": x1 - x0,
                "height": y1 - y0,
            })
        return result


def extract_table(
    pdf_path: str,
    page_num: int,
    table_region: dict,
    columns: list[dict],
    header_row: bool = True,
    key_column_id: str | None = None,
) -> list[dict]:
    """Extract structured table data from a PDF region.

    Uses pdfminer's LTTextLine elements to detect rows by y-position proximity,
    then assigns each text element to a column based on x-overlap.

    Args:
        pdf_path: Path to the PDF file.
        page_num: 1-indexed page number.
        table_region: Normalized bounding box {x, y, width, height, page}.
        columns: List of {id, label, x} sorted by x position. Each column's
                 width extends from its x to the next column's x (or table right edge).
        header_row: If True, skip the first detected row (treat as header).
        key_column_id: If set, the column that always has data in every real row.
                       Lines where this column is empty are merged into the row above.

    Returns:
        List of row dicts: [{col_label: cell_text, ...}, ...]
    """
    from pdfminer.layout import LTTextBox, LTTextLine

    with pdfplumber.open(pdf_path, laparams={
        "boxes_flow": 0.5,
        "line_margin": 0.5,   # Tight grouping for table rows
        "word_margin": 0.1,
    }) as pdf:
        page_idx = page_num - 1
        if page_idx < 0 or page_idx >= len(pdf.pages):
            return []
        page = pdf.pages[page_idx]
        pw, ph = float(page.width), float(page.height)

        # Table bounds (normalized)
        t_x = table_region["x"]
        t_y = table_region["y"]
        t_right = t_x + table_region["width"]
        t_bottom = t_y + table_region["height"]

        # Collect all LTTextLine elements within the table bounds
        text_lines: list[dict] = []
        for element in page.layout:
            if not isinstance(element, LTTextBox):
                continue
            for child in element:
                if not isinstance(child, LTTextLine):
                    continue
                line_text = child.get_text().strip()
                if not line_text:
                    continue
                lb = child.bbox  # (x0, y0_bottom, x1, y1_top) — bottom-left origin
                # Convert to normalized top-left origin
                nx = lb[0] / pw
                ny = (ph - lb[3]) / ph
                nw = (lb[2] - lb[0]) / pw
                nh = (lb[3] - lb[1]) / ph
                # Center points
                cx = nx + nw / 2
                cy = ny + nh / 2
                # Check if within table bounds
                if cx < t_x or cx > t_right or cy < t_y or cy > t_bottom:
                    continue
                text_lines.append({
                    "text": line_text,
                    "x": nx, "y": ny,
                    "width": nw, "height": nh,
                    "cx": cx, "cy": cy,
                })

        if not text_lines:
            return []

        # Sort by y position (top to bottom)
        text_lines.sort(key=lambda tl: tl["cy"])

        # Group into rows by y-proximity
        # Use median line height as the tolerance for grouping
        heights = [tl["height"] for tl in text_lines]
        heights.sort()
        median_h = heights[len(heights) // 2] if heights else 0.01
        y_tolerance = median_h * 0.6

        rows: list[list[dict]] = []
        current_row: list[dict] = [text_lines[0]]
        current_y = text_lines[0]["cy"]

        for tl in text_lines[1:]:
            if abs(tl["cy"] - current_y) <= y_tolerance:
                current_row.append(tl)
            else:
                rows.append(current_row)
                current_row = [tl]
                current_y = tl["cy"]
        rows.append(current_row)

        # Build column boundaries: each column spans from columns[i].x to columns[i+1].x
        sorted_cols = sorted(columns, key=lambda c: c["x"])
        col_bounds: list[tuple[float, float, str]] = []  # (left_x, right_x, label)
        for i, col in enumerate(sorted_cols):
            left = col["x"]
            if i + 1 < len(sorted_cols):
                right = sorted_cols[i + 1]["x"]
            else:
                right = t_right
            col_bounds.append((left, right, col["label"]))

        # Skip header row if configured
        data_rows = rows[1:] if header_row and len(rows) > 1 else rows

        # Resolve key column label from id
        key_col_label: str | None = None
        if key_column_id:
            for col in columns:
                if col["id"] == key_column_id:
                    key_col_label = col["label"]
                    break

        # Assign text elements to columns for each raw row
        raw_rows: list[dict[str, str]] = []
        for row_lines in data_rows:
            row_dict: dict[str, str] = {}
            for tl in row_lines:
                for left, right, label in col_bounds:
                    if left <= tl["cx"] < right:
                        if label in row_dict:
                            row_dict[label] += " " + tl["text"]
                        else:
                            row_dict[label] = tl["text"]
                        break
            # Ensure all columns are present
            for _, _, label in col_bounds:
                if label not in row_dict:
                    row_dict[label] = ""
            raw_rows.append(row_dict)

        # Merge rows using key column: if key column cell is empty, merge into previous row
        if key_col_label and raw_rows:
            merged: list[dict[str, str]] = []
            for row in raw_rows:
                if merged and not row.get(key_col_label, "").strip():
                    # Merge into previous row: append non-empty cell text
                    prev = merged[-1]
                    for label in prev:
                        cell = row.get(label, "").strip()
                        if cell:
                            prev[label] = (prev[label] + " " + cell).strip() if prev[label] else cell
                else:
                    merged.append(row)
            return merged

        return raw_rows


def find_anchor_in_blocks(
    pdf_path: str,
    page_num: int,
    expected_text: str,
    original_x: float = 0.0,
    original_y: float = 0.0,
) -> dict | None:
    """Find which layout block contains the anchor text.

    Returns dict with:
      - block_id: id of the matched block
      - block_text: full text of the block
      - block_bbox: { x, y, width, height } normalized
      - found_x, found_y: normalized position of the block
      - dx, dy: offset from original anchor position
      - candidates_found: how many blocks matched
    Or None if not found.
    """
    blocks = get_page_layout(pdf_path, page_num)
    if not blocks:
        return None

    norm_expected = expected_text.lower().strip().rstrip(":").strip()
    matches = []

    for block in blocks:
        block_text_lower = block["text"].lower()
        if norm_expected in block_text_lower or block_text_lower.rstrip(":").strip() in norm_expected:
            bx = block["bbox"]["x"]
            by = block["bbox"]["y"]
            dist = ((bx - original_x) ** 2 + (by - original_y) ** 2) ** 0.5
            matches.append({
                "block_id": block["id"],
                "block_text": block["text"],
                "block_bbox": block["bbox"],
                "found_x": bx,
                "found_y": by,
                "dx": bx - original_x,
                "dy": by - original_y,
                "distance": dist,
            })

    if not matches:
        return None

    matches.sort(key=lambda m: m["distance"])
    best = matches[0]
    best["candidates_found"] = len(matches)
    del best["distance"]
    return best


def extract_block_text(
    pdf_path: str,
    page_num: int,
    block_id: str,
    extract_mode: str = "same_block",
    anchor_text: str | None = None,
) -> dict | None:
    """Extract text from a layout block.

    Modes:
      - same_block: all text in the block
      - rest_of_block: text after the anchor text within the block
      - next_block: text from the block immediately below

    Returns dict with text, bbox (normalized) or None.
    """
    blocks = get_page_layout(pdf_path, page_num)
    if not blocks:
        return None

    target_idx = None
    for i, block in enumerate(blocks):
        if block["id"] == block_id:
            target_idx = i
            break

    if target_idx is None:
        return None

    target = blocks[target_idx]

    if extract_mode == "same_block":
        return {"text": target["text"], "bbox": target["bbox"]}

    if extract_mode == "rest_of_block" and anchor_text:
        full_text = target["text"]
        norm_anchor = anchor_text.lower().strip()
        lower_text = full_text.lower()
        idx = lower_text.find(norm_anchor)
        if idx >= 0:
            after = full_text[idx + len(anchor_text):].strip()
            if after.startswith(":"):
                after = after[1:].strip()
            return {
                "text": after if after else full_text,
                "bbox": target["bbox"],
            }
        return {"text": full_text, "bbox": target["bbox"]}

    if extract_mode == "next_block":
        target_bottom = target["bbox"]["y"] + target["bbox"]["height"]
        below_blocks = [
            b for b in blocks
            if b["bbox"]["y"] > target_bottom - 0.005 and b["id"] != block_id
        ]
        if not below_blocks:
            return None
        below_blocks.sort(key=lambda b: b["bbox"]["y"])
        next_block = below_blocks[0]
        return {"text": next_block["text"], "bbox": next_block["bbox"]}

    return None
