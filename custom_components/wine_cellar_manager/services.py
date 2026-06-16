from __future__ import annotations

import logging
from homeassistant.core import HomeAssistant, ServiceCall
from .const import DOMAIN, SERVICE_REBUILD_READY

_LOGGER = logging.getLogger(__name__)

async def async_register_services(hass: HomeAssistant) -> None:
    """Register custom services for Wine Cellar Manager."""
    
    async def handle_rebuild_ready(call: ServiceCall) -> None:
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            _LOGGER.warning("Impossible d'exécuter le service : aucune instance de configuration trouvée.")
            return
            
        entry = entries[0]
        # Récupération sécurisée du store alignée sur l'architecture de __init__.py
        store = hass.data[DOMAIN][entry.entry_id]["store"]
        
        _LOGGER.info("Wine Cellar Manager: Reconstitution des données d'apogée initiée.")
        # Force le rechargement rafraîchi du stockage pour recalculer l'état "ready_to_drink"
        await store.async_load()

    hass.services.async_register(
        DOMAIN,
        SERVICE_REBUILD_READY,
        handle_rebuild_ready,
    )


async def async_unregister_services(hass: HomeAssistant) -> None:
    """Unregister custom services."""
    hass.services.async_remove(DOMAIN, SERVICE_REBUILD_READY)
