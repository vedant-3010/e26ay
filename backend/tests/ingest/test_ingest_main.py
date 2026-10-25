import json
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from winddesk.analytics.timeutil import UTC_DTYPE, delivery_days
from winddesk.ingest.__main__ import main, run_ingest
from winddesk.ingest.client import fuelhh_chunks, windfor_chunks

from .fakes import fuelhh_day, windfor_day

START, END = date(2026, 1, 13), date(2026, 1, 15)


@pytest.fixture
def raw_dir(tmp_path: Path) -> Path:
    """A raw cache for publish days 13–15 Jan, laid out exactly as the client writes it."""
    raw = tmp_path / "raw"
    for chunk in windfor_chunks(START, END):
        path = chunk.cache_file(raw)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(windfor_day(date.fromisoformat(chunk.name))))
    for chunk in fuelhh_chunks(START, END):
        first, last = (date.fromisoformat(d) for d in chunk.name.split("_"))
        records = [r for d in delivery_days(first, last) for r in fuelhh_day(d)]
        path = chunk.cache_file(raw)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(records))
    return raw


def test_offline_rebuild_is_reproducible(tmp_path: Path, raw_dir: Path) -> None:
    out = tmp_path / "snapshot"
    first = run_ingest(START, END, out_dir=out, raw_dir=raw_dir, offline=True)
    manifest_1 = (out / "manifest.json").read_text()
    second = run_ingest(START, END, out_dir=out, raw_dir=raw_dir, offline=True)

    assert first.snapshot_id == second.snapshot_id
    assert len(first.snapshot_id) == 12
    # Unchanged snapshot → byte-identical manifest (created_at is preserved).
    assert (out / "manifest.json").read_text() == manifest_1
    assert first.status == "ok"


def test_writes_typed_parquet_and_manifest(tmp_path: Path, raw_dir: Path) -> None:
    out = tmp_path / "snapshot"
    result = run_ingest(START, END, out_dir=out, raw_dir=raw_dir, offline=True)

    forecasts = pd.read_parquet(out / "forecasts.parquet")
    actuals = pd.read_parquet(out / "actuals.parquet")
    assert str(forecasts["target_time"].dtype) == UTC_DTYPE
    assert str(actuals["target_time"].dtype) == UTC_DTYPE
    assert (forecasts["lead_h"] >= 0).all()
    assert len(actuals) == 3 * 48

    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["snapshot_id"] == result.snapshot_id
    assert manifest["rows"] == {"actuals": len(actuals), "forecasts": len(forecasts)}
    assert manifest["fetch"]["chunks"] == {"WINDFOR": 3, "FUELHH": 1}
    assert set(manifest["files"]) == {"actuals.parquet", "forecasts.parquet"}

    quality = json.loads((out / "quality.json").read_text())
    assert quality["status"] == "ok"
    # Delivery days whose D−1 was fetched: 14, 15 and 16 Jan.
    assert "3 days" in next(
        c["message"] for c in quality["checks"] if c["id"] == "decision_coverage_epex"
    )


def test_cli_offline_prints_checks(
    tmp_path: Path, raw_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "snapshot"
    argv = ["--start", "2026-01-13", "--end", "2026-01-15", "--offline"]
    assert main([*argv, "--raw", str(raw_dir), "--out", str(out)]) == 0
    printed = capsys.readouterr().out
    assert "[  ok] runs_per_day" in printed
    assert "quality: ok" in printed


def test_cli_offline_without_cache_fails_cleanly(tmp_path: Path) -> None:
    argv = ["--start", "2026-01-13", "--end", "2026-01-13", "--offline"]
    assert main([*argv, "--raw", str(tmp_path / "none"), "--out", str(tmp_path / "s")]) == 1


def test_cli_rejects_conflicting_flags() -> None:
    with pytest.raises(SystemExit):
        main(["--offline", "--refresh"])
