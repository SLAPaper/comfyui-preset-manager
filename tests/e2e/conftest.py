"""
E2E test fixtures for ComfyUI Preset Manager.

Starts a lightweight ComfyUI instance with only the preset-manager plugin.
"""

import pytest
import pytest_asyncio
import subprocess
import sys
import time
import threading
from pathlib import Path

import httpx

PLUGIN_DIR = Path(__file__).parent.parent.parent
COMFYUI_DIR = PLUGIN_DIR.parent.parent  # custom_nodes/comfyui-preset-manager -> ComfyUI
PORT = 18188


@pytest.fixture(scope="session")
def comfyui_server():
    """Start a lightweight ComfyUI instance with only preset-manager loaded."""
    proc = subprocess.Popen(
        [
            sys.executable, "main.py",
            "--cpu", "--port", str(PORT),
            "--disable-all-custom-nodes",
            "--whitelist-custom-nodes", "comfyui-preset-manager",
            "--disable-api-nodes",
            "--database-url", "sqlite:///:memory:",
        ],
        cwd=str(COMFYUI_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    # Drain output in background to prevent pipe blocking
    output_lines = []
    def _drain():
        for line in proc.stdout:
            output_lines.append(line.rstrip())
    threading.Thread(target=_drain, daemon=True).start()

    # Wait for server to be ready
    base_url = f"http://127.0.0.1:{PORT}"
    for _ in range(60):
        try:
            resp = httpx.get(f"{base_url}/system_stats", timeout=2)
            if resp.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        proc.terminate()
        raise RuntimeError(
            "ComfyUI failed to start within 60 seconds.\n"
            + "\n".join(output_lines[-30:])
        )

    yield base_url

    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture
def api_base(comfyui_server):
    """Return the API base URL."""
    return comfyui_server


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
        yield page

        await browser.close()
