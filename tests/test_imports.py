"""
Pytest configuration for ComfyUI Preset Manager tests.

Provides fixtures that import the actual modules.
"""

import pytest
import sys
from pathlib import Path

# Add plugin directory to path so we can import modules
PLUGIN_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(PLUGIN_DIR))


@pytest.fixture
def workflow_parser():
    """Import and return the workflow_parser module."""
    import workflow_parser
    return workflow_parser


@pytest.fixture
def node_matcher():
    """Import and return the node_matcher module."""
    import node_matcher
    return node_matcher


@pytest.fixture
def preset_manager():
    """Import and return the preset_manager module."""
    import preset_manager
    return preset_manager
