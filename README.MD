## Usage

This project does not use the OpenAI Python SDK.
The LLM layer calls the Codex CLI as the local backend.
Codex CLI must be installed and already authenticated in WSL, or otherwise available on your PATH.
For UI/testing without a real Codex call, set `LLM_BACKEND=mock`.
