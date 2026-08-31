#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import mimetypes
import os
import re
import shutil
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
LEGACY_LAYOUT_FILE = DATA_DIR / "layout.json"
LAYOUT01_FILE = DATA_DIR / "layout01.json"   # committed / live layout
LAYOUT02_FILE = DATA_DIR / "layout02.json"   # edit-session draft layout
EDIT_SESSION_FILE = DATA_DIR / ".edit-session-state.json"
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 250 * 1024 * 1024
SERVER_VERSION = "24"


def safe_filename(name: str, content_type: str = "") -> str:
    name = Path(urllib.parse.unquote(name or "image")).name
    stem = Path(name).stem or "image"
    suffix = Path(name).suffix.lower()
    if not suffix:
        suffix = mimetypes.guess_extension(content_type or "") or ".png"
    stem = re.sub(r"[^\w\-. ()\[\]]+", "-", stem, flags=re.UNICODE).strip(" .-") or "image"
    return f"{stem}{suffix}"


def atomic_write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    temp_name = None
    try:
        fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_name, path)
    except PermissionError:
        # Some macOS launch contexts deny temporary-file creation or replace
        # on external volumes even when the target file is writable.
        if temp_name:
            try: os.unlink(temp_name)
            except OSError: pass
        path.write_text(encoded, encoding="utf-8")
    else:
        temp_name = None
    finally:
        if temp_name:
            try: os.unlink(temp_name)
            except OSError: pass


def read_json(path: Path, fallback=None):
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return fallback


def copy_json(source: Path, dest: Path) -> None:
    payload = read_json(source, {})
    atomic_write_json(dest, payload if isinstance(payload, dict) else {})


def ensure_layout_files() -> None:
    # Migrate v10 and earlier once. From this version onward layout01 is the
    # committed source of truth and layout02 is the disposable edit draft.
    if not LAYOUT01_FILE.exists():
        if LEGACY_LAYOUT_FILE.exists():
            copy_json(LEGACY_LAYOUT_FILE, LAYOUT01_FILE)
        else:
            atomic_write_json(LAYOUT01_FILE, {})
    if not LAYOUT02_FILE.exists():
        copy_json(LAYOUT01_FILE, LAYOUT02_FILE)


def upload_names():
    return sorted(p.name for p in UPLOAD_DIR.iterdir() if p.is_file() and p.name != ".gitkeep")


def uploaded_sources(layout):
    refs = set()
    if not isinstance(layout, dict):
        return refs
    layers = layout.get("layers")
    if isinstance(layers, dict):
        for layer in layers.values():
            if not isinstance(layer, dict):
                continue
            src = urllib.parse.unquote(str(layer.get("src", "")))
            if src.startswith("uploads/"):
                refs.add(Path(src).name)
    background = layout.get("background")
    if isinstance(background, dict):
        src = urllib.parse.unquote(str(background.get("src", "")))
        if src.startswith("uploads/"):
            refs.add(Path(src).name)
    scene_backgrounds = layout.get("sceneBackgrounds")
    if isinstance(scene_backgrounds, dict):
        for background in scene_backgrounds.values():
            if not isinstance(background, dict):
                continue
            src = urllib.parse.unquote(str(background.get("src", "")))
            if src.startswith("uploads/"):
                refs.add(Path(src).name)
    return refs


def delete_upload_name(name: str) -> None:
    name = Path(name).name
    target = (UPLOAD_DIR / name).resolve()
    uploads_root = UPLOAD_DIR.resolve()
    if uploads_root in target.parents and target.exists() and target.is_file():
        target.unlink()


def load_edit_session():
    data = read_json(EDIT_SESSION_FILE, {})
    return data if isinstance(data, dict) else {}


def save_edit_session(payload) -> None:
    atomic_write_json(EDIT_SESSION_FILE, payload)


def rollback_active_session() -> None:
    """Restore draft from committed layout and remove only files uploaded in this edit session."""
    ensure_layout_files()
    session = load_edit_session()
    baseline = set(session.get("baselineUploads", [])) if session.get("active") else set(upload_names())
    if session.get("active"):
        for name in set(upload_names()) - baseline:
            delete_upload_name(name)
    copy_json(LAYOUT01_FILE, LAYOUT02_FILE)
    save_edit_session({"active": False, "baselineUploads": upload_names()})


def layouts_differ() -> bool:
    """Compare semantic JSON content, not file formatting or key order."""
    ensure_layout_files()
    committed = read_json(LAYOUT01_FILE, {})
    draft = read_json(LAYOUT02_FILE, {})
    return committed != draft


def edit_session_status():
    ensure_layout_files()
    session = load_edit_session()
    return {
        "draftDiffers": layouts_differ(),
        "active": bool(session.get("active")),
        "source": "layout02.json" if layouts_differ() else "layout01.json",
    }


def begin_edit_session():
    """Start a clean edit session when committed and draft layouts match."""
    ensure_layout_files()
    # If an abandoned session made no semantic layout changes, it does not
    # need a recovery prompt. Clean its temporary uploads before starting over.
    if load_edit_session().get("active"):
        rollback_active_session()
    copy_json(LAYOUT01_FILE, LAYOUT02_FILE)
    baseline = upload_names()
    save_edit_session({"active": True, "baselineUploads": baseline})
    return read_json(LAYOUT02_FILE, {})


def resume_edit_session():
    """Keep an abandoned layout02 draft intact and continue editing it."""
    ensure_layout_files()
    session = load_edit_session()
    if not session.get("active"):
        # If the old session marker was lost, preserve current assets rather
        # than risk deleting a user file. The layout draft remains untouched.
        session = {"active": True, "baselineUploads": upload_names()}
        save_edit_session(session)
    return read_json(LAYOUT02_FILE, {})


def restart_edit_session():
    """Discard an abandoned draft, sync layout02 from layout01, then edit anew."""
    ensure_layout_files()
    rollback_active_session()
    copy_json(LAYOUT01_FILE, LAYOUT02_FILE)
    baseline = upload_names()
    save_edit_session({"active": True, "baselineUploads": baseline})
    return read_json(LAYOUT02_FILE, {})


def commit_edit_session():
    ensure_layout_files()
    session = load_edit_session()
    baseline = set(session.get("baselineUploads", upload_names()))
    committed = read_json(LAYOUT01_FILE, {})
    draft = read_json(LAYOUT02_FILE, {})
    committed_refs = uploaded_sources(committed)
    draft_refs = uploaded_sources(draft)
    current = set(upload_names())

    # 1) Existing uploaded assets removed from the draft become real deletions.
    # 2) Assets uploaded during this edit but no longer referenced (e.g. add ->
    #    delete or add -> undo) are also physically removed on Save.
    to_delete = (committed_refs - draft_refs) | ((current - baseline) - draft_refs)
    for name in to_delete:
        delete_upload_name(name)

    copy_json(LAYOUT02_FILE, LAYOUT01_FILE)
    # Keep both files identical immediately after a successful commit.
    copy_json(LAYOUT01_FILE, LAYOUT02_FILE)
    save_edit_session({"active": False, "baselineUploads": upload_names()})
    return read_json(LAYOUT01_FILE, {})


