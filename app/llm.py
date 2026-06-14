from __future__ import annotations

import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = APP_DIR / "prompts"
LLM_BACKEND = os.getenv("LLM_BACKEND", "codex").strip().lower()
CODEX_TIMEOUT_SECONDS = int(os.getenv("CODEX_TIMEOUT_SECONDS", "180"))
MOCK_RESPONSE = "Mock backend active. No Codex CLI call was made."


def _resolve_project_root() -> Path:
    for candidate in (APP_DIR, *APP_DIR.parents):
        if (candidate / "app").is_dir() and (candidate / "projects").is_dir():
            return candidate

    raise RuntimeError("Project root not found. Expected a directory containing both `app/` and `projects/`.")


PROJECT_ROOT = _resolve_project_root()


def load_prompt(name: str) -> str:
    path = PROMPTS_DIR / name
    with path.open("r", encoding="utf-8") as f:
        return f.read()


def _build_full_prompt(system_prompt: str, user_prompt: str) -> str:
    return (
        f"SYSTEM:\n{system_prompt.strip()}\n\n"
        f"USER:\n{user_prompt.strip()}\n\n"
        "Return only the assistant response.\n"
    )


def _run_command(cmd: list[str], prompt_text: str) -> str:
    try:
        result = subprocess.run(
            cmd,
            input=prompt_text,
            capture_output=True,
            text=True,
            timeout=CODEX_TIMEOUT_SECONDS,
            check=False,
            cwd=PROJECT_ROOT,
        )
    except FileNotFoundError as exc:
        raise FileNotFoundError from exc
    except subprocess.TimeoutExpired as exc:
        command_label = " ".join(cmd)
        raise RuntimeError(
            f"Codex CLI timed out after {CODEX_TIMEOUT_SECONDS} seconds while running `{command_label}`."
        ) from exc

    stderr = result.stderr.strip()
    stdout = result.stdout.strip()

    if result.returncode != 0 or stderr:
        detail = stderr or f"Command exited with code {result.returncode}."
        raise RuntimeError(f"Codex CLI failed while running `{' '.join(cmd)}`: {detail}")

    if not stdout:
        raise RuntimeError(f"Codex CLI returned empty output while running `{' '.join(cmd)}`.")

    return stdout


def _needs_skip_git_repo_check(error_message: str) -> bool:
    lowered = error_message.lower()
    return "not inside a trusted directory" in lowered or "not a git repo" in lowered


def _ask_codex(system_prompt: str, user_prompt: str) -> str:
    prompt_text = _build_full_prompt(system_prompt, user_prompt)
    last_error: RuntimeError | None = None

    # Preferred path is running inside the real project root in a trusted git repo.
    # `--skip-git-repo-check` is only a fallback for local directories that are not trusted repos.
    for cmd in (["codex", "exec", "-"], ["wsl", "codex", "exec", "-"]):
        try:
            return _run_command(cmd, prompt_text)
        except FileNotFoundError:
            continue
        except RuntimeError as exc:
            last_error = exc
            if not _needs_skip_git_repo_check(str(exc)):
                continue

            retry_cmd = cmd[:-1] + ["--skip-git-repo-check", "-"]
            try:
                return _run_command(retry_cmd, prompt_text)
            except FileNotFoundError:
                continue
            except RuntimeError as retry_exc:
                last_error = retry_exc

    if last_error is None:
        raise RuntimeError(
            "Codex CLI not found. Install/authenticate Codex or make it accessible from PATH/WSL."
        )

    raise RuntimeError(str(last_error))


def ask_llm(system_prompt: str, user_prompt: str) -> str:
    if LLM_BACKEND == "mock":
        return MOCK_RESPONSE

    if LLM_BACKEND == "codex":
        return _ask_codex(system_prompt, user_prompt)

    raise RuntimeError(f"Unsupported LLM_BACKEND `{LLM_BACKEND}`. Supported values: codex, mock.")
