"""Wine Cellar Manager integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .services import async_register_services, async_unregister_services
from .storage import async_get_store
from .websocket_api import async_register_websockets


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Wine Cellar Manager integration."""
    hass.data.setdefault(DOMAIN, {})

    if not hass.data[DOMAIN].get("websockets_registered"):
        async_register_websockets(hass)
        hass.data[DOMAIN]["websockets_registered"] = True

    if not hass.data[DOMAIN].get("services_registered"):
        await async_register_services(hass)
        hass.data[DOMAIN]["services_registered"] = True

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Wine Cellar Manager from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    if not hass.data[DOMAIN].get("websockets_registered"):
        async_register_websockets(hass)
        hass.data[DOMAIN]["websockets_registered"] = True

    store = async_get_store(hass)
    await store.async_load()

    hass.data[DOMAIN][entry.entry_id] = {"store": store, "entry": entry}

    # ENREGISTREMENT AUTOMATIQUE DE LA CARTE LOVELACE DANS HOME ASSISTANT
    frontend_dir = entry.manager.hass.config.path("custom_components", DOMAIN, "frontend")
    
    # 1. Crée un lien d'URL statique local accessible par le navigateur
    hass.http.register_static_path(
        "/wine-cellar-manager-frontend",
        frontend_dir,
        cache_headers=False
    )
    
    # 2. Injecte la ressource dans le tableau de bord de l'utilisateur
    if "lovelace" in hass.data:
        lovelace = hass.data["lovelace"]
        if hasattr(lovelace, "async_register_custom_card"):
            await lovelace.async_register_custom_card(
                "wine-cellar-card",
                "/wine-cellar-manager-frontend/wine-cellar-card.js"
            )

    # ROUTINE DE NETTOYAGE GLOBAL DES ANCIENNES ENTITÉS ORPHELINES
    from homeassistant.helpers import entity_registry as er
    import logging
    _LOGGER = logging.getLogger(__name__)
    
    ent_reg = er.async_get(hass)
    
    # Liste noire des anciens formats d'unique_id et de noms d'entités système obsolètes
    obsolete_unique_ids = {
        "wine_stock_status",
        "total_cellar_capacity",
        "wine_cellar_manager_stock",
        "wine_cellar_manager_capacity",
    }
    obsolete_entity_ids = {
        "sensor.wine_stock_status",
        "sensor.total_cellar_capacity",
    }
    
    # Balayage complet du registre de Home Assistant sans filtre d'instance
    entries_to_remove = []
    for entity_entry in list(ent_reg.entities.values()):
        # Suppression si l'unique_id est obsolète ou si l'entité est l'un des anciens capteurs figés
        if entity_entry.unique_id in obsolete_unique_ids or entity_entry.entity_id in obsolete_entity_ids:
            # Sécurité pour ne pas supprimer vos deux nouveaux capteurs opérationnels fraîchement créés
            if "_wine_stock_status" not in str(entity_entry.unique_id) and "_total_cellar_capacity" not in str(entity_entry.unique_id):
                entries_to_remove.append(entity_entry.entity_id)
    
    # Purgation définitive du registre
    for entity_id in entries_to_remove:
        _LOGGER.warning("Wine Cellar Manager : Nettoyage forcé de l'ancienne entité orpheline %s", entity_id)
        try:
            ent_reg.async_remove(entity_id)
        except Exception as err:
            _LOGGER.error("Impossible de purger l'entité %s : %r", entity_id, err)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok and DOMAIN in hass.data:
        hass.data[DOMAIN].pop(entry.entry_id, None)

    return unload_ok