ensure_layout_files()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def end_headers(self):
        # Development responses must revalidate so local verification never
        # serves an older HTML, JS, CSS, or asset file from browser cache.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_body_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > 10 * 1024 * 1024:
            raise ValueError("Invalid JSON payload size")
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body.decode("utf-8")) if body else {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/version":
            return self.send_json(200, {"ok": True, "version": SERVER_VERSION, "editSessionApi": True})
        if parsed.path == "/api/layout":
            ensure_layout_files()
            qs = urllib.parse.parse_qs(parsed.query)
            draft = qs.get("draft", ["0"])[0] == "1"
            target = LAYOUT02_FILE if draft else LAYOUT01_FILE
            try:
                layout = read_json(target, None)
                return self.send_json(200, {"ok": True, "layout": layout, "source": target.name})
            except Exception as exc:
                return self.send_json(500, {"ok": False, "error": f"Could not read {target.name}: {exc}"})
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/edit-session":
            try:
                data = self.read_body_json()
                action = str(data.get("action", "")).lower()
                if action == "status":
                    return self.send_json(200, {"ok": True, **edit_session_status()})
                if action == "begin":
                    layout = begin_edit_session()
                    return self.send_json(200, {"ok": True, "layout": layout, "source": "layout02.json"})
                if action == "resume":
                    layout = resume_edit_session()
                    return self.send_json(200, {"ok": True, "layout": layout, "source": "layout02.json", "resumed": True})
                if action == "restart":
                    layout = restart_edit_session()
                    return self.send_json(200, {"ok": True, "layout": layout, "source": "layout02.json", "restarted": True})
                if action == "save":
                    layout = commit_edit_session()
                    return self.send_json(200, {"ok": True, "layout": layout, "source": "layout01.json"})
                if action == "discard":
                    rollback_active_session()
                    return self.send_json(200, {"ok": True, "layout": read_json(LAYOUT01_FILE, {}), "source": "layout01.json"})
                return self.send_json(400, {"ok": False, "error": "Unknown edit-session action"})
            except Exception as exc:
                return self.send_json(400, {"ok": False, "error": str(exc)})

        if parsed.path == "/api/layout":
            qs = urllib.parse.parse_qs(parsed.query)
            draft = qs.get("draft", ["0"])[0] == "1"
            target = LAYOUT02_FILE if draft else LAYOUT01_FILE
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > 10 * 1024 * 1024:
                return self.send_json(400, {"ok": False, "error": "Invalid layout payload size"})
            try:
                body = self.rfile.read(length)
                data = json.loads(body.decode("utf-8"))
                layout = data.get("layout", data) if isinstance(data, dict) else data
                if not isinstance(layout, dict):
                    raise ValueError("Layout must be an object")
                # Editing writes only layout02. layout01 is changed exclusively by
                # the Save transaction, so Discard can never depend on Undo depth.
                if not draft:
                    raise ValueError("Committed layout can only be changed by Save")
                atomic_write_json(target, layout)
                return self.send_json(200, {"ok": True, "path": f"data/{target.name}"})
            except Exception as exc:
                return self.send_json(400, {"ok": False, "error": str(exc)})

        if parsed.path == "/api/upload":
            qs = urllib.parse.parse_qs(parsed.query)
            requested_name = qs.get("name", ["asset"])[0]
            content_type = self.headers.get("Content-Type", "application/octet-stream")
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > MAX_UPLOAD_BYTES:
                return self.send_json(400, {"ok": False, "error": "Asset is empty or larger than 250 MB"})
            try:
                base_name = safe_filename(requested_name, content_type)
                stem, suffix = Path(base_name).stem, Path(base_name).suffix
                candidate = base_name
                counter = 2
                while (UPLOAD_DIR / candidate).exists():
                    candidate = f"{stem}-{counter}{suffix}"
                    counter += 1
                dest = UPLOAD_DIR / candidate
                remaining = length
                with dest.open("wb") as f:
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("Upload ended before the declared content length")
                        f.write(chunk)
                        remaining -= len(chunk)
                return self.send_json(200, {
                    "ok": True,
                    "src": f"uploads/{urllib.parse.quote(candidate)}",
                    "fileName": requested_name,
                    "size": length,
                })
            except Exception as exc:
                try:
                    if 'dest' in locals() and dest.exists():
                        dest.unlink()
                except Exception:
                    pass
                return self.send_json(400, {"ok": False, "error": str(exc)})

        if parsed.path == "/api/delete-asset":
            # Kept for backwards compatibility. Current editor defers physical
            # upload deletion until Save / Discard resolves the transaction.
            try:
                data = self.read_body_json()
                src = urllib.parse.unquote(str(data.get("src", "")))
                if src.startswith("uploads/"):
                    delete_upload_name(Path(src).name)
                return self.send_json(200, {"ok": True})
            except Exception as exc:
                return self.send_json(400, {"ok": False, "error": str(exc)})

        return self.send_json(404, {"ok": False, "error": "Not found"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Joe Scene server v{SERVER_VERSION} running at http://localhost:{port}")
    print(f"Committed layout: {LAYOUT01_FILE}")
    print(f"Edit draft:       {LAYOUT02_FILE}")
    print("Use Ctrl+C to stop.")
    server.serve_forever()
