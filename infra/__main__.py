"""BCS PDF Data Extractor - Azure demo infrastructure."""

from mstr_infra.infra_pipeline import create_infrastructure
from environments.demo import Demo

env_config = Demo()
create_infrastructure(env_config)
