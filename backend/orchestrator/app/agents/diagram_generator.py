"""
Mermaid diagram generator from spec YAML.

Generates visual architecture diagrams including:
- Data entity relationships (ER diagram)
- UI page flow (flowchart)
- API structure (flowchart)
"""

from __future__ import annotations

import yaml
from typing import Optional


def generate_architecture_diagram(spec_yaml: str) -> str:
    """
    Generate a Mermaid architecture diagram from spec YAML.

    Combines data entities, UI pages, and API endpoints into
    a comprehensive flowchart showing the application structure.
    """
    try:
        spec = yaml.safe_load(spec_yaml)
        if not isinstance(spec, dict):
            return ""
    except Exception:
        return ""

    lines = ["flowchart TB"]

    # Add subgraph for UI Pages
    pages = spec.get("ui_pages", [])
    if pages:
        lines.append("    subgraph UI[\"Frontend Pages\"]")
        for page in pages:
            if isinstance(page, dict):
                page_id = _sanitize_id(page.get("path", "") or page.get("name", ""))
                page_name = page.get("name", page.get("path", "Page"))
                if page_id:
                    lines.append(f"        {page_id}[\"{page_name}\"]")
        lines.append("    end")

    # Add subgraph for API Endpoints
    endpoints = spec.get("api_endpoints", [])
    if endpoints:
        lines.append("    subgraph API[\"Backend API\"]")
        for ep in endpoints:
            if isinstance(ep, dict):
                method = ep.get("method", "GET")
                path = ep.get("path", "")
                ep_id = _sanitize_id(f"{method}_{path}")
                ep_name = f"{method} {path}"
                if ep_id:
                    lines.append(f"        {ep_id}[\"{ep_name}\"]")
        lines.append("    end")

    # Add subgraph for Data Entities
    entities = spec.get("data_entities", [])
    if entities:
        lines.append("    subgraph DB[\"Data Layer\"]")
        for entity in entities:
            if isinstance(entity, dict):
                entity_name = entity.get("name", "")
                entity_id = _sanitize_id(entity_name)
                fields = entity.get("fields", [])
                field_count = len(fields) if isinstance(fields, list) else 0
                if entity_id:
                    lines.append(f"        {entity_id}[(\"{entity_name}<br/>{field_count} fields\")]")
        lines.append("    end")

    # Add connections from UI to API
    if pages and endpoints:
        lines.append("")
        lines.append("    %% UI to API connections")
        for page in pages:
            if isinstance(page, dict):
                page_id = _sanitize_id(page.get("path", "") or page.get("name", ""))
                data_reqs = page.get("data_requirements", [])
                if page_id and data_reqs:
                    # Connect to first relevant endpoint
                    for ep in endpoints[:3]:  # Limit connections for clarity
                        if isinstance(ep, dict):
                            method = ep.get("method", "GET")
                            path = ep.get("path", "")
                            ep_id = _sanitize_id(f"{method}_{path}")
                            if ep_id:
                                lines.append(f"    {page_id} --> {ep_id}")
                                break

    # Add connections from API to Data
    if endpoints and entities:
        lines.append("")
        lines.append("    %% API to Data connections")
        for ep in endpoints:
            if isinstance(ep, dict):
                method = ep.get("method", "GET")
                path = ep.get("path", "")
                ep_id = _sanitize_id(f"{method}_{path}")
                if ep_id and entities:
                    # Connect to first entity (simplified)
                    entity = entities[0]
                    if isinstance(entity, dict):
                        entity_id = _sanitize_id(entity.get("name", ""))
                        if entity_id:
                            lines.append(f"    {ep_id} --> {entity_id}")

    # Styling
    lines.append("")
    lines.append("    %% Styling")
    lines.append("    classDef uiStyle fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e")
    lines.append("    classDef apiStyle fill:#fef3c7,stroke:#d97706,color:#78350f")
    lines.append("    classDef dbStyle fill:#dcfce7,stroke:#16a34a,color:#14532d")

    if pages:
        page_ids = [_sanitize_id(p.get("path", "") or p.get("name", "")) for p in pages if isinstance(p, dict)]
        page_ids = [pid for pid in page_ids if pid]
        if page_ids:
            lines.append(f"    class {','.join(page_ids)} uiStyle")

    if endpoints:
        ep_ids = [_sanitize_id(f"{e.get('method', 'GET')}_{e.get('path', '')}") for e in endpoints if isinstance(e, dict)]
        ep_ids = [eid for eid in ep_ids if eid]
        if ep_ids:
            lines.append(f"    class {','.join(ep_ids)} apiStyle")

    if entities:
        entity_ids = [_sanitize_id(e.get("name", "")) for e in entities if isinstance(e, dict)]
        entity_ids = [eid for eid in entity_ids if eid]
        if entity_ids:
            lines.append(f"    class {','.join(entity_ids)} dbStyle")

    return "\n".join(lines)


