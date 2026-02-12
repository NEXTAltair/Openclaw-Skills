#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any

ALLOWED = {
    "title", "title_sort", "authors", "author_sort", "series", "series_index", "tags", "publisher", "pubdate", "languages", "comments"
}

OC_START = "<!-- OC_ANALYSIS_START -->"
OC_END = "<!-- OC_ANALYSIS_END -->"

I18N = {
    "ja": {
        "title": "OpenClaw解析",
        "summary": "要約",
        "key_points": "重要ポイント",
        "reread": "再読ガイド",
        "generated_at": "生成日時",
        "file_hash": "ファイルハッシュ",
        "analysis_tags": "解析タグ",
        "section": "章/節",
        "page": "ページ",
        "chunk": "チャンク"
    },
    "en": {
        "title": "OpenClaw Analysis",
        "summary": "Summary",
        "key_points": "Key points",
        "reread": "Reread guide",
        "generated_at": "generated_at",
        "file_hash": "file_hash",
        "analysis_tags": "analysis_tags",
        "section": "section",
        "page": "page",
        "chunk": "chunk"
    }
}


def run(cmd: list[str]) -> tuple[int, str, str]:
    cp = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return cp.returncode, cp.stdout, cp.stderr


def run_ok(cmd: list[str]) -> str:
    rc, out, err = run(cmd)
    if rc != 0:
        raise RuntimeError(
            f"calibredb failed ({rc})\nCMD: {' '.join(shlex.quote(x) for x in cmd)}\nERR:\n{err.strip()}"
        )
    return out


DEFAULT_AUTH_FILE = Path.home() / ".config" / "calibre-metadata-apply" / "auth.json"


def load_auth_file(path: Path) -> dict[str, str]:
    try:
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        out: dict[str, str] = {}
        for k in ("username", "password", "password_env"):
            v = data.get(k)
            if isinstance(v, str) and v.strip():
                out[k] = v.strip()
        return out
    except Exception:
        return {}


def save_auth_file(path: Path, *, username: str, password: str | None, password_env: str | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, str] = {"username": username}
    if password:
        payload["password"] = password
    if password_env:
        payload["password_env"] = password_env
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def resolve_auth(ns: argparse.Namespace) -> tuple[str | None, str | None, str | None]:
    auth = load_auth_file(Path(ns.auth_file)) if ns.auth_file else {}

    username = ns.username or auth.get("username")

    password = ns.password
    if not password and ns.password_env:
        password = os.environ.get(ns.password_env, "")
    if not password and auth.get("password_env"):
        password = os.environ.get(auth.get("password_env", ""), "")
    if not password:
        password = auth.get("password")

    used_password_env = ns.password_env or auth.get("password_env")

    if ns.save_auth:
        if not username:
            raise ValueError("--save-auth requires username (provide --username or existing auth file with username)")
        if not password and not used_password_env:
            raise ValueError("--save-auth requires password source (--password or --password-env with env value)")
        save_auth_file(
            Path(ns.auth_file),
            username=username,
            password=password if ns.save_plain_password else None,
            password_env=used_password_env,
        )

    return username, password, used_password_env


def common_args(ns: argparse.Namespace) -> list[str]:
    args = ["--with-library", ns.with_library]
    if ns._auth_username:
        args += ["--username", ns._auth_username]
    if ns._auth_password:
        args += ["--password", ns._auth_password]
    return args


def redacted_cmd(cmd: list[str]) -> str:
    out: list[str] = []
    skip_next_password = False
    for i, token in enumerate(cmd):
        if skip_next_password:
            out.append("********")
            skip_next_password = False
            continue
        out.append(token)
        if token == "--password" and i + 1 < len(cmd):
            skip_next_password = True
    return " ".join(shlex.quote(x) for x in out)


def to_field_value(v: Any) -> str:
    if isinstance(v, list):
        return ",".join(str(x) for x in v)
    return str(v)


