"""Sensors for Wine Cellar Manager."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import StateType

from .const import DOMAIN, EVENT_DATA_CHANGED

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Wine Cellar Manager sensors from a config entry."""
    store = hass.data[DOMAIN][config_entry.entry_id]["store"]
    
    # Création des deux seules entités officielles basées sur l'ID de l'intégration
    sensors = [
        WineCellarStockSensor(config_entry, store),
        WineCellarCapacitySensor(config_entry, store),
    ]
    async_add_entities(sensors, update_before_add=True)


class BaseWineCellarSensor(SensorEntity):
    """Common base for wine cellar sensors to handle data updates securely."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, config_entry: ConfigEntry, store: Any) -> None:
        """Initialize the sensor."""
        self.config_entry = config_entry
        self.store = store
        self._stored_data: dict[str, Any] = {}

    async def async_added_to_hass(self) -> None:
        """Register callbacks when entity is added to Home Assistant."""
        async def _on_data_changed(_):
            """Triggered whenever bottles or cellars are saved/deleted."""
            await self.async_update_ha_state(force_refresh=True)

        self.async_on_remove(
            self.hass.bus.async_listen(EVENT_DATA_CHANGED, _on_data_changed)
        )

    async def async_update(self) -> None:
        """Fetch fresh data from the persistent store."""
        try:
            # Charge les données réelles du disque
            raw_data = await self.store.async_load()
            # Utilise l'exportateur natif pour avoir les structures calculées
            self._stored_data = self.store.async_export(raw_data)
        except Exception as err:
            _LOGGER.error("Failed to update wine cellar sensor data: %r", err)


class WineCellarStockSensor(BaseWineCellarSensor):
    """Representation of the Wine Stock Status sensor."""

    def __init__(self, config_entry: ConfigEntry, store: Any) -> None:
        """Initialize stock sensor."""
        super().__init__(config_entry, store)
        self._attr_name = "Wine stock status"
        # Unique ID immuable combinant l'entrée et le type pour éviter les duplicats
        self._attr_unique_id = f"{config_entry.entry_id}_wine_stock_status"
        self._attr_icon = "mdi:wine-bottle"

    @property
    def native_value(self) -> StateType:
        """Return the total number of active bottles currently in the cellar."""
        bottles = self._stored_data.get("bottles", [])
        return len(bottles) if isinstance(bottles, list) else 0


class WineCellarCapacitySensor(BaseWineCellarSensor):
    """Representation of the Total Cellar Capacity sensor."""

    def __init__(self, config_entry: ConfigEntry, store: Any) -> None:
        """Initialize capacity sensor."""
        super().__init__(config_entry, store)
        self._attr_name = "Total cellar capacity"
        self._attr_unique_id = f"{config_entry.entry_id}_total_cellar_capacity"
        self._attr_icon = "mdi:fridge-industrial"

    @property
    def native_value(self) -> StateType:
        """Return the sum of all front and back capacities across all shelves."""
        cellars = self._stored_data.get("cellars", [])
        if not isinstance(cellars, list):
            return 0
            
        total_capacity = 0
        for cellar in cellars:
            shelves = cellar.get("shelves", [])
            if isinstance(shelves, list):
                for shelf in shelves:
                    front = int(shelf.get("capacity_front", 0) or 0)
                    back = int(shelf.get("capacity_back", 0) or 0)
                    total_capacity += (front + back)
                    
        return total_capacity