def generate_entity_diagram(spec_yaml: str) -> str:
    """
    Generate a Mermaid ER diagram showing data entity relationships.
    """
    try:
        spec = yaml.safe_load(spec_yaml)
        if not isinstance(spec, dict):
            return ""
    except Exception:
        return ""

    entities = spec.get("data_entities", [])
    if not entities:
        return ""

    lines = ["erDiagram"]

    # Add entities with fields
    for entity in entities:
        if not isinstance(entity, dict):
            continue

        entity_name = entity.get("name", "")
        if not entity_name:
            continue

        # Sanitize entity name for ER diagram
        safe_name = entity_name.replace(" ", "_").replace("-", "_")

        fields = entity.get("fields", [])
        if fields and isinstance(fields, list):
            lines.append(f"    {safe_name} {{")
            for field in fields[:10]:  # Limit fields for readability
                if isinstance(field, dict):
                    field_name = field.get("name", "field")
                    field_type = field.get("type", "string")
                    lines.append(f"        {field_type} {field_name}")
                elif isinstance(field, str):
                    lines.append(f"        string {field}")
            lines.append("    }")
        else:
            lines.append(f"    {safe_name}")

    # Add relationships
    for entity in entities:
        if not isinstance(entity, dict):
            continue

        entity_name = entity.get("name", "").replace(" ", "_").replace("-", "_")
        relationships = entity.get("relationships", [])

        if relationships and isinstance(relationships, list):
            for rel in relationships:
                if isinstance(rel, dict):
                    target = rel.get("entity", rel.get("target", "")).replace(" ", "_").replace("-", "_")
                    rel_type = rel.get("type", "has")
                    if target:
                        # Determine cardinality
                        if "many" in rel_type.lower():
                            lines.append(f"    {entity_name} ||--o{{ {target} : \"{rel_type}\"")
                        else:
                            lines.append(f"    {entity_name} ||--|| {target} : \"{rel_type}\"")
                elif isinstance(rel, str):
                    target = rel.replace(" ", "_").replace("-", "_")
                    lines.append(f"    {entity_name} ||--o{{ {target} : \"has\"")

    return "\n".join(lines)


def generate_flow_diagram(spec_yaml: str) -> str:
    """
    Generate a Mermaid flowchart showing user flow through the application.
    """
    try:
        spec = yaml.safe_load(spec_yaml)
        if not isinstance(spec, dict):
            return ""
    except Exception:
        return ""

    features = spec.get("features", [])
    pages = spec.get("ui_pages", [])

    if not features and not pages:
        return ""

    lines = ["flowchart LR"]

    # Start node
    lines.append("    Start([User]) --> Home")

    # Add pages as flow
    prev_id = "Home"
    for i, page in enumerate(pages[:8]):  # Limit pages
        if not isinstance(page, dict):
            continue

        page_name = page.get("name", f"Page{i}")
        page_id = _sanitize_id(page_name)

        if i == 0:
            lines.append(f"    Home[{page_name}]")
        else:
            lines.append(f"    {prev_id} --> {page_id}[{page_name}]")
            prev_id = page_id

    # Add features as sub-flows
    if features:
        lines.append("")
        lines.append("    subgraph Features")
        for feature in features[:6]:  # Limit features
            if isinstance(feature, dict):
                feature_name = feature.get("name", "Feature")
                feature_id = _sanitize_id(feature_name)
                if feature_id:
                    lines.append(f"        {feature_id}{{{{ {feature_name} }}}}")
        lines.append("    end")

    return "\n".join(lines)


def generate_all_diagrams(spec_yaml: str) -> dict:
    """
    Generate all diagram types from spec YAML.

    Returns a dict with:
    - architecture: Main architecture flowchart
    - entities: ER diagram of data entities
    - flow: User flow diagram
    """
    return {
        "architecture": generate_architecture_diagram(spec_yaml),
        "entities": generate_entity_diagram(spec_yaml),
        "flow": generate_flow_diagram(spec_yaml),
    }


def _sanitize_id(text: str) -> str:
    """Sanitize a string to be a valid Mermaid node ID."""
    if not text:
        return ""
    # Remove special characters, replace spaces/slashes with underscores
    result = text.replace("/", "_").replace("-", "_").replace(" ", "_")
    result = "".join(c for c in result if c.isalnum() or c == "_")
    # Ensure it doesn't start with a number
    if result and result[0].isdigit():
        result = "n" + result
    return result[:30]  # Limit length
