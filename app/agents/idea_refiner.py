from __future__ import annotations

import json
from pydantic import ValidationError

from app.llm import ask_llm, load_prompt
from app.models import DiscoveryData, ProjectState, ChatMessage
from app.storage import write_artifact


CRITICAL_FIELDS = [
    "idea_summary",
    "target_users",
    "problem_statement",
    "core_features",
]


class IdeaRefinerAgent:
    def extract_data(self, state: ProjectState) -> DiscoveryData:
        system_prompt = load_prompt("extract.txt")

        conversation_text = "\n".join(
            f"{m.role.upper()}: {m.content}" for m in state.messages
        )

        user_prompt = f"""
Conversation:
{conversation_text}

Current known data:
{state.discovery_data.model_dump_json(indent=2)}
"""

        raw = ask_llm(system_prompt, user_prompt)

        try:
            data = json.loads(raw)
            parsed = DiscoveryData.model_validate(data)
            return parsed
        except (json.JSONDecodeError, ValidationError):
            return state.discovery_data

    def merge_data(self, old: DiscoveryData, new: DiscoveryData) -> DiscoveryData:
        merged = old.model_dump()

        for key, value in new.model_dump().items():
            if value in (None, "", [], {}):
                continue
            merged[key] = value

        return DiscoveryData.model_validate(merged)

    def missing_fields(self, data: DiscoveryData) -> list[str]:
        missing = []

        if not data.idea_summary:
            missing.append("idea_summary")
        if not data.target_users:
            missing.append("target_users")
        if not data.problem_statement:
            missing.append("problem_statement")
        if len(data.core_features) < 3:
            missing.append("core_features")
        if not data.success_criteria:
            missing.append("success_criteria")

        return missing

    def ask_next_question(self, state: ProjectState, missing: list[str]) -> str:
        system_prompt = load_prompt("ask_next.txt")

        user_prompt = f"""
Known data:
{state.discovery_data.model_dump_json(indent=2)}

Missing fields:
{missing}
"""

        return ask_llm(system_prompt, user_prompt)

    def generate_summary(self, state: ProjectState) -> str:
        system_prompt = load_prompt("summary.txt")
        user_prompt = state.discovery_data.model_dump_json(indent=2)
        return ask_llm(system_prompt, user_prompt)

    def generate_spec_markdown(self, state: ProjectState) -> str:
        system_prompt = load_prompt("spec.txt")
        user_prompt = state.discovery_data.model_dump_json(indent=2)
        return ask_llm(system_prompt, user_prompt)

    def save_spec_artifacts(self, state: ProjectState) -> None:
        spec_md = self.generate_spec_markdown(state)
        write_artifact(state.project_id, "mvp_spec.md", spec_md)
        write_artifact(
            state.project_id,
            "mvp_spec.json",
            state.discovery_data.model_dump_json(indent=2, exclude_none=True)
        )