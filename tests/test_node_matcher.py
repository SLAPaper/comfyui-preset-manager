"""
Tests for node_matcher module.

Verifies node matching algorithms (unique_class, title_keyword) and preset application.
"""

import pytest
from copy import deepcopy


# === Tests for match_nodes() ===


def test_match_nodes_returns_dict(node_matcher, sample_workflow, sample_template):
    """match_nodes() should return a dict mapping param_name to MatchResult."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert isinstance(result, dict)


def test_match_nodes_matches_unique_class_sampler(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match KSampler for sampler parameter."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["sampler"] is not None
    assert result["sampler"].node_id == "3"
    assert result["sampler"].widget_name == "sampler_name"


def test_match_nodes_matches_unique_class_steps(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match KSampler for steps parameter."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["steps"] is not None
    assert result["steps"].node_id == "3"
    assert result["steps"].widget_name == "steps"


def test_match_nodes_matches_unique_class_dimensions(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match EmptyLatentImage for width/height."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["width"] is not None
    assert result["width"].node_id == "5"
    assert result["height"] is not None
    assert result["height"].node_id == "5"


def test_match_nodes_matches_title_keyword_positive(node_matcher, sample_workflow, sample_template):
    """title_keyword strategy should match CLIPTextEncode with 'positive' in title."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["positive_prompt"] is not None
    assert result["positive_prompt"].node_id == "6"
    assert result["positive_prompt"].widget_name == "text"


def test_match_nodes_matches_title_keyword_negative(node_matcher, sample_workflow, sample_template):
    """title_keyword strategy should match CLIPTextEncode with 'negative' in title."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["negative_prompt"] is not None
    assert result["negative_prompt"].node_id == "7"
    assert result["negative_prompt"].widget_name == "text"


def test_match_nodes_returns_none_for_missing_node(node_matcher, sample_template):
    """match_nodes() should return None for parameters with no matching node."""
    # Workflow without CLIPTextEncode nodes
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {"steps": 20},
            "_meta": {"title": "KSampler"}
        }
    }
    result = node_matcher.match_nodes(workflow, sample_template)
    assert result["positive_prompt"] is None
    assert result["negative_prompt"] is None


def test_match_nodes_logs_success(node_matcher, sample_workflow, sample_template, capsys):
    """match_nodes() should log successful matches."""
    node_matcher.match_nodes(sample_workflow, sample_template)
    captured = capsys.readouterr()
    assert "[PresetManager] 匹配" in captured.out


def test_match_nodes_logs_failure(node_matcher, sample_template, capsys):
    """match_nodes() should log warnings for failed non-optional matches."""
    workflow = {"3": {"class_type": "KSampler", "inputs": {}, "_meta": {}}}
    node_matcher.match_nodes(workflow, sample_template)
    captured = capsys.readouterr()
    assert "[WARN] 匹配失败" in captured.out


# === Tests for synonym handling ===


def test_match_nodes_handles_synonyms(node_matcher, sample_template):
    """match_nodes() should handle class_type synonyms (KSamplerAdvanced -> KSampler)."""
    workflow = {
        "3": {
            "class_type": "KSamplerAdvanced",  # Synonym for KSampler
            "inputs": {"sampler_name": "euler", "steps": 20},
            "_meta": {"title": "KSampler"}
        }
    }
    result = node_matcher.match_nodes(workflow, sample_template)
    assert result["sampler"] is not None
    assert result["sampler"].node_id == "3"


# === Tests for apply_preset() ===


def test_apply_preset_returns_modified_workflow(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should return a modified workflow dict."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert isinstance(result, dict)


def test_apply_preset_does_not_modify_original(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should NOT modify the original workflow."""
    original_steps = sample_workflow["3"]["inputs"]["steps"]
    node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert sample_workflow["3"]["inputs"]["steps"] == original_steps


