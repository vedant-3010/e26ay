import tomllib

from winddesk import __version__
from winddesk.config import REPO_ROOT


def test_package_version_matches_pyproject() -> None:
    pyproject = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert pyproject["project"]["version"] == __version__
