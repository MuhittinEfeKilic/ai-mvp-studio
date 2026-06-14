from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

from app.agents.idea_refiner import IdeaRefinerAgent
from app.models import ChatMessage
from app.storage import create_project, load_state, save_state

agent = IdeaRefinerAgent()

st.set_page_config(page_title="AI MVP Studio", layout="wide")
st.title("AI MVP Studio")
st.caption("Fikirden MVP spec çıkaran kişisel planning console")

if "project_id" not in st.session_state:
    st.session_state.project_id = None

with st.sidebar:
    st.header("Proje")
    project_name = st.text_input("Yeni proje adı")

    if st.button("Proje oluştur"):
        if project_name.strip():
            state = create_project(project_name.strip())
            st.session_state.project_id = state.project_id
            st.success(f"Proje oluşturuldu: {state.project_id}")

if not st.session_state.project_id:
    st.info("Önce bir proje oluştur.")
    st.stop()

state = load_state(st.session_state.project_id)
if state is None:
    st.error("Proje yüklenemedi.")
    st.stop()

st.subheader(f"Proje: {state.project_id}")

for msg in state.messages:
    with st.chat_message(msg.role):
        st.write(msg.content)

user_input = st.chat_input("Fikrini yaz...")

if user_input:
    state.messages.append(ChatMessage(role="user", content=user_input))

    extracted = agent.extract_data(state)
    state.discovery_data = agent.merge_data(state.discovery_data, extracted)

    missing = agent.missing_fields(state.discovery_data)

    if not missing:
        state.status = "draft_ready"
        summary = agent.generate_summary(state)
        state.messages.append(ChatMessage(role="assistant", content=summary))
    else:
        next_q = agent.ask_next_question(state, missing)
        state.messages.append(ChatMessage(role="assistant", content=next_q))

    save_state(state)
    st.rerun()

if state.status == "draft_ready":
    st.divider()
    st.subheader("Summary approval")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("Özeti onayla ve spec üret"):
            state.summary_approved = True
            state.status = "approved"
            agent.save_spec_artifacts(state)
            save_state(state)
            st.success("Spec dosyaları oluşturuldu.")
            st.rerun()

    with col2:
        if st.button("Biraz daha netleştirelim"):
            state.status = "exploring"
            state.messages.append(
                ChatMessage(
                    role="assistant",
                    content="Tamam, biraz daha netleştirelim. İlk sürümde kesin olması gereken 3 özelliği net söyle."
                )
            )
            save_state(state)
            st.rerun()

if state.summary_approved:
    st.divider()
    st.success("Spec hazır. projects klasörü içinde mvp_spec.md ve mvp_spec.json oluşturuldu.")
