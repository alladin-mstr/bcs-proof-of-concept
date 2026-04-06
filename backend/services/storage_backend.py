"""Storage abstraction: local filesystem or Azure Blob Storage."""

from __future__ import annotations

import json
import tempfile
from abc import ABC, abstractmethod
from contextlib import contextmanager
from pathlib import Path


class StorageBackend(ABC):
    """Abstract storage interface for PDFs, templates, and metadata."""

    # -- PDFs --

    @abstractmethod
    def upload_pdf(self, pdf_id: str, content: bytes) -> None: ...

    @abstractmethod
    @contextmanager
    def pdf_temp_path(self, pdf_id: str):
        """Yield a local file path for pdfplumber. Cleaned up after use."""
        ...

    @abstractmethod
    def pdf_exists(self, pdf_id: str) -> bool: ...

    @abstractmethod
    def delete_pdf(self, pdf_id: str) -> None: ...

    @abstractmethod
    def get_pdf_response_path(self, pdf_id: str) -> str:
        """Return a path suitable for FileResponse (local only) or raise."""
        ...

    # -- Metadata --

    @abstractmethod
    def load_metadata(self) -> dict: ...

    @abstractmethod
    def save_metadata(self, data: dict) -> None: ...

    # -- Templates --

    @abstractmethod
    def save_template(self, template_id: str, content: str) -> None: ...

    @abstractmethod
    def get_template(self, template_id: str) -> str | None: ...

    @abstractmethod
    def list_template_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_template(self, template_id: str) -> bool: ...

    # -- Test Runs --

    @abstractmethod
    def save_test_run(self, run_id: str, content: str) -> None: ...

    @abstractmethod
    def get_test_run(self, run_id: str) -> str | None: ...

    @abstractmethod
    def list_test_run_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_test_run(self, run_id: str) -> bool: ...

    # -- Controle Runs --

    @abstractmethod
    def save_controle_run(self, run_id: str, content: str) -> None: ...

    @abstractmethod
    def get_controle_run(self, run_id: str) -> str | None: ...

    @abstractmethod
    def list_controle_run_ids(self) -> list[str]: ...

    # -- Controles --

    @abstractmethod
    def save_controle(self, controle_id: str, content: str) -> None: ...

    @abstractmethod
    def get_controle(self, controle_id: str) -> str | None: ...

    @abstractmethod
    def list_controle_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_controle(self, controle_id: str) -> bool: ...

    # -- Klanten --

    @abstractmethod
    def save_klant(self, klant_id: str, content: str) -> None: ...

    @abstractmethod
    def get_klant(self, klant_id: str) -> str | None: ...

    @abstractmethod
    def list_klant_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_klant(self, klant_id: str) -> bool: ...


