"""Centralized configuration from environment variables."""

import os


STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "")
AZURE_STORAGE_PDFS_CONTAINER = os.getenv("AZURE_STORAGE_PDFS_CONTAINER", "pdfs")
AZURE_STORAGE_TEMPLATES_CONTAINER = os.getenv("AZURE_STORAGE_TEMPLATES_CONTAINER", "templates")
AZURE_STORAGE_TEST_RUNS_CONTAINER = os.getenv("AZURE_STORAGE_TEST_RUNS_CONTAINER", "test-runs")
AZURE_STORAGE_CONTROLES_CONTAINER = os.getenv("AZURE_STORAGE_CONTROLES_CONTAINER", "controles")
AZURE_STORAGE_CONTROLE_RUNS_CONTAINER = os.getenv("AZURE_STORAGE_CONTROLE_RUNS_CONTAINER", "controle-runs")
AZURE_STORAGE_KLANTEN_CONTAINER = os.getenv("AZURE_STORAGE_KLANTEN_CONTAINER", "klanten")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
