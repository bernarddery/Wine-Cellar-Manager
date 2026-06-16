"""Websockets API for Wine Cellar Manager."""
from __future__ import annotations

from datetime import datetime
import logging
import re
from typing import Any
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import (
    DOMAIN,
    LANE_BACK,
    LANE_FRONT,
    LAYOUT_SINGLE,
    LAYOUT_STAGGERED,
    OPTION_GEMINI_API_KEY,
    OPTION_GEMINI_MODEL,
    WS_TYPE_CONSUME_BOTTLE,
    WS_TYPE_COPY_BOTTLE,
    WS_TYPE_CLEANUP_TEMP_IMAGE,
    WS_TYPE_DELETE_BOTTLE,
    WS_TYPE_DELETE_CELLAR,
    WS_TYPE_FIND_LABEL_DUPLICATES,
    WS_TYPE_GET_DATA,
    WS_TYPE_MOVE_BOTTLE,
    WS_TYPE_SAVE_BOTTLE,
    WS_TYPE_SAVE_CELLAR,
    WS_TYPE_SEARCH_BOTTLES,
    WS_TYPE_UNIFIED_ANALYZE,
    WS_TYPE_UPLOAD_LABEL_IMAGE,
)

WS_TYPE_SWAP_BOTTLES = "wine_cellar_manager/swap_bottles"

_LOGGER = logging.getLogger(__name__)


def _safe_str(val: Any) -> str:
    """Safely convert a value to string."""
    if val is None:
        return ""
    return str(val)


def _safe_int(val: Any) -> int | None:
    """Safely convert a value to integer."""
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val: Any) -> float | None:
    """Safely convert a value to float."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _get_config_entry_options(hass: HomeAssistant) -> dict[str, Any]:
    """Get config entry options."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return {}
    return dict(entries[0].options) if isinstance(entries, list) else dict(entries.options)


def _normalize_wine_type(val: Any) -> str:
    """Normalize wine type string."""
    t = _safe_str(val).strip().lower()
    allowed = ["unset", "red", "white", "rosé", "sparkling", "orange", "sweet", "other"]
    if t in allowed:
        return t
    return "other"


def _normalize_label_suggestion(payload: dict[str, Any], image_path: str) -> dict[str, Any]:
    """Clean up and format the raw AI json payload for the wine database."""
    wine_name = _safe_str(payload.get("wine_name")).strip()
    
    # Éradication automatique des formats de bouteilles (ex: 750ml, 750 ml, 1.5L) à la fin du nom
    wine_name = re.sub(r'\s*[-\(]?\s*\d+(?:\.\d+)?\s*(?:ml|l|cl|ML|L|CL)\s*\)?\s*$', '', wine_name).strip()
    
    producer = _safe_str(payload.get("producer")).strip()
    region = _safe_str(payload.get("region")).strip()
    
    for suffix in ("docg", "doc", "aoc", "dop", "igp", "vdp"):
        if region.lower().endswith(f" {suffix}"):
            region = region[:-len(suffix)].strip()
        elif region.lower().endswith(f"({suffix})"):
            region = region[:-len(suffix)-2].strip()

    country = _safe_str(payload.get("country")).strip()
    raw_varietal = _safe_str(payload.get("varietal")).strip()
    
    raw_varietal_lower = raw_varietal.lower().replace("shiraz", "syrah")
    single_composite_grapes = {
        "cabernet-sauvignon", "pinot-noir", "chenin-blanc", "sauvignon-blanc", 
        "cabernet-franc", "gros-manseng", "petit-manseng", "gewürztraminer",
        "savagnin-rose", "carignan-noir", "mourvèdre-syrah"
    }
    
    normalized_text = raw_varietal_lower.replace("/", "-").replace("&", "-").replace(" and ", "-")
    
    if "-" in normalized_text:
        if normalized_text in single_composite_grapes:
            varietal = raw_varietal.replace("Shiraz", "Syrah").replace("shiraz", "Syrah")
        else:
            parts = [p.strip().capitalize() for p in normalized_text.split("-") if p.strip()]
            parts = [p if p != "Syrah" else "Syrah" for p in parts]
            varietal = ", ".join(parts)
    else:
        varietal = raw_varietal.replace("Shiraz", "Syrah").replace("shiraz", "Syrah").capitalize()

    notes = _safe_str(payload.get("notes")).strip()
    
    raw_type = payload.get("wine_type")
    wine_type = _normalize_wine_type(raw_type) if raw_type else "unset"
    
    vintage = _safe_int(payload.get("vintage"))
    if vintage == 0: vintage = None
    
    price = _safe_float(payload.get("price"))
    if price == 0.0 or price == 0: price = None
    
    # Sécurité anti-zéro pour l'apogée : si l'IA renvoie 0, on traite comme "pas d'information" (None)
    aging_start_year = _safe_int(payload.get("aging_start_year"))
    if aging_start_year == 0: aging_start_year = None
    
    aging_end_year = _safe_int(payload.get("aging_end_year"))
    if aging_end_year == 0: aging_end_year = None
    
    rating = _safe_int(payload.get("rating"))
    if rating is not None:
        rating = max(0, min(5, rating))

    if (
        aging_start_year is not None
        and aging_end_year is not None
        and aging_start_year > aging_end_year
    ):
        aging_start_year = None
        aging_end_year = None

    # Extraction et nettoyage de l'URL SAQ optionnelle transmise par l'IA
    saq_url = _safe_str(payload.get("saq_url")).strip()

    return {
        "wine_name": wine_name,
        "producer": producer,
        "region": region,
        "country": country,
        "varietal": varietal,
        "vintage": vintage,
        "wine_type": wine_type,
        "price": price,
        "image_path": image_path,
        "saq_url": saq_url if saq_url else None,
        "aging_start_year": aging_start_year,
        "aging_end_year": aging_end_year,
        "rating": rating,
        "notes": notes,
    }