class LocalStorageBackend(StorageBackend):
    """Filesystem-backed storage (current behaviour)."""

    def __init__(self, base_dir: Path | None = None):
        if base_dir is None:
            base_dir = Path(__file__).resolve().parent.parent / "storage"
        self._uploads = base_dir / "uploads"
        self._templates = base_dir / "templates"
        self._metadata_file = self._uploads / "_metadata.json"
        self._test_runs = base_dir / "test_runs"
        self._controles = base_dir / "controles"
        self._controle_runs = base_dir / "controle_runs"
        self._klanten = base_dir / "klanten"
        self._uploads.mkdir(parents=True, exist_ok=True)
        self._templates.mkdir(parents=True, exist_ok=True)
        self._test_runs.mkdir(parents=True, exist_ok=True)
        self._controles.mkdir(parents=True, exist_ok=True)
        self._controle_runs.mkdir(parents=True, exist_ok=True)
        self._klanten.mkdir(parents=True, exist_ok=True)

    # -- PDFs --

    def upload_pdf(self, pdf_id: str, content: bytes) -> None:
        (self._uploads / f"{pdf_id}.pdf").write_bytes(content)

    @contextmanager
    def pdf_temp_path(self, pdf_id: str):
        yield str(self._uploads / f"{pdf_id}.pdf")

    def pdf_exists(self, pdf_id: str) -> bool:
        return (self._uploads / f"{pdf_id}.pdf").exists()

    def delete_pdf(self, pdf_id: str) -> None:
        (self._uploads / f"{pdf_id}.pdf").unlink(missing_ok=True)

    def get_pdf_response_path(self, pdf_id: str) -> str:
        return str(self._uploads / f"{pdf_id}.pdf")

    # -- Metadata --

    def load_metadata(self) -> dict:
        if self._metadata_file.exists():
            return json.loads(self._metadata_file.read_text())
        return {}

    def save_metadata(self, data: dict) -> None:
        self._metadata_file.write_text(json.dumps(data, indent=2))

    # -- Templates --

    def save_template(self, template_id: str, content: str) -> None:
        (self._templates / f"{template_id}.json").write_text(content, encoding="utf-8")

    def get_template(self, template_id: str) -> str | None:
        path = self._templates / f"{template_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_template_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._templates.glob("*.json"))]

    def delete_template(self, template_id: str) -> bool:
        path = self._templates / f"{template_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True

    # -- Test Runs --

    def save_test_run(self, run_id: str, content: str) -> None:
        (self._test_runs / f"{run_id}.json").write_text(content, encoding="utf-8")

    def get_test_run(self, run_id: str) -> str | None:
        path = self._test_runs / f"{run_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_test_run_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._test_runs.glob("*.json"))]

    def delete_test_run(self, run_id: str) -> bool:
        path = self._test_runs / f"{run_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True

    # -- Controle Runs --

    def save_controle_run(self, run_id: str, content: str) -> None:
        (self._controle_runs / f"{run_id}.json").write_text(content, encoding="utf-8")

    def get_controle_run(self, run_id: str) -> str | None:
        path = self._controle_runs / f"{run_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_controle_run_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._controle_runs.glob("*.json"))]

    # -- Controles --

    def save_controle(self, controle_id: str, content: str) -> None:
        (self._controles / f"{controle_id}.json").write_text(content, encoding="utf-8")

    def get_controle(self, controle_id: str) -> str | None:
        path = self._controles / f"{controle_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_controle_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._controles.glob("*.json"))]

    def delete_controle(self, controle_id: str) -> bool:
        path = self._controles / f"{controle_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True

    # -- Klanten --

    def save_klant(self, klant_id: str, content: str) -> None:
        (self._klanten / f"{klant_id}.json").write_text(content, encoding="utf-8")

    def get_klant(self, klant_id: str) -> str | None:
        path = self._klanten / f"{klant_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_klant_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._klanten.glob("*.json"))]

    def delete_klant(self, klant_id: str) -> bool:
        path = self._klanten / f"{klant_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True


