from __future__ import annotations

import json
from pathlib import Path
from app.models import ProjectState

BASE_DIR = Path("projects")


def slugify(text: str) -> str:
    return (
        text.lower()
        .strip()
        .replace(" ", "-")
        .replace("/", "-")
        .replace("\\", "-")
    )


def project_dir(project_id: str) -> Path:
    path = BASE_DIR / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def state_file(project_id: str) -> Path:
    return project_dir(project_id) / "conversation.json"


def save_state(state: ProjectState) -> None:
    file_path = state_file(state.project_id)
    file_path.write_text(
        state.model_dump_json(indent=2, exclude_none=True),
        encoding="utf-8"
    )


def load_state(project_id: str) -> ProjectState | None:
    file_path = state_file(project_id)
    if not file_path.exists():
        return None
    data = json.loads(file_path.read_text(encoding="utf-8"))
    return ProjectState.model_validate(data)


def create_project(project_name: str) -> ProjectState:
    project_id = slugify(project_name)
    state = ProjectState(project_id=project_id)
    save_state(state)
    return state


def write_artifact(project_id: str, filename: str, content: str) -> None:
    path = project_dir(project_id) / filename
    path.write_text(content, encoding="utf-8")