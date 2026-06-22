import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("HASHTAG_API_KEY")
BASE_URL = "https://kg-api.hashtag.ai/patentrag"

if not API_KEY:
    raise ValueError("HASHTAG_API_KEY not found in environment variables")