@callback
def async_register_websockets(hass: HomeAssistant) -> None:
    """Register websocket commands."""
    websocket_api.async_register_command(hass, ws_get_data)
    websocket_api.async_register_command(hass, ws_save_cellar)
    websocket_api.async_register_command(hass, ws_delete_cellar)
    websocket_api.async_register_command(hass, ws_save_bottle)
    websocket_api.async_register_command(hass, ws_consume_bottle)
    websocket_api.async_register_command(hass, ws_delete_bottle)
    websocket_api.async_register_command(hass, ws_copy_bottle)
    websocket_api.async_register_command(hass, ws_move_bottle)
    websocket_api.async_register_command(hass, ws_search_bottles)
    websocket_api.async_register_command(hass, ws_find_label_duplicates)
    websocket_api.async_register_command(hass, ws_swap_bottles)
    websocket_api.async_register_command(hass, ws_upload_label_image)
    websocket_api.async_register_command(hass, ws_unified_analyze)
    websocket_api.async_register_command(hass, ws_cleanup_temp_image)


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_DATA})
@websocket_api.async_response
async def ws_get_data(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle get data command and compile real-time statistics securely."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return
    
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    
    # Correction majeure : on charge d'abord les données réelles du disque avant d'exporter
    try:
        loaded_stored_data = await store.async_load()
        raw_data = store.async_export(loaded_stored_data)
    except Exception as err:
        _LOGGER.error("Erreur lors du chargement des données pour l'export : %r", err)
        raw_data = {}

    # Si les données sont enveloppées dans une clé racine "data"
    if "data" in raw_data and isinstance(raw_data["data"], dict):
        raw_data = raw_data["data"]

    cellars = raw_data.get("cellars", []) or []
    bottles = raw_data.get("bottles", []) or []
    consumed_bottles = raw_data.get("consumed_bottles", []) or []

    current_year = datetime.now().year
    total_value = 0.0
    total_age_years = 0
    bottles_with_vintage = 0
    unique_wines = set()
    country_counts = {}
    
    allowed_types = ["unset", "red", "white", "rosé", "sparkling", "orange", "sweet", "other"]
    taste_window = {}
    for y in range(current_year, current_year + 11):
        taste_window[str(y)] = {t: 0 for t in allowed_types}

    for b in bottles:
        wine_key = f"{b.get('wine_name', '')}||{b.get('producer', '')}".lower().strip()
        unique_wines.add(wine_key)
        
        if b.get("price"):
            try:
                total_value += float(b["price"])
            except (ValueError, TypeError):
                pass
            
        if b.get("vintage"):
            v_int = _safe_int(b["vintage"])
            if v_int:
                total_age_years += (current_year - v_int)
                bottles_with_vintage += 1
            
        cntry = b.get("country", "").strip() or "Unknown"
        country_counts[cntry] = country_counts.get(cntry, 0) + 1
        
        start_y = b.get("aging_start_year")
        end_y = b.get("aging_end_year")
        b_type = b.get("wine_type") or "other"
        if b_type not in allowed_types:
            b_type = "other"
            
        if start_y and end_y:
            try:
                for y in range(int(start_y), int(end_y) + 1):
                    ystr = str(y)
                    if ystr in taste_window:
                        taste_window[ystr][b_type] += 1
            except (ValueError, TypeError):
                pass

    avg_age = round(total_age_years / bottles_with_vintage, 1) if bottles_with_vintage > 0 else 0
    sorted_countries = [{"country": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:6]]

    result = {
        "cellars": cellars,
        "bottles": bottles,
        "consumed_bottles": consumed_bottles,
        "stats": {
            "total_bottles": len(bottles),
            "unique_wines_count": len(unique_wines),
            "average_age": avg_age,
            "total_value": round(total_value, 2),
            "top_countries": sorted_countries,
            "taste_window": taste_window
        }
    }
    connection.send_result(msg["id"], result)

@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_SAVE_CELLAR,
    vol.Optional("cellar_id"): str,
    vol.Required("name"): str,
    vol.Required("shelves"): list,
    vol.Optional("display_order", default=0): int,
    vol.Optional("bg_color", default=""): str,
})
@websocket_api.async_response
async def ws_save_cellar(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle save cellar command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    
    try:
        await store.async_save_cellar(
            cellar_id=msg.get("cellar_id"),
            name=msg["name"],
            shelves=msg["shelves"],
            display_order=msg.get("display_order", 0),
            bg_color=msg.get("bg_color", "")
        )
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        connection.send_error(msg["id"], "save_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_DELETE_CELLAR, vol.Required("cellar_id"): str})
@websocket_api.async_response
async def ws_delete_cellar(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle delete cellar command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    
    target_cellar_id = str(msg["cellar_id"])
    
    try:
        # 1. Charger l'état actuel de la base de données du disque
        current_data = await store.async_load()
        
        # 2. Filtrer la liste des bouteilles actives pour purger celles du cellier ciblé
        if "bottles" in current_data and isinstance(current_data["bottles"], list):
            initial_count = len(current_data["bottles"])
            current_data["bottles"] = [
                b for b in current_data["bottles"] 
                if str(b.get("cellar_id")) != target_cellar_id
            ]
            purged_count = initial_count - len(current_data["bottles"])
            if purged_count > 0:
                _LOGGER.info("Wine Cellar Cascade: %d bouteille(s) orpheline(s) purgée(s) du stockage.", purged_count)
                
        # 3. Sauvegarder la base de données filtrée
        await store.async_save(current_data)
        
        # 4. Appeler la routine native de suppression structurelle du cellier
        await store.async_delete_cellar(target_cellar_id)
        
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        _LOGGER.error("Erreur lors de la suppression en cascade du cellier : %r", err)
        connection.send_error(msg["id"], "delete_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_SAVE_BOTTLE,
    vol.Optional("bottle_id"): str,
    vol.Required("cellar_id"): str,
    vol.Required("shelf_id"): str,
    vol.Required("lane"): str,
    vol.Required("position"): int,
    vol.Required("wine_name"): str,
    vol.Optional("producer", default=""): str,
    vol.Optional("region", default=""): str,
    vol.Optional("country", default=""): str,
    vol.Optional("varietal", default=""): str,
    vol.Optional("vintage"): vol.Any(int, None),
    vol.Optional("wine_type", default="other"): str,
    vol.Optional("price"): vol.Any(float, int, None),
    vol.Optional("serving_temp"): vol.Any(float, int, None),
    vol.Optional("alcohol_pct"): vol.Any(float, int, None),
    vol.Optional("image_path", default=""): str,
    vol.Optional("barcode", default=""): str,
    vol.Optional("saq_url"): vol.Any(str, None),
    vol.Optional("aging_start_year"): vol.Any(int, None),
    vol.Optional("aging_end_year"): vol.Any(int, None),
    vol.Optional("rating"): vol.Any(int, None),
    vol.Optional("notes", default=""): str,
})
@websocket_api.async_response
async def ws_save_bottle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle save bottle command securely by unpacking arguments."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: 
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    
    bottle_id = msg.get("bottle_id")
    
    try:
        # Déballage explicite des arguments nommés requis par storage.py
        await store.async_save_bottle(
            bottle_id=bottle_id,
            cellar_id=msg["cellar_id"],
            shelf_id=msg["shelf_id"],
            lane=msg["lane"],
            position=int(msg["position"]),
            wine_name=msg["wine_name"],
            producer=msg.get("producer", ""),
            vintage=msg.get("vintage"),
            region=msg.get("region", ""),
            country=msg.get("country", ""),
            varietal=msg.get("varietal", ""),
            wine_type=msg.get("wine_type", "other"),
            price=msg.get("price"),
            serving_temp=msg.get("serving_temp"),
            alcohol_pct=msg.get("alcohol_pct"),
            image_path=msg.get("image_path", ""),
            barcode=msg.get("barcode", ""),
            saq_url=msg.get("saq_url"),
            aging_start_year=msg.get("aging_start_year"),
            aging_end_year=msg.get("aging_end_year"),
            rating=msg.get("rating"),
            notes=msg.get("notes", "")
        )
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        _LOGGER.exception("Error in ws_save_bottle: %r", err)
        connection.send_error(msg["id"], "save_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_CONSUME_BOTTLE, vol.Required("bottle_id"): str})
@websocket_api.async_response
async def ws_consume_bottle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle consume bottle command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    try:
        await store.async_consume_bottle(msg["bottle_id"])
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        connection.send_error(msg["id"], "consume_failed", str(err))
@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_DELETE_BOTTLE, vol.Required("bottle_id"): str})
@websocket_api.async_response
async def ws_delete_bottle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle delete bottle command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    try:
        await store.async_delete_bottle(msg["bottle_id"])
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        connection.send_error(msg["id"], "delete_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_COPY_BOTTLE,
    vol.Required("source_bottle_id"): str,
    vol.Required("cellar_id"): str,
    vol.Required("shelf_id"): str,
    vol.Required("lane"): str,
    vol.Required("position"): int,
})
@websocket_api.async_response
async def ws_copy_bottle(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle copy bottle command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return

    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]

    try:
        new_bottle_id = await store.async_copy_bottle(
            source_bottle_id=msg["source_bottle_id"],
            cellar_id=msg["cellar_id"],
            shelf_id=msg["shelf_id"],
            lane=msg["lane"],
            position=int(msg["position"]),
        )
        connection.send_result(
            msg["id"],
            {
                "status": "success",
                "bottle_id": new_bottle_id,
            },
        )
    except Exception as err:
        connection.send_error(msg["id"], "copy_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_MOVE_BOTTLE, 
    vol.Required("bottle_id"): str, 
    vol.Required("cellar_id"): str, 
    vol.Required("shelf_id"): str, 
    vol.Required("lane"): str, 
    vol.Required("position"): int
})
@websocket_api.async_response
async def ws_move_bottle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle move bottle command securely with keyword arguments."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: 
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    try:
        # Correction chirurgicale : Utilisation impérative des arguments nommés dictés par storage.py
        await store.async_move_bottle(
            bottle_id=str(msg["bottle_id"]),
            cellar_id=str(msg["cellar_id"]),
            shelf_id=str(msg["shelf_id"]),
            lane=str(msg["lane"]),
            position=int(msg["position"])
        )
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        _LOGGER.error("Failed to move bottle via WS: %r", err)
        connection.send_error(msg["id"], "move_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_SWAP_BOTTLES,
    vol.Required("source_id"): str,
    vol.Required("dest_id"): str,
})
@websocket_api.async_response
async def ws_swap_bottles(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle atomic swap bottles command securely."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    try:
        await store.async_swap_bottles(
            source_id=str(msg["source_id"]),
            dest_id=str(msg["dest_id"])
        )
        connection.send_result(msg["id"], {"status": "success"})
    except Exception as err:
        _LOGGER.error("Failed to swap bottles via WS: %r", err)
        connection.send_error(msg["id"], "swap_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_SEARCH_BOTTLES,
    vol.Required("query"): str,
})
@websocket_api.async_response
async def ws_search_bottles(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle search bottles command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return

    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]

    try:
        results = await store.async_search_bottles(msg["query"])
        connection.send_result(msg["id"], results)
    except Exception as err:
        connection.send_error(msg["id"], "search_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): WS_TYPE_FIND_LABEL_DUPLICATES,
    vol.Required("image_path"): str,
})
@websocket_api.async_response
async def ws_find_label_duplicates(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle duplicate label lookup by image path."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "no_entry", "No configuration entry found.")
        return

    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]

    try:
        matches = await store.async_find_duplicate_labels(msg["image_path"])
        connection.send_result(
            msg["id"],
            {
                "matches": matches,
                "message": (
                    f"{len(matches)} duplicate label(s) found." if matches else ""
                ),
            },
        )
    except Exception as err:
        connection.send_error(msg["id"], "duplicate_failed", str(err))

