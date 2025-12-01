from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base

# --- User Table ---
class User(Base):
    """SQLAlchemy model for the 'users' table."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    
    # Relationships
    feedback = relationship("Feedback", back_populates="owner")
    timetables = relationship("Timetable", back_populates="owner")
    # ✅ FIX: This line MUST be present and correctly spelled.
    video_notes = relationship("VideoNoteEntry", back_populates="owner") 

# --- Feedback Table ---
class Feedback(Base):
    """SQLAlchemy model for the 'feedback' table."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    name_display = Column(String, nullable=True) # Name provided during feedback
    message = Column(Text, nullable=False)

    # Relationship
    owner = relationship("User", back_populates="feedback")

# --- Timetable Table ---
class Timetable(Base):
    """SQLAlchemy model for the 'timetables' table."""
    __tablename__ = "timetables"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    # Store complex inputs/outputs as JSON strings
    input_constraints_json = Column(Text, nullable=False) 
    schedule_json = Column(Text, nullable=False)

    # Relationship
    owner = relationship("User", back_populates="timetables")


# --- NEW: Video Note Entry Table ---
class VideoNoteEntry(Base):
    """SQLAlchemy model for storing AI-generated video and notes entries."""
    __tablename__ = "video_note_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    # Input fields
    topic = Column(String, nullable=False)
    language = Column(String, nullable=False)
    
    # Output fields (from AI)
    video_title = Column(String, nullable=False)
    video_url = Column(String, nullable=False)
    notes_markdown = Column(Text, nullable=False)
    
    # Relationship
    owner = relationship("User", back_populates="video_notes")