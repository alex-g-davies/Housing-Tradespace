"""Application settings.

This module is the ONLY place the Mapbox token and work location are read. The
token comes from the environment and must never be serialized into a response or
logged (R5).
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    """Settings loaded from environment / .env.

    `mapbox_token` is optional: when blank we serve the committed isochrone
    fixture instead of calling Mapbox (fixture-first mode).
    """

    mapbox_token: str = ""
    # Default work location: the Museum of Flight, Seattle. Used when the client
    # does not pass an explicit lat/lon (the frontend lets users move the point).
    work_lat: float = 47.5180
    work_lon: float = -122.2966
    contour_minutes: int = 30
    use_fixture: bool = False

    # Frontend dev origin allowed through CORS.
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def serve_fixture(self) -> bool:
        """True when the isochrone endpoint should serve the committed fixture
        rather than calling Mapbox: either explicitly forced, or no token set."""
        return self.use_fixture or not self.mapbox_token.strip()


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor used as a FastAPI dependency (overridable in tests)."""
    return Settings()