@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_UPLOAD_LABEL_IMAGE, vol.Required("filename"): str, vol.Required("data_base64"): str})
@websocket_api.async_response
async def ws_upload_label_image(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Handle image upload command."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries: return
    entry = entries[0]
    store = hass.data[DOMAIN][entry.entry_id]["store"]
    try:
        path = await store.async_upload_label_image(msg["filename"], msg["data_base64"])
        connection.send_result(msg["id"], {"image_path": path})
    except Exception as err:
        connection.send_error(msg["id"], "upload_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "wine_cellar_manager/unified_analyze",
    vol.Optional("barcode", default=""): str,
    vol.Optional("image_path", default=""): str,
})
@websocket_api.async_response
async def ws_unified_analyze(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Unified analyze flow: barcode first, otherwise label image."""
    barcode = "".join(ch for ch in _safe_str(msg.get("barcode", "")) if ch.isdigit())
    image_path = _safe_str(msg.get("image_path", "")).strip()

    if not barcode and not image_path:
        connection.send_error(
            msg["id"],
            "missing_data",
            "Veuillez fournir un code-barres ou téléverser une photo d'étiquette.",
        )
        return

    try:
        from .gemini_vision import async_analyze_wine_with_gemini, async_extract_barcode_from_image
        from .storage import async_get_store

        if image_path and not barcode and "temp_barcode_" in image_path:
            barcode_result = await async_extract_barcode_from_image(hass, image_path)
            extracted = barcode_result.get("barcode", "")
            store = async_get_store(hass)
            await store.async_delete_image(image_path)

            if not extracted:
                connection.send_result(
                    msg["id"],
                    {"message": "Aucun code-barres fiable détecté.", "suggestion": None},
                )
                return

            connection.send_result(
                msg["id"],
                {
                    "message": "Code-barres détecté.",
                    "suggestion": {"barcode": extracted},
                    "official_image_url": None,
                },
            )
            return

        result = await async_analyze_wine_with_gemini(
            hass,
            barcode=barcode or None,
            image_path=image_path or None,
        )

        result["official_image_path"] = None
        connection.send_result(msg["id"], result)

    except Exception as err:
        _LOGGER.exception("Unified analyze failed: %r", err)
        # Nettoyage préventif des caractères de structure JSON pour ne pas faire planter la carte JS
        error_msg = str(err).replace("{", "[").replace("}", "]").replace('"', "'")
        connection.send_error(msg["id"], "analyze_failed", error_msg)

@websocket_api.websocket_command({
    vol.Required("type"): "wine_cellar_manager/cleanup_temp_image",
    vol.Required("action"): str,
    vol.Optional("local_path", default=""): str,
    vol.Optional("official_path", default=""): str,
})
@websocket_api.async_response
async def ws_cleanup_temp_image(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Cleanup temporary image files after user choice."""
    try:
        from .storage import async_get_store

        store = async_get_store(hass)
        action = _safe_str(msg.get("action")).strip()
        local_path = _safe_str(msg.get("local_path")).strip()
        official_path = _safe_str(msg.get("official_path")).strip()

        if action == "keep_local":
            if official_path:
                await store.async_delete_image(official_path)

            connection.send_result(
                msg["id"],
                {
                    "status": "success",
                    "new_image_path": local_path,
                },
            )
            return

        if action == "keep_official":
            if local_path:
                await store.async_delete_image(local_path)

            connection.send_result(
                msg["id"],
                {
                    "status": "success",
                    "new_image_path": official_path,
                },
            )
            return

        if action in ("cancel", "cancel_both", "delete_both"):
            if local_path:
                await store.async_delete_image(local_path)
            if official_path:
                await store.async_delete_image(official_path)

            connection.send_result(msg["id"], {"status": "success"})
            return

        connection.send_error(msg["id"], "invalid_action", f"Unsupported action: {action}")

    except Exception as err:
        connection.send_error(msg["id"], "cleanup_failed", str(err))