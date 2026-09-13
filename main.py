"""Root entrypoint shim for Nemesis Backend.

Provides backwards compatibility for:
  - uvicorn main:app --reload --port 8000
  - python main.py

The canonical application package is located in `app/`.
"""

from app.main import app, manager

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
