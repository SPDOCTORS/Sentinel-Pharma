# AI Engine Test Environment

Use Python 3.11 and an isolated virtual environment. This keeps FastAPI, PyTorch,
PyG, and test dependencies out of the system interpreter.

```powershell
cd ai_engine
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

`requirements-dev.txt` includes `requirements.txt`, which declares `pytest`,
`pytest-asyncio`, `pytest-cov`, and `pytest-mock` along with runtime dependencies
needed by the FastAPI and graph test suite. The virtual environment is ignored by
Git. Do not run model training, dataset download, or artifact-mutating commands as
part of test setup.

The full suite includes CPU-bound GNN evaluation smoke tests and normally takes
about 35–40 seconds on the current Windows environment. Pytest uses the ignored
`.pytest_cache_local` directory because an older cache directory may be
non-writable after an elevated run.