def test_apply_preset_injects_positive_prompt(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject positive_prompt into matched CLIPTextEncode node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["6"]["inputs"]["text"] == "masterpiece, best quality, ultra detailed"


def test_apply_preset_injects_negative_prompt(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject negative_prompt into matched CLIPTextEncode node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["7"]["inputs"]["text"] == "worst quality, low quality, blurry"


def test_apply_preset_injects_sampler(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject sampler_name into KSampler node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    # The preset has sampler: "euler_ancestral", which maps to widget sampler_name
    assert result["3"]["inputs"]["sampler_name"] == sample_preset["params"]["sampler"]


def test_apply_preset_injects_steps(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject steps into KSampler node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["3"]["inputs"]["steps"] == 30


def test_apply_preset_injects_dimensions(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject width/height into EmptyLatentImage node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["5"]["inputs"]["width"] == 1024
    assert result["5"]["inputs"]["height"] == 1024


def test_apply_preset_logs_injection_summary(node_matcher, sample_workflow, sample_template, sample_preset, capsys):
    """apply_preset() should log injection summary."""
    node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    captured = capsys.readouterr()
    assert "注入完成:" in captured.out


def test_apply_preset_handles_missing_params_gracefully(node_matcher, sample_workflow, sample_template):
    """apply_preset() should handle preset with missing params gracefully."""
    partial_params = {"steps": 30}  # Only inject steps
    result = node_matcher.apply_preset(sample_workflow, sample_template, partial_params)
    assert result["3"]["inputs"]["steps"] == 30
    # Other params should remain unchanged
    assert result["3"]["inputs"]["sampler_name"] == "euler"


# === Tests for output_connection strategy ===


FLUX_WORKFLOW = {
    "10": {
        "class_type": "RandomNoise",
        "inputs": {"noise_seed": 12345},
        "_meta": {"title": "RandomNoise"}
    },
    "20": {
        "class_type": "BasicScheduler",
        "inputs": {"steps": 20, "scheduler": "simple", "denoise": 1.0},
        "_meta": {"title": "BasicScheduler"}
    },
    "30": {
        "class_type": "KSamplerSelect",
        "inputs": {"sampler_name": "euler"},
        "_meta": {"title": "KSamplerSelect"}
    },
    "40": {
        "class_type": "FluxGuidance",
        "inputs": {"guidance": 3.5},
        "_meta": {"title": "FluxGuidance"}
    },
    "50": {
        "class_type": "PrimitiveInt",
        "inputs": {"value": 768},
        "_meta": {"title": "宽度"}
    },
    "51": {
        "class_type": "PrimitiveInt",
        "inputs": {"value": 1280},
        "_meta": {"title": "高度"}
    },
    "60": {
        "class_type": "ModelSamplingFlux",
        "inputs": {
            "max_shift": 1.15,
            "base_shift": 0.5,
            "width": ["50", 0],   # connected to PrimitiveInt id=50
            "height": ["51", 0],  # connected to PrimitiveInt id=51
        },
        "_meta": {"title": "ModelSamplingFlux"}
    },
}

FLUX_TEMPLATE = {
    "name": "Flux Test",
    "node_mapping": {
        "seed": {
            "match_strategy": "output_connection",
            "target_class_type": "RandomNoise",
            "target_input": "noise_seed",
            "widget": "noise_seed"
        },
        "width": {
            "match_strategy": "output_connection",
            "target_class_type": "ModelSamplingFlux",
            "target_input": "width",
            "widget": "value"
        },
        "height": {
            "match_strategy": "output_connection",
            "target_class_type": "ModelSamplingFlux",
            "target_input": "height",
            "widget": "value"
        },
    },
    "synonyms": {}
}


def test_match_output_connection_follows_link(node_matcher):
    """output_connection should trace connected input back to source node."""
    result = node_matcher.match_nodes(FLUX_WORKFLOW, FLUX_TEMPLATE)
    # width input on ModelSamplingFlux is connected to PrimitiveInt id=50
    assert result["width"] is not None
    assert result["width"].node_id == "50"
    assert result["width"].widget_name == "value"
    assert result["width"].current_value == 768


def test_match_output_connection_follows_link_for_height(node_matcher):
    """output_connection should trace height input back to source node."""
    result = node_matcher.match_nodes(FLUX_WORKFLOW, FLUX_TEMPLATE)
    assert result["height"] is not None
    assert result["height"].node_id == "51"
    assert result["height"].widget_name == "value"
    assert result["height"].current_value == 1280


def test_match_output_connection_fallback_when_unconnected(node_matcher):
    """output_connection should fall back to target node's own widget when input is not connected."""
    result = node_matcher.match_nodes(FLUX_WORKFLOW, FLUX_TEMPLATE)
    # seed input on RandomNoise is not connected (direct value)
    assert result["seed"] is not None
    assert result["seed"].node_id == "10"
    assert result["seed"].widget_name == "noise_seed"
    assert result["seed"].current_value == 12345


def test_match_output_connection_returns_none_for_missing_target(node_matcher):
    """output_connection should return None when target node doesn't exist."""
    template = {
        "name": "Test",
        "node_mapping": {
            "param": {
                "match_strategy": "output_connection",
                "target_class_type": "NonExistentNode",
                "target_input": "some_input",
                "widget": "value"
            }
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(FLUX_WORKFLOW, template)
    assert result["param"] is None


def test_apply_preset_with_output_connection(node_matcher):
    """apply_preset() should inject values through output_connection strategy."""
    params = {"width": 1024, "height": 1024}
    result = node_matcher.apply_preset(FLUX_WORKFLOW, FLUX_TEMPLATE, params)
    # width should be injected into PrimitiveInt id=50
    assert result["50"]["inputs"]["value"] == 1024
    # height should be injected into PrimitiveInt id=51
    assert result["51"]["inputs"]["value"] == 1024


# === Tests for input_slot strategy ===


# Anima-like workflow: CLIPTextEncode nodes have NO titles
ANIMA_WORKFLOW = {
    "1": {
        "class_type": "UNETLoader",
        "inputs": {"unet_name": "anima/model.safetensors", "weight_dtype": "default"},
        "_meta": {"title": ""}
    },
    "2": {
        "class_type": "CLIPLoader",
        "inputs": {"clip_name": "qwen_3_06b_base.safetensors", "type": "stable_diffusion", "device": "default"},
        "_meta": {"title": ""}
    },
    "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "positive prompt text", "clip": ["2", 0]},
        "_meta": {"title": ""}
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "negative prompt text", "clip": ["2", 0]},
        "_meta": {"title": ""}
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        "_meta": {"title": ""}
    },
    "17": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 783399240628280,
            "steps": 35,
            "cfg": 5,
            "sampler_name": "euler_ancestral",
            "scheduler": "bong_tangent",
            "denoise": 1,
            "model": ["1", 0],
            "positive": ["3", 0],
            "negative": ["4", 0],
            "latent_image": ["5", 0]
        },
        "_meta": {"title": ""}
    },
}

ANIMA_TEMPLATE = {
    "name": "Anima Test",
    "node_mapping": {
        "positive_prompt": {
            "match_strategy": "input_slot",
            "class_type": "KSampler",
            "input_name": "positive",
            "widget": "text"
        },
        "negative_prompt": {
            "match_strategy": "input_slot",
            "class_type": "KSampler",
            "input_name": "negative",
            "widget": "text"
        },
        "steps": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "steps"
        },
        "cfg": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "cfg"
        },
        "sampler": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "sampler_name"
        },
        "scheduler": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "scheduler"
        },
        "width": {
            "match_strategy": "unique_class",
            "class_type": "EmptyLatentImage",
            "widget": "width"
        },
        "height": {
            "match_strategy": "unique_class",
            "class_type": "EmptyLatentImage",
            "widget": "height"
        },
    },
    "synonyms": {
        "KSamplerAdvanced": "KSampler"
    }
}


