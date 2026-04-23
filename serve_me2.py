# -*- coding: utf-8 -*-
"""
Static file server for /web +:
  - POST   /api/rates  -> data/rates.json
  - GET    /api/trades -> { "rows": [...] } from SQLite
  - PUT    /api/trades -> replace all trade rows in SQLite
"""
from __future__ import annotations

import json
import os
import socket
import sqlite3
import sys
import tempfile
import threading
import urllib
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def _web_root() -> str:
    # PyInstaller one-file: exe lives beside index.html / data/
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


WEB_ROOT = _web_root()
RATES_PATH = os.path.join(WEB_ROOT, "data", "rates.json")
DB_PATH = os.path.join(WEB_ROOT, "data", "me2.db")
MAX_POST = 2_000_000
_db_lock = threading.Lock()


def _port_has_listener(host: str, port: int) -> bool:
    """True if something already accepts connections on this port (another serve_me2)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        try:
            s.close()
        except OSError:
            pass


DDL = """
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY NOT NULL,
  t INTEGER NOT NULL,
  ccode TEXT,
  is_buy INTEGER NOT NULL DEFAULT 0,
  in_vuv INTEGER NOT NULL DEFAULT 0,
  x REAL,
  rate REAL,
  base TEXT,
  leg_c TEXT,
  leg_s TEXT,
  d_v REAL
);
"""


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.join(WEB_ROOT, "data"), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db_lock:
        c = _connect()
        try:
            c.executescript(DDL)
        finally:
            c.close()


def _validate_rates(data) -> bool:
    if not isinstance(data, dict):
        return False
    cur = data.get("currencies")
    if not isinstance(cur, list) or not cur:
        return False
    for c in cur:
        if not isinstance(c, dict) or not c.get("code"):
            return False
        for key in ("weBuyVatu", "weSellVatu"):
            x = c.get(key)
            if not isinstance(x, (int, float)):
                return False
            if not (0 < float(x) < 1e12):
                return False
    return True


def _row_from_db(r: sqlite3.Row) -> dict:
    d = {k: r[k] for k in r.keys()}
    return {
        "id": d["id"],
        "t": int(d["t"]),
        "cCode": d["ccode"] or "",
        "isBuy": bool(d["is_buy"]),
        "inVuv": bool(d["in_vuv"]),
        "x": d["x"],
        "rate": d["rate"],
        "base": d["base"] or "",
        "legC": d["leg_c"] or "",
        "legS": d["leg_s"] or "",
        "dV": d["d_v"],
    }


def _trades_get_all() -> list[dict]:
    with _db_lock:
        c = _connect()
        try:
            q = c.execute("SELECT * FROM trades ORDER BY t ASC")
            return [_row_from_db(r) for r in q]
        finally:
            c.close()


def _trades_put_all(rows: list) -> None:
    with _db_lock:
        c = _connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            c.execute("DELETE FROM trades")
            for r in rows:
                if not isinstance(r, dict) or not r.get("id"):
                    raise ValueError("row")
                t = r.get("t")
                dv = r.get("dV")
                if dv is None and r.get("d_v") is not None:
                    dv = r.get("d_v")
                c.execute(
                    """
                    INSERT OR REPLACE INTO trades
                    (id, t, ccode, is_buy, in_vuv, x, rate, base, leg_c, leg_s, d_v)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(r["id"]),
                        int(t) if t is not None else 0,
                        (r.get("cCode") or r.get("ccode") or "") or None,
                        1 if r.get("isBuy") else 0,
                        1 if r.get("inVuv") else 0,
                        float(r["x"]) if r.get("x") is not None else None,
                        float(r["rate"]) if r.get("rate") is not None else None,
                        (r.get("base") or "") or None,
                        (r.get("legC") or r.get("leg_c") or "") or None,
                        (r.get("legS") or r.get("leg_s") or "") or None,
                        float(dv) if dv is not None else None,
                    ),
                )
            c.execute("COMMIT")
        except Exception:  # noqa: BLE001
            try:
                c.execute("ROLLBACK")
            except (OSError, sqlite3.OperationalError):
                pass
            raise
        finally:
            c.close()


def _validate_trades_payload(data) -> bool:
    if not isinstance(data, dict) or "rows" not in data:
        return False
    if not isinstance(data["rows"], list):
        return False
    for r in data["rows"]:
        if not isinstance(r, dict) or "id" not in r or "t" not in r:
            return False
    return True


def atomic_write_text(path: str, text: str) -> None:
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix="rates", suffix=".tmp", text=False)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as w:
            w.write(text)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    if _port_has_listener("127.0.0.1", port):
        return 0
    _init_db()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=WEB_ROOT, **k)

        def _send_json(self, obj, status: int = HTTPStatus.OK) -> None:
            raw = json.dumps(obj, ensure_ascii=True).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            path = (urllib.parse.urlparse(self.path).path or "/").rstrip("/") or "/"
            if path == "/api/trades":
                try:
                    self._send_json({"rows": _trades_get_all()})
                except OSError as e:
                    self.log_error("trades get: %s", e)
                    self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "db read")
                return
            super().do_GET()

        def do_PUT(self) -> None:  # noqa: N802
            path = (urllib.parse.urlparse(self.path).path or "/").rstrip("/") or "/"
            if path != "/api/trades":
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            n = int(self.headers.get("Content-Length", 0) or 0)
            if n < 0 or n > MAX_POST:
                self.send_error(HTTPStatus.BAD_REQUEST, "Body size")
                return
            try:
                body = self.rfile.read(n)
                data = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
                return
            if not _validate_trades_payload(data):
                self.send_error(HTTPStatus.BAD_REQUEST, "Invalid trades")
                return
            try:
                _trades_put_all(data["rows"])
            except (OSError, ValueError) as e:
                self.log_error("trades put: %s", e)
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "db write")
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()

        def do_POST(self) -> None:  # noqa: N802
            path = (urllib.parse.urlparse(self.path).path or "/").rstrip("/") or "/"
            if path != "/api/rates":
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            n = int(self.headers.get("Content-Length", 0) or 0)
            if n < 1 or n > MAX_POST:
                self.send_error(HTTPStatus.BAD_REQUEST, "Body size")
                return
            try:
                body = self.rfile.read(n)
                data = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
                return
            if not _validate_rates(data):
                self.send_error(HTTPStatus.BAD_REQUEST, "Invalid rate structure")
                return
            try:
                text = json.dumps(data, ensure_ascii=True, indent=2) + "\n"
                atomic_write_text(RATES_PATH, text)
            except OSError as e:
                self.log_error("save rates: %s", e)
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Write failed")
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()

        def log_message(self, fmt, *args) -> None:  # noqa: A003
            if os.environ.get("ME2_DEBUG_HTTP"):
                super().log_message(fmt, *args)

    try:
        with ThreadingHTTPServer(("127.0.0.1", port), Handler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        w = getattr(e, "winerror", None)
        if w == 10048 or e.errno in (98, 10048):
            return 0
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
