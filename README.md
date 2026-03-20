# BCS - PDF Data Extractor

Deterministic PDF data extraction using template-based bounding boxes. No AI — pure algorithmic extraction with configurable field pipelines and validation rules.

Draw fields on a PDF, save as a template, then extract structured data from any PDF with the same layout. Supports two-file comparison mode for cross-document validation (e.g., receipt vs invoice).

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # macOS/Linux
# .venv\Scripts\activate     # Windows
pip install -e .
```

### Frontend

```bash
cd frontend
npm install
```

## Running

Start both the backend and frontend in separate terminals:

**Backend** (runs on http://localhost:8000):

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

**Frontend** (runs on http://localhost:5173):

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## How It Works

1. **Upload PDFs** — click Upload in the header to add PDF files
2. **Create a template** — draw bounding boxes on the PDF to define fields:
   - **Static fields** — fixed position extraction (blue boxes)
   - **Dynamic fields** — anchor text + value offset (amber anchor + blue value)
3. **Add validation rules** — per-field rules like data type checks, range limits, regex patterns, cross-field comparisons
4. **Test** — run the template against any PDF with the same layout to extract and validate data
5. **Comparison mode** — work with two PDFs side by side and create cross-document field comparisons

## Project Structure

```
bcs/
├── backend/                     # Python FastAPI
│   ├── main.py                  # App entry point, CORS config
│   ├── routers/
│   │   ├── pdfs.py              # PDF upload, serve, list, delete
│   │   ├── templates.py         # Template CRUD
│   │   └── extract.py           # Extraction + testing endpoints
│   ├── services/
│   │   ├── pdf_service.py       # pdfplumber text extraction, anchor search
│   │   ├── extraction_service.py # Rule validation, two-pass extraction
│   │   ├── chain_engine.py      # Configurable extraction pipeline engine
│   │   └── template_store.py    # JSON file storage
│   ├── models/schemas.py        # Pydantic models
│   └── storage/                 # Runtime data (gitignored)
│       ├── uploads/             # Uploaded PDFs
│       └── templates/           # Saved templates
│
└── frontend/                    # React + TypeScript + Tailwind + Vite
    └── src/
        ├── App.tsx              # Main layout
        ├── components/          # UI components
        ├── store/appStore.ts    # Zustand state management
        ├── hooks/               # Custom React hooks
        ├── api/client.ts        # Backend API client
        ├── types/index.ts       # TypeScript type definitions
        └── utils/coords.ts      # Coordinate conversion utilities
```

## API

The backend runs a REST API on port 8000. Key endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/pdfs/upload` | Upload a PDF |
| GET | `/pdfs` | List uploaded PDFs |
| GET | `/pdfs/{id}` | Serve a PDF file |
| DELETE | `/pdfs/{id}` | Delete a PDF |
| POST | `/templates` | Create a template |
| GET | `/templates` | List templates |
| PUT | `/templates/{id}` | Update a template |
| DELETE | `/templates/{id}` | Delete a template |
| POST | `/extract` | Extract using a saved template |
| POST | `/test` | Test with inline fields |

API docs available at http://localhost:8000/docs when the backend is running.
