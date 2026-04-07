# Polaris Node — Signal Lookup Design

## Overview

Add a new "Polaris" node type to the rule graph editor that reads a spreadsheet (key column + signal column), looks up each signal code in the Regelbibliotheek translation rules, groups results by key, and outputs a structured table. The node appears in a new "Polaris" category tab in the Add Node menu.

## Node UI & Configuration

- **Category**: New "Polaris" tab in Add Node menu (one item: "Signal Lookup")
- **Color theme**: Purple/violet border and accent (distinct from existing node colors)
- **Configuration dropdowns** (inside the node card):
  - **Spreadsheet**: pick which uploaded spreadsheet file to read from
  - **Key column**: populated from spreadsheet headers (e.g. "Employee ID")
  - **Signal column**: populated from headers (e.g. "Signal")
- **Output handle**: right side, connectable to other nodes via `computed_ref`

## Backend — New Rule Type

### Serialization

`serializeGraph.ts` emits a `TemplateRule` with:

```json
{
  "type": "computation",
  "computation": {
    "operation": "polaris_lookup",
    "operands": [],
    "output_label": "Polaris Lookup",
    "polaris_config": {
      "spreadsheet_id": "...",
      "key_column": "Employee ID",
      "signal_column": "Signal"
    }
  }
}
```

### Rule Engine

`RuleEngine.evaluate_computation()` handles `"polaris_lookup"`:

1. Read the spreadsheet grid from `self.grid_data[spreadsheet_id]`
2. Find key and signal column indices from headers
3. For each row, look up the signal code in `self.translation_rules` dict
4. Group by key column value
5. Store result as JSON string in `self.computed[rule.id]`

### Translation Rules — Backend

Translation rules are currently frontend-only demo data. Move them to the backend:

- New Pydantic model: `TranslationRule(id, code, rapport, teamId, teamName, translation, lastModified)`
- New store: `services/translation_rules_store.py` — JSON-based CRUD (mirrors existing storage pattern)
- New router: `routers/translation_rules.py` — `GET /translation-rules` endpoint
- Seed with existing demo data on first access
- `run_controle` handler loads translation rules and passes them to `RuleEngine`

### Computed Result Format

```json
{
  "emp A": [
    {"code": "P003", "translation": "Ingangsdatum functie..."},
    {"code": "P0047", "translation": "Geboortedatum is niet..."}
  ],
  "emp B": [
    {"code": "P0012", "translation": "Adresgegevens ontbreken..."}
  ]
}
```

## Results Display

When run results contain a `polaris_lookup` computed value, Results.tsx parses the JSON and renders a grouped table:

| Key (Employee ID) | Signalen |
|-|-|
| emp A | • P003 — Ingangsdatum functie ligt voor aanvang...<br>• P0047 — Geboortedatum is niet ingevuld... |
| emp B | • P0012 — Adresgegevens ontbreken... |

Styled consistently with the existing "Gecombineerd terugkoppelbestand" table in Results.tsx.

## Connectable Output

The JSON string is stored in `self.computed[rule.id]`, so downstream nodes reference it via `computed_ref`. Useful for "is not empty" checks or count-based validations on the grouped result.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/types/index.ts` | Add `"polaris_lookup"` to `RuleNodeType`, add `polarisConfig` fields to `RuleNodeData` and `ComputationConfig` |
| `frontend/src/components/rules/RuleNodes.tsx` | New `PolarisLookupNode` component |
| `frontend/src/components/rules/RulesPanel.tsx` | Add "Polaris" category + menu item |
| `frontend/src/components/rules/serializeGraph.ts` | Handle polaris_lookup serialization |
| `frontend/src/pages/Results.tsx` | Render polaris lookup results as grouped table |
| `backend/models/schemas.py` | Add `polaris_config` to `ComputationConfig`, add `TranslationRule` model |
| `backend/services/rule_engine.py` | Handle `"polaris_lookup"` in `evaluate_computation` |
| `backend/routers/controles.py` | Load translation rules and pass to `RuleEngine` |
| `backend/routers/translation_rules.py` | New router: `GET /translation-rules` |
| `backend/services/translation_rules_store.py` | New store: JSON-based CRUD for translation rules |
