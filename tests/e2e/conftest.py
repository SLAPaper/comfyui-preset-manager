"""
E2E test fixtures for ComfyUI Preset Manager.

Starts a lightweight ComfyUI instance with only the preset-manager plugin.
Each session gets its own free port and temporary data directories, so tests
never touch the running user's presets, workflows, outputs, or temp files.
"""

import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
import pytest_asyncio

import httpx

PLUGIN_DIR = Path(__file__).parent.parent.parent
COMFYUI_DIR = PLUGIN_DIR.parent.parent  # custom_nodes/comfyui-preset-manager -> ComfyUI


def _get_comfyui_python() -> str:
    """Find the ComfyUI venv Python, falling back to sys.executable."""
    venv_python = COMFYUI_DIR / "venv" / "Scripts" / "python.exe"
    if venv_python.is_file():
        return str(venv_python)
    # Unix-style venv
    venv_python_unix = COMFYUI_DIR / "venv" / "bin" / "python"
    if venv_python_unix.is_file():
        return str(venv_python_unix)
    return sys.executable


def _get_free_port() -> int:
    """Reserve an ephemeral port so a leftover server cannot collide with us."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def comfyui_server(tmp_path_factory):
    """Start a lightweight ComfyUI instance with temporary data directories."""
    root = tmp_path_factory.mktemp("comfyui-e2e")
    dirs = {}
    for name in ("user", "output", "temp", "input"):
        path = root / name
        path.mkdir()
        dirs[name] = path

    port = _get_free_port()
    python_exe = _get_comfyui_python()
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        [
            python_exe, "main.py",
            "--cpu", "--port", str(port),
            "--user-directory", str(dirs["user"]),
            "--output-directory", str(dirs["output"]),
            "--temp-directory", str(dirs["temp"]),
            "--input-directory", str(dirs["input"]),
            "--disable-all-custom-nodes",
            "--whitelist-custom-nodes", "comfyui-preset-manager",
            "--disable-api-nodes",
            "--database-url", "sqlite:///:memory:",
        ],
        cwd=str(COMFYUI_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )

    # Drain output in background to prevent pipe blocking
    output_lines = []
    def _drain():
        for line in proc.stdout:
            output_lines.append(line.rstrip())
    threading.Thread(target=_drain, daemon=True).start()

    # Wait for server to be ready
    base_url = f"http://127.0.0.1:{port}"
    ready = False
    for _ in range(60):
        if proc.poll() is not None:
            break
        try:
            resp = httpx.get(f"{base_url}/system_stats", timeout=2)
            if resp.status_code == 200:
                ready = True
                break
        except Exception:
            pass
        time.sleep(1)

    if not ready:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        raise RuntimeError(
            "ComfyUI failed to start within 60 seconds.\n"
            + "\n".join(output_lines[-30:])
        )

    yield base_url

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


@pytest.fixture
def api_base(comfyui_server):
    """Return the API base URL."""
    return comfyui_server


async def _dismiss_startup_dialog(page):
    """Close the template browser that a fresh user directory opens on first run."""
    await page.wait_for_function(
        """() => document.querySelector('[data-testid="dialog-overlay"][data-state="open"]')
            || [...document.querySelectorAll('button')].some(button => button.textContent.includes('Presets'))""",
        timeout=15000,
    )

    overlay = page.locator('[data-testid="dialog-overlay"][data-state="open"]')
    if not await overlay.is_visible():
        return

    for name in ("关闭对话框", "Close dialog"):
        button = page.get_by_role("button", name=name)
        if await button.count():
            await button.first.click()
            break
    else:
        await page.keyboard.press("Escape")

    try:
        await overlay.wait_for(state="hidden", timeout=3000)
    except Exception:
        pass


@pytest_asyncio.fixture
async def page(comfyui_server):
    """Create a Playwright page with ComfyUI loaded."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Dismiss any beforeunload dialogs
        page.on("dialog", lambda d: d.accept())

        await page.goto(comfyui_server, wait_until="networkidle", timeout=30000)
        await _dismiss_startup_dialog(page)
        yield page

        await browser.close()