def test_match_input_slot_follows_positive_input(node_matcher):
    """input_slot should trace KSampler's positive input to CLIPTextEncode."""
    result = node_matcher.match_nodes(ANIMA_WORKFLOW, ANIMA_TEMPLATE)
    assert result["positive_prompt"] is not None
    assert result["positive_prompt"].node_id == "3"
    assert result["positive_prompt"].widget_name == "text"
    assert result["positive_prompt"].current_value == "positive prompt text"


def test_match_input_slot_follows_negative_input(node_matcher):
    """input_slot should trace KSampler's negative input to CLIPTextEncode."""
    result = node_matcher.match_nodes(ANIMA_WORKFLOW, ANIMA_TEMPLATE)
    assert result["negative_prompt"] is not None
    assert result["negative_prompt"].node_id == "4"
    assert result["negative_prompt"].widget_name == "text"
    assert result["negative_prompt"].current_value == "negative prompt text"


def test_match_input_slot_returns_none_for_missing_hub(node_matcher):
    """input_slot should return None when hub node (KSampler) doesn't exist."""
    template = {
        "name": "Test",
        "node_mapping": {
            "prompt": {
                "match_strategy": "input_slot",
                "class_type": "NonExistentHub",
                "input_name": "positive",
                "widget": "text"
            }
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(ANIMA_WORKFLOW, template)
    assert result["prompt"] is None


def test_match_input_slot_returns_none_when_not_connected(node_matcher):
    """input_slot should return None when the input slot has no connection."""
    workflow = {
        "17": {
            "class_type": "KSampler",
            "inputs": {
                "positive": "direct value string",
                "steps": 20
            },
            "_meta": {"title": ""}
        }
    }
    template = {
        "name": "Test",
        "node_mapping": {
            "prompt": {
                "match_strategy": "input_slot",
                "class_type": "KSampler",
                "input_name": "positive",
                "widget": "text"
            }
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(workflow, template)
    assert result["prompt"] is None


def test_match_input_slot_with_synonyms(node_matcher):
    """input_slot should handle synonyms (KSamplerAdvanced -> KSampler)."""
    workflow = {
        "17": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "positive": ["3", 0],
                "negative": ["4", 0],
                "steps": 20
            },
            "_meta": {"title": ""}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "test prompt"},
            "_meta": {"title": ""}
        },
    }
    template = {
        "name": "Test",
        "node_mapping": {
            "prompt": {
                "match_strategy": "input_slot",
                "class_type": "KSampler",
                "input_name": "positive",
                "widget": "text"
            }
        },
        "synonyms": {"KSamplerAdvanced": "KSampler"}
    }
    result = node_matcher.match_nodes(workflow, template)
    assert result["prompt"] is not None
    assert result["prompt"].node_id == "3"


def test_match_input_slot_unique_class_still_works(node_matcher):
    """unique_class and input_slot should work together in the same template."""
    result = node_matcher.match_nodes(ANIMA_WORKFLOW, ANIMA_TEMPLATE)
    assert result["positive_prompt"] is not None
    assert result["negative_prompt"] is not None
    assert result["steps"] is not None
    assert result["steps"].node_id == "17"
    assert result["cfg"] is not None
    assert result["sampler"] is not None
    assert result["scheduler"] is not None
    assert result["width"] is not None
    assert result["height"] is not None


def test_apply_preset_with_input_slot(node_matcher):
    """apply_preset() should inject values through input_slot strategy."""
    params = {
        "positive_prompt": "new positive",
        "negative_prompt": "new negative",
        "steps": 20,
        "cfg": 7.0,
    }
    result = node_matcher.apply_preset(ANIMA_WORKFLOW, ANIMA_TEMPLATE, params)
    assert result["3"]["inputs"]["text"] == "new positive"
    assert result["4"]["inputs"]["text"] == "new negative"
    assert result["17"]["inputs"]["steps"] == 20


# === Tests for Qwen Image Edit template (input_slot + unique_class, no EmptyLatentImage) ===

QWEN_EDIT_WORKFLOW = {
    "37": {
        "class_type": "UNETLoader",
        "inputs": {"unet_name": "qwen_image_edit_fp8.safetensors", "weight_dtype": "default"},
        "_meta": {"title": ""}
    },
    "38": {
        "class_type": "CLIPLoader",
        "inputs": {"clip_name": "qwen_2.5_vl_7b.safetensors", "type": "qwen_image", "device": "default"},
        "_meta": {"title": ""}
    },
    "39": {
        "class_type": "VAELoader",
        "inputs": {"vae_name": "qwen_image_vae.safetensors"},
        "_meta": {"title": ""}
    },
    "76": {
        "class_type": "TextEncodeQwenImageEdit",
        "inputs": {"prompt": "Put this logo onto a cardboard", "clip": ["38", 0], "vae": ["39", 0], "image": ["78", 0]},
        "_meta": {"title": ""}
    },
    "77": {
        "class_type": "TextEncodeQwenImageEdit",
        "inputs": {"prompt": "", "clip": ["38", 0], "vae": ["39", 0], "image": ["78", 0]},
        "_meta": {"title": ""}
    },
    "78": {
        "class_type": "LoadImage",
        "inputs": {"image": "logo1.png"},
        "_meta": {"title": ""}
    },
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 976480016588017,
            "steps": 20,
            "cfg": 2.5,
            "sampler_name": "euler",
            "scheduler": "simple",
            "denoise": 1,
            "model": ["37", 0],
            "positive": ["76", 0],
            "negative": ["77", 0],
            "latent_image": ["88", 0]
        },
        "_meta": {"title": ""}
    },
    "88": {
        "class_type": "VAEEncode",
        "inputs": {"pixels": ["93", 0], "vae": ["39", 0]},
        "_meta": {"title": ""}
    },
}