class AzureBlobStorageBackend(StorageBackend):
    """Azure Blob Storage backend using DefaultAzureCredential."""

    def __init__(self, account_name: str, pdfs_container: str = "pdfs", templates_container: str = "templates", test_runs_container: str = "test-runs", controles_container: str = "controles", controle_runs_container: str = "controle-runs", klanten_container: str = "klanten"):
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient

        credential = DefaultAzureCredential()
        account_url = f"https://{account_name}.blob.core.windows.net"
        self._client = BlobServiceClient(account_url, credential=credential)
        self._pdfs = self._client.get_container_client(pdfs_container)
        self._templates = self._client.get_container_client(templates_container)
        self._test_runs = self._client.get_container_client(test_runs_container)
        self._controles = self._client.get_container_client(controles_container)
        self._controle_runs = self._client.get_container_client(controle_runs_container)
        self._klanten = self._client.get_container_client(klanten_container)
        # Ensure all containers exist
        for container in [self._pdfs, self._templates, self._test_runs, self._controles, self._controle_runs, self._klanten]:
            if not container.exists():
                container.create_container()

    # -- PDFs --

    def upload_pdf(self, pdf_id: str, content: bytes) -> None:
        self._pdfs.upload_blob(f"{pdf_id}.pdf", content, overwrite=True)

    @contextmanager
    def pdf_temp_path(self, pdf_id: str):
        blob = self._pdfs.download_blob(f"{pdf_id}.pdf")
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        try:
            tmp.write(blob.readall())
            tmp.close()
            yield tmp.name
        finally:
            Path(tmp.name).unlink(missing_ok=True)

    def pdf_exists(self, pdf_id: str) -> bool:
        blob_client = self._pdfs.get_blob_client(f"{pdf_id}.pdf")
        return blob_client.exists()

    def delete_pdf(self, pdf_id: str) -> None:
        blob_client = self._pdfs.get_blob_client(f"{pdf_id}.pdf")
        if blob_client.exists():
            blob_client.delete_blob()

    def get_pdf_response_path(self, pdf_id: str) -> str:
        raise NotImplementedError(
            "Azure backend does not support direct file paths. Use pdf_temp_path() instead."
        )

    # -- Metadata --

    def load_metadata(self) -> dict:
        blob_client = self._pdfs.get_blob_client("_metadata.json")
        if not blob_client.exists():
            return {}
        data = blob_client.download_blob().readall()
        return json.loads(data)

    def save_metadata(self, data: dict) -> None:
        self._pdfs.upload_blob(
            "_metadata.json", json.dumps(data, indent=2), overwrite=True
        )

    # -- Templates --

    def save_template(self, template_id: str, content: str) -> None:
        self._templates.upload_blob(
            f"{template_id}.json", content, overwrite=True
        )

    def get_template(self, template_id: str) -> str | None:
        blob_client = self._templates.get_blob_client(f"{template_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_template_ids(self) -> list[str]:
        ids = []
        for blob in self._templates.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_template(self, template_id: str) -> bool:
        blob_client = self._templates.get_blob_client(f"{template_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True

    # -- Test Runs --

    def save_test_run(self, run_id: str, content: str) -> None:
        self._test_runs.upload_blob(
            f"{run_id}.json", content, overwrite=True
        )

    def get_test_run(self, run_id: str) -> str | None:
        blob_client = self._test_runs.get_blob_client(f"{run_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_test_run_ids(self) -> list[str]:
        ids = []
        for blob in self._test_runs.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_test_run(self, run_id: str) -> bool:
        blob_client = self._test_runs.get_blob_client(f"{run_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True

    # -- Controle Runs --

    def save_controle_run(self, run_id: str, content: str) -> None:
        self._controle_runs.upload_blob(f"{run_id}.json", content, overwrite=True)

    def get_controle_run(self, run_id: str) -> str | None:
        blob_client = self._controle_runs.get_blob_client(f"{run_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_controle_run_ids(self) -> list[str]:
        ids = []
        for blob in self._controle_runs.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    # -- Controles --

    def save_controle(self, controle_id: str, content: str) -> None:
        self._controles.upload_blob(f"{controle_id}.json", content, overwrite=True)

    def get_controle(self, controle_id: str) -> str | None:
        blob_client = self._controles.get_blob_client(f"{controle_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_controle_ids(self) -> list[str]:
        ids = []
        for blob in self._controles.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_controle(self, controle_id: str) -> bool:
        blob_client = self._controles.get_blob_client(f"{controle_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True

    # -- Klanten --

    def save_klant(self, klant_id: str, content: str) -> None:
        self._klanten.upload_blob(f"{klant_id}.json", content, overwrite=True)

    def get_klant(self, klant_id: str) -> str | None:
        blob_client = self._klanten.get_blob_client(f"{klant_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_klant_ids(self) -> list[str]:
        ids = []
        for blob in self._klanten.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_klant(self, klant_id: str) -> bool:
        blob_client = self._klanten.get_blob_client(f"{klant_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True


# -- Singleton --

_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _instance
    if _instance is None:
        from config import STORAGE_BACKEND, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_PDFS_CONTAINER, AZURE_STORAGE_TEMPLATES_CONTAINER, AZURE_STORAGE_TEST_RUNS_CONTAINER, AZURE_STORAGE_CONTROLES_CONTAINER, AZURE_STORAGE_CONTROLE_RUNS_CONTAINER, AZURE_STORAGE_KLANTEN_CONTAINER

        if STORAGE_BACKEND == "azure":
            _instance = AzureBlobStorageBackend(
                account_name=AZURE_STORAGE_ACCOUNT,
                pdfs_container=AZURE_STORAGE_PDFS_CONTAINER,
                templates_container=AZURE_STORAGE_TEMPLATES_CONTAINER,
                test_runs_container=AZURE_STORAGE_TEST_RUNS_CONTAINER,
                controles_container=AZURE_STORAGE_CONTROLES_CONTAINER,
                controle_runs_container=AZURE_STORAGE_CONTROLE_RUNS_CONTAINER,
                klanten_container=AZURE_STORAGE_KLANTEN_CONTAINER,
            )
        else:
            _instance = LocalStorageBackend()
    return _instance
