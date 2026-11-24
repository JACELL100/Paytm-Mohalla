"""Run the API: `python -m app [--port 8000] [--host 127.0.0.1] [--reload]`.

Same as `uvicorn app.main:app`, but always on a selector event loop so the fast psycopg Postgres driver
also works on Windows (plain uvicorn on Windows uses a Proactor loop, where we fall back to asyncpg).
"""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true")
    a = ap.parse_args()
    uvicorn.run("app.main:app", host=a.host, port=a.port, reload=a.reload, loop="app.core.loops:selector_loop")


if __name__ == "__main__":
    main()
