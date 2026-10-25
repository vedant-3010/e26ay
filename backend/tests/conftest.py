"""Shared fixtures. The synthetic, hand-computable dataset (DATA §7) is added in Phase 2."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from winddesk.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c
