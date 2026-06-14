"""
Node matching algorithm for ComfyUI Preset Manager.

Matches workflow nodes to template parameters using class_type and title keyword strategies.
"""

import copy
from dataclasses import dataclass


@dataclass
class MatchResult:
    node_id: str
    widget_name: str
    current_value: any = None


def _get_effective_class_type(node: dict, synonyms: dict) -> str:
    """
    Get the effective class_type for a node, applying synonym mapping if available.
    Example: KSamplerAdvanced -> KSampler (if synonym exists)
    """
    class_type = node.get("class_type", "")
    return synonyms.get(class_type, class_type)


def _find_nodes_by_class(workflow: dict, class_type: str, synonyms: dict) -> list[tuple[str, dict]]:
    """
    Find all nodes in workflow that match the given class_type (after synonym resolution).
    Returns list of (node_id, node_data) tuples.
    """
    matches = []
    for node_id, node_data in workflow.items():
        effective_type = _get_effective_class_type(node_data, synonyms)
        if effective_type == class_type:
            matches.append((node_id, node_data))
    return matches


def _match_unique_class(workflow: dict, param_def: dict, synonyms: dict) -> MatchResult | None:
    """
    Match using unique_class strategy.
    Only matches if exactly one node of the target class_type exists.
    """
    class_type = param_def.get("class_type", "")
    widget_name = param_def.get("widget", "")

    nodes = _find_nodes_by_class(workflow, class_type, synonyms)

    if len(nodes) == 1:
        node_id, node_data = nodes[0]
        current_value = node_data.get("inputs", {}).get(widget_name)
        return MatchResult(node_id=node_id, widget_name=widget_name, current_value=current_value)
    elif len(nodes) == 0:
        return None
    else:
        # Multiple nodes of same class_type - unique_class can't disambiguate
        print(f"[PresetManager] [WARN] unique_class 策略失败: 找到 {len(nodes)} 个 {class_type} 节点")
        return None


def _match_title_keyword(workflow: dict, param_def: dict, synonyms: dict) -> MatchResult | None:
    """
    Match using title_keyword strategy.
    Matches nodes whose class_type matches AND title contains one of the keywords.
    """
    class_type = param_def.get("class_type", "")
    widget_name = param_def.get("widget", "")
    title_keywords = param_def.get("title_keywords", [])

    nodes = _find_nodes_by_class(workflow, class_type, synonyms)

    for node_id, node_data in nodes:
        # Get title from _meta.title or fallback to class_type
        meta = node_data.get("_meta", {})
        title = meta.get("title", "")

        # Check if title contains any of the keywords (case-insensitive)
        title_lower = title.lower()
        for keyword in title_keywords:
            if keyword.lower() in title_lower:
                current_value = node_data.get("inputs", {}).get(widget_name)
                return MatchResult(node_id=node_id, widget_name=widget_name, current_value=current_value)

    return None


def match_nodes(workflow: dict, template: dict) -> dict[str, MatchResult | None]:
    """
    Match workflow nodes to template parameters.

    Args:
        workflow: ComfyUI workflow dict {node_id: {class_type, inputs, _meta}}
        template: Parsed template dict with node_mapping and synonyms

    Returns:
        {param_name: MatchResult or None if not matched}
        Logs warnings for unmatched non-optional parameters.
    """
    node_mapping = template.get("node_mapping", {})
    synonyms = template.get("synonyms", {})
    results = {}

    for param_name, param_def in node_mapping.items():
        match_strategy = param_def.get("match_strategy", "")
        class_type = param_def.get("class_type", "")
        is_optional = param_def.get("optional", False)

        result = None

        if match_strategy == "unique_class":
            result = _match_unique_class(workflow, param_def, synonyms)
        elif match_strategy == "title_keyword":
            result = _match_title_keyword(workflow, param_def, synonyms)
        else:
            print(f"[PresetManager] [WARN] 未知匹配策略: {match_strategy}")
            continue

        if result is not None:
            print(f"[PresetManager] 匹配 {param_name}: 节点 {result.node_id} ({class_type})")
        else:
            if not is_optional:
                print(f"[PresetManager] [WARN] 匹配失败: {param_name} ({class_type} 不存在)")

        results[param_name] = result

    return results


def apply_preset(workflow: dict, template: dict, preset_params: dict) -> dict:
    """
    Apply preset parameters to workflow.

    Args:
        workflow: ComfyUI workflow dict (will be deep-copied)
        template: Parsed template dict
        preset_params: {param_name: value} from preset

    Returns:
        Modified workflow dict (original unchanged)
    """
    # Deep copy to avoid modifying original
    workflow_copy = copy.deepcopy(workflow)

    # Match nodes to parameters
    matches = match_nodes(workflow, template)

    # Apply preset values
    success_count = 0
    total_count = 0

    for param_name, value in preset_params.items():
        total_count += 1
        match_result = matches.get(param_name)

        if match_result is not None:
            node_id = match_result.node_id
            widget_name = match_result.widget_name

            # Ensure inputs dict exists
            if "inputs" not in workflow_copy[node_id]:
                workflow_copy[node_id]["inputs"] = {}

            # Set the value
            workflow_copy[node_id]["inputs"][widget_name] = value
            success_count += 1
        else:
            print(f"[PresetManager] [WARN] 无法注入参数 {param_name}: 未匹配到节点")

    print(f"[PresetManager] 注入完成: {success_count}/{total_count} 个参数成功")

    return workflow_copy
