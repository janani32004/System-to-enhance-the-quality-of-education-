from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1. Database Configuration
# Using SQLite for simplicity. Replace with PostgreSQL/MySQL for production.
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:1234@localhost:5432/rural_education_db"

# 2. SQLAlchemy Engine Creation
# connect_args={'check_same_thread': False} is needed only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL
)

# 3. Session Factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Declarative Base
# Base class which your ORM models will inherit from.
Base = declarative_base()

# 5. Dependency: Get Database Session
def get_db():
    """Provides a fresh database session for a request and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()