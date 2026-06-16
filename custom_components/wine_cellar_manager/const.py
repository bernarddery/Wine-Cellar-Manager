DOMAIN = "wine_cellar_manager"

PLATFORMS = ["sensor"]

STORAGE_VERSION = 2
STORAGE_KEY = f"{DOMAIN}.data"

DATA_MANAGER = "manager"
DATA_OPTIONS = "options"

DEFAULT_TITLE = "Wine Cellar Manager"

OPTION_IMAGE_BASE_PATH = "image_base_path"
OPTION_IMAGE_UPLOAD_DIR = "image_upload_dir"
OPTION_DEMO_ENRICHMENT = "demo_enrichment"
OPTION_GEMINI_API_KEY = "gemini_api_key"
OPTION_GEMINI_MODEL = "gemini_model"

DEFAULT_IMAGE_BASE_PATH = "/local/wine_labels"
DEFAULT_IMAGE_UPLOAD_DIR = "www/wine_labels"
DEFAULT_DEMO_ENRICHMENT = True
DEFAULT_GEMINI_API_KEY = ""
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

WS_TYPE_GET_DATA = f"{DOMAIN}/data"
WS_TYPE_SAVE_CELLAR = f"{DOMAIN}/save_cellar"
WS_TYPE_DELETE_CELLAR = f"{DOMAIN}/delete_cellar"
WS_TYPE_SAVE_BOTTLE = f"{DOMAIN}/save_bottle"
WS_TYPE_DELETE_BOTTLE = f"{DOMAIN}/delete_bottle"
WS_TYPE_UPLOAD_LABEL_IMAGE = f"{DOMAIN}/upload_label_image"
WS_TYPE_FIND_LABEL_DUPLICATES = f"{DOMAIN}/find_label_duplicates"
WS_TYPE_COPY_BOTTLE = f"{DOMAIN}/copy_bottle"
WS_TYPE_SEARCH_BOTTLES = f"{DOMAIN}/search_bottles"
WS_TYPE_MOVE_BOTTLE = f"{DOMAIN}/move_bottle"
WS_TYPE_CONSUME_BOTTLE = f"{DOMAIN}/consume_bottle"
WS_TYPE_UNIFIED_ANALYZE = f"{DOMAIN}/unified_analyze"
WS_TYPE_CLEANUP_TEMP_IMAGE = f"{DOMAIN}/cleanup_temp_image"

SERVICE_REBUILD_READY = "rebuild_ready"

EVENT_DATA_CHANGED = "wine_cellar_manager_data_changed"

LANE_FRONT = "front"
LANE_BACK = "back"

LAYOUT_SINGLE = "single"
LAYOUT_STAGGERED = "staggered"

WINE_TYPES = {
    "unset",
    "red",
    "white",
    "rosé",
    "sparkling",
    "orange",
    "sweet",
    "other",
}