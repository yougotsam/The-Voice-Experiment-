from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    assemblyai_api_key: str = ""
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    groq_tts_voice: str = "troy"
    groq_tts_model: str = "canopylabs/orpheus-v1-english"
    tts_provider: str = "elevenlabs"
    tts_fallback_chain: str = "groq,elevenlabs"
    host: str = "0.0.0.0"
    port: int = 8000
    gemini_api_key: str = ""
    xai_api_key: str = ""
    ghl_api_key: str = ""
    ghl_location_id: str = ""
    ghl_webhook_secret: str = ""
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
