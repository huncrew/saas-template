# Factory Templates

This directory defines reusable template descriptors that drive the Factory workflow. Each template
packages a base repo snapshot (zip in S3) plus a YAML manifest describing the tech stack, components,
and expected spec structure.

## Layout

```
factory/templates/
  <template-id>/
    template.yaml      # manifest + spec schema (required)
    README.md          # optional, human-readable notes
```

`template.yaml` has three major sections:

1. **template** – metadata about the template, tech stack, and canonical directories.
2. **spec_schema** – the YAML spec format the orchestrator expects for this template.
3. **guidance** – prompt notes, env defaults, reusable component references.

The orchestrator loads this file (by `template_id`) to:

- seed new projects with the template metadata,
- instruct the LLM to emit a structured YAML spec,
- validate follow-up answers before kicking off CodeBuild.

Add new templates by creating a directory, copying `template.yaml` from `saas-crud`,
and adjusting the reusable components/spec schema for your use case.
