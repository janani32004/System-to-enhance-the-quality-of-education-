from sqlalchemy.orm import Session
import models, schemas
from security import get_password_hash 
from typing import Optional

# --- User CRUD ---
def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """Retrieves a user by their email address."""
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    """Creates a new user, hashes the password, and adds them to the database."""
    # Hash the password using the function from security.py
    hashed_password = get_password_hash(user.password)
    
    # Create the DB model instance
    db_user = models.User(
        email=user.email, 
        username=user.username, 
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Feedback CRUD ---
def create_feedback(db: Session, feedback: schemas.FeedbackCreate, user_id: int) -> models.Feedback:
    """Creates and saves new user feedback."""
    db_feedback = models.Feedback(
        user_id=user_id,
        name_display=feedback.name_display,
        message=feedback.message
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback

# --- Timetable CRUD ---
def create_timetable(db: Session, input_json: str, schedule_json: str, user_id: int) -> models.Timetable:
    """Creates and saves a new timetable entry."""
    db_timetable = models.Timetable(
        user_id=user_id,
        input_constraints_json=input_json,
        schedule_json=schedule_json
    )
    db.add(db_timetable)
    db.commit()
    db.refresh(db_timetable)
    return db_timetable

# --- NEW: Video Notes CRUD (Refactored) ---
def create_video_note_entry(
    db: Session, 
    data: schemas.VideoNoteEntryCreate, 
    user_id: int 
) -> models.VideoNoteEntry:
    """Creates and saves a new AI video/notes entry."""
    
    # 👇 FIX: Ensure ALL fields for the VideoNoteEntry model are correctly passed 
    # from the 'data' Pydantic schema and the 'user_id' dependency.
    db_entry = models.VideoNoteEntry(
        user_id=user_id,
        topic=data.topic,
        language=data.language,
        video_title=data.video_title,
        video_url=data.video_url,
        notes_markdown=data.notes_markdown,
    )
    
    db.add(db_entry)
    db.commit() # The error will most likely happen here if the database is down/misconfigured
    db.refresh(db_entry)
    return db_entry