from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    assemblyai_api_key: str = ""
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    groq_tts_voice: str = "autumn"
    groq_tts_model: str = "canopylabs/orpheus-v1-english"
    xai_tts_voice: str = "eve"
    tts_provider: str = "fallback"
    tts_fallback_chain: str = "groq,xai,elevenlabs"
    deepgram_api_key: str = ""
    deepgram_tts_voice: str = "aura-2-thalia-en"
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "79a125e8-cd45-4c13-8a67-188112f4dd22"
    host: str = "0.0.0.0"
    port: int = 8000
    gemini_api_key: str = ""
    xai_api_key: str = ""
    piper_models_dir: str = ""
    piper_voice: str = "hal"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "gemma3:4b"
    ollama_api_key: str = "ollama"
    ghl_api_key: str = ""
    ghl_location_id: str = ""
    ghl_webhook_secret: str = ""
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
