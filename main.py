from dotenv import load_dotenv
load_dotenv()
import os
import time
import json
from io import BytesIO
from datetime import timedelta
from typing import Optional, List
import numpy as np

# FastAPI and SQLAlchemy imports
import models, schemas, crud, security 
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Body
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# ML/AI Imports
from PIL import Image
try:
    from tensorflow.keras.models import load_model 
    from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess_input 
except ImportError:
    # Fallback/Mock for missing TensorFlow
    load_model = lambda *args, **kwargs: None
    resnet_preprocess_input = lambda x: x 
    
# Google API Imports
try:
    from google import genai
    from google.genai.errors import APIError
    from googleapiclient.discovery import build
except ImportError:
    print("CRITICAL WARNING: Missing required Google libraries. Run 'pip install google-genai google-api-python-client tensorflow'")
    genai = None
    APIError = None
    # Fallback/Mock for missing Google libraries
    build = lambda *args, **kwargs: None 

# Local imports
from database import Base
from database import SessionLocal, engine, get_db
from security import create_access_token, verify_password, get_current_user

# ----------------------------------------------------
# ⚙️ Initialization & Configuration
# ----------------------------------------------------

# Create all tables in the database (only runs if tables don't exist)
Base.metadata.create_all(bind=engine)

# --- CNN MODEL CONFIGURATION ---
IMAGE_SIZE = (224, 224) # Must match the ResNet50 input size
MODEL_FILE_NAME = "plant_disease_resnet50_model.h5" 

CNN_MODEL = None
CLASS_NAMES = None

try:
    # Load the new model file and class names
    CNN_MODEL = load_model(MODEL_FILE_NAME)
    CLASS_NAMES = np.load("class_names.npy", allow_pickle=True).tolist()
    print(f"✅ CNN Model ({MODEL_FILE_NAME}) and Class Names loaded successfully.")
    CNN_MODEL.summary(line_length=100) # Print summary to confirm model loaded

except Exception as e:
    print(f"❌ ERROR: Failed to load CNN Model or class names. Prediction endpoint will fail: {e}")


# --- API KEY CONFIGURATION ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

if not GEMINI_API_KEY:
    print("CRITICAL WARNING: GEMINI_API_KEY not found. AI features will fail.")
if not YOUTUBE_API_KEY:
    print("CRITICAL WARNING: YOUTUBE_API_KEY not found. Video features will fail.")

# Initialize Google GenAI client
try:
    client = genai.Client(api_key=GEMINI_API_KEY)
except Exception:
    client = None

# Initialize YouTube client
try:
    youtube_client = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
except Exception:
    youtube_client = None

# ----------------------------------------------------
# 🤖 AI / ML Functions
# ----------------------------------------------------

def cnn_predict_disease(image: Image.Image) -> str:
    """
    Preprocesses an image and runs prediction through the ResNet50 model.
    """
    if CNN_MODEL is None or CLASS_NAMES is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded. Check server startup logs for model loading errors."
        )

    # 1. Image Preprocessing (Required for ResNet50)
    # Resize image to (224, 224)
    image = image.resize(IMAGE_SIZE)
    img_array = np.array(image) 
    
    # Handle Grayscale or RGBA to ensure (224, 224, 3) shape
    if img_array.ndim == 2: 
        img_array = np.stack((img_array,) * 3, axis=-1)
    elif img_array.shape[2] == 4:
        img_array = img_array[:, :, :3] # Drop alpha channel if present
        
    # Expand dimensions to create a batch size of 1: (224, 224, 3) -> (1, 224, 224, 3)
    img_array = np.expand_dims(img_array, axis=0) 
    
    # Apply the required ResNet50 preprocessing function. 
    processed_img = resnet_preprocess_input(img_array)

    # 2. Model Prediction
    predictions = CNN_MODEL.predict(processed_img)
    
    # Get the index of the class with the highest probability
    predicted_index = np.argmax(predictions[0])
    
    # 3. Class Name Retrieval
    if predicted_index < len(CLASS_NAMES):
        predicted_class = CLASS_NAMES[predicted_index]
    else:
        predicted_class = "Unknown Disease (Index out of range)"
    
    return predicted_class

# --- GEMINI FUNCTIONS ---
def gemini_localize_cure(full_disease_name: str, local_language: str) -> str:
    """Generates localized cure text using the Gemini API."""
    if not client:
        return f"Error: Gemini client not initialized. Cannot generate cure steps for {full_disease_name}."

    prompt = (
        f"You are an agricultural expert. The detected plant disease is '{full_disease_name}'. "
        f"Provide the cure and preventive measures. "
        f"The output must be in the specified language: '{local_language}'. "
        f"Structure the response clearly with headings for 'Cure' and 'Prevention'. "
        f"Use simple language appropriate for a rural farmer."
    )
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                temperature=0.4,
            ),
        )
        return response.text
    except APIError as e:
        print(f"Gemini API Error (Network/DNS issue): {e}")
        return f"Error connecting to AI service for cure. Please check network connection. Disease: {full_disease_name}"
    except Exception as e:
        print(f"Gemini API Exception: {e}")
        return f"An unknown error occurred while fetching cure for {full_disease_name}."

