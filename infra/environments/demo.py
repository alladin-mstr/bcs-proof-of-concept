from mstr_infra.environments.base import BaseConfig


class Demo(BaseConfig):
    env = "demo"
    project_name = "bcs"
    github_repo_name = "MSTR-Projects/bcs-proof-of-concept"
    location = "westeurope"

    rbacConfig = {
        "owners": [
            "deric_mstr.nl#EXT#@silasmstr.onmicrosoft.com",
        ],
        "contributors": [],
        "readers": [],
    }

    # Storage (PDFs + templates)
    enable_storage = True
    storage_container_name = "pdfs"
    static_container_name = "templates"
    static_container_public = False

    # Container Registry (Docker images)
    enable_container_registry = True
    build_and_push_images = False
    image_tag = "latest"

    # App Service (FastAPI + React static, single container)
    enable_app_service = True
    backend_docker_path = "../Dockerfile"
    docker_compose_path = "../docker/docker-compose.yml"

    # App Service SKU
    app_service_sku_tier = "Basic"
    app_service_sku_name = "B1"

    # Health check
    health_check_path = "/health"