QWEN_EDIT_TEMPLATE = {
    "name": "Qwen Image Edit",
    "node_mapping": {
        "positive_prompt": {
            "match_strategy": "input_slot",
            "class_type": "KSampler",
            "input_name": "positive",
            "widget": "prompt"
        },
        "negative_prompt": {
            "match_strategy": "input_slot",
            "class_type": "KSampler",
            "input_name": "negative",
            "widget": "prompt"
        },
        "steps": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "steps"
        },
        "cfg": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "cfg"
        },
        "sampler": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "sampler_name"
        },
        "scheduler": {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "scheduler"
        },
    },
    "synonyms": {}
}


def test_qwen_edit_positive_prompt_via_input_slot(node_matcher):
    """Qwen Edit: input_slot traces KSampler positive to TextEncodeQwenImageEdit."""
    result = node_matcher.match_nodes(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE)
    assert result["positive_prompt"] is not None
    assert result["positive_prompt"].node_id == "76"
    assert result["positive_prompt"].widget_name == "prompt"
    assert result["positive_prompt"].current_value == "Put this logo onto a cardboard"


def test_qwen_edit_negative_prompt_via_input_slot(node_matcher):
    """Qwen Edit: input_slot traces KSampler negative to TextEncodeQwenImageEdit."""
    result = node_matcher.match_nodes(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE)
    assert result["negative_prompt"] is not None
    assert result["negative_prompt"].node_id == "77"
    assert result["negative_prompt"].widget_name == "prompt"
    assert result["negative_prompt"].current_value == ""