# 👇 NEW AI FUNCTION FOR TIMETABLE GENERATION
def gemini_generate_timetable(constraints_json: str, days: int) -> str:
    """Generates a study timetable in markdown table format using the Gemini API."""
    if not client:
        return "Error: Gemini client not initialized. Cannot generate timetable."

    prompt = (
        f"You are a sophisticated study planner AI. Generate a detailed study timetable "
        f"in **clean markdown table format** for a student to complete the following chapters in {days} days. "
        f"The input constraints are provided as a JSON string: {constraints_json}. "
        f"The table **must** have columns: 'Day', 'Subject', 'Chapters to Study', and 'Estimated Time (hours)'. "
        f"Distribute the workload evenly over the {days} days, focusing on completing the specified chapters. "
        f"For visual appeal and organization, only list the 'Day' number on the first row of entries for that day. "
        f"Example format for a single day with two subjects: | Day 1 | Subject A | ... | ... |\n| | Subject B | ... | ... |\n"
        f"Do not include any introductory or concluding sentences outside the markdown table. Start directly with the table header."
    )
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                temperature=0.6,
            ),
        )
        return response.text
    except Exception as e:
        print(f"Timetable Generation Gemini API Exception: {e}")
        return f"An error occurred while generating the timetable. {e}"

def ai_chatbot_response(message: str) -> str:
    """Generates a chatbot response using the Gemini API."""
    if not client:
        return "Error: Gemini client not initialized. Cannot answer."
    
    prompt = (
        f"You are a friendly and helpful agricultural expert chatbot for farmers. "
        f"Answer the user's question simply and clearly. Question: '{message}'"
    )
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        print(f"Chatbot Gemini API Exception: {e}")
        return "Sorry, I couldn't connect to the AI service. Please try again later."


def gemini_generate_notes(video_title: str, topic: str, language: str) -> str:
    """Generates notes in markdown format based on a video title and topic, localized."""
    if not client:
        return "Error: Gemini client not initialized. Cannot generate notes."

    prompt = (
        f"You are an educational assistant. Generate concise, well-structured notes "
        f"in **markdown format** based on the video titled: '{video_title}', which "
        f"is about the topic: '{topic}'. The notes must be in the '{language}' language. "
        f"Ensure the notes are easy for rural students/farmers to understand. "
        f"Do not include any introductory or concluding sentences outside the markdown."
    )
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                temperature=0.3,
            ),
        )
        return response.text
    except Exception as e:
        print(f"Notes Generation Gemini API Exception: {e}")
        return f"An error occurred while generating notes for '{topic}'. {e}"


# --- YOUTUBE FUNCTIONS ---

def youtube_search_video(topic: str, language: str) -> dict:
    """Searches YouTube for a relevant video on the topic in the specified language."""
    if not youtube_client:
        return {"video_title": f"No video found for {topic}", "video_url": "#"}

    # Construct the search query
    search_query = f"{topic} {language} for students"
    
    try:
        search_response = youtube_client.search().list(
            q=search_query,
            part='snippet',
            maxResults=1,
            type='video',
            # FIX: Removed potentially restrictive/problematic search params
            # videoSyndicated='true', 
            # relevanceLanguage=language, 
        ).execute()

        

        # Check for results
        if search_response.get('items'):
            item = search_response['items'][0]
            video_title = item['snippet']['title']
            video_id = item['id']['videoId']
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            return {
                "video_title": video_title,
                "video_url": video_url
            }
        else:
            return {"video_title": f"No relevant video found for {topic} in {language}.", "video_url": "#"}

    except Exception as e:
        print(f"YouTube API Exception: {e}")
        return {"video_title": f"YouTube search failed for {topic}.", "video_url": "#"}


# ----------------------------------------------------
# 🌐 FastAPI App Setup
# ----------------------------------------------------
app = FastAPI()