def split_multi(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        raw = [str(x) for x in v]
    else:
        raw = re.split(r"[,;\n]", str(v))
    out: list[str] = []
    seen = set()
    for x in raw:
        t = x.strip()
        if not t:
            continue
        k = t.casefold()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def fetch_book(ns: argparse.Namespace, book_id: str, fields: str) -> dict[str, Any] | None:
    cmd = [
        "calibredb", "list", "--for-machine", "--fields", fields,
        "--search", f"id:{book_id}", "--limit", "5",
    ] + common_args(ns)
    out = run_ok(cmd)
    rows = json.loads(out)
    for row in rows:
        if str(row.get("id")) == str(book_id):
            return row
    return None


def render_analysis_html(book_id: str, analysis: dict[str, Any], default_lang: str = "ja") -> str:
    summary = str(analysis.get("summary", "")).strip()
    highlights = split_multi(analysis.get("highlights", []))
    tags = split_multi(analysis.get("tags", []))
    reread = analysis.get("reread", [])
    generated_at = str(analysis.get("generated_at", "")).strip() or dt.datetime.now(dt.timezone.utc).isoformat()
    source_hash = str(analysis.get("file_hash", "")).strip()

    lang = str(analysis.get("lang", default_lang)).strip().lower()
    if lang not in I18N:
        lang = default_lang if default_lang in I18N else "en"
    tr = I18N[lang]

    lines: list[str] = []
    lines.append(OC_START)
    lines.append('<div class="openclaw-analysis">')
    lines.append(f"<h3>{tr["title"]}</h3>")

    if summary:
        lines.append(f"<p><strong>{tr["summary"]}:</strong> {summary}</p>")

    if highlights:
        lines.append(f"<h4>{tr["key_points"]}</h4><ul>")
        for h in highlights:
            lines.append(f"<li>{h}</li>")
        lines.append("</ul>")

    if reread and isinstance(reread, list):
        lines.append(f"<h4>{tr["reread"]}</h4><ul>")
        for item in reread:
            if not isinstance(item, dict):
                continue
            section = str(item.get("section", "")).strip()
            page = str(item.get("page", "")).strip()
            chunk = str(item.get("chunk_id", "")).strip()
            reason = str(item.get("reason", "")).strip()
            parts = [p for p in [f"{tr["section"]}: {section}" if section else "", f"{tr["page"]}: {page}" if page else "", f"{tr["chunk"]}: {chunk}" if chunk else "", reason] if p]
            if parts:
                lines.append(f"<li>{' | '.join(parts)}</li>")
        lines.append("</ul>")

    meta_bits = [f"{tr["generated_at"]}: {generated_at}"]
    if source_hash:
        meta_bits.append(f"{tr["file_hash"]}: {source_hash}")
    if tags:
        meta_bits.append(f"{tr["analysis_tags"]}: {', '.join(tags)}")
    lines.append(f"<p><em>{' / '.join(meta_bits)}</em></p>")

    lines.append("</div>")
    lines.append(OC_END)
    return "\n".join(lines)


def upsert_oc_block(existing_html: str, oc_block_html: str) -> str:
    existing = existing_html or ""
    pattern = re.compile(re.escape(OC_START) + r".*?" + re.escape(OC_END), re.DOTALL)
    if pattern.search(existing):
        return pattern.sub(oc_block_html, existing)
    if existing.strip():
        return existing.rstrip() + "\n\n" + oc_block_html
    return oc_block_html


def build_fields(ns: argparse.Namespace, rec: dict[str, Any]) -> list[tuple[str, str]]:
    # Work on a copy so we can synthesize comments/tags safely.
    r = dict(rec)
    bid = str(r.get("id", "")).strip()
    if not bid:
        raise ValueError("missing id")

    # analysis -> comments_html
    analysis = r.get("analysis")
    if isinstance(analysis, dict):
        r["comments_html"] = render_analysis_html(bid, analysis, default_lang=ns.lang)
        if not r.get("analysis_tags"):
            r["analysis_tags"] = analysis.get("tags", [])

    # comments_html upsert into comments with marker block.
    if r.get("comments_html"):
        current = fetch_book(ns, bid, "id,comments") or {}
        existing_comments = str(current.get("comments") or "")
        merged = upsert_oc_block(existing_comments, str(r["comments_html"]))
        r["comments"] = merged

    # tags merge/normalize (multi-tag support)
    if r.get("tags") is not None or r.get("analysis_tags") is not None or r.get("tags_remove") is not None:
        incoming = split_multi(r.get("tags"))
        extra = split_multi(r.get("analysis_tags"))
        remove_tags = set(split_multi(r.get("tags_remove")))
        merge_existing = bool(r.get("tags_merge", True))
        existing_tags: list[str] = []
        if merge_existing:
            current = fetch_book(ns, bid, "id,tags") or {}
            existing_tags = split_multi(current.get("tags", []))
        merged = split_multi(existing_tags + incoming + extra)
        if remove_tags:
            merged = [t for t in merged if t not in remove_tags]
        # set even when empty to allow explicit tag clearing by removal
        r["tags"] = merged

    fields: list[tuple[str, str]] = []
    for k, v in r.items():
        if k == "id":
            continue
        if k not in ALLOWED:
            continue
        if v is None:
            continue
        fields.append((k, to_field_value(v)))

    if not fields:
        raise ValueError("no updatable fields")
    return fields


def build_set_metadata_cmd(ns: argparse.Namespace, rec: dict[str, Any]) -> list[str]:
    bid = str(rec.get("id", "")).strip()
    if not bid:
        raise ValueError("missing id")
    fields = build_fields(ns, rec)
    cmd = ["calibredb", "set_metadata", bid]
    for k, v in fields:
        cmd += ["--field", f"{k}:{v}"]
    cmd += common_args(ns)
    return cmd


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-library", required=True)
    ap.add_argument("--username")
    ap.add_argument("--password", help="Direct password value for Calibre server auth")
    ap.add_argument("--password-env", default="CALIBRE_PASSWORD")
    ap.add_argument("--auth-file", default=str(DEFAULT_AUTH_FILE), help="Auth cache file path")
    ap.add_argument("--save-auth", action="store_true", help="Save resolved auth to --auth-file")
    ap.add_argument("--save-plain-password", action="store_true", help="When used with --save-auth, save plaintext password into auth file")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--lang", default="ja", choices=["ja", "en"], help="Default language for generated HTML labels")
    ns = ap.parse_args()

    ns._auth_username, ns._auth_password, ns._auth_password_env = resolve_auth(ns)

    lines = [ln.strip() for ln in sys.stdin.read().splitlines() if ln.strip()]
    if not lines:
        print(json.dumps({"ok": True, "summary": {"total": 0, "planned": 0, "applied": 0, "failed": 0}, "results": []}, ensure_ascii=False, indent=2))
        return 0

    results = []
    planned = 0
    applied = 0
    failed = 0

    for i, ln in enumerate(lines, start=1):
        try:
            rec = json.loads(ln)
            cmd = build_set_metadata_cmd(ns, rec)
            planned += 1

            if not ns.apply:
                results.append({"line": i, "id": rec.get("id"), "action": "planned", "cmd": redacted_cmd(cmd)})
                continue

            rc, out, err = run(cmd)
            if rc == 0:
                applied += 1
                results.append({"line": i, "id": rec.get("id"), "action": "applied", "stdout": out.strip()})
            else:
                failed += 1
                results.append({"line": i, "id": rec.get("id"), "action": "failed", "stderr": err.strip(), "rc": rc})
        except Exception as e:
            failed += 1
            results.append({"line": i, "action": "error", "error": str(e)})

    ok = failed == 0
    print(json.dumps({
        "ok": ok,
        "mode": "apply" if ns.apply else "dry-run",
        "summary": {"total": len(lines), "planned": planned, "applied": applied, "failed": failed},
        "results": results,
    }, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