def test_qwen_edit_sampler_params(node_matcher):
    """Qwen Edit: unique_class matches KSampler params correctly."""
    result = node_matcher.match_nodes(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE)
    assert result["steps"].current_value == 20
    assert result["cfg"].current_value == 2.5
    assert result["sampler"].current_value == "euler"
    assert result["scheduler"].current_value == "simple"


def test_qwen_edit_no_width_height(node_matcher):
    """Qwen Edit template should NOT have width/height (uses VAEEncode, not EmptyLatentImage)."""
    result = node_matcher.match_nodes(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE)
    assert "width" not in QWEN_EDIT_TEMPLATE["node_mapping"]
    assert "height" not in QWEN_EDIT_TEMPLATE["node_mapping"]


def test_qwen_edit_input_slot_ignores_source_class_type(node_matcher):
    """input_slot should work regardless of source node class_type (TextEncodeQwenImageEdit vs CLIPTextEncode)."""
    result = node_matcher.match_nodes(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE)
    # The source is TextEncodeQwenImageEdit, not CLIPTextEncode — input_slot doesn't care
    assert result["positive_prompt"] is not None
    assert result["positive_prompt"].node_id == "76"


def test_qwen_edit_apply_preset(node_matcher):
    """apply_preset should inject values into Qwen Edit workflow."""
    params = {
        "positive_prompt": "new edit instruction",
        "negative_prompt": "bad quality",
        "steps": 30,
        "cfg": 3.0,
        "sampler": "euler_ancestral",
        "scheduler": "normal",
    }
    result = node_matcher.apply_preset(QWEN_EDIT_WORKFLOW, QWEN_EDIT_TEMPLATE, params)
    assert result["76"]["inputs"]["prompt"] == "new edit instruction"
    assert result["77"]["inputs"]["prompt"] == "bad quality"
    assert result["3"]["inputs"]["steps"] == 30
    assert result["3"]["inputs"]["cfg"] == 3.0
    assert result["3"]["inputs"]["sampler_name"] == "euler_ancestral"
    assert result["3"]["inputs"]["scheduler"] == "normal"


# === Tests for input_slot multi-hop (recursive) matching ===

