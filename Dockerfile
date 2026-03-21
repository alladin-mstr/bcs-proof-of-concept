# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + static assets
FROM python:3.12-slim
WORKDIR /app

# Install build system + dependencies from pyproject.toml (layer caching)
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir hatchling && pip install --no-cache-dir .

# Copy backend source
COPY backend/ ./

# Copy built frontend into static/ directory
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
