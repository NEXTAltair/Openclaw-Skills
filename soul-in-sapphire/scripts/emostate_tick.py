from __future__ import annotations

import json
import math
import sys
from datetime import datetime
from pathlib import Path

# Ensure workspace root on sys.path
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from emostate_config import load_config, require_paths
from emostate_notion import (
    build_emotion_props,
    build_event_props,
    build_state_props,
    clamp_0_10,
    create_page,
    query_recent,
    text_of,
)

AXES = [
    "arousal",
    "valence",
    "focus",
    "confidence",
    "stress",
    "curiosity",
    "social",
    "solitude",
    "joy",
    "anger",
    "sadness",
    "fun",
    "pain",
]

NORMAL_HALF_LIFE_HOURS = 24.0


def read_json_stdin():
    raw = sys.stdin.read().strip()
    if not raw:
        raise SystemExit("Expected JSON on stdin")
    return json.loads(raw)


def _parse_iso(dt: str | None) -> datetime | None:
    if not dt:
        return None
    # Handle 'Z'
    dt = dt.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(dt)
    except Exception:
        return None


def parse_state_from_row(row) -> tuple[dict, datetime | None]:
    props = (row or {}).get("properties") or {}
    s = text_of(props.get("state_json"))
    when = text_of(props.get("when"))
    when_dt = _parse_iso(when) if isinstance(when, str) else None
    if not s:
        return {}, when_dt
    try:
        obj = json.loads(s)
        if isinstance(obj, dict):
            return obj, when_dt
    except json.JSONDecodeError:
        pass
    return {}, when_dt


def initial_state() -> dict:
    return {k: 5.0 for k in AXES}


def _exp_decay_toward(x: float, target: float, hours: float, half_life_hours: float) -> float:
    if hours <= 0:
        return x
    if half_life_hours <= 0:
        return target
    # After half-life, distance halves
    lam = math.log(2.0) / half_life_hours
    return target + (x - target) * math.exp(-lam * hours)


def _imprint_half_life(severity: float) -> float:
    # 1 day .. 11 days
    severity = max(0.0, min(10.0, severity))
    return NORMAL_HALF_LIFE_HOURS * (1.0 + severity / 1.0)


def _maybe_add_imprints(state_json: dict, emotions: list[dict], event: dict):
    """Add durable imprints when something is 'traumatic'.

    Heuristic (v0):
    - any emotion with level >= 9
    - and control <= 3 (if control is provided)

    Stored under state_json['imprints'] (list).
    """

    imprints = state_json.get("imprints")
    if not isinstance(imprints, list):
        imprints = []

    control = event.get("control")
    try:
        control_v = float(control) if control is not None else None
    except Exception:
        control_v = None

    for emo in emotions:
        axis = emo.get("axis")
        if axis not in AXES:
            continue
        try:
            level = float(emo.get("level"))
        except Exception:
            continue

        if level < 9.0:
            continue
        if control_v is not None and control_v > 3.0:
            continue

        sev = max(0.0, min(10.0, level))
        tag = f"imprint:{axis}:{event.get('trigger') or 'event'}"
        imprints.append(
            {
                "tag": tag,
                "axis": axis,
                "severity": sev,
                "created_at": event.get("when"),
                "decay_half_life_hours": _imprint_half_life(sev),
                "notes": emo.get("comment") or "",
            }
        )

    # de-dupe by (tag, created_at) keeping last
    seen = set()
    dedup = []
    for it in reversed(imprints):
        key = (it.get("tag"), it.get("created_at"))
        if key in seen:
            continue
        seen.add(key)
        dedup.append(it)
    state_json["imprints"] = list(reversed(dedup))


def main():
    cfg = load_config()
    require_paths(
        cfg,
        [
            "valentina_events_database_id",
            "valentina_emotions_database_id",
            "valentina_state_database_id",
            "valentina_state_data_source_id",
        ],
    )

    payload = read_json_stdin()
    event = payload.get("event") or {}
    emotions = payload.get("emotions") or []
    state_overrides = payload.get("state") or {}

    # 1) create event
    epage = create_page(cfg["valentina_events_database_id"], build_event_props(event))
    event_id = epage.get("id")

    # 2) create emotion rows linked to event
    for emo in emotions:
        create_page(cfg["valentina_emotions_database_id"], build_emotion_props(emo, event_page_id=event_id))

    # 3) load latest state
    latest = query_recent(cfg["valentina_state_data_source_id"], page_size=1)
    base = initial_state()
    base_obj = {}
    base_when = None
    if latest:
        base_obj, base_when = parse_state_from_row(latest[0])
        if isinstance(base_obj, dict):
            base.update({k: float(base_obj.get(k, base.get(k, 5.0))) for k in AXES if k in base})

    # 3.5) decay toward neutral (5)
    # Use latest state's when -> now (event.when if provided, else now in build_event_props)
    now_dt = _parse_iso(event.get("when"))
    if now_dt and base_when:
        hours = (now_dt - base_when).total_seconds() / 3600.0
        if hours > 0:
            # build per-axis half-life based on imprints
            imprints = base_obj.get("imprints") if isinstance(base_obj, dict) else None
            by_axis = {}
            if isinstance(imprints, list):
                for it in imprints:
                    ax = it.get("axis")
                    if ax in AXES:
                        try:
                            by_axis[ax] = float(it.get("decay_half_life_hours") or _imprint_half_life(float(it.get("severity") or 0)))
                        except Exception:
                            by_axis[ax] = _imprint_half_life(0)
            for ax in AXES:
                hl = by_axis.get(ax, NORMAL_HALF_LIFE_HOURS)
                base[ax] = clamp_0_10(_exp_decay_toward(float(base.get(ax, 5.0)), 5.0, hours, hl))

    # 4) apply deltas
    for emo in emotions:
        axis = emo.get("axis")
        if axis not in base:
            continue
        try:
            level = float(emo.get("level"))
        except Exception:
            continue
        delta = level - 5.0
        base[axis] = clamp_0_10(float(base.get(axis, 5.0)) + delta)

    # 4.5) maybe add imprints
    state_json = {**base}
    if isinstance(base_obj, dict) and isinstance(base_obj.get("imprints"), list):
        state_json["imprints"] = base_obj.get("imprints")
    _maybe_add_imprints(state_json, emotions, event)
    state_json["__meta"] = {"version": 1}

    # 5) write state snapshot linked to event
    st = {
        "state_json": state_json,
        "reason": state_overrides.get("reason") or "event tick",
        "source": state_overrides.get("source") or "event",
        "mood_label": state_overrides.get("mood_label"),
        "intent": state_overrides.get("intent"),
        "need_stack": state_overrides.get("need_stack"),
        "need_level": state_overrides.get("need_level"),
        "avoid": state_overrides.get("avoid") or [],
        "when": event.get("when"),
    }
    spage = create_page(cfg["valentina_state_database_id"], build_state_props(st, event_page_id=event_id))

    out = {
        "ok": True,
        "event": {"id": event_id, "url": epage.get("url")},
        "state": {"id": spage.get("id"), "url": spage.get("url"), "state_json": state_json},
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