# Qwen Image Edit 2511-like workflow: KSampler ← IntermediateNode ← TextEncode
QWEN_EDIT_2511_WORKFLOW = {
    "68": {
        "class_type": "TextEncodeQwenImageEditPlus",
        "inputs": {"prompt": "positive edit instruction", "clip": ["61", 0], "image1": ["79", 0]},
        "_meta": {"title": ""}
    },
    "69": {
        "class_type": "TextEncodeQwenImageEditPlus",
        "inputs": {"prompt": "", "clip": ["61", 0], "image1": ["79", 0]},
        "_meta": {"title": ""}
    },
    "91": {
        "class_type": "ReferenceLatent",
        "inputs": {"conditioning": ["68", 0], "latent": ["75", 0]},
        "_meta": {"title": ""}
    },
    "92": {
        "class_type": "ReferenceLatent",
        "inputs": {"conditioning": ["69", 0], "latent": ["75", 0]},
        "_meta": {"title": ""}
    },
    "70": {
        "class_type": "FluxKontextMultiReferenceLatentMethod",
        "inputs": {"conditioning": ["91", 0]},
        "_meta": {"title": ""}
    },
    "71": {
        "class_type": "FluxKontextMultiReferenceLatentMethod",
        "inputs": {"conditioning": ["92", 0]},
        "_meta": {"title": ""}
    },
    "65": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 374470990866512,
            "steps": 20,
            "cfg": 4,
            "sampler_name": "euler_ancestral",
            "scheduler": "bong_tangent",
            "denoise": 1,
            "model": ["64", 0],
            "positive": ["70", 0],
            "negative": ["71", 0],
            "latent_image": ["98", 0]
        },
        "_meta": {"title": ""}
    },
}


def test_input_slot_follows_multi_hop_to_widget(node_matcher):
    """input_slot should recursively follow conditioning chain to find the widget source."""
    template = {
        "name": "Test Multi-Hop",
        "node_mapping": {
            "positive_prompt": {
                "match_strategy": "input_slot",
                "class_type": "KSampler",
                "input_name": "positive",
                "widget": "prompt"
            },
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(QWEN_EDIT_2511_WORKFLOW, template)
    assert result["positive_prompt"] is not None
    # Should find node 68 (TextEncodeQwenImageEditPlus), NOT node 70 (FluxKontextMultiReferenceLatentMethod)
    assert result["positive_prompt"].node_id == "68"
    assert result["positive_prompt"].widget_name == "prompt"
    assert result["positive_prompt"].current_value == "positive edit instruction"


def test_input_slot_multi_hop_negative(node_matcher):
    """input_slot should follow multi-hop chain for negative prompt too."""
    template = {
        "name": "Test Multi-Hop",
        "node_mapping": {
            "negative_prompt": {
                "match_strategy": "input_slot",
                "class_type": "KSampler",
                "input_name": "negative",
                "widget": "prompt"
            },
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(QWEN_EDIT_2511_WORKFLOW, template)
    assert result["negative_prompt"] is not None
    assert result["negative_prompt"].node_id == "69"


def test_input_slot_multi_hop_respects_depth_limit(node_matcher):
    """input_slot should stop at max_depth and return None if chain is too long."""
    # Create a 6-level deep chain (exceeds max_depth=5)
    deep_workflow = {
        "99": {
            "class_type": "TextEncodeQwenImageEditPlus",
            "inputs": {"prompt": "deep prompt"},
            "_meta": {"title": ""}
        },
        "98": {"class_type": "Intermediate1", "inputs": {"conditioning": ["99", 0]}, "_meta": {"title": ""}},
        "97": {"class_type": "Intermediate2", "inputs": {"conditioning": ["98", 0]}, "_meta": {"title": ""}},
        "96": {"class_type": "Intermediate3", "inputs": {"conditioning": ["97", 0]}, "_meta": {"title": ""}},
        "95": {"class_type": "Intermediate4", "inputs": {"conditioning": ["96", 0]}, "_meta": {"title": ""}},
        "94": {"class_type": "Intermediate5", "inputs": {"conditioning": ["95", 0]}, "_meta": {"title": ""}},
        "93": {"class_type": "Intermediate6", "inputs": {"conditioning": ["94", 0]}, "_meta": {"title": ""}},
        "3": {
            "class_type": "KSampler",
            "inputs": {"positive": ["93", 0], "steps": 20},
            "_meta": {"title": ""}
        },
    }
    template = {
        "name": "Test Deep",
        "node_mapping": {
            "prompt": {
                "match_strategy": "input_slot",
                "class_type": "KSampler",
                "input_name": "positive",
                "widget": "prompt"
            },
        },
        "synonyms": {}
    }
    result = node_matcher.match_nodes(deep_workflow, template)
    assert result["prompt"] is None
