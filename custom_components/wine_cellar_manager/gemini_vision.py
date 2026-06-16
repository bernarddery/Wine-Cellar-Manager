"""Gemini Vision AI Engine for Wine Cellar Manager using google-genai."""
from __future__ import annotations

import json
import logging
import os
from typing import Any
from pydantic import BaseModel, Field

from homeassistant.core import HomeAssistant
from .websocket_api import _get_config_entry_options
from .const import OPTION_GEMINI_API_KEY, OPTION_GEMINI_MODEL

_LOGGER = logging.getLogger(__name__)

# Définition des schémas de sortie stricts via Pydantic pour forcer Gemini à renvoyer un JSON parfait
class WineAnalysisSchema(BaseModel):
    wine_name: str | None = Field(None, description="Full commercial name or specific cuvée name of the wine (exclude volume like 750ml).")
    producer: str | None = Field(None, description="The specific winery, chateau, domain, or vineyard producer company.")
    region: str | None = Field(None, description="The wine region (e.g., Bordeaux, Tuscany, Napa Valley). Exclude regulatory suffixes like AOC or DOCG.")
    country: str | None = Field(None, description="The origin country (e.g., France, Italy, Canada).")
    varietal: str | None = Field(None, description="The grape variety or varieties (e.g., Cabernet-Sauvignon, or Chardonnay).")
    vintage: int | None = Field(None, description="Year of harvest as an integer.")
    wine_type: str | None = Field(None, description='Must be exactly one of these strings: "red", "white", "rosé", "sparkling", "orange", "sweet", or "other".')
    price: float | None = Field(None, description="The official market price or SAQ price in CAD as a float number (e.g., 24.95).")
    serving_temp: float | None = Field(None, description="Recommended serving temperature in Celsius as a float or integer, if guessable.")
    alcohol_pct: float | None = Field(None, description="The explicit alcohol level percentage extracted from the label as a float number (e.g., 13.5).")
    aging_start_year: int | None = Field(None, description="Estimated starting year when this specific vintage enters its optimal drinking window.")
    aging_end_year: int | None = Field(None, description="Estimated final year of its peak drinking window.")
    notes: str | None = Field(None, description="Brief sensory description, aging potential comment, or food pairing suggestion.")
    saq_url: str | None = Field(None, description="The official SAQ.com URL string for this product web page (e.g., https://saq.com).")

class BarcodeSchema(BaseModel):
    barcode: str | None = Field(None, description="The text string of the numeric barcode digits found, or null if no barcode is visible.")


PROMPT_LABEL_ANALYSIS = """
You are an expert sommelier and wine label scanner. Carefully analyze this image of a wine label.
CRITICAL DIRECTIONS:
1. Do NOT confuse the 'producer' (the company, chateau, winery, estate, or maison who made it) with the 'wine_name' (the specific cuvée, brand name, or grape designation). 
2. Look closely at the fine print on the neck, back, or bottom edges of the label to find the alcohol level percentage.
3. If this wine is sold in Canada/Quebec, search your knowledge base to provide its official SAQ.com product page URL in 'saq_url' and its current SAQ price in CAD in 'price'.
"""

PROMPT_BARCODE_EXTRACTION = """
Analyze this image. Find the barcode on the bottle (especially look for a 14-digit SAQ barcode if applicable).
"""

def _get_client_and_model(hass: HomeAssistant) -> tuple[Any, str]:
    """Extract configuration options and initialize the Gemini API client securely."""
    from google import genai
    options = _get_config_entry_options(hass)
    api_key = options.get(OPTION_GEMINI_API_KEY, "")
    model_name = options.get(OPTION_GEMINI_MODEL, "gemini-2.5-flash")
    
    if not api_key:
        raise ValueError("Gemini API key is not configured in integration options.")
        
    client = genai.Client(api_key=api_key)
    return client, model_name


def _load_image_bytes_and_mime(image_path: str) -> tuple[bytes, str]:
    """Safely resolve paths, read content and dynamically detect if it's PNG or JPEG."""
    resolved_path = image_path
    if image_path.startswith("/local/"):
        resolved_path = "/config/www/" + image_path[len("/local/"):]
        
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"Image label file not found on disk: {resolved_path}")
        
    with open(resolved_path, "rb") as f:
        data = f.read()
        
    # Analyse des "magic bytes" signature du fichier pour en extraire le bon type MIME
    mime_type = "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime_type = "image/png"
    elif data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        mime_type = "image/gif"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        mime_type = "image/webp"
        
    return data, mime_type


async def async_analyze_wine_with_gemini(
    hass: HomeAssistant,
    barcode: str | None = None,
    image_path: str | None = None,
) -> dict[str, Any]:
    """Analyze a wine using its barcode or label image via Gemini Vision."""
    client, model_name = await hass.async_add_executor_job(_get_client_and_model, hass)
    
    if barcode and not image_path:
        def _sync_text_query():
            from google.genai import types
            response = client.models.generate_content(
                model=model_name,
                contents=f"Provide detailed sommelier data for wine with barcode: {barcode}. Instructions: {PROMPT_LABEL_ANALYSIS}",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=WineAnalysisSchema,
                ),
            )
            return json.loads(response.text)
            
        suggestion_raw = await hass.async_add_executor_job(_sync_text_query)
        from .websocket_api import _normalize_label_suggestion
        return {"suggestion": _normalize_label_suggestion(suggestion_raw, "")}

    if not image_path:
        raise ValueError("An image path is required for vision analysis.")

    def _sync_vision_analysis():
        from google.genai import types
        image_bytes, mime_type = _load_image_bytes_and_mime(image_path)
        
        # Passage obligatoire par types.Part.from_bytes en fournissant le type MIME détecté dynamiquement
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        
        response = client.models.generate_content(
            model=model_name,
            contents=[image_part, PROMPT_LABEL_ANALYSIS],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=WineAnalysisSchema,
            ),
        )
        return json.loads(response.text)

    try:
        raw_json = await hass.async_add_executor_job(_sync_vision_analysis)
        from .websocket_api import _normalize_label_suggestion
        
        # LOGS DE DIAGNOSTIC - Ajout temporaire pour inspecter le contenu du transfert
        _LOGGER.error("DIAGNOSTIC - Réponse brute Gemini : %s", json.dumps(raw_json))
        
        normalized = _normalize_label_suggestion(raw_json, image_path)
        _LOGGER.error("DIAGNOSTIC - Données normalisées : %s", json.dumps(normalized))
        
        return {
            "suggestion": normalized,
            "official_image_url": None
        }
    except Exception as err:
        _LOGGER.error("Gemini vision generation failed: %r", err)
        raise RuntimeError(f"Gemini API call failed: {str(err)}")


async def async_extract_barcode_from_image(
    hass: HomeAssistant,
    image_path: str,
) -> dict[str, Any]:
    """Scan an uploaded image to detect and extract numeric barcode strings using Gemini."""
    client, model_name = await hass.async_add_executor_job(_get_client_and_model, hass)

    def _sync_barcode_extraction():
        from google.genai import types
        image_bytes, mime_type = _load_image_bytes_and_mime(image_path)
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        
        response = client.models.generate_content(
            model=model_name,
            contents=[image_part, PROMPT_BARCODE_EXTRACTION],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BarcodeSchema,
            ),
        )
        return json.loads(response.text)

    try:
        raw_json = await hass.async_add_executor_job(_sync_barcode_extraction)
        return {"barcode": raw_json.get("barcode")}
    except Exception as err:
        _LOGGER.error("Gemini barcode scanning failed: %r", err)
        return {"barcode": None}