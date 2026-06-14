from __future__ import annotations

from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class DiscoveryData(BaseModel):
    project_name: Optional[str] = None
    idea_summary: Optional[str] = None
    target_users: List[str] = Field(default_factory=list)
    problem_statement: Optional[str] = None
    value_proposition: Optional[str] = None
    platform: Optional[str] = None
    core_features: List[str] = Field(default_factory=list)
    out_of_scope: List[str] = Field(default_factory=list)
    technical_preferences: Dict[str, str] = Field(default_factory=dict)
    success_criteria: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)


class ProjectState(BaseModel):
    project_id: str
    status: str = "exploring"
    messages: List[ChatMessage] = Field(default_factory=list)
    discovery_data: DiscoveryData = Field(default_factory=DiscoveryData)
    summary_approved: bool = False