"""Centralized configuration from environment variables."""

import os


STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "")
AZURE_STORAGE_PDFS_CONTAINER = os.getenv("AZURE_STORAGE_PDFS_CONTAINER", "pdfs")
AZURE_STORAGE_TEMPLATES_CONTAINER = os.getenv("AZURE_STORAGE_TEMPLATES_CONTAINER", "templates")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
