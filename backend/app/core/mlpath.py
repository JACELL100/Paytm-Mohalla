"""Put backend/ on sys.path so `import ml...` works (backend/ml holds the data and forecasting code)."""

import os
import sys
from pathlib import Path

from .config import API_DIR

_root = Path(os.environ.get("MOHALLA_BACKEND_DIR", str(API_DIR)))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