# Add CORS Middleware to allow requests from the frontend
origins = [
    "http://localhost",
    "http://localhost:3000",  # Your React frontend's address
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------
# 🔒 AUTHENTICATION ENDPOINTS
# ----------------------------------------------------

@app.post("/api/v1/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    return crud.create_user(db=db, user=user)

@app.post("/api/v1/login", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # This relies on the new authenticate_user function added to security.py
    user = security.authenticate_user(db, form_data.username, form_data.password) 
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": user.email}
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/v1/users/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(security.get_current_user)):
    return current_user


# ----------------------------------------------------
# 🌱 AGRI-TECH ENDPOINTS (ML + GENAI)
# ----------------------------------------------------

@app.post("/api/v1/agri-tech-disease-detect")
async def detect_disease_endpoint(
    image_file: UploadFile = File(...),
    # Language is now passed via Form data from the frontend
    language: str = Form("English"), 
    current_user: models.User = Depends(security.get_current_user)
):
    # 1. Read the image file
    try:
        image_bytes = await image_file.read()
        image = Image.open(BytesIO(image_bytes))
    except Exception as e:
        print(f"Error reading image file: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unreadable image file uploaded."
        )

    # 2. ML Prediction (CNN)
    try:
        full_disease_name = cnn_predict_disease(image)
    except HTTPException as e:
        # Re-raise 503 if the model wasn't loaded
        raise e
    except Exception as e:
        print(f"Prediction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model prediction failed due to an internal error."
        )

    # 3. Localized Cure Generation (Gemini)
    cure_output_text = gemini_localize_cure(full_disease_name, language)
    
    # 4. Compile the response
    return {
        "disease": full_disease_name.replace("___", " ").replace("_", " "),
        "cure_localized": cure_output_text,
        "language": language
    }


# ----------------------------------------------------
# ⏰ TIMETABLE GENERATION ENDPOINT (NEW)
# ----------------------------------------------------

@app.post(
    "/api/v1/generate-timetable",
    # Using dict for response since schemas is not provided
    status_code=status.HTTP_200_OK
)
async def generate_timetable_endpoint(
    # Expects {'subjects': [{'subject': str, 'chapters': int}, ...], 'total_days': int}
    request_data: dict = Body(...), 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    try:
        subjects_data = request_data.get('subjects', [])
        total_days = request_data.get('total_days')

        if not subjects_data or not isinstance(total_days, int) or total_days <= 0:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid input: subjects list cannot be empty and total_days must be a positive integer."
            )

        # Convert the complex subject data (list of dicts) to a JSON string for the prompt and storage
        input_constraints_json = json.dumps(subjects_data)
        
        # 1. Generate Timetable (Gemini)
        schedule_markdown = gemini_generate_timetable(input_constraints_json, total_days)

        # 2. Save to database using crud.create_timetable
        try:
            crud.create_timetable(
                db=db,
                input_json=input_constraints_json,
                schedule_json=schedule_markdown,
                user_id=current_user.id
            )
        except Exception as db_e:
            print(f"Failed to save timetable entry to DB: {db_e}")
            # Non-critical: Do not fail the API call just because the DB save failed.

        return {
            "timetable_markdown": schedule_markdown,
            "total_days": total_days,
            "input_subjects": subjects_data
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Timetable generation endpoint error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during timetable generation: {e}"
        )


# ----------------------------------------------------
# 💬 CHATBOT & FEEDBACK ENDPOINTS
# ----------------------------------------------------

@app.post("/api/v1/feedback", status_code=status.HTTP_201_CREATED)
def submit_feedback(
    feedback: schemas.FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    crud.create_feedback(db=db, feedback=feedback, user_id=current_user.id)
    return {"message": "Feedback submitted."}

@app.post("/api/v1/chatbot")
async def chatbot_query(
    request: schemas.ChatRequest,
    current_user: schemas.User = Depends(get_current_user)
):
    response_text = ai_chatbot_response(request.message)
    return {"response": response_text}


# ----------------------------------------------------
# 🎥 Video Learning Hub Endpoint
# ----------------------------------------------------

@app.post(
    "/api/v1/topic-video-notes", 
    response_model=schemas.TopicVideoResponse,
    status_code=status.HTTP_200_OK
)
async def get_video_and_notes(
    request: schemas.TopicVideoRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    topic = request.topic
    language = request.language
    
    # 1. Video Search (Live API Call) - Uses YOUTUBE_API_KEY
    video_info = youtube_search_video(topic, language)
    video_title = video_info['video_title']
    video_url = video_info['video_url']
    
    # 2. Notes Generation (Live API Call) - Uses GEMINI_API_KEY
    notes_markdown = gemini_generate_notes(video_title, topic, language)
    
    # 3. Compile the final response data
    response_data = schemas.TopicVideoResponse(
        video_title=video_title,
        video_url=video_url,
        notes_markdown=notes_markdown
    )
    
    # 4. Compile the database data model
    db_data = schemas.VideoNoteEntryCreate(
        topic=topic,
        language=language,
        video_title=video_title,
        video_url=video_url,
        notes_markdown=notes_markdown
    )
    
    # 5. Save to database
    try:
        crud.create_video_note_entry(
            db=db,
            data=db_data,
            user_id=current_user.id
        )
    except Exception as e:
        print(f"Failed to save video note entry to DB: {e}")
        
    return response_data