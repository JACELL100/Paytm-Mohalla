"""Put the repo root on sys.path so `import ml...` works (the ml/ folder is shared with the API)."""

import os
import sys
from pathlib import Path

from .config import REPO_ROOT

_root = Path(os.environ.get("MOHALLA_REPO_ROOT", str(REPO_ROOT)))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
