"""Settings for the NotebookLM service (ADR 0010). Loaded from env / .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HAETAE_NOTEBOOKLM_", env_file=".env", extra="ignore")

    # notebooklm-py profile (matches ~/.notebooklm/profiles/<name>). "default"=kentech.
    profile: str = "default"
    # Cap concurrent notebooklm-py calls (burst-click protection).
    max_concurrent: int = 2
    # SQLite mirror DB. Defaults under the user's data dir; overridable for tests.
    db_path: Path = Path("~/.haetae/notebooklm.db").expanduser()
    port: int = 4100


settings = Settings()
