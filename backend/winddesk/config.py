"""Runtime configuration, read from environment variables (prefix ``WINDDESK_``)."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Repository root: ``backend/winddesk/config.py`` → three levels up. The same layout is used
#: locally, in Docker (``/app``) and in the Vercel function bundle, so relative paths resolve
#: identically everywhere regardless of the process working directory.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WINDDESK_", extra="ignore")

    data_dir: Path = Path("data/snapshot")
    enable_live: bool = False
    log_level: str = "INFO"
    git_sha: str | None = Field(
        default=None,
        validation_alias=AliasChoices("VERCEL_GIT_COMMIT_SHA", "GIT_SHA"),
    )

    @property
    def data_path(self) -> Path:
        """Absolute snapshot directory; relative values are resolved against the repo root."""
        return self.data_dir if self.data_dir.is_absolute() else REPO_ROOT / self.data_dir


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
