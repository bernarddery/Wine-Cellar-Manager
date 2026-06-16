class WineCellarCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._data = null;
    this._search = "";
    this._filterType = "";
    this._view = "cellars";
    this._modal = null;
    this._hasRendered = false;
    this._rendering = false;
    this._lastSnapshot = "";
    this._formError = "";
    this._actionMessage = "";
    this._scanner = null;
    this._scannerActive = false;
    this._scannerTargetId = "wine-barcode-scanner";
    this._barcodeBuffer = "";
    this._duplicateMatches = [];
    this._duplicateMessage = "";
    this._searchResults = [];
    this._searchMessage = "";
    this._historySearchValue = "";
    this._historySearchTimer = null;
    this._copiedBottleData = null;
    this._sortColumn = "wine_name";
    this._sortOrder = "asc";
    this._filterCountry = "";
    this._filterReady = false;
    this._viewingDuplicateManager = false;
    this._foundSyntaxDuplicates = [];
    this._duplicateManagerSearching = false;
    this._duplicateManagerHasSearched = false; // Nouvelle variable pour savoir si l'analyse a été lancée
  }

  _t(key) {
    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    var translations = {
      "cellars": isFr ? "Celliers" : "Cellars",
      "compact": isFr ? "Compact" : "Compact",
      "all_bottles": isFr ? "Toutes les bouteilles" : "All Bottles",
      "stats": isFr ? "Statistiques" : "Stats",
      "add_cellar": isFr ? "Ajouter un cellier" : "Add Cellar",
      "add_bottle": isFr ? "Ajouter une bouteille" : "Add Bottle",
      "edit_bottle": isFr ? "Modifier la bouteille" : "Edit Bottle",
      "ready_to_drink": isFr ? "Prêt à boire" : "Ready to Drink",
      "all_types": isFr ? "Tous les types" : "All Types",
      "all_countries": isFr ? "Tous les pays" : "All Countries",
      "wine_name": isFr ? "Nom du vin" : "Wine name",
      "producer": isFr ? "Vignoble" : "Producer",
      "varietal": isFr ? "Cépage" : "Varietal",
      "region": isFr ? "Région" : "Region",
      "country": isFr ? "Pays" : "Country",
      "vintage": isFr ? "Millésime" : "Vintage",
      "type": isFr ? "Type" : "Type",
      "price": isFr ? "Prix" : "Price",
      "rating": isFr ? "Évaluation" : "Rating",
      "notes": isFr ? "Notes" : "Notes",
      "aging_start": isFr ? "Début de l'apogée" : "Aging start year",
      "aging_end": isFr ? "Fin de l'apogée" : "Aging end year",
      "shelf": isFr ? "Tablette" : "Shelf",
      "lane": isFr ? "Rang" : "Lane",
      "position": isFr ? "Position" : "Position",
      "front": isFr ? "Avant" : "Front",
      "back": isFr ? "Arrière" : "Back",
      "consume": isFr ? "Consommer" : "Consume",
      "delete": isFr ? "Supprimer" : "Delete",
      "save": isFr ? "Enregistrer" : "Save",
      "cancel": isFr ? "Annuler" : "Cancel",
      "close": isFr ? "Fermer" : "Close",
      "search_history": isFr ? "Rechercher dans l'historique" : "Search previous bottles",
      "taste_window_title": isFr ? "Fenêtre de dégustation" : "Optimal Drinking Window",
      "serving_temp": isFr ? "Température de service" : "Serving temperature",
      "alcohol_pct": isFr ? "Degré d'alcool" : "Alcohol level",
      "empty_slots": isFr ? "Vide" : "Empty",
      "not_specified": isFr ? "Non spécifié" : "Not Specified",
      "cleanup_btn": isFr ? "Nettoyage" : "Clean-Up",
      "cleanup_title": isFr ? "Outil de recherche et nettoyage de doublons" : "Duplicate Search & Clean-Up Tool",
      "cleanup_search_btn": isFr ? "Rechercher les doublons" : "Search for Duplicates",
      "cleanup_merge_all": isFr ? "Fusionner tout" : "Merge All",
      "cleanup_no_duplicates": isFr ? "Aucun doublon de syntaxe détecté !" : "No syntax duplicates detected!",
      "cleanup_searching": isFr ? "Analyse de la cave en cours..." : "Analyzing cellar data...",
      "cleanup_welcome": isFr ? "Cliquez sur le bouton ci-dessus pour lancer la recherche et l'analyse de votre cave." : "Click the button above to start the search and analyze your cellar data."
    };

    return translations[key] || key;
  }

  setConfig(config) {
    this.config = Object.assign({ title: "Wine Cellar" }, config || {});
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this.render(true);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot || !this._hasRendered) {
      this.render(true);
    }
  }

  getCardSize() {
    return 12;
  }

  getLayoutOptions() {
    return { grid_columns: 12, grid_rows: 10, grid_min_rows: 8 };
  }

  async _callWS(msg) {
    try {
      return await this._hass.connection.sendMessagePromise(msg);
    } catch (err) {
      console.error("Wine Cellar WS error", msg.type, err);
      const detail =
        (err && err.code ? err.code + ": " : "") +
        (err && err.message ? err.message : JSON.stringify(err));
      throw new Error(detail);
    }
  }

  async _loadData(force) {
    if (!this._hass) return { cellars: [], bottles: [], consumed_bottles: [] };
    if (!this._data || force) {
      this._data = await this._callWS({ type: "wine_cellar_manager/data" });
    }
    return this._data || { cellars: [], bottles: [], consumed_bottles: [] };
  }

  async _ensureScannerLibrary() {
    if (window.Html5Qrcode) return;

    if (window.__wineCellarScannerLoading) {
      await window.__wineCellarScannerLoading;
      return;
    }

    window.__wineCellarScannerLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load barcode scanner library"));
      document.head.appendChild(script);
    });

    await window.__wineCellarScannerLoading;
  }

  _escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (s) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[s];
    });
  }

  _str(v) {
    return v == null ? "" : String(v);
  }

  _normalizeImagePath(path) {
    var value = this._str(path).trim();
    if (!value) return "";

    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/local/")) return value;
    if (value.startsWith("local/")) return "/" + value;
    if (value.startsWith("/www/")) return value.replace(/^\/www\//, "/local/");
    if (value.startsWith("www/")) return "/" + value.replace(/^www\//, "local/");
    if (value.startsWith("/")) return value;

    return "/local/" + value.replace(/^\/+/, "");
  }

  _truncateMeta(text) {
    if (!text) return "";
    var str = String(text).trim();
    
    // Dictionnaire de traduction strict
    var replacements = {
      "Cabernet-Sauvignon": "Cab.-Sauv.",
      "Cabernet Franc": "Cab. Franc",
      "Sauvignon Blanc": "Sauv. Blanc",
      "Gewürztraminer": "Gewurtz.",
      "Chardonnay": "Chard.",
      "Pinot Noir": "P. Noir"
    };

    for (var key in replacements) {
      if (str.toLowerCase() === key.toLowerCase()) {
        return replacements[key];
      }
    }

    // Nettoyages administratifs génériques textuels
    str = str.replace(/Appellation d'Origine Contrôlée/gi, "AOC")
             .replace(/Appellation d'Origine Protégée/gi, "AOP")
             .replace(/Grand Cru Classé/gi, "GCC")
             .replace(/Grand Vin de Bordeaux/gi, "Bordeaux");

    return str;
  }


  _intOrNull(v) {
    if (v == null) return null;
    v = String(v).trim();
    if (v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  _floatOrNull(v) {
    if (v == null) return null;
    v = String(v).trim();
    if (v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _setFormError(msg) {
    this._formError = msg || "";
    var errorBox = this.shadowRoot && this.shadowRoot.querySelector(".form-error");
    if (errorBox) {
      if (this._formError) {
        errorBox.textContent = this._formError;
        errorBox.style.display = "block";
      } else {
        errorBox.textContent = "";
        errorBox.style.display = "none";
      }
    }
  }

  _setActionMessage(msg) {
    this._actionMessage = msg || "";
    var box = this.shadowRoot && this.shadowRoot.querySelector(".action-message");
    if (box) {
      if (this._actionMessage) {
        box.textContent = this._actionMessage;
        box.style.display = "block";
      } else {
        box.textContent = "";
        box.style.display = "none";
      }
    }
  }

  _clearFormError() {
    this._setFormError("");
  }

  _clearActionMessage() {
    this._setActionMessage("");
  }

  _clearDuplicateState() {
    this._duplicateMatches = [];
    this._duplicateMessage = "";
  }

  _clearSearchState() {
    this._searchResults = [];
    this._searchMessage = "";
    this._updateSearchResultsPanel();
  }

  _isDarkMode() {
    var bg = getComputedStyle(this).getPropertyValue("--card-background-color").trim().toLowerCase();
    if (!bg) return true;
    if (bg.startsWith("#")) {
      var hex = bg.replace("#", "");
      if (hex.length === 3) {
        hex = hex.split("").map(function (c) { return c + c; }).join("");
      }
      if (hex.length === 6) {
        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);
        var luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance < 0.5;
      }
    }
    return true;
  }

  _wineSurfaceColor(type) {
    var dark = this._isDarkMode();
    if (dark) {
      var darkColors = {
        red: "#6f2233",
        white: "#d8c88a",
        "rosé": "#c97c90",
        sparkling: "#f6eccbff",
        orange: "#c98338",
        sweet: "#f2f2ee",
        other: "#D1E7FF",
        unset: "#6f6a64" // Gris neutre d'origine pour le mode sombre
      };
      return darkColors[type] || darkColors.unset;
    }

    var lightColors = {
      red: "#8b2d3f",
      white: "#eadca6",
      "rosé": "#d88fa0",
      sparkling: "#f6eccbff",
      orange: "#dd9950",
      sweet: "#fcfcf8",
      other: "#D1E7FF",
      unset: "#b2aaa3" // Gris neutre d'origine pour le mode clair
    };
    return lightColors[type] || lightColors.unset;
  }

  _wineTextColor(type) {
    if (type === "white" || type === "sparkling" || type === "sweet" || type === "other" || type === "unset") {
      return "#1f1f1f";
    }
    return "var(--primary-text-color)";
  }
  _agingStatus(bottle) {
    var currentYear = new Date().getFullYear();
    var rawStart = bottle.aging_start_year;
    var rawStop = bottle.aging_end_year;

    if (rawStart === null || rawStart === undefined || rawStart === "") return "none";
    if (rawStop === null || rawStop === undefined || rawStop === "") return "none";

    var start = Number(rawStart);
    var stop = Number(rawStop);

    if (!Number.isFinite(start) || !Number.isFinite(stop)) return "none";

    if (currentYear < start) return "young";
    if (currentYear === stop) return "peak";
    if (currentYear > stop) return "past";
    if (currentYear >= start && currentYear < stop) return "ready";
    return "none";
  }

  _agingBorderColor(bottle) {
    var status = this._agingStatus(bottle);
    var colors = {
      none: "#8a8f98",
      young: "#3b82f6",
      ready: "#22c55e",
      peak: "#d4a017",
      past: "#dc2626"
    };
    return colors[status] || colors.none;
  }

  _normalizeCompareValue(value) {
    return this._str(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  _countSimilarBottles(targetBottle) {
    if (!targetBottle || !this._data || !Array.isArray(this._data.bottles)) return 0;

    var targetName = this._normalizeCompareValue(targetBottle.wine_name);
    var targetProducer = this._normalizeCompareValue(targetBottle.producer);

    if (!targetName) return 0;

    return this._data.bottles.filter((b) => {
      var name = this._normalizeCompareValue(b.wine_name);
      var producer = this._normalizeCompareValue(b.producer);

      if (!name || name !== targetName) return false;

      if (targetProducer && producer) {
        return producer === targetProducer;
      }
      return true;
    }).length;
  }

  _formatPrice(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2
    }).format(num);
  }

  _formatStars(rating) {
    var n = Number(rating);
    if (!Number.isFinite(n) || n <= 0) return "Not rated";
    return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
  }

  _filteredBottles(data) {
    var self = this;
    var bottles = (data && data.bottles || []);
    if (!Array.isArray(bottles)) bottles = [];
    
    return bottles.filter(function(b) {
      return self._bottleMatchesFilters(b);
    });
  }

  _bottleMatchesFilters(bottle) {
    if (!bottle) return false;

    var search = (this._search || "").toLowerCase().trim();
    var type = this._filterType || "";
    var country = this._filterCountry || "";
    var readyFilter = this._filterReady || "";

    // 1. Protection et Filtre par Âge / Apogée
    if (readyFilter === "ready" || readyFilter === true) {
      if (!bottle.ready_to_drink) return false;
    } else if (readyFilter === "drink_now") {
      var currentYear = new Date().getFullYear();
      var rawStop = bottle.aging_end_year;
      if (rawStop === null || rawStop === undefined || rawStop === "") return false;
      if (Number(rawStop) !== currentYear) return false;
    }
    
    // 2. Protection et Filtre par Type de vin
    if (type && (bottle.wine_type || "") !== type) return false;
    
    // 3. Protection et Filtre par Pays d'origine
    if (country) {
      var bCountry = String(bottle.country || "").trim();
      if (bCountry !== country) return false;
    }

    // 4. Protection et Barre de recherche textuelle globale (Inclusion du cépage et du vignoble)
    if (search) {
      var text = [
        String(bottle.wine_name || ""),
        String(bottle.producer || ""),   // Vignoble
        String(bottle.varietal || ""),   // Cépage (Ajouté)
        String(bottle.region || ""),
        String(bottle.country || ""),
        String(bottle.cellar_name || ""),
        this._getShelfName ? String(this._getShelfName(bottle.cellar_id, bottle.shelf_id) || "") : "",
        String(bottle.lane || "")
      ].join(" ").toLowerCase();
      if (text.indexOf(search) === -1) return false;
    }
    return true;
  }

  _levenshteinDistance(s1, s2) {
    var m = s1.length, n = s2.length;
    // Initialisation correcte d'un tableau de tableaux (Matrice 2D)
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = [];
      for (var j = 0; j <= n; j++) {
        dp[i][j] = 0;
      }
    }

    // Remplissage des index de base sans écraser les dimensions de la matrice
    for (var i = 0; i <= m; i++) dp[i][0] = i;
    for (var j = 0; j <= n; j++) dp[0][j] = j;

    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
        }
      }
    }
    return dp[m][n];
  }

  _calculateSimilarity(str1, str2) {
    var s1 = this._normalizeCompareValue(str1);
    var s2 = this._normalizeCompareValue(str2);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 100;
    var maxLen = Math.max(s1.length, s2.length);
    var dist = this._levenshteinDistance(s1, s2);
    return ((maxLen - dist) / maxLen) * 100;
  }

  _findSyntaxAnomalies() {
    var self = this;
    try {
      var bottles = (this._data && this._data.bottles) || [];
      var fields = ["wine_name", "producer", "varietal", "region", "country"];
      var duplicatesFound = [];

      fields.forEach(function(field) {
        var uniqueValues = [];
        bottles.forEach(function(b) {
          var val = String(b[field] || "").trim();
          if (val && uniqueValues.indexOf(val) === -1) {
            uniqueValues.push(val);
          }
        });

        for (var i = 0; i < uniqueValues.length; i++) {
          for (var j = i + 1; j < uniqueValues.length; j++) {
            var valA = uniqueValues[i];
            var valB = uniqueValues[j];

            var similarity = self._calculateSimilarity(valA, valB);
            if (similarity >= 72 && similarity < 100) {
              var bottlesA = bottles.filter(function(b) { return String(b[field] || "").trim() === valA; });
              var bottlesB = bottles.filter(function(b) { return String(b[field] || "").trim() === valB; });

              duplicatesFound.push({
                id: field + "_" + i + "_" + j,
                field: field,
                valueA: valA,
                valueB: valB,
                selectedValue: valA.length >= valB.length ? valA : valB,
                bottlesA: bottlesA,
                bottlesB: bottlesB
              });
            }
          }
        }
      });

      this._foundSyntaxDuplicates = duplicatesFound;
    } catch (err) {
      console.error("Syntax anomaly scanner crashed:", err);
      this._setFormError("Scanner error: " + (err.message || err));
    } finally {
      this._duplicateManagerSearching = false;
      this._duplicateManagerHasSearched = true; // L'analyse s'est terminée avec succès ou échec
      this._rendering = false; 
      this.render(true); 
    }
  }

  async _executeSyntaxMerge(item) {
    try {
      this._setActionMessage("Mise à jour du champ en cours...");
      var bottlesToUpdate = item.selectedValue === item.valueA ? item.bottlesB : item.bottlesA;

      for (var b of bottlesToUpdate) {
        // Filtrage chirurgical : construction stricte du payload attendu par le serveur Python
        var payload = {
          type: "wine_cellar_manager/save_bottle",
          bottle_id: String(b.id),
          cellar_id: String(b.cellar_id),
          shelf_id: String(b.shelf_id),
          lane: String(b.lane || "front"),
          position: b.position != null ? Math.trunc(Number(b.position)) : null,
          wine_name: String(b.wine_name || "").trim(),
          saq_url: b.saq_url ? String(b.saq_url).trim() : (b.url_saq ? String(b.url_saq).trim() : ""),
          producer: String(b.producer || "").trim(),
          region: String(b.region || "").trim(),
          country: String(b.country || "").trim(),
          varietal: String(b.varietal || "").trim(),
          vintage: b.vintage != null ? Math.trunc(Number(b.vintage)) : null,
          wine_type: String(b.wine_type || "other").trim(),
          price: b.price != null ? Number(b.price) : null,
          image_path: String(b.image_path || "").trim(),
          barcode: String(b.barcode || "").trim(),
          aging_start_year: b.aging_start_year != null ? Math.trunc(Number(b.aging_start_year)) : null,
          aging_end_year: b.aging_end_year != null ? Math.trunc(Number(b.aging_end_year)) : null,
          rating: b.rating != null ? Math.trunc(Number(b.rating)) : null,
          notes: String(b.notes || "").trim()
        };

        // Application de la nouvelle chaîne harmonisée sur le champ concerné
        payload[item.field] = item.selectedValue;

        await this._callWS(payload);
      }

      this._foundSyntaxDuplicates = this._foundSyntaxDuplicates.filter(i => i.id !== item.id);
      await this._loadData(true);
      this.render(false);
    } catch(err) {
      this._setFormError("Erreur lors de la mise à jour : " + (err.message || err));
    }
  }

  async _executeMergeAllSyntax() {
    try {
      this._setActionMessage("Fusion de tous les choix en cours...");
      var items = [...this._foundSyntaxDuplicates];
      
      for (var item of items) {
        var bottlesToUpdate = item.selectedValue === item.valueA ? item.bottlesB : item.bottlesA;
        for (var b of bottlesToUpdate) {
          var payload = {
            type: "wine_cellar_manager/save_bottle",
            bottle_id: String(b.id),
            cellar_id: String(b.cellar_id),
            shelf_id: String(b.shelf_id),
            lane: String(b.lane || "front"),
            position: b.position != null ? Math.trunc(Number(b.position)) : null,
            wine_name: String(b.wine_name || "").trim(),
            saq_url: b.saq_url ? String(b.saq_url).trim() : (b.url_saq ? String(b.url_saq).trim() : ""),
            producer: String(b.producer || "").trim(),
            region: String(b.region || "").trim(),
            country: String(b.country || "").trim(),
            varietal: String(b.varietal || "").trim(),
            vintage: b.vintage != null ? Math.trunc(Number(b.vintage)) : null,
            wine_type: String(b.wine_type || "other").trim(),
            price: b.price != null ? Number(b.price) : null,
            image_path: String(b.image_path || "").trim(),
            barcode: String(b.barcode || "").trim(),
            aging_start_year: b.aging_start_year != null ? Math.trunc(Number(b.aging_start_year)) : null,
            aging_end_year: b.aging_end_year != null ? Math.trunc(Number(b.aging_end_year)) : null,
            rating: b.rating != null ? Math.trunc(Number(b.rating)) : null,
            notes: String(b.notes || "").trim()
          };

          payload[item.field] = item.selectedValue;

          await this._callWS(payload);
        }
      }
      
      this._foundSyntaxDuplicates = [];
      await this._loadData(true);
      this.render(false);
    } catch(err) {
      this._setFormError("Erreur globale : " + (err.message || err));
    }
  }


  _renderCleanUpModal() {
    if (!this._viewingDuplicateManager) return "";
    var self = this;
    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    var fieldLabels = {
      "wine_name": isFr ? "Nom du vin" : "Wine name",
      "producer": self._t("producer"),
      "varietal": self._t("varietal"),
      "region": isFr ? "Région" : "Region",
      "country": self._t("country")
    };

    var content = "";
    if (this._duplicateManagerSearching) {
      content = '<div class="empty-state">' + self._t("cleanup_searching") + '</div>';
    } else if (!this._duplicateManagerHasSearched) {
      // Cas 1 : L'utilisateur vient d'ouvrir la fenêtre sans lancer l'analyse
      content = '<div class="empty-state" style="border: 1px dashed color-mix(in srgb,var(--primary-text-color) 12%, transparent); border-radius:12px; padding:30px">' + self._t("cleanup_welcome") + '</div>';
    } else if (!this._foundSyntaxDuplicates.length) {
      // Cas 2 : L'analyse s'est exécutée et la cave est parfaitement propre
      content = '<div class="empty-state" style="color:#22c55e; font-weight:600">' + self._t("cleanup_no_duplicates") + '</div>';
    } else {
      content = [
        '<div style="display:grid; gap:14px; max-height:50vh; overflow-y:auto; padding-right:4px">',
        this._foundSyntaxDuplicates.map(function(item) {
          var label = fieldLabels[item.field] || item.field;
          var styleA = item.selectedValue === item.valueA ? 'background:var(--primary-background-color); border:2px solid #2563eb; font-weight:700' : 'background:var(--secondary-background-color); border:1px solid transparent; opacity:0.8';
          var styleB = item.selectedValue === item.valueB ? 'background:var(--primary-background-color); border:2px solid #2563eb; font-weight:700' : 'background:var(--secondary-background-color); border:1px solid transparent; opacity:0.8';

          return [
            '<div class="duplicate-item" style="grid-template-columns:1fr auto auto; gap:14px; padding:14px; align-items:center">',
            '  <div style="display:grid; gap:6px">',
            '    <span style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--accent-color,#f59e0b); letter-spacing:0.05em">' + self._escape(label) + '</span>',
            '    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">',
            '      <button class="btn small-btn" data-select-variant-a="' + item.id + '" style="' + styleA + '; text-align:left; height:auto; padding:8px 12px; border-radius:8px; color:inherit" type="button">',
            '        <div style="font-size:0.95rem">' + self._escape(item.valueA) + '</div>',
            '        <div style="font-size:0.75rem; color:var(--secondary-text-color); margin-top:2px">' + item.bottlesA.length + ' ' + (isFr ? "bouteille(s)" : "bottle(s)") + '</div>',
            '      </button>',
            '      <button class="btn small-btn" data-select-variant-b="' + item.id + '" style="' + styleB + '; text-align:left; height:auto; padding:8px 12px; border-radius:8px; color:inherit" type="button">',
            '        <div style="font-size:0.95rem">' + self._escape(item.valueB) + '</div>',
            '        <div style="font-size:0.75rem; color:var(--secondary-text-color); margin-top:2px">' + item.bottlesB.length + ' ' + (isFr ? "bouteille(s)" : "bottle(s)") + '</div>',
            '      </button>',
            '    </div>',
            '  </div>',
            '  <button class="btn" data-accept-cleanup style="background:#22c55e; color:#fff; border:none; width:42px; height:42px; padding:0; border-radius:10px; font-size:1.2rem; font-weight:bold" type="button">✓</button>',
            '  <button class="btn" data-reject-cleanup style="background:#dc2626; color:#fff; border:none; width:42px; height:42px; padding:0; border-radius:10px; font-size:1.2rem; font-weight:bold" type="button">✗</button>',
            '</div>'
          ].join("");
        }).join(""),
        '</div>'
      ].join("");
    }

    return [
      '<div class="modal-backdrop" data-close-cleanup-backdrop>',
      '  <div class="modal small-modal" style="display:flex; flex-direction:column; gap:16px">',
      '    <div class="modal-head" style="margin:0">',
      '      <h3>' + self._t("cleanup_title") + '</h3>',
      '      <button class="icon-btn" type="button" data-close-cleanup-btn>×</button>',
      '    </div>',
      '    <div class="form-error"' + (this._formError ? '' : ' style="display:none"') + '>' + this._escape(this._formError || "") + '</div>',
      '    <div class="action-message"' + (this._actionMessage ? '' : ' style="display:none"') + '>' + this._escape(this._actionMessage || "") + '</div>',
      '    <button class="btn" data-trigger-cleanup-search-btn style="background:#2563eb; color:#fff; font-weight:700; height:44px; width:100%">' + self._t("cleanup_search_btn") + '</button>',
      content,
      '    <div class="modal-actions" style="margin-top:auto; padding-top:12px; border-top:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)">',
      '      <button class="btn primary" data-cleanup-merge-all-btn ' + (this._foundSyntaxDuplicates.length ? '' : 'disabled') + ' style="background:#7b2130; color:#fff">' + self._t("cleanup_merge_all") + '</button>',
      '      <button class="btn" data-close-cleanup-bottom style="border:1px solid color-mix(in srgb,var(--primary-text-color) 15%, transparent); background:var(--secondary-background-color)">' + self._t("close") + '</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");
  }


  _openBottleModal(bottle, preset) {
    var self = this;
    this._formError = "";
    this._actionMessage = "";
    this._barcodeBuffer = "";
    this._historySearchValue = "";
    this._clearDuplicateState();
    this._clearSearchState();
    this._modal = {
      type: "bottle",
      bottle: bottle || null,
      preset: preset || {},
      mode: bottle && bottle.id ? "view" : "edit"
    };
    
    this.render(true);

    // ÉCOUTEUR : Attachement direct des fonctions sur le DOM réel généré
    setTimeout(function() {
      var root = self.shadowRoot;
      if (!root) return;

      // Liaison du bouton Modifier
      var editBtn = root.querySelector("[data-edit-bottle-btn]");
      if (editBtn) {
        editBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          self._setBottleModalMode("edit");
        };
      }

      // Liaison du bouton Copier (Nettoyage de l'ID pour pouvoir cloner dans un emplacement vide)
      var copyBtn = root.querySelector("[data-copy-bottle-btn]");
      if (copyBtn && self._modal && self._modal.bottle) {
        copyBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          var bData = Object.assign({}, self._modal.bottle);
          delete bData.id;
          delete bData.cellar_id;
          delete bData.shelf_id;
          delete bData.position;
          
          self._copiedBottleData = bData; // Écrit dans la bonne variable globale
          
          var currentLang = (self._hass && self._hass.language) || "en";
          alert(currentLang.startsWith("fr") ? "Bouteille copiée ! Cliquez sur une case vide pour la coller." : "Bottle copied! Click on an empty slot to paste.");
          self._closeModal();
        };
      }
    }, 40); 
  }

  _openCellarModal(cellar) {
    this._formError = "";
    this._actionMessage = "";
    this._modal = {
      type: "cellar",
      cellar: cellar || null
    };
    this.render(true);
  }

  async _closeModal() {
    this._formError = "";
    this._actionMessage = "";
    this._barcodeBuffer = "";
    this._historySearchValue = "";
    this._clearDuplicateState();
    this._clearSearchState();
    this._modal = null;
    this.render(true);
  }

  _setBottleModalMode(mode) {
    if (this._modal && this._modal.type === "bottle") {
      this._modal.mode = mode;
      this._clearFormError();
      this._clearActionMessage();
      this.render(true);
    }
  }

  _getSortedShelves(cellar) {
    var shelves = (cellar && cellar.shelves ? cellar.shelves : []).slice();
    shelves.sort(function (a, b) {
      var orderDiff = (a.display_order || 0) - (b.display_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return shelves;
  }

  _getShelfById(cellarId, shelfId) {
    var cellars = (this._data && this._data.cellars) ? this._data.cellars : [];
    for (var i = 0; i < cellars.length; i++) {
      if (cellars[i].id !== cellarId) continue;
      var shelves = cellars[i].shelves || [];
      for (var j = 0; j < shelves.length; j++) {
        if (shelves[j].id === shelfId) return shelves[j];
      }
    }
    return null;
  }

  _getShelfName(cellarId, shelfId) {
    var shelf = this._getShelfById(cellarId, shelfId);
    return shelf ? (shelf.name || shelf.id || "") : "";
  }

  _laneLabel(lane) {
    var lang = (this._hass && this._hass.language) || "en";
    if (lane === "back") return lang.startsWith("fr") ? "Arrière" : "Back";
    return lang.startsWith("fr") ? "Avant" : "Front";
  }

  _formatBottleLocation(bottle) {
    var cellars = (this._data && this._data.cellars) ? this._data.cellars : [];
    var cellar = cellars.find(function(c) { return c.id === bottle.cellar_id; });
    var cellarName = cellar ? (cellar.name || "Cellar") : "Unknown cellar";
    var shelfName = this._getShelfName(bottle.cellar_id, bottle.shelf_id) || "Unknown shelf";
    return cellarName +
      " • " + shelfName +
      " • " + this._laneLabel(bottle.lane) +
      " • Position " + (bottle.position || "—");
  }

  _buildShelfOptions(cellarId, selectedShelfId) {
    var cellars = (this._data && this._data.cellars) ? this._data.cellars : [];
    var cellar = cellars.find(function (c) { return c.id === cellarId; });
    var shelves = this._getSortedShelves(cellar);

    return shelves.map((shelf) => {
      return '<option value="' + this._escape(shelf.id) + '"' +
        (String(selectedShelfId || "") === shelf.id ? " selected" : "") +
        ">" + this._escape(shelf.name || shelf.id || "Shelf") + "</option>";
    }).join("");
  }

  _getLaneCapacity(cellarId, shelfId, lane) {
    var shelf = this._getShelfById(cellarId, shelfId);
    if (!shelf) return 0;
    return lane === "back" ? Number(shelf.capacity_back || 0) : Number(shelf.capacity_front || 0);
  }

  _buildLaneOptions(cellarId, shelfId, selectedLane) {
    var self = this; // Déclaration essentielle pour que la fonction map() puisse y accéder
    var shelf = this._getShelfById(cellarId, shelfId);
    if (!shelf) return '<option value="front" selected>Front</option>';

    var lanes = [{ value: "front", label: "Front" }];
    if (Number(shelf.capacity_back || 0) > 0 || shelf.layout_mode === "staggered") {
      lanes.push({ value: "back", label: "Back" });
    }

    var activeLane = selectedLane;
    if (activeLane !== "front" && activeLane !== "back") {
      activeLane = lanes[0].value;
    }
    if (activeLane === "back" && lanes.length === 1) {
      activeLane = "front";
    }

    return lanes.map(function (lane) {
      return '<option value="' + lane.value + '"' + (activeLane === lane.value ? " selected" : "") + ">" + self._escape(self._laneLabel(lane.value)) + "</option>";
    }).join("");
  }
  _buildPositionOptions(cellarId, shelfId, lane, selectedPosition) {
    var capacity = this._getLaneCapacity(cellarId, shelfId, lane);
    var options = [];

    if (!capacity || capacity < 1) {
      capacity = 1;
    }

    for (var i = 1; i <= capacity; i++) {
      options.push(
        '<option value="' + i + '"' + (Number(selectedPosition || 1) === i ? " selected" : "") + ">Position " + i + "</option>"
      );
    }
    return options.join("");
  }

  _validateBottlePayload(payload) {
    if (!payload.cellar_id) return "Please select a cellar.";
    if (!payload.shelf_id) return "Please select a shelf.";
    if (payload.lane !== "front" && payload.lane !== "back") return "Please select a valid lane.";
    if (!Number.isInteger(payload.position) || payload.position < 1) return "Position must be a whole number of 1 or greater.";
    if (!payload.wine_name || !payload.wine_name.trim()) return "Wine name is required.";

    var shelf = this._getShelfById(payload.cellar_id, payload.shelf_id);
    if (!shelf) return "Selected shelf could not be found.";

    var capacity = payload.lane === "back"
      ? Number(shelf.capacity_back || 0)
      : Number(shelf.capacity_front || 0);

    if (capacity < 1) {
      return payload.lane === "back"
        ? "This shelf does not have a back lane."
        : "This shelf does not have any front positions.";
    }

    if (payload.position > capacity) {
      return "Position exceeds the shelf capacity for the selected lane.";
    }

    var bottles = (this._data && this._data.bottles) ? this._data.bottles : [];
    var conflict = bottles.find(function (b) {
      return (
        b.cellar_id === payload.cellar_id &&
        b.shelf_id === payload.shelf_id &&
        String(b.lane) === String(payload.lane) &&
        Number(b.position) === payload.position &&
        b.id !== payload.bottle_id
      );
    });

    if (conflict) {
      return 'That position is already occupied by "' + (conflict.wine_name || "another bottle") + '".';
    }

    if (
      payload.aging_start_year !== null &&
      payload.aging_end_year !== null &&
      payload.aging_start_year > payload.aging_end_year
    ) {
      return "Aging start year cannot be later than aging end year.";
    }

    if (payload.rating !== null && (payload.rating < 0 || payload.rating > 5)) {
      return "Rating must be between 0 and 5.";
    }
    return "";
  }

  _validateBottleForm(form) {
    var wineName = form.querySelector('[name="wine_name"]');
    var position = form.querySelector('[name="position"]');
    var rating = form.querySelector('[name="rating"]');
    var agingStart = form.querySelector('[name="aging_start_year"]');
    var agingEnd = form.querySelector('[name="aging_end_year"]');

    [wineName, position, rating, agingStart, agingEnd].forEach(function (el) {
      if (el) el.setCustomValidity("");
    });

    if (wineName && !wineName.value.trim()) {
      wineName.setCustomValidity("Wine name is required.");
      wineName.reportValidity();
      return false;
    }

    if (position && (!Number.isInteger(Number(position.value)) || Number(position.value) < 1)) {
      position.setCustomValidity("Position must be a whole number of 1 or greater.");
      position.reportValidity();
      return false;
    }

    if (rating && rating.value !== "") {
      var ratingNum = Number(rating.value);
      if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        rating.setCustomValidity("Rating must be between 0 and 5.");
        rating.reportValidity();
        return false;
      }
    }

    if (agingStart && agingEnd && agingStart.value !== "" && agingEnd.value !== "") {
      var startNum = Number(agingStart.value);
      var endNum = Number(agingEnd.value);
      if (Number.isFinite(startNum) && Number.isFinite(endNum) && startNum > endNum) {
        agingEnd.setCustomValidity("Aging end year must be equal to or later than aging start year.");
        agingEnd.reportValidity();
        return false;
      }
    }
    return true;
  }

  _applySuggestionToBottleForm(form, suggestion, overwrite) {
    if (!form || !suggestion) return;

    var fields = [
      "wine_name",
      "producer",
      "region",
      "country",
      "varietal",
      "vintage",
      "wine_type",
      "price",
      "serving_temp",
      "alcohol_pct",
      "image_path",
      "aging_start_year",
      "aging_end_year",
      "rating",
      "notes"
    ];

    fields.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      if (suggestion[name] === undefined || suggestion[name] === null) return;

      var currentValue = (el.value ?? "").toString().trim();
      var incomingValue = suggestion[name];

      if (!overwrite && currentValue !== "") {
        return;
      }

      el.value = incomingValue == null ? "" : String(incomingValue);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }


  async _analyzeLabelFromForm(form) {
    var imagePathEl = form.querySelector('[name="image_path"]');
    var imagePath = imagePathEl ? imagePathEl.value.trim() : "";
    if (!imagePath) {
      this._setFormError("Please upload or capture a label image first.");
      return;
    }

    this._clearFormError();
    this._setActionMessage("Analyzing label...");

    try {
      var result = await this._callWS({
        type: "wine_cellar_manager/unified_analyze",
        image_path: imagePath,
        barcode: ""
      });

      if (result) {
        var suggestion = result.suggestion || result;
        this._applySuggestionToBottleForm(form, suggestion, false);
        this._setActionMessage("Label suggestion applied to empty fields.");
      } else {
        this._setActionMessage("No label result found.");
      }
    } catch (err) {
      console.error("Label analysis failed", err);
      this._setFormError("Label analysis failed: " + (err && err.message ? err.message : "unknown error"));
      this._clearActionMessage();
    }
  }

  async _searchHistory(query) {
    this._historySearchValue = query || "";

    if (!query || !query.trim()) {
      this._searchResults = [];
      this._searchMessage = "";
      this._updateSearchResultsPanel();
      return;
    }

    try {
      var result = await this._callWS({
        type: "wine_cellar_manager/search_bottles",
        query: query.trim()
      });
      // Le backend renvoyant directement le tableau, on valide le type Array
      this._searchResults = Array.isArray(result) ? result : [];
      var lang = (this._hass && this._hass.language) || "en";
      this._searchMessage = this._searchResults.length + (lang.startsWith("fr") ? " bouteille(s) trouvée(s)." : " bottle(s) found.");
      this._updateSearchResultsPanel();
    } catch (err) {
      console.error("Bottle search failed", err);
      this._searchResults = [];
      this._searchMessage = "Bottle search failed: " + (err && err.message ? err.message : "unknown error");
      this._updateSearchResultsPanel();
    }
  }

  _renderSearchResultsMarkup() {
    if (!this._searchResults.length && !this._searchMessage) {
      return "";
    }

    var self = this;
    var info = this._searchMessage
      ? '<div class="duplicate-info">' + this._escape(this._searchMessage) + '</div>'
      : "";

    if (!this._searchResults.length) {
      return '<div class="duplicate-panel"><h4>Search previous bottles</h4>' + info + '<div class="duplicate-empty">No matching bottles found.</div></div>';
    }

    return [
      '<div class="duplicate-panel">',
      '  <h4>Search previous bottles</h4>',
      info,
      '  <div class="duplicate-list">',
      this._searchResults.map(function (match) {
        return (
          '<div class="duplicate-item">' +
          '  <div class="duplicate-meta">' +
          '    <div class="duplicate-title">' + self._escape(match.wine_name || "Unnamed bottle") + '</div>' +
          '    <div class="duplicate-sub">' +
                 self._escape((match.producer || "") + (match.vintage ? " • " + match.vintage : "") + (match.cellar_name ? " • " + match.cellar_name : "") + (match.source ? " • " + match.source : "")) +
          '    </div>' +
          '  </div>' +
          '  <div class="duplicate-actions">' +
          '    <button class="btn small-btn" type="button" data-apply-match="' + self._escape(match.bottle_id) + '">Use details</button>' +
          '    <button class="btn small-btn" type="button" data-copy-match="' + self._escape(match.bottle_id) + '">Copy to slot</button>' +
          '  </div>' +
          '</div>'
        );
      }).join(""),
      '  </div>',
      '</div>'
    ].join("");
  }

  _updateSearchResultsPanel() {
    var panel = this.shadowRoot && this.shadowRoot.querySelector("[data-history-results]");
    if (!panel) return;
    panel.innerHTML = this._renderSearchResultsMarkup();
    this._bindSearchResultButtons();
  }

  _bindSearchResultButtons() {
    var self = this;
    var root = this.shadowRoot;
    var bottleForm = root && root.querySelector("[data-save-bottle]");
    if (!root || !bottleForm) return;

    root.querySelectorAll("[data-apply-match]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._applyExistingBottleToForm(el.getAttribute("data-apply-match"), bottleForm);
      };
    });

    root.querySelectorAll("[data-copy-match]").forEach(function (el) {
      el.onclick = async function (e) {
        e.preventDefault();
        e.stopPropagation();
        await self._copyBottleIntoCurrentSlot(el.getAttribute("data-copy-match"), bottleForm);
      };
    });
  }

  async _checkDuplicatesForImage(imagePath) {
    if (!imagePath) {
      this._clearDuplicateState();
      return;
    }

    try {
      var result = await this._callWS({
        type: "wine_cellar_manager/find_label_duplicates",
        image_path: imagePath
      });
      this._duplicateMatches = (result && result.matches) ? result.matches : [];
      this._duplicateMessage = (result && result.message) ? result.message : "";
    } catch (err) {
      console.error("Duplicate detection failed", err);
      this._duplicateMatches = [];
      this._duplicateMessage = "Duplicate detection failed: " + (err && err.message ? err.message : "unknown error");
    }
  }

  async _uploadLabelFile(file, form) {
    if (!file) {
      this._setFormError("No file selected.");
      return;
    }

    if (!file.type || !file.type.startsWith("image/")) {
      this._setFormError("Selected file is not an image.");
      return;
    }

    this._clearFormError();
    this._setActionMessage("Reading label image...");
    this._clearDuplicateState();

    try {
      var dataUrl = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error("File read failed")); };
        reader.readAsDataURL(file);
      });

      this._setActionMessage("Uploading label image...");

      // Extraction de la chaîne Base64 pure en retirant l'en-tête "data:image/...;base64,"
      var base64Data = dataUrl.split(",")[1] || dataUrl;

      var result = await this._callWS({
        type: "wine_cellar_manager/upload_label_image",
        data_base64: base64Data,
        filename: file.name || "label"
      });

      var imagePathEl = form.querySelector('[name="image_path"]');
      if (imagePathEl && result && result.image_path) {
        imagePathEl.value = result.image_path;
        imagePathEl.dispatchEvent(new Event("input", { bubbles: true }));
        imagePathEl.dispatchEvent(new Event("change", { bubbles: true }));
      }

      this._duplicateMatches = (result && result.duplicate_matches) ? result.duplicate_matches : [];
      this._duplicateMessage = (result && result.duplicate_message) ? result.duplicate_message : "";

      this._setActionMessage(
        this._duplicateMatches.length
          ? "Label image uploaded. Possible duplicates found below."
          : "Label image uploaded."
      );

      var modalBottle = this._modal && this._modal.bottle ? this._modal.bottle : {};
      var modalPreset = this._modal && this._modal.preset ? this._modal.preset : {};

      this._modal = {
        type: "bottle",
        bottle: Object.assign({}, modalBottle, { image_path: result.image_path || "" }),
        preset: Object.assign({}, modalPreset, { image_path: result.image_path || "" }),
        mode: "edit"
      };

      this.render(true);
    } catch (err) {
      console.error("Label upload failed", err);

      let detail = "unknown error";
      if (typeof err === "string") {
        detail = err;
      } else if (err && typeof err.message === "string" && err.message) {
        detail = err.message;
      } else if (err && typeof err.code === "string" && typeof err.message === "string") {
        detail = err.code + ": " + err.message;
      } else {
        try {
          detail = JSON.stringify(err);
        } catch (_) {
          detail = String(err);
        }
      }

      this._setFormError("Label upload failed: " + detail);
      this._clearActionMessage();
    }
  }

  async _copyBottleIntoCurrentSlot(sourceBottleId, form) {
    try {
      var cellarEl = form.querySelector('[name="cellar_id"]');
      var shelfEl = form.querySelector('[name="shelf_id"]');
      var laneEl = form.querySelector('[name="lane"]');
      var positionEl = form.querySelector('[name="position"]');

      var cellarId = cellarEl ? cellarEl.value.trim() : "";
      var shelfId = shelfEl ? shelfEl.value.trim() : "";
      var lane = laneEl ? laneEl.value.trim() : "";
      var position = positionEl ? Number(positionEl.value) : NaN;

      if (!cellarId || !shelfId || !lane || !Number.isInteger(position)) {
        this._setFormError("Select cellar, shelf, lane, and position before copying.");
        return;
      }

      this._clearFormError();
      this._setActionMessage("Copying existing bottle into current slot...");

      await this._callWS({
        type: "wine_cellar_manager/copy_bottle",
        source_bottle_id: sourceBottleId,
        cellar_id: cellarId,
        shelf_id: shelfId,
        lane: lane,
        position: position
      });

      await this._loadData(true);
      await this._closeModal();
    } catch (err) {
      console.error("Copy bottle failed", err);
      this._setFormError("Copy bottle failed: " + (err && err.message ? err.message : "unknown error"));
      this._clearActionMessage();
    }
  }

  _applyExistingBottleToForm(sourceBottleId, form) {
    var active = (this._data && this._data.bottles) ? this._data.bottles : [];
    var consumed = (this._data && this._data.consumed_bottles) ? this._data.consumed_bottles : [];
    var source = active.concat(consumed).find(function (b) { return b.id === sourceBottleId; });
    if (!source) {
      source = this._searchResults.find(function (b) { return b.bottle_id === sourceBottleId; });
    }
    if (!source) {
      this._setFormError("Could not find source bottle.");
      return;
    }

    this._applySuggestionToBottleForm(form, {
      wine_name: source.wine_name,
      producer: source.producer,
      region: source.region,
      country: source.country,
      varietal: source.varietal,
      vintage: source.vintage,
      wine_type: source.wine_type,
      price: source.price,
      image_path: source.image_path,
      aging_start_year: source.aging_start_year,
      aging_end_year: source.aging_end_year,
      rating: source.rating,
      notes: source.notes
    }, true);

    var barcodeEl = form.querySelector('[name="barcode"]');
    if (barcodeEl) {
      barcodeEl.value = "";
    }
    this._setActionMessage("Existing bottle details copied into the form. Review and save.");
  }

  async _saveBottleFromForm(form) {
    if (!this._validateBottleForm(form)) {
      return;
    }

    var fd = new FormData(form);

    var payload = {
      type: "wine_cellar_manager/save_bottle",
      bottle_id: this._str(fd.get("bottle_id")).trim() || undefined,
      cellar_id: this._str(fd.get("cellar_id")).trim(),
      shelf_id: this._str(fd.get("shelf_id")).trim(),
      lane: this._str(fd.get("lane")).trim() || "front",
      position: this._intOrNull(fd.get("position")),
      wine_name: this._str(fd.get("wine_name")).trim(),
      saq_url: fd.get("saq_url") ? this._str(fd.get("saq_url")).trim() : "",
      producer: this._str(fd.get("producer")).trim(),
      region: this._str(fd.get("region")).trim(),
      country: this._str(fd.get("country")).trim(),
      varietal: this._str(fd.get("varietal")).trim(),
      vintage: this._intOrNull(fd.get("vintage")),
      wine_type: this._str(fd.get("wine_type")).trim() || "other",
      price: this._floatOrNull(fd.get("price")),
      serving_temp: this._floatOrNull(fd.get("serving_temp")),
      alcohol_pct: this._floatOrNull(fd.get("alcohol_pct")),
      image_path: this._str(fd.get("image_path")).trim(),
      barcode: this._str(fd.get("barcode")).trim(),
      aging_start_year: this._intOrNull(fd.get("aging_start_year")),
      aging_end_year: this._intOrNull(fd.get("aging_end_year")),
      rating: this._intOrNull(fd.get("rating")),
      notes: this._str(fd.get("notes")).trim()
    };

    var validationError = this._validateBottlePayload(payload);
    if (validationError) {
      this._setFormError(validationError);
      return;
    }

    try {
      this._clearFormError();
      this._clearActionMessage();
      await this._callWS(payload);
      await this._loadData(true);

      var savedBottleId = payload.bottle_id;
      if (!savedBottleId && this._data && Array.isArray(this._data.bottles)) {
        var match = this._data.bottles.find((b) =>
          b.cellar_id === payload.cellar_id &&
          b.shelf_id === payload.shelf_id &&
          String(b.lane) === String(payload.lane) &&
          Number(b.position) === payload.position
        );
        if (match) savedBottleId = match.id;
      }

      if (savedBottleId && this._data && Array.isArray(this._data.bottles)) {
        var savedBottle = this._data.bottles.find((b) => b.id === savedBottleId);
        this._modal = {
          type: "bottle",
          bottle: savedBottle || null,
          preset: {},
          mode: "view"
        };
        this.render(true);
      } else {
        await this._closeModal();
      }
    } catch (err) {
      console.error("Bottle save failed", err, payload);
      this._setFormError("Bottle save failed: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  _parseShelvesFromForm(form) {
    var shelves = [];
    form.querySelectorAll("[data-shelf-row]").forEach((row, index) => {
      var idEl = row.querySelector('[name="shelf_id[]"]');
      var nameEl = row.querySelector('[name="shelf_name[]"]');
      var orderEl = row.querySelector('[name="shelf_display_order[]"]');
      var frontEl = row.querySelector('[name="capacity_front[]"]');
      var backEl = row.querySelector('[name="capacity_back[]"]');

      var front = this._intOrNull(frontEl ? frontEl.value : null);
      var back = this._intOrNull(backEl ? backEl.value : null);

      if (!Number.isInteger(front) || front < 1) {
        throw new Error("Each shelf must have a front capacity of at least 1.");
      }
      if (back === null || back < 0) {
        back = 0;
      }

      shelves.push({
        id: this._str(idEl ? idEl.value : "").trim() || undefined,
        name: this._str(nameEl ? nameEl.value : "").trim() || ("Shelf " + (index + 1)),
        display_order: this._intOrNull(orderEl ? orderEl.value : null) || index,
        capacity_front: front,
        capacity_back: back,
        layout_mode: back > 0 ? "staggered" : "single"
      });
    });

    if (!shelves.length) {
      throw new Error("Add at least one shelf.");
    }
    return shelves;
  }

  async _saveCellarFromForm(form) {
    var fd = new FormData(form);

    try {
      var shelves = this._parseShelvesFromForm(form);

      var bgColorEl = form.querySelector('[name="bg_color"]');
      var selectedBgColor = bgColorEl ? bgColorEl.value.trim() : "";

      await this._callWS({
        type: "wine_cellar_manager/save_cellar",
        cellar_id: fd.get("cellar_id") || undefined,
        name: fd.get("name"),
        shelves: shelves,
        display_order: Number(fd.get("display_order") || 0),
        bg_color: selectedBgColor
      });

      await this._loadData(true);
      await this._closeModal();
    } catch (err) {
      console.error("Cellar save failed", err);
      this._setFormError("Cellar save failed: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  async _deleteBottle(id) {
    if (!confirm("Permanently delete this bottle? This cannot be undone.")) return;
    await this._callWS({
      type: "wine_cellar_manager/delete_bottle",
      bottle_id: id
    });
    await this._loadData(true);
    await this._closeModal();
  }

  async _consumeBottle(id) {
    if (!confirm("Mark this bottle as consumed and move it to history?")) return;
    await this._callWS({
      type: "wine_cellar_manager/consume_bottle",
      bottle_id: id
    });
    await this._loadData(true);
    await this._closeModal();
  }

  async _deleteCellar(id) {
    if (!confirm("Delete this cellar and all its bottles?")) return;
    await this._callWS({
      type: "wine_cellar_manager/delete_cellar",
      cellar_id: id
    });
    await this._loadData(true);
    await this._closeModal();
  }
  _renderToolbar() {
    var self = this;
    var data = this._data || { bottles: [] };
    
    // Extraction dynamique des pays uniques présents dans la cave
    var countriesSet = new Set();
    (data.bottles || []).forEach(function(b) {
      var c = String(b.country || "").trim();
      if (c) countriesSet.add(c);
    });
    var uniqueCountries = Array.from(countriesSet).sort();

    // Détection de la langue pour la barre de recherche textuelle indicative
    var lang = (this._hass && this._hass.language) || "en";
    var searchPlaceholder = lang.startsWith("fr") ? "Rechercher vin, vignoble, région..." : "Search wine, producer, region...";

    return [
      '<div class="toolbar">',
      
      '  <!-- CONTENEUR DES ONGLETS STRUCTURAUX SEPARES AVEC BORDURE REECRITS VIA _T -->',
      '  <div class="nav-tabs-container">',
      '    <button class="btn' + (this._view === "cellars" ? " primary" : "") + '" type="button" data-view="cellars">' + self._t("cellars") + '</button>',
      '    <button class="btn' + (this._view === "compact" ? " primary" : "") + '" type="button" data-view="compact">' + self._t("compact") + '</button>',
      '    <button class="btn' + (this._view === "list" ? " primary" : "") + '" type="button" data-view="list">' + self._t("all_bottles") + '</button>',
      '    <button class="btn' + (this._view === "stats" ? " primary" : "") + '" type="button" data-view="stats">' + self._t("stats") + '</button>',
      '    <button class="btn" type="button" data-open-cleanup-tool style="margin-left:auto; background:#2563eb; color:#fff; font-weight:600">' + self._t("cleanup_btn") + '</button>',
      '    <button class="btn primary" type="button" data-add-cellar style="margin-left:8px">' + (lang.startsWith("fr") ? "+ Cellier" : "+ Cellar") + '</button>',
      '  </div>',
      
      '  <!-- ZONE DES FILTRES REECRITS VIA _T -->',
      (this._view !== "stats" ? [
        '  <div class="toolbar-actions" style="margin-top:4px">',
        '    <input type="search" data-search placeholder="' + searchPlaceholder + '" value="' + this._escape(this._search || "") + '" style="flex:1; min-width:240px; background:var(--secondary-background-color); border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent); border-radius:12px; padding:10px; color:inherit; height:42px">',
        '    <select data-age-filter class="' + (this._filterReady ? "filter-active" : "") + '">',
        '      <option value=""' + (this._filterReady === "" || this._filterReady === false ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Tous les âges" : "All ages") + '</option>',
        '      <option value="ready"' + (this._filterReady === "ready" || this._filterReady === true ? " selected" : "") + '>' + self._t("ready_to_drink") + '</option>',
        '      <option value="drink_now"' + (this._filterReady === "drink_now" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Boire maintenant" : "Drink now") + '</option>',
        '    </select>',
        '    <select data-type-filter class="' + (this._filterType ? "filter-active" : "") + '">',
        '      <option value="">' + self._t("all_types") + '</option>',
        '      <option value="red"' + (this._filterType === "red" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Rouge" : "Red") + '</option>',
        '      <option value="white"' + (this._filterType === "white" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Blanc" : "White") + '</option>',
        '      <option value="rosé"' + (this._filterType === "rosé" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Rosé" : "Rosé") + '</option>',
        '      <option value="sparkling"' + (this._filterType === "sparkling" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Mousseux" : "Sparkling") + '</option>',
        '      <option value="orange"' + (this._filterType === "orange" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Orange" : "Orange") + '</option>',
        '      <option value="sweet"' + (this._filterType === "sweet" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Sucré" : "Sweet") + '</option>',
        '      <option value="other"' + (this._filterType === "other" ? " selected" : "") + '>' + (lang.startsWith("fr") ? "Autre" : "Other") + '</option>',
        '    </select>',
        '    <select data-country-filter class="' + (this._filterCountry ? "filter-active" : "") + '">',
        '      <option value="">' + self._t("all_countries") + '</option>' +
               uniqueCountries.map(function(c) {
                 return '<option value="' + self._escape(c) + '"' + (self._filterCountry === c ? " selected" : "") + ">" + self._escape(c) + "</option>";
               }).join("") +
        '    </select>',
        '  </div>'
      ].join("") : ''),
      "</div>"
    ].join("");
  }

  _renderBottleSlot(bottle, isDimmed) {
    var textColor = this._wineTextColor(bottle.wine_type);
    var borderColor = this._agingBorderColor(bottle);
    var rating = Number.isFinite(Number(bottle.rating)) ? "★".repeat(Number(bottle.rating)) : "";
    var normalizedImagePath = this._normalizeImagePath(bottle.image_path);
    var imageHtml = normalizedImagePath
      ? '<div class="label-wrap"><img class="label-image" src="' + this._escape(normalizedImagePath) + '" alt="' + this._escape(bottle.wine_name || "Wine label") + '" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'placeholder\');this.parentElement.innerHTML=\'<span>Image missing</span>\';"></div>'
      : '<div class="label-wrap placeholder"><span>Label</span></div>';

    var countryClean = String(bottle.country || "").trim().toLowerCase();
    var extraInfo = countryClean === "france" ? (bottle.region || "") : (bottle.varietal || "");
    // Application de la méthode d'abréviation logique intelligente
    var metaText = (extraInfo ? this._truncateMeta(extraInfo) + " " : "") + (bottle.vintage || "");

    var dragMeta = JSON.stringify({
      bottle_id: bottle.id,
      cellar_id: bottle.cellar_id,
      shelf_id: bottle.shelf_id,
      lane: bottle.lane,
      position: Number(bottle.position)
    });

    return (
      '<div class="slot filled' + (isDimmed ? " dimmed" : "") + '" data-edit-bottle="' + bottle.id + '"' +
      ' draggable="true" data-drag-source="' + this._escape(dragMeta) + '"' +
      ' style="background:' + this._wineSurfaceColor(bottle.wine_type) + ';border-color:' + borderColor + ';color:' + textColor + ';cursor:pointer;">' +
      imageHtml +
      '<span class="slot-name">' + this._escape(bottle.wine_name) + '</span>' +
      '<span class="slot-meta">' + this._escape(metaText.trim() || "") + '</span>' +
      '<span class="slot-rating">' + this._escape(rating || "—") + '</span>' +
      "</div>"
    );
  }

  _renderLaneSlots(cellar, shelf, lane, capacity, bottles) {
    var self = this;
    var slotsHtml = [];

    for (var pos = 1; pos <= capacity; pos++) {
      var bottle = null;
      for (var i = 0; i < bottles.length; i++) {
        if (
          bottles[i].shelf_id === shelf.id &&
          String(bottles[i].lane) === String(lane) &&
          Number(bottles[i].position) === pos
        ) {
          bottle = bottles[i];
          break;
        }
      }

      if (bottle) {
        slotsHtml.push(self._renderBottleSlot(bottle, !self._bottleMatchesFilters(bottle)));
      } else {
        slotsHtml.push(
          '<div class="slot empty" data-new-bottle="' +
          self._escape(JSON.stringify({
            cellar_id: cellar.id,
            shelf_id: shelf.id,
            lane: lane,
            position: pos,
            wine_type: "unset",
            rating: 0
          })) +
          '" style="cursor:pointer;">' + self._t("empty_slots") + '</div>'
        );
      }
    }

    var labelHtml = '<div class="lane-label">' + self._escape(self._laneLabel(lane)) + "</div>";
    var content = [];

    if (lane === "back") {
      content.push(labelHtml);
      content.push('<div class="row-slots">' + slotsHtml.join("") + '</div>');
    } else {
      content.push('<div class="row-slots">' + slotsHtml.join("") + '</div>');
      content.push(labelHtml);
    }

    return [
      '<div class="lane-block lane-' + self._escape(lane) + '">',
      content.join(""),
      "</div>"
    ].join("");
  }
  _renderCellars(data) {
    var self = this;
    var cellars = (data.cellars || []).slice().sort(function (a, b) {
      return (a.display_order || 0) - (b.display_order || 0);
    });

    if (!cellars.length) {
      return '<div class="empty-state">Add a first cellar to get started!</div>';
    }

    return '<div class="cellars-grid">' + cellars.map(function (cellar) {
      var cellarBottles = (data.bottles || []).filter(function (b) {
        return b.cellar_id === cellar.id;
      });

      var shelfHtml = self._getSortedShelves(cellar).map(function (shelf, index) {
        var frontCapacity = Number(shelf.capacity_front || 0);
        var backCapacity = Number(shelf.capacity_back || 0);
        var parts = [];

        if (backCapacity > 0) {
          parts.push(self._renderLaneSlots(cellar, shelf, "back", backCapacity, cellarBottles));
        }
        if (frontCapacity > 0) {
          parts.push(self._renderLaneSlots(cellar, shelf, "front", frontCapacity, cellarBottles));
        }

        return (
          '<div class="shelf">' +
          '<div class="shelf-head">' +
          '<div class="row-label">' + self._escape(shelf.name || ("Shelf " + (index + 1))) + '</div>' +
          "</div>" +
          '<div class="shelf-lanes' + (backCapacity > 0 ? " has-back" : "") + '">' + parts.join("") + "</div>" +
          "</div>"
        );
      }).join("");

      return (
        (function() {
          // Utilise l'attribut bg_color persistant du stockage Python s'il existe
          var customBg = cellar.bg_color || cellar.bg_color_custom || "";
          if (!customBg) customBg = "var(--secondary-background-color)";
          return '<section class="cellar-panel" style="background: color-mix(in srgb, ' + customBg + ' 85%, transparent) !important;">';
        })() +
        '<div class="cellar-head">' +
        '<div><h3>' + self._escape(cellar.name) + "</h3></div>" +
        '<button class="btn small-btn" type="button" data-edit-cellar="' + cellar.id + '">Edit</button>' +
        "</div>" +
        (shelfHtml || '<div class="empty-state">No shelves configured.</div>') +
        "</section>"
      );
    }).join("") + "</div>";
  }

  _renderList(data) {
    var self = this;
    var bottles = this._filteredBottles(data);

    if (!bottles.length) {
      return '<div class="empty-state">No bottles match the current view.</div>';
    }

    // 1. Définir l'ordre fixe des types de vin pour le regroupement
    var allowedTypes = ["unset", "red", "white", "rosé", "sparkling", "orange", "sweet", "other"];
    
    // 2. Structurer le dictionnaire de regroupement
    var groups = {};
    allowedTypes.forEach(function(t) { groups[t] = []; });

    // 3. Répartir les bouteilles dans leur groupe respectif
    bottles.forEach(function(b) {
      var t = b.wine_type || "other";
      if (!groups[t]) t = "other";
      groups[t].push(b);
    });

    // 4. Déterminer la clé de tri selon la colonne active
    var col = this._sortColumn || "wine_name";
    var order = this._sortOrder === "desc" ? -1 : 1;

    // 5. Fonction de tri interne pour chaque groupe
    function sortGroup(arr) {
      arr.sort(function(a, b) {
        var valA = "", valB = "";
        
        if (col === "wine_name" || col === "producer" || col === "vintage" || col === "rating" || col === "notes") {
          valA = a[col];
          valB = b[col];
        } else if (col === "region_varietal") {
          var cA = String(a.country || "").trim().toLowerCase();
          valA = cA === "france" ? (a.region || "") : (a.varietal || "");
          var cB = String(b.country || "").trim().toLowerCase();
          valB = cB === "france" ? (b.region || "") : (b.varietal || "");
        } else if (col === "price") {
          valA = a.price != null ? Number(a.price) : 0;
          valB = b.price != null ? Number(b.price) : 0;
        } else if (col === "aging") {
          valA = (a.aging_start_year || 0) + "-" + (a.aging_end_year || 0);
          valB = (b.aging_start_year || 0) + "-" + (b.aging_end_year || 0);
        }

        if (valA == null) valA = "";
        if (valB == null) valB = "";

        if (typeof valA === "number" && typeof valB === "number") {
          return (valA - valB) * order;
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: "base" }) * order;
      });
    }

    // Appliquer le tri sur chaque groupe
    allowedTypes.forEach(function(t) {
      sortGroup(groups[t]);
    });

    // Indicateurs visuels de direction du tri pour les th
    function sortIndicator(columnName) {
      if (self._sortColumn !== columnName) return "";
      return self._sortOrder === "asc" ? " ▲" : " ▼";
    }

    // 6. Construire le tableau HTML traduit dynamiquement via _t
    var lang = (this._hass && this._hass.language) || "en";
    var typeLabels = {
      "unset": lang.startsWith("fr") ? "Non spécifié" : "Not Specified",
      "red": lang.startsWith("fr") ? "Rouge" : "Red",
      "white": lang.startsWith("fr") ? "Blanc" : "White",
      "rosé": "Rosé",
      "sparkling": lang.startsWith("fr") ? "Mousseux" : "Sparkling",
      "orange": "Orange",
      "sweet": lang.startsWith("fr") ? "Sucré" : "Sweet",
      "other": lang.startsWith("fr") ? "Autre" : "Other"
    };

    var html = [];
    html.push('<div class="table-wrap"><table>');
    html.push('<thead><tr>');
    html.push('<th data-sort="wine_name">' + (lang.startsWith("fr") ? "Vin" : "Wine") + sortIndicator("wine_name") + '</th>');
    html.push('<th data-sort="producer">' + self._t("producer") + sortIndicator("producer") + '</th>');
    html.push('<th data-sort="vintage">' + self._t("vintage") + sortIndicator("vintage") + '</th>');
    html.push('<th data-sort="region_varietal">' + (lang.startsWith("fr") ? "Région / Cépage" : "Region/Varietal") + sortIndicator("region_varietal") + '</th>');
    html.push('<th data-sort="rating">' + self._t("rating") + sortIndicator("rating") + '</th>');
    html.push('<th data-sort="aging">' + (lang.startsWith("fr") ? "Apogée" : "Aging") + sortIndicator("aging") + '</th>');
    html.push('<th data-sort="price">' + (lang.startsWith("fr") ? "Prix" : "Price") + sortIndicator("price") + '</th>');
    html.push('</tr></thead><tbody>');

    // 7. Parcourir les groupes et ajouter les lignes
    allowedTypes.forEach(function(t) {
      var groupBottles = groups[t];
      if (!groupBottles.length) return;

      var bgColor = self._wineSurfaceColor(t);
      var textColor = self._wineTextColor(t);
      var labelText = typeLabels[t] || t;

      // Ligne d'entête du groupe de type traduit
      html.push('<tr><td colspan="7" class="type-group-header" style="background:' + bgColor + ';color:' + textColor + ';">' + labelText + ' (' + groupBottles.length + ')</td></tr>');

      // Lignes de bouteilles pour ce groupe
      groupBottles.forEach(function(b) {
        var countryClean = String(b.country || "").trim().toLowerCase();
        var regionVarietal = countryClean === "france" ? (b.region || "—") : (b.varietal || "—");
        var stars = Number.isFinite(Number(b.rating)) ? "★".repeat(Number(b.rating)) : "—";
        
        // Détermination de la couleur d'âge
        var ageStatus = self._agingStatus(b);
        var ageRange = (b.aging_start_year || "-") + " → " + (b.aging_end_year || "-");

        html.push('<tr data-edit-bottle="' + b.id + '">');
        html.push('<td>' + self._escape(b.wine_name) + '</td>');
        html.push('<td>' + self._escape(b.producer || "—") + '</td>');
        html.push('<td>' + self._escape(b.vintage || "—") + '</td>');
        html.push('<td>' + self._escape(regionVarietal) + '</td>');
        html.push('<td>' + self._escape(stars) + '</td>');
        html.push('<td><span class="age-text ' + ageStatus + '">' + self._escape(ageRange) + '</span></td>');
        html.push('<td>' + self._escape(self._formatPrice(b.price)) + '</td>');
        html.push('</tr>');
      });
    });

    html.push('</tbody></table></div>');
    return html.join("");
  }

  _renderStats(data) {
    var self = this;
    var st = (data && data.stats) ? data.stats : null;

    if (!st || !st.taste_window) {
      return '<div class="empty-state">No statistical data available yet. Please add bottles with drinking windows.</div>';
    }

    // --- CHART 1 : REPAIRED SVG DONUT FOR WINE TYPES ---
    var allowedTypes = ["unset", "red", "white", "rosé", "sparkling", "orange", "sweet", "other"];
    var typeCounts = {};
    allowedTypes.forEach(function(t) { typeCounts[t] = 0; });
    
    (data.bottles || []).forEach(function(b) {
      var t = b.wine_type || "other";
      if (typeCounts[t] !== undefined) typeCounts[t]++;
      else typeCounts["other"]++;
    });

    var totalB = st.total_bottles || 1;
    var pieRadius = 50;
    var pieCircumference = 2 * Math.PI * pieRadius;
    var currentAngle = -90; // Commencer le premier arc tout en haut
    
    var donutSegmentsHtml = [];
    var donutLegendHtml = [];
    var globalLegendHtml = []; // Pour le graphique du bas

    // Dictionnaire de traduction respectant les majuscules pour les statistiques
    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");
    var typeLabels = {
      "unset": isFr ? "Non spécifié" : "Not Specified",
      "red": isFr ? "Rouge" : "Red",
      "white": isFr ? "Blanc" : "White",
      "rosé": "Rosé",
      "sparkling": isFr ? "Mousseux" : "Sparkling",
      "orange": "Orange",
      "sweet": isFr ? "Sucré" : "Sweet",
      "other": isFr ? "Autre" : "Other"
    };

    allowedTypes.forEach(function(t) {
      var count = typeCounts[t];
      var color = self._wineSurfaceColor(t);
      var labelText = typeLabels[t] || t;
      
      // Construire la légende globale horizontale (utilisée sous le graphique du bas)
      globalLegendHtml.push(
        '<div style="display:flex;align-items:center;gap:6px;font-size:0.82rem;white-space:nowrap">' +
        '  <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + color + '"></span>' +
        '  <span>' + self._escape(labelText) + '</span>' +
        '</div>'
      );

      if (count === 0) return;
      
      var percentage = (count / totalB) * 100;
      var strokeDashArray = (percentage / 100) * pieCircumference;

      donutSegmentsHtml.push(
        '<circle cx="80" cy="80" r="' + pieRadius + '" fill="transparent" ' +
        ' stroke="' + color + '" stroke-width="18" ' +
        ' stroke-dasharray="' + strokeDashArray + ' ' + (pieCircumference - strokeDashArray) + '" ' +
        ' stroke-dashoffset="0" ' +
        ' transform="rotate(' + currentAngle + ' 80 80)"></circle>'
      );

      currentAngle += (percentage / 100) * 360;

      donutLegendHtml.push(
        '<div style="display:flex;align-items:center;gap:8px;font-size:0.88rem;margin-bottom:4px">' +
        '  <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + color + ';border:1px solid rgba(255,255,255,0.1)"></span>' +
        '  <span style="font-weight:600">' + self._escape(labelText) + '</span>' +
        '  <span style="color:var(--secondary-text-color)">(' + count + ' — ' + Math.round(percentage) + '%)</span>' +
        '</div>'
      );
    });

    // --- CHART 2 : HORIZONTAL BARS FOR COUNTRIES ---
    var topCountries = st.top_countries || [];
    var maxCountryCount = topCountries.length ? Math.max.apply(null, topCountries.map(function(c) { return c.count; })) : 1;
    
    var countriesHtml = topCountries.map(function(c) {
      var barPct = (c.count / maxCountryCount) * 100;
      return [
        '<div style="margin-bottom:10px">',
        '  <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600;margin-bottom:4px">',
        '    <span>' + self._escape(c.country) + '</span>',
        '    <span style="margin-left:auto;color:var(--secondary-text-color)">' + c.count + '</span>',
        '  </div>',
        '  <div style="width:100%;height:10px;background:var(--secondary-background-color);border-radius:4px;overflow:hidden">',
        '    <div style="width:' + barPct + '%;height:100%;background:#7b2130;border-radius:4px"></div>',
        '  </div>',
        '</div>'
      ].join("");
    }).join("");

    if (!countriesHtml) {
      countriesHtml = '<div class="empty-state" style="padding:10px">No countries listed.</div>';
    }

    // --- CHART 3 : STACKED VERTICAL BARS (TASTING WINDOW) ---
    var tasteWindow = st.taste_window || {};
    var years = Object.keys(tasteWindow).sort();
    
    var maxYearTotal = 1;
    years.forEach(function(y) {
      var yearTotal = 0;
      allowedTypes.forEach(function(t) {
        yearTotal += (tasteWindow[y][t] || 0);
      });
      if (yearTotal > maxYearTotal) maxYearTotal = yearTotal;
    });

    var svgWidth = 800;
    var svgHeight = 220;
    var chartTopPadding = 15;
    var chartBottomPadding = 25;
    var chartLeftPadding = 35;
    var chartRightPadding = 15;
    
    var graphHeight = svgHeight - chartTopPadding - chartBottomPadding;
    var graphWidth = svgWidth - chartLeftPadding - chartRightPadding;
    
    var barWidth = Math.max(15, Math.floor(graphWidth / (years.length || 1)) - 16);
    var xStep = graphWidth / (years.length || 1);

    var svgContent = [];

    // Lignes de repère Y
    for (var l = 1; l <= 3; l++) {
      var yVal = Math.round((maxYearTotal / 3) * l);
      var yPos = svgHeight - chartBottomPadding - ((yVal / maxYearTotal) * graphHeight);
      svgContent.push('<line x1="' + chartLeftPadding + '" y1="' + yPos + '" x2="' + (svgWidth - chartRightPadding) + '" y2="' + yPos + '" stroke="color-mix(in srgb, var(--primary-text-color) 8%, transparent)" stroke-dasharray="4,4" />');
      svgContent.push('<text x="' + (chartLeftPadding - 8) + '" y="' + (yPos + 4) + '" fill="var(--secondary-text-color)" font-size="10" text-anchor="end">' + yVal + '</text>');
    }
    svgContent.push('<line x1="' + chartLeftPadding + '" y1="' + (svgHeight - chartBottomPadding) + '" x2="' + (svgWidth - chartRightPadding) + '" y2="' + (svgHeight - chartBottomPadding) + '" stroke="color-mix(in srgb, var(--primary-text-color) 20%, transparent)" stroke-width="1.5" />');

    // Génération des rectangles empilés sans texte numérique dessus
    years.forEach(function(year, idx) {
      var xPos = chartLeftPadding + (idx * xStep) + (xStep - barWidth) / 2;
      var currentYOffset = 0;

      svgContent.push('<text x="' + (xPos + barWidth / 2) + '" y="' + (svgHeight - 8) + '" fill="var(--primary-text-color)" font-size="11" font-weight="600" text-anchor="middle">' + year + '</text>');

      allowedTypes.forEach(function(t) {
        var count = tasteWindow[year][t] || 0;
        if (count === 0) return;

        var barHeight = (count / maxYearTotal) * graphHeight;
        var yPos = svgHeight - chartBottomPadding - barHeight - currentYOffset;
        var color = self._wineSurfaceColor(t);

        svgContent.push(
          '<rect x="' + xPos + '" y="' + yPos + '" width="' + barWidth + '" height="' + barHeight + '" ' +
          ' fill="' + color + '" rx="2" style="transition:all 0.2s ease" />'
        );

        currentYOffset += barHeight;
      });
    });

    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    return [
      '<div class="stats-summary-grid">',
      '  <div class="stats-card"><div class="stats-card-label">' + (isFr ? "Bouteilles au total" : "Total Bottles") + '</div><div class="stats-card-value">' + (st.total_bottles || 0) + '</div></div>',
      '  <div class="stats-card"><div class="stats-card-label">' + (isFr ? "Vins différents" : "Different Wines") + '</div><div class="stats-card-value">' + (st.unique_wines_count || 0) + '</div></div>',
      '  <div class="stats-card"><div class="stats-card-label">' + (isFr ? "Âge moyen" : "Average Age") + '</div><div class="stats-card-value">' + (st.average_age || 0) + ' <span style="font-size:0.9rem;font-weight:normal;color:var(--secondary-text-color)">' + (isFr ? "ans" : "years") + '</span></div></div>',
      '  <div class="stats-card"><div class="stats-card-label">' + (isFr ? "Valeur totale" : "Total Value") + '</div><div class="stats-card-value">' + self._formatPrice(st.total_value || 0) + '</div></div>',
      '</div>',
      
      '<div class="stats-charts-split">',
      '  <div class="stats-panel">',
      '    <h4>' + (isFr ? "Distribution par type" : "Distribution by Type") + '</h4>',
      '    <div style="display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;padding:10px 0">',
      '      <svg width="160" height="160" viewBox="0 0 160 160">',
               donutSegmentsHtml.join(""),
      '        <circle cx="80" cy="80" r="34" fill="var(--card-background-color)"></circle>',
      '        <text x="80" y="86" text-anchor="middle" font-weight="bold" font-size="14" fill="var(--primary-text-color)">' + (st.total_bottles || 0) + '</text>',
      '      </svg>',
      '      <div style="display:flex;flex-direction:column;justify-content:center">',
               donutLegendHtml.join(""),
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="stats-panel">',
      '    <h4>' + (isFr ? "Top des pays d'origine" : "Top Countries of Origin") + '</h4>',
      '    <div style="padding:4px 0">' + countriesHtml + '</div>',
      '  </div>',
      '</div>',

      '<div class="stats-panel chart-full-width">',
      '  <h4>' + self._t("taste_window_title") + ' (' + (isFr ? "Bouteilles prêtes à boire par année" : "Bottles Ready to Drink by Year") + ')</h4>',
      '  <div style="width:100%;overflow-x:auto;padding-top:4px;margin-bottom:12px">',
      '    <svg width="' + svgWidth + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" style="display:block;margin:0 auto">',
             svgContent.join(""),
      '    </svg>',
      '  </div>',
      '  <!-- Horizontal Color Legend for Stacked Chart -->',
      '  <div style="display:flex;gap:12px 16px;flex-wrap:wrap;justify-content:center;border-top:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);padding-top:12px;margin-top:4px">',
           globalLegendHtml.join(""),
      '  </div>',
      '</div>'
    ].join("");
  }

  _renderDuplicateMatches() {
    if (!this._duplicateMatches.length && !this._duplicateMessage) {
      return "";
    }

    var self = this;
    var info = this._duplicateMessage
      ? '<div class="duplicate-info">' + this._escape(this._duplicateMessage) + '</div>'
      : "";

    if (!this._duplicateMatches.length) {
      return '<div class="duplicate-panel"><h4>Possible duplicates</h4>' + info + '<div class="duplicate-empty">No likely duplicate labels found.</div></div>';
    }

    return [
      '<div class="duplicate-panel">',
      '  <h4>Possible duplicates</h4>',
      info,
      '  <div class="duplicate-list">',
      this._duplicateMatches.map(function (match) {
        return (
          '<div class="duplicate-item">' +
          '  <div class="duplicate-meta">' +
          '    <div class="duplicate-title">' + self._escape(match.wine_name || "Unnamed bottle") + '</div>' +
          '    <div class="duplicate-sub">' +
                 self._escape((match.producer || "") + (match.vintage ? " • " + match.vintage : "") + (match.cellar_name ? " • " + match.cellar_name : "") + (match.source ? " • " + match.source : "")) +
          '    </div>' +
          '    <div class="duplicate-sub">Similarity distance: ' + self._escape(match.distance) + '</div>' +
          '  </div>' +
          '  <div class="duplicate-actions">' +
          '    <button class="btn small-btn" type="button" data-apply-match="' + self._escape(match.bottle_id) + '">Use details</button>' +
          '    <button class="btn small-btn" type="button" data-copy-match="' + self._escape(match.bottle_id) + '">Copy to slot</button>' +
          '  </div>' +
          '</div>'
        );
      }).join(""),
      '  </div>',
      '</div>'
    ].join("");
  }
  _renderBottleViewModal(data) {
    var bottle = (this._modal && this._modal.bottle) || {};
    var self = this;
    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    var imagePath = bottle.image_path ? this._normalizeImagePath(bottle.image_path) : "";
    var bgColor = this._wineSurfaceColor(bottle.wine_type);
    var textColor = this._wineTextColor(bottle.wine_type);

    var typeLabels = {
      "unset": isFr ? "Non spécifié" : "Not Specified",
      "red": isFr ? "Rouge" : "Red",
      "white": isFr ? "Blanc" : "White",
      "rosé": "Rosé",
      "sparkling": isFr ? "Mousseux" : "Sparkling",
      "orange": "Orange",
      "sweet": isFr ? "Sucré" : "Sweet",
      "other": isFr ? "Autre" : "Other"
    };
    var rawType = bottle.wine_type || "";
    var formattedRawType = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : "";
    var wineTypeLabel = typeLabels[bottle.wine_type || "other"] || formattedRawType;

    var ratingHtml = "";
    if (bottle.rating && Number(bottle.rating) > 0) {
      var r = Math.max(0, Math.min(5, Number(bottle.rating)));
      ratingHtml = '<span style="color:var(--accent-color, #f59e0b);font-size:1.6rem;letter-spacing:4px;line-height:1">' + "★".repeat(r) + '<span style="color:var(--secondary-text-color);opacity:0.25">' + "★".repeat(5 - r) + "</span></span>";
    } else {
      ratingHtml = '<span style="color:var(--accent-color, #2563eb);font-size:1.25rem;font-weight:700;line-height:1">' + (isFr ? "Non évalué" : "Not rated") + '</span>';
    }

    // Calcul dynamique du nombre de bouteilles semblables en stock
    var similarCount = this._countSimilarBottles(bottle);
    var similarText = isFr
      ? (similarCount > 1 ? similarCount + " bouteilles semblables au total" : "Seule bouteille de ce type")
      : (similarCount > 1 ? similarCount + " similar bottles total" : "Only bottle of this kind");

    return [
      '<div class="modal-backdrop" data-close-modal>',
      '  <div class="modal wine-view-modal" role="dialog" aria-modal="true" aria-label="Wine details">',
      
      '    <div class="modal-banner" style="background:' + bgColor + ';color:' + textColor + ';display:flex;align-items:center;justify-content:flex-start;padding:16px 20px;border-top-left-radius:14px;border-top-right-radius:14px;gap:12px;text-align:left">',
      '      <span class="wine-badge" style="background:rgba(255,255,255,0.25);color:' + textColor + ';padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border:none">' + wineTypeLabel + '</span>',
      '      <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; text-align:left">',
      '        <h2 class="modal-banner-title" style="margin:0;font-size:1.35rem;font-weight:700;color:' + textColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">' + this._escape(bottle.wine_name || (isFr ? "Nom inconnu" : "Unnamed Wine")) + '</h2>',
      '        <div class="modal-banner-sub" style="margin-top:2px;font-size:0.82rem;opacity:0.85;color:' + textColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">' + this._escape(similarText) + '</div>',
      '      </div>',
      '      <button class="icon-btn" type="button" data-close-modal style="color:' + textColor + ';font-size:1.6rem;background:none;border:none;cursor:pointer;margin-left:12px;flex-shrink:0;align-self:center">×</button>',
      '    </div>',
      
      '    <div class="modal-body split-view" style="padding:20px">',
      '      <div class="info-column">',
      '        <div class="rating-row" style="margin-bottom:18px;display:flex;align-items:center;gap:4px;min-height:30px">',
                 ratingHtml,
      '        </div>',

      '        <div class="detail-grid">',
      '          <div class="meta-item"><strong>' + self._t("producer") + '</strong><div>' + this._escape(bottle.producer || "—") + '</div></div>',
      '          <div class="meta-item"><strong>' + self._t("varietal") + '</strong><div>' + this._escape(bottle.varietal || "—") + '</div></div>',
      '          <div class="meta-item"><strong>' + (isFr ? "Région" : "Region") + '</strong><div>' + this._escape(bottle.region || "—") + '</div></div>',
      '          <div class="meta-item"><strong>' + self._t("country") + '</strong><div>' + this._escape(bottle.country || "—") + '</div></div>',
          '          <div class="meta-item"><strong>' + self._t("vintage") + '</strong><div>' + (bottle.vintage || (isFr ? "Inconnu" : "N/A")) + '</div></div>',
          '          <div class="meta-item"><strong>' + (isFr ? "Prix" : "Price") + '</strong><div>' + this._formatPrice(bottle.price || 0) + '</div></div>',
          '          <div class="meta-item"><strong>' + self._t("serving_temp") + '</strong><div>' + (bottle.serving_temp != null ? bottle.serving_temp + " °C" : "—") + '</div></div>',
          '          <div class="meta-item"><strong>' + self._t("alcohol_pct") + '</strong><div>' + (bottle.alcohol_pct != null ? bottle.alcohol_pct + " %" : "—") + '</div></div>',
          '        </div>',
          '        <div class="detail-grid" style="margin-top:14px;border-top:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);padding-top:14px">',
      '          <div class="meta-item" style="grid-column:span 2"><strong>' + (isFr ? "Apogée" : "Drinking Window") + '</strong><div style="font-size:0.95rem;margin-top:2px">' + 
                  ((bottle.aging_start_year && bottle.aging_end_year) 
                    ? (isFr ? "De " : "From ") + bottle.aging_start_year + (isFr ? " à " : " to ") + bottle.aging_end_year 
                    : '<span style="color:var(--secondary-text-color);font-size:0.88rem">' + (isFr ? "Pas d'information" : "No data") + '</span>') + 
      '          </div></div>',
      '        </div>',
      bottle.notes ? '        <div class="notes-box" style="margin-top:14px"><div class="detail-label"><strong>' + self._t("notes") + '</strong></div><div class="notes-text" style="margin-top:4px">' + this._escape(bottle.notes) + '</div></div>' : '',
      
      /* BOUTON SAQ RECALIBRÉ COMPACT ET EMPLACEMENT DE LA BOUTEILLE */
      [
        (bottle.saq_url ? [
          '        <div style="margin-top:14px">',
          '          <a href="' + this._escape(bottle.saq_url) + '" target="_blank" rel="noopener" class="btn" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;height:34px;padding:0 12px;font-size:0.85rem;border-radius:10px;border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);background:var(--secondary-background-color);color:var(--primary-text-color)">',
          '            <span>Lien SAQ</span><span style="font-size:1rem;line-height:1">↗</span>',
          '          </a>',
          '        </div>'
        ].join("") : ""),
        '        <div style="margin-top:14px;font-size:0.88rem;color:var(--secondary-text-color);display:flex;flex-direction:column;gap:4px">',
        '          <span style="font-size:0.75rem;text-transform:uppercase;font-weight:700;color:var(--accent-color,#f59e0b);letter-spacing:0.05em">' + (isFr ? "Emplacement physique" : "Physical Location") + '</span>',
        '          <div style="font-weight:600;color:var(--primary-text-color);background:color-mix(in srgb,var(--secondary-background-color) 40%,transparent);padding:8px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--primary-text-color) 6%,transparent);line-height:1.4">' + this._escape(this._formatBottleLocation(bottle).replace(/ • /g, " → ")) + '</div>',
        '        </div>'
      ].join(""),
      '      </div>',
      '      <div class="image-column">',
      imagePath
        ? '        <div class="hero-image-frame"><img src="' + this._escape(imagePath) + '" alt="' + this._escape(bottle.wine_name || "Wine label") + '" class="hero-label-image" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'placeholder\');this.parentElement.innerHTML=\'<span>' + (isFr ? "Aucune image" : "No label image") + '</span>\';"></div>'
        : '        <div class="hero-image-frame placeholder"><span>' + (isFr ? "Aucune image" : "No label image") + '</span></div>',
      '      </div>',
      '    </div>',
      
      '    <!-- SUPPRESSION DE L\'ATTRIBUT CONFLICTUEL DATA-EDIT-BOTTLE POUR RETROUVER LES COULEURS BLEUES -->',
      '    <div class="view-actions modal-actions" style="padding:16px 20px;border-top:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%">',
      '      <div class="left-actions" style="display:flex;gap:8px">',
      '        <button class="btn warning" type="button" data-consume-bottle="' + bottle.id + '">' + (isFr ? "Consommer" : "Consume") + '</button>',
      '        <button class="btn danger" type="button" data-delete-bottle="' + bottle.id + '">' + (isFr ? "Supprimer" : "Delete") + '</button>',
      '      </div>',
      '      <div class="right-actions" style="display:flex;gap:8px;margin-left:auto;align-items:center">',
      '        <button class="btn primary" type="button" data-copy-memory-btn style="border:none !important;background:#2563eb !important;color:#ffffff !important;padding:0 16px !important;border-radius:12px !important;cursor:pointer !important;height:42px !important;font-weight:600 !important;display:inline-block !important">' + (isFr ? "Copier" : "Copy") + '</button>',
      '        <button class="btn primary" type="button" data-enter-edit style="border:none !important;background:#7b2130 !important;color:#ffffff !important;padding:0 16px !important;border-radius:12px !important;cursor:pointer !important;height:42px !important;font-weight:600 !important;display:inline-block !important">' + (isFr ? "Modifier" : "Edit") + '</button>',
      '        <button class="btn" type="button" data-close-modal style="border:1px solid color-mix(in srgb,var(--primary-text-color) 15%, transparent) !important;background:var(--secondary-background-color) !important;color:var(--primary-text-color) !important;padding:0 16px !important;border-radius:12px !important;cursor:pointer !important;height:42px !important;font-weight:600 !important;display:inline-block !important">' + (isFr ? "Fermer" : "Close") + '</button>',
      '      </div>',
     '    </div>',
      '  </div>',
      '</div>'
    ].join("");
  }

  _renderBottleModal(data) {
    var bottle = (this._modal && this._modal.bottle) || null;
    var mode = (this._modal && this._modal.mode) || "edit";

    if (bottle && bottle.id && mode === "view") {
      return this._renderBottleViewModal(data);
    }
    return this._renderBottleEditModal(data);
  }

  _renderBottleEditModal(data) {
    var bottle = (this._modal && this._modal.bottle) || {};
    var preset = (this._modal && this._modal.preset) || {};
    var self = this;

    function v(key, fallback) {
      if (bottle[key] !== undefined && bottle[key] !== null) return bottle[key];
      if (preset[key] !== undefined && preset[key] !== null) return preset[key];
      return fallback;
    }

    var cellars = data.cellars || [];
    var defaultCellarId = v("cellar_id", cellars.length ? cellars[0].id : "");
    var currentCellarId = String(defaultCellarId || "");
    var currentShelfId = String(v("shelf_id", "") || "");
    var cellarForDefaultShelf = cellars.find(function (c) { return c.id === currentCellarId; });
    var sortedShelves = this._getSortedShelves(cellarForDefaultShelf);
    if (!currentShelfId && sortedShelves.length) {
      currentShelfId = sortedShelves[0].id;
    }

    var selectedLane = String(v("lane", "front") || "front");
    var shelf = this._getShelfById(currentCellarId, currentShelfId);
    if ((!shelf || !(Number(shelf.capacity_back || 0) > 0)) && selectedLane === "back") {
      selectedLane = "front";
    }

    var defaultPosition = Number(v("position", 1) || 1);
    var maxPosition = this._getLaneCapacity(currentCellarId, currentShelfId, selectedLane);
    if (maxPosition > 0 && defaultPosition > maxPosition) {
      defaultPosition = 1;
    }

    var imagePath = v("image_path", "");
    var previewImagePath = this._normalizeImagePath(imagePath);

    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    return [
      '<div class="modal-backdrop" data-close-modal>',
      '  <div class="modal" role="dialog" aria-modal="true" aria-label="Bottle editor">',
      '    <div class="modal-head">',
      "      <h3>" + (bottle.id ? self._t("edit_bottle") : self._t("add_bottle")) + "</h3>",
      '      <button class="icon-btn" type="button" data-close-modal>×</button>',
      "    </div>",
      '<div class="form-error"' + (this._formError ? '' : ' style="display:none"') + ' role="alert">' + this._escape(this._formError || "") + '</div>',
      '<div class="action-message"' + (this._actionMessage ? '' : ' style="display:none"') + '>' + this._escape(this._actionMessage || "") + '</div>',
      '    <form class="modal-form" data-save-bottle novalidate>',
      '      <input type="hidden" name="bottle_id" value="' + self._escape(v("id", "")) + '">',
      '      <input type="hidden" name="analyzed_flag" value="' + (bottle.analyzed ? "true" : "false") + '">',
      
      '      <!-- ZONE CAPTURE ET ANALYSE DE HAUT DE FORMULAIRE -->',
      '      <div class="analysis-top-panel" style="background:color-mix(in srgb, var(--secondary-background-color) 40%, transparent);padding:14px;border-radius:14px;display:grid;gap:12px;border:1px dashed color-mix(in srgb,var(--primary-text-color) 15%, transparent)">',
      '        <div style="font-weight:700;font-size:0.95rem">' + (isFr ? "Acquisition et identification du vin" : "Wine Acquisition & Identification") + '</div>',
      '        <div class="grid2">',
      '          <button class="btn small-btn" type="button" data-pick-barcode-btn>' + (isFr ? "📁 Charger code-barres (SAQ seulement)" : "📁 Upload Barcode (SAQ Only)") + '</button>',
      '          <button class="btn small-btn" type="button" data-pick-label-btn>' + (isFr ? "📁 Charger photo étiquette" : "📁 Upload Label Photo") + '</button>',
      '          <input type="file" accept="image/*" data-barcode-file-input style="display:none">',
      '          <input type="file" accept="image/*" data-label-file-input style="display:none">',
      '        </div>',
      '        <div class="grid2">',
      '          <label style="font-size:0.85rem">' + (isFr ? "Numéro du code-barres (14 chiffres)" : "Barcode Number (14 digits)") + '<input name="barcode" placeholder="' + (isFr ? "Résultat du scan ou entrée manuelle" : "Scan result or manual entry") + '" value="' + self._escape(v("barcode", "")) + '"></label>',
      '          <label style="font-size:0.85rem">' + (isFr ? "Chemin de l'image de l'étiquette" : "Label Image Path") + '<input name="image_path" placeholder="/local/wine_labels/example.jpg" value="' + self._escape(imagePath) + '"></label>',
      '        </div>',
      '        <button class="btn primary" type="button" data-universal-analyze-btn style="height:40px;font-weight:700">🔍 ' + (isFr ? "Analyser" : "Analyze") + '</button>',
      '      </div>',

      previewImagePath ? '<div class="image-preview"><img src="' + this._escape(previewImagePath) + '" alt="Label image preview" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<div class=&quot;empty-state&quot;>' + (isFr ? "Image non accessible" : "Image not reachable") + '</div>\';"></div>' : "",
      this._renderDuplicateMatches(),

      '      <label style="margin-top:8px">' + self._t("search_history") + '<input name="history_search" type="search" placeholder="' + (isFr ? "Nom du vin, vignoble, région..." : "Wine name, producer, region...") + '" value="' + self._escape(this._historySearchValue || "") + '"></label>',
      '      <div data-history-results>' + this._renderSearchResultsMarkup() + '</div>',
      
      '      <label style="position:relative">' + self._t("wine_name") + '<input name="wine_name" value="' + self._escape(v("wine_name", "")) + '" autocomplete="off" required><div class="custom-autocomplete-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper-dialog-background-color,var(--card-background-color));border:1px solid color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:12px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:4px"></div></label>',
      '      <div class="grid2">',
      '        <label style="position:relative">' + self._t("producer") + '<input name="producer" value="' + self._escape(v("producer", "")) + '" autocomplete="off"><div class="custom-autocomplete-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper-dialog-background-color,var(--card-background-color));border:1px solid color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:12px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:4px"></div></label>',
      '        <label style="position:relative">' + self._t("varietal") + '<input name="varietal" value="' + self._escape(v("varietal", "")) + '" autocomplete="off"><div class="custom-autocomplete-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper-dialog-background-color,var(--card-background-color));border:1px solid color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:12px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:4px"></div></label>',
      '      </div>',
      '      <div class="grid2">',
      '        <label style="position:relative">' + self._t("region") + '<input name="region" value="' + self._escape(v("region", "")) + '" autocomplete="off"><div class="custom-autocomplete-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper-dialog-background-color,var(--card-background-color));border:1px solid color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:12px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:4px"></div></label>',
      '        <label style="position:relative">' + self._t("country") + '<input name="country" value="' + self._escape(v("country", "")) + '" autocomplete="off"><div class="custom-autocomplete-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper-dialog-background-color,var(--card-background-color));border:1px solid color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:12px;max-height:200px;overflow-y:auto;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:4px"></div></label>',
      '      </div>',
      '      <div class="grid2">',
      '        <label>' + self._t("vintage") + '<input name="vintage" type="number" value="' + self._escape(v("vintage", "")) + '"></label>',
      '        <label>' + self._t("type") + '<select name="wine_type">' +
        ["unset", "red", "white", "rosé", "sparkling", "orange", "sweet", "other"].map(function (t) {
          var lbl = t;
          if (isFr) {
            if (t === "unset") lbl = "Non spécifié";
            else if (t === "red") lbl = "Rouge";
            else if (t === "white") lbl = "Blanc";
            else if (t === "rosé") lbl = "Rosé";
            else if (t === "sparkling") lbl = "Mousseux";
            else if (t === "orange") lbl = "Orange";
            else if (t === "sweet") lbl = "Sucré";
            else if (t === "other") lbl = "Autre";
          } else {
            // Sécurité pour l'anglais : force la première lettre en majuscule (ex: Red, Rosé, Orange)
            lbl = t.charAt(0).toUpperCase() + t.slice(1);
          }
          return '<option value="' + t + '"' + (v("wine_type", "unset") === t ? " selected" : "") + ">" + lbl + "</option>";
        }).join("") +
      "</select></label>",
      '      </div>',
      '      <div class="grid2">',
      '        <label>' + self._t("price") + ' (CAD)<input name="price" type="number" step="0.01" min="0" value="' + self._escape(v("price", "")) + '"></label>',
      '        <label>' + self._t("rating") + '<select name="rating">' +
        [0, 1, 2, 3, 4, 5].map(function (n) {
          return '<option value="' + n + '"' + (Number(v("rating", 0)) === n ? " selected" : "") + ">" + (n === 0 ? "—" : "★".repeat(n)) + "</option>";
        }).join("") +
      "</select></label>",
      '      </div>',
      '      <div class="grid2">',
      '        <label>' + self._t("serving_temp") + ' (°C)<input name="serving_temp" type="number" step="0.5" value="' + self._escape(v("serving_temp", "")) + '"></label>',
      '        <label>' + self._t("alcohol_pct") + ' (%)<input name="alcohol_pct" type="number" step="0.1" min="0" max="100" value="' + self._escape(v("alcohol_pct", "")) + '"></label>',
      '      </div>',
      '      <div class="grid2">',
      '        <label>' + self._t("aging_start") + '<input name="aging_start_year" type="number" value="' + self._escape(v("aging_start_year", "")) + '"></label>',
      '        <label>' + self._t("aging_end") + '<input name="aging_end_year" type="number" value="' + self._escape(v("aging_end_year", "")) + '"></label>',
      '      </div>',
      '      <label>' + self._t("notes") + '<textarea name="notes" rows="4" maxlength="500">' + this._escape(v("notes", "")) + '</textarea></label>',
      '      <label style="margin-top:4px">' + (isFr ? "Lien SAQ.com" : "SAQ.com URL") + '<input name="saq_url" placeholder="https://saq.com..." value="' + self._escape(v("saq_url", bottle.url_saq || "")) + '"></label>',
      
      '      <!-- ZONE LOCALISATION DESCENTE TOUT EN BAS AVEC TRADUCTION -->',
      '      <div style="background:color-mix(in srgb, var(--secondary-background-color) 25%, transparent);padding:12px;border-radius:12px;display:grid;gap:10px;margin-top:4px">',
      '        <label>' + (isFr ? "Cellier" : "Cellar") + '<select name="cellar_id" data-cellar-select>' +
          cellars.map(function (c) {
            return '<option value="' + c.id + '"' + (String(currentCellarId) === c.id ? " selected" : "") + ">" + self._escape(c.name) + "</option>";
          }).join("") +
        "</select></label>",
      '        <div class="grid-location">',
      '          <label>' + self._t("shelf") + '<select name="shelf_id" data-shelf-select>' + this._buildShelfOptions(currentCellarId, currentShelfId) + "</select></label>",
      '          <label>' + self._t("lane") + '<select name="lane" data-lane-select>' + this._buildLaneOptions(currentCellarId, currentShelfId, selectedLane) + "</select></label>",
      '          <label class="position-field">' + self._t("position") + '<select name="position" data-position-select>' + this._buildPositionOptions(currentCellarId, currentShelfId, selectedLane, defaultPosition) + '</select></label>',
      '        </div>',

      '      </div>',

      '      <div class="modal-actions">',
      bottle.id
        ? '        <div class="left-actions"><button class="btn warning" type="button" data-consume-bottle="' + bottle.id + '">' + self._t("consume") + '</button><button class="btn danger" type="button" data-delete-bottle="' + bottle.id + '">' + self._t("delete") + '</button></div>'
        : "        <span></span>",
      '        <div class="right-actions">',
      (bottle.id ? '          <button class="btn edit-btn" type="button" data-cancel-edit>' + (isFr ? "Voir" : "View") + '</button>' : '          <button class="btn" type="button" data-close-modal>' + self._t("cancel") + '</button>'),
      '          <button class="btn primary" type="button" data-save-bottle-btn>' + self._t("save") + '</button>',
      '        </div>',
      '      </div>',
      "    </form>",
      "  </div>",
      "</div>"
    ].join("");
  }
  _renderShelfEditorRows(shelves) {
    var self = this;
    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    return shelves.map(function (s, idx) {
      return [
        '<div class="shelf-row" data-shelf-row style="border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);padding:14px;border-radius:12px;margin-bottom:10px;position:relative;background:color-mix(in srgb,var(--secondary-background-color) 30%, transparent);padding-top:34px">',
        '  <input type="hidden" name="shelf_id[]" value="' + self._escape(s.id || "") + '">',
        '  <div style="margin-bottom:6px">',
        '    <label style="font-size:0.85rem">' + (isFr ? "Nom de la tablette" : "Shelf Name") + '<input type="text" name="shelf_name[]" value="' + self._escape(s.name || "") + '" style="padding:6px" required></label>',
        '  </div>',
        '  <div class="grid3" style="gap:8px">',
        '    <label style="font-size:0.85rem">' + (isFr ? "Ordre" : "Order") + '<input type="number" name="shelf_display_order[]" min="0" value="' + self._escape(s.display_order || 0) + '" style="padding:6px"></label>',
        '    <label style="font-size:0.85rem">' + (isFr ? "Capacité avant" : "Front capacity") + '<input type="number" name="capacity_front[]" min="1" value="' + self._escape(s.capacity_front || 6) + '" style="padding:6px" required></label>',
        '    <label style="font-size:0.85rem">' + (isFr ? "Capacité arrière" : "Back capacity") + '<input type="number" name="capacity_back[]" min="0" value="' + self._escape(s.capacity_back || 0) + '" style="padding:6px"></label>',
        '  </div>',
        '  <button class="btn danger small-btn" type="button" data-remove-shelf style="position:absolute;top:10px;right:10px;padding:4px 8px;font-size:0.75rem">' + (isFr ? "Supprimer" : "Remove") + '</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  _renderCellarModal() {
    var cellar = (this._modal && this._modal.cellar) || {};
    var self = this;

    function v(key, fallback) {
      if (cellar[key] !== undefined && cellar[key] !== null) return cellar[key];
      return fallback;
    }

    // Extraction et nettoyage de l'attribut de persistance
    var currentBgColor = cellar.bg_color || "";

    var nextDisplayOrder = 0;
    if (!cellar.id && this._data && Array.isArray(this._data.cellars) && this._data.cellars.length) {
      nextDisplayOrder = Math.max.apply(null, this._data.cellars.map(function (c) {
        return Number(c.display_order || 0);
      })) + 1;
    }

    var lang = (this._hass && this._hass.language) || "en";
    var isFr = lang.startsWith("fr");

    var shelves = (cellar.shelves && cellar.shelves.length)
      ? self._getSortedShelves(cellar)
      : [
          { id: "", name: isFr ? "Tablette 1" : "Shelf 1", display_order: 0, capacity_front: 6, capacity_back: 0, layout_mode: "single" }
        ];

    return [
      '<div class="modal-backdrop" data-close-modal>',
      '  <div class="modal small-modal" role="dialog" aria-modal="true" aria-label="Cellar editor">',
      '    <div class="modal-head">',
      "      <h3>" + (cellar.id ? (isFr ? "Modifier le cellier" : "Edit cellar") : (isFr ? "Ajouter un cellier" : "Add cellar")) + "</h3>",
      '      <button class="icon-btn" type="button" data-close-modal>×</button>',
      "    </div>",
      '<div class="form-error"' + (this._formError ? '' : ' style="display:none"') + ' role="alert">' + this._escape(this._formError || "") + '</div>',
      '    <form class="modal-form" data-save-cellar>',
      '      <input type="hidden" name="cellar_id" value="' + self._escape(v("id", "")) + '">',
      '      <label>' + (isFr ? "Nom du cellier" : "Name") + '<input name="name" value="' + self._escape(v("name", "")) + '" required></label>',
      '      <label>' + (isFr ? "Ordre d'affichage" : "Display order") + '<input name="display_order" type="number" min="0" value="' + self._escape(v("display_order", nextDisplayOrder)) + '"></label>',
      '      <label>' + (isFr ? "Couleur d'arrière-plan" : "Background Color") + '<select name="bg_color">' +
               [
                 { value: "", label: isFr ? "Par défaut (Thème HA)" : "Default (HA Theme)" },
                 { value: "#7b2130", label: isFr ? "Rouge Bordeaux" : "Bordeaux Red" },
                 { value: "#8c6239", label: isFr ? "Brun Chêne" : "Oak Brown" },
                 { value: "#556b2f", label: isFr ? "Vert Olive" : "Olive Green" },
                 { value: "#1e3a8a", label: isFr ? "Bleu Azur" : "Azur Blue" },
                 { value: "#374151", label: isFr ? "Gris Ardoise" : "Slate Gray" },
                 { value: "#fbfbfbff", label: isFr ? "Blanc cassée" : "Off White" }
               ].map(function(opt) {
                 return '<option value="' + opt.value + '"' + (currentBgColor === opt.value ? " selected" : "") + '>' + opt.label + '</option>';
               }).join("") +
      '      </select></label>',
      '      <div class="shelf-editor">',

      '        <div class="shelf-editor-head">',
      '          <strong>' + (isFr ? "Tablettes" : "Shelves") + '</strong>',
      '          <button class="btn small-btn" type="button" data-add-shelf-row>' + (isFr ? "+ Ajouter" : "Add shelf") + '</button>',
      '        </div>',
      '        <div data-shelf-rows>',
      self._renderShelfEditorRows(shelves),
      '        </div>',
      '      </div>',
      '      <div class="modal-actions">',
      cellar.id ? '        <button class="btn danger" type="button" data-delete-cellar="' + cellar.id + '">' + (isFr ? "Supprimer" : "Delete") + '</button>' : "        <span></span>",
      '        <div class="right-actions"><button class="btn" type="button" data-close-modal>' + (isFr ? "Annuler" : "Cancel") + '</button><button class="btn primary" type="button" data-save-cellar-btn>' + (isFr ? "Enregistrer" : "Save") + '</button></div>',
      "      </div>",
      '    </form>',
      '  </div>',
      '</div>'
    ].join("");
  }

  _refreshBottleLocationSelectors(root) {
    var form = root.querySelector("[data-save-bottle]");
    if (!form) return;

    var cellarEl = form.querySelector('[name="cellar_id"]');
    var shelfEl = form.querySelector('[name="shelf_id"]');
    var laneEl = form.querySelector('[name="lane"]');
    var positionEl = form.querySelector('[name="position"]');

    if (!cellarEl || !shelfEl || !laneEl || !positionEl) return;

    var cellarId = cellarEl.value || "";
    var currentShelf = shelfEl.value || "";
    shelfEl.innerHTML = this._buildShelfOptions(cellarId, currentShelf);

    if (!shelfEl.value) {
      var firstOption = shelfEl.querySelector("option");
      if (firstOption) shelfEl.value = firstOption.value;
    }

    var shelfId = shelfEl.value || "";
    var currentLane = laneEl.value || "front";
    laneEl.innerHTML = this._buildLaneOptions(cellarId, shelfId, currentLane);

    if (!laneEl.value) {
      var firstLane = laneEl.querySelector("option");
      if (firstLane) laneEl.value = firstLane.value;
    }

    var lane = laneEl.value || "front";
    var currentPosition = Number(positionEl.value || 1);
    positionEl.innerHTML = this._buildPositionOptions(cellarId, shelfId, lane, currentPosition);

    if (!positionEl.value) {
      var firstPos = positionEl.querySelector("option");
      if (firstPos) positionEl.value = firstPos.value;
    }
  }

  _appendShelfRow(root) {
    var rowsWrap = root.querySelector("[data-shelf-rows]");
    if (!rowsWrap) return;

    var count = rowsWrap.querySelectorAll("[data-shelf-row]").length;
    var existingOrders = Array.from(rowsWrap.querySelectorAll('[name="shelf_display_order[]"]'))
      .map(function (el) { return Number(el.value); })
      .filter(function (n) { return Number.isFinite(n); });

    var nextOrder = existingOrders.length
      ? Math.max.apply(null, existingOrders) + 1
      : 0;

    rowsWrap.insertAdjacentHTML("beforeend", this._renderShelfEditorRows([
      {
        id: "",
        name: "Shelf " + (count + 1),
        display_order: nextOrder,
        capacity_front: 6,
        capacity_back: 0,
        layout_mode: "single"
      }
    ]));
  }

  async render(force) {
    if (!this.shadowRoot || !this._hass) return;
    
    // Sauvegarde persistante dans le navigateur pour survivre aux rafraîchissements globaux
    var scrollContainer = this.shadowRoot.querySelector(".main-scroll-content");
    if (scrollContainer) {
      window.sessionStorage.setItem("wine_cellar_scroll_top", scrollContainer.scrollTop);
    }

    if (this._rendering) return;

    this._rendering = true;

    try {
      var data = await this._loadData(!!force);
      var snapshot = JSON.stringify({
        view: this._view || "cellars",
        modal: this._modal ? {
          type: this._modal.type,
          bottleId: this._modal.bottle ? this._modal.bottle.id : null,
          cellarId: this._modal.cellar ? this._modal.cellar.id : (this._modal.preset ? this._modal.preset.cellar_id : null),
          mode: this._modal.mode || ""
        } : null,
        search: this._search || "",
        filterType: this._filterType || "",
        formError: this._formError || "",
        actionMessage: this._actionMessage || "",
        scannerActive: this._scannerActive,
        duplicateMatches: this._duplicateMatches,
        duplicateMessage: this._duplicateMessage,
        searchResults: this._searchResults,
        searchMessage: this._searchMessage,
        historySearchValue: this._historySearchValue,
        sortColumn: this._sortColumn || "wine_name",
        sortOrder: this._sortOrder || "asc",
        filterCountry: this._filterCountry || "",
        filterReady: this._filterReady,
        viewingDuplicateManager: this._viewingDuplicateManager,
        foundSyntaxDuplicates: this._foundSyntaxDuplicates,
        duplicateManagerSearching: this._duplicateManagerSearching,
        duplicateManagerHasSearched: this._duplicateManagerHasSearched,
        data: data
      });

      if (this._hasRendered && snapshot === this._lastSnapshot) {
        return;
      }

      this._lastSnapshot = snapshot;
      this._hasRendered = true;

      var view = this._view || "cellars";
      var body = "";
      if (view === "cellars") {
        body = this._renderCellars(data);
      } else if (view === "compact") {
        body = '<div class="compact-grid">' + this._renderCellars(data) + '</div>';
      } else if (view === "stats") {
        body = this._renderStats ? this._renderStats(data) : '<div class="empty-state">Stats loading...</div>';
      } else {
        body = this._renderList(data);
      }
      var modal = this._modal ? (this._modal.type === "bottle" ? this._renderBottleModal(data) : this._renderCellarModal()) : "";
      var comparisonModal = this._renderImageComparisonModal ? this._renderImageComparisonModal() : "";
      var cleanupModal = this._renderCleanUpModal();

      this.shadowRoot.innerHTML =
        "<style>" +
        ":host{display:block}" +
        "*{box-sizing:border-box}" +
        "ha-card{display:block}" +
        ":host{display:flex !important;flex-direction:column !important;position:absolute !important;top:var(--header-height, 56px) !important;left:0 !important;right:0 !important;bottom:0 !important;height:calc(100vh - var(--header-height, 56px)) !important;width:100% !important;box-sizing:border-box !important}" +
        "ha-card{display:flex !important;flex-direction:column !important;flex:1 1 100% !important;height:100% !important;min-height:0 !important;border:none !important;box-shadow:none !important;border-radius:0 !important}" +
        ".wrap{background-image:linear-gradient(rgba(0,0,0,0.20),rgba(0,0,0,0.20)),url('/local/wine-cellar-card/cellar_pattern.jpg');background-size:auto;background-repeat:repeat;background-position:top left;color:var(--primary-text-color);border-radius:0 !important;padding:16px;flex:1 1 100%;display:flex;flex-direction:column;gap:12px;overflow:hidden;height:100%}" +
        ".toolbar{display:grid;grid-template-columns:1fr;gap:12px;flex:0 0 auto;border-bottom:1px solid color-mix(in srgb,var(--primary-text-color) 8%,transparent);padding-bottom:12px}" +
        ".toolbar-actions,.filters,.helper-actions,.left-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
        ".btn,.icon-btn,select,input,textarea{font:inherit}" +
        ".btn,select[data-age-filter],select[data-type-filter],select[data-country-filter]{border:1px solid transparent;background:var(--secondary-background-color);color:var(--primary-text-color);padding:10px 14px;border-radius:12px;cursor:pointer;height:42px;transition:background-color 0.15s ease,color 0.15s ease}" +
        "select[data-age-filter],select[data-type-filter],select[data-country-filter]{width:auto;min-width:140px;padding-right:28px}" +
        "select.filter-active{background-color:#2563eb !important;color:#ffffff !important;font-weight:700;box-shadow:0 0 10px rgba(37,99,235,0.3)}" +
        "select.filter-active option{background-color:var(--secondary-background-color) !important;color:var(--primary-text-color) !important;font-weight:normal}" +
        "/* Separateur Onglets structuraux */" +
        ".nav-tabs-container{display:flex;gap:8px;padding-bottom:12px;margin-bottom:4px;border-bottom:2px solid color-mix(in srgb, var(--primary-text-color) 15%, transparent);width:100%}" +
        "/* Style Switch Ready active */" +
        ".btn.togglable.active{background:#2563eb;color:#ffffff;font-weight:700;box-shadow:0 0 10px rgba(37,99,235,0.4)}" +
        ".btn[data-close-modal-btn]{border:1px solid color-mix(in srgb,var(--primary-text-color) 40%, transparent)}" +
        ".btn.primary{background:#7b2130;color:#fff;border:none}" +
        ".btn.danger{background:#a12d2f;color:#fff}" +
        ".btn.warning{background:#9c6b14;color:#fff}" +
        ".btn.edit-btn{background:#2563eb;color:#fff}" +
        ".small-btn{padding:8px 10px}" +
        ".icon-btn{background:none;border:none;font-size:1.6rem;cursor:pointer;color:inherit;line-height:1}" +
        ".filters input{width:auto;min-width:320px;background:var(--secondary-background-color);border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);border-radius:12px;padding:10px;color:inherit}" +
        ".modal-form input,.modal-form select,.modal-form textarea{width:100%;background:var(--secondary-background-color);border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);border-radius:12px;padding:10px;color:inherit}" +
        ".cellars-grid{display:grid;grid-template-columns:1fr;gap:24px;justify-items:start}" +
        ".cellar-panel{background:color-mix(in srgb,var(--secondary-background-color) 85%, transparent);border-radius:18px;padding:16px;min-width:0;width:max-content;max-width:100%;display:flex;flex-direction:column;align-items:center;border:1px solid color-mix(in srgb,var(--primary-text-color) 15%, transparent);box-shadow:0 4px 20px rgba(0,0,0,0.40)}.cellar-head{width:100%}" +
        ".cellar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}" +
        ".cellar-head h3{margin:0}" +
        ".shelf{margin-bottom:14px;padding:10px;border-radius:14px;background:color-mix(in srgb,var(--card-background-color) 55%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".shelf-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}" +
        ".shelf-lanes{display:grid;grid-template-columns:1fr;gap:10px;overflow-x:auto;padding-bottom:6px;width:100%}" +
        ".shelf-lanes.has-back{padding-right:21px}" +
        ".shelf-lanes.has-back{grid-template-columns:1fr}" +
        ".lane-block{min-width:max-content;width:100%}" +
        ".lane-label{font-weight:700;margin-bottom:4px;margin-top:4px}" +
        ".row-label{font-weight:700;margin-bottom:0}" +
        ".row-slots{display:flex;flex-wrap:nowrap;gap:10px;padding-bottom:2px;width:100%}" +
        ".slot{width:122px;height:170px;flex:0 0 122px;border-radius:14px;border:4px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);padding:5px;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;text-align:center;cursor:pointer;color:inherit;transition:opacity .15s ease, transform .15s ease, border-color .15s ease;overflow:hidden}" +
        ".slot.filled:hover{transform:translateY(-1px)}" +
        ".slot.empty{opacity:.65;background:transparent;justify-content:center;height:170px}" +
        ".slot.dimmed{opacity:.28;filter:grayscale(.25)}" +
        ".compact-grid .cellars-grid{display:flex;flex-direction:row;flex-wrap:wrap;gap:14px;align-items:flex-start}.compact-grid .cellar-panel{width:max-content;max-width:100%}.compact-grid .shelf{padding:10px;margin-bottom:12px;border-radius:10px;display:flex;flex-direction:column;align-items:center;width:max-content;overflow:hidden}.compact-grid .shelf-head{display:none}.compact-grid .shelf-lanes{display:flex;flex-direction:column;align-items:center;width:auto;max-width:100%;padding:0 17px;box-sizing:border-box}.compact-grid .row-slots{gap:6px;justify-content:center;flex-wrap:nowrap;padding-bottom:0;width:auto}.compact-grid .lane-block{width:auto;min-width:0}.compact-grid .lane-label{display:none}.compact-grid .slot{width:28px;height:28px;flex:0 0 28px;border-radius:50%;padding:0;border:2px solid color-mix(in srgb,var(--primary-text-color) 15%,transparent);justify-content:center;align-items:center}.compact-grid .slot.empty{background:transparent;border:2px dashed color-mix(in srgb,var(--primary-text-color) 25%,transparent);font-size:0;position:relative}.compact-grid .slot.empty::before{content:'';width:5px;height:5px;background:color-mix(in srgb,var(--primary-text-color) 20%,transparent);border-radius:50%}.compact-grid .slot .label-wrap,.compact-grid .slot .slot-name,.compact-grid .slot .slot-meta,.compact-grid .slot .slot-rating{display:none}" +
        ".lane-back{transform:translateX(21px)}" +
        ".compact-grid .lane-back{transform:translateX(17px)}" +
        ".label-wrap{height:78px;flex:0 0 78px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.20);overflow:hidden;margin-bottom:4px;border:1px dashed rgba(255,255,255,0.28);backdrop-filter:blur(2px)}" +
        ".label-wrap.placeholder span{font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;opacity:.75}" +
        ".label-image{width:100%;height:100%;object-fit:cover}" +
        ".slot-name{font-size:.88rem;font-weight:700;line-height:1.1;margin-bottom:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.2em;flex-shrink:0}" +
        ".slot-meta{font-size:.78rem;opacity:.85;margin-bottom:2px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;height:1.2em;line-height:1.1;text-overflow:ellipsis;width:100%;flex-shrink:0}" +
        ".slot-rating{font-size:.82rem;font-weight:600;opacity:.9;margin-top:auto}" +
        ".table-wrap{overflow:auto}" +
        ".table-wrap table{width:100%;border-collapse:collapse}" +
        ".table-wrap th,.table-wrap td{padding:10px;border-bottom:1px solid color-mix(in srgb,var(--primary-text-color) 10%, transparent);text-align:left}" +
        ".table-wrap tr{cursor:pointer}" +
        ".table-wrap th{cursor:pointer;user-select:none}" +
        ".table-wrap th:hover{background:color-mix(in srgb, var(--secondary-background-color) 85%, var(--primary-text-color))}" +
        ".type-group-header{padding:12px 10px;font-weight:bold;font-size:1.1rem;letter-spacing:0.03em;text-transform:capitalize}" +
        ".age-text{font-weight:600}" +
        ".age-text.young{color:#3b82f6}" +
        ".age-text.ready{color:#22c55e}" +
        ".age-text.peak{color:#d4a017}" +
        ".age-text.past{color:#dc2626}" +
        ".empty-state{padding:24px;text-align:center;color:var(--secondary-text-color);font-size:1rem}" +
        "/* STYLES INTERFACE STATISTIQUES */" +
        ".stats-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px}" +
        ".stats-card{background:color-mix(in srgb,var(--secondary-background-color) 70%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.05)}" +
        ".stats-card-label{font-size:0.82rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--secondary-text-color);margin-bottom:6px}" +
        ".stats-card-value{font-size:1.6rem;font-weight:700;color:var(--primary-text-color)}" +
        ".stats-charts-split{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}" +
        ".stats-panel{background:color-mix(in srgb,var(--secondary-background-color) 50%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);border-radius:18px;padding:16px}" +
        ".stats-panel h4{margin:0 0 14px 0;font-size:1.1rem;font-weight:700;letter-spacing:0.02em}" +
        ".chart-full-width{margin-bottom:10px}" +
        "@media (max-width:900px){.stats-charts-split{grid-template-columns:1fr}}" +
        ".modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:999}" +
        ".modal{width:min(980px,100%);max-height:92vh;overflow:auto;background:var(--card-background-color);color:var(--primary-text-color);border-radius:22px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.35)}" +
        ".small-modal{width:min(760px,100%)}" +
        ".modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}" +
        ".modal-head h3{margin:0}" +
        ".modal-form{display:grid;gap:12px}" +
        ".grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}" +
        ".grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}" +
        ".grid-location{display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;align-items:end}" +
        ".grid-location .position-field{display:none}" +
        ".grid-shelf{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px}" +
        ".modal-form label{display:grid;gap:6px;font-size:.92rem}" +
        ".modal-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;grid-column:1 / -1;margin-top:8px}" +
        ".left-actions{display:flex;gap:8px;justify-content:flex-start;margin-right:auto}" +
        ".right-actions{display:flex;gap:8px;justify-content:flex-end}" +
        ".image-preview img{max-width:100%;max-height:220px;border-radius:12px;border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent)}" +
        ".form-error{margin-bottom:12px;padding:10px 12px;border-radius:12px;background:#a12d2f;color:#fff;font-size:.92rem;line-height:1.35}" +
        ".action-message{margin-bottom:12px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--secondary-background-color) 80%, transparent);color:var(--primary-text-color);font-size:.92rem;line-height:1.35}" +
        ".scanner-wrap{border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);border-radius:14px;padding:10px;background:color-mix(in srgb,var(--secondary-background-color) 55%, transparent)}" +
        ".scanner-box{overflow:hidden;border-radius:12px;background:#000;min-height:220px}" +
        ".scanner-host{width:100%;min-height:220px}" +
        ".duplicate-panel{border:1px solid color-mix(in srgb,var(--primary-text-color) 12%, transparent);border-radius:14px;padding:12px;background:color-mix(in srgb,var(--secondary-background-color) 60%, transparent)}" +
        ".duplicate-panel h4{margin:0 0 10px 0}" +
        ".duplicate-info{font-size:.88rem;color:var(--secondary-text-color);margin-bottom:10px}" +
        ".duplicate-empty{font-size:.92rem;color:var(--secondary-text-color)}" +
        ".duplicate-list{display:grid;gap:10px}" +
        ".duplicate-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px;border-radius:12px;background:color-mix(in srgb,var(--card-background-color) 60%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".duplicate-title{font-weight:700}" +
        ".duplicate-sub{font-size:.84rem;color:var(--secondary-text-color)}" +
        ".duplicate-actions{display:flex;gap:8px;flex-wrap:wrap}" +
        ".wine-view-modal{padding:0;overflow:hidden;display:flex;flex-direction:column}" +
        ".modal-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 16px;flex:0 0 auto;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden}" +
        ".modal-banner-title{font-size:1.55rem;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
        ".modal-banner-sub{margin-top:6px;font-size:.95rem;opacity:.88}" +
        ".modal-close-light{color:inherit;opacity:.9}" +
        ".view-shell{display:flex;flex-direction:column;min-height:0;max-height:calc(92vh - 88px)}" +
        ".modal-body.split-view{display:grid;grid-template-columns:minmax(320px,1.05fr) minmax(280px,.95fr);gap:18px;padding:18px 20px 12px;overflow:auto;min-height:0;align-items:start}" +
        ".detail-column{display:flex;flex-direction:column;gap:16px;min-width:0}" +
        ".detail-hero-line{display:flex;flex-direction:column;gap:4px}" +
        ".detail-vintage{font-size:1.65rem;font-weight:700;line-height:1}" +
        ".detail-winery{font-size:1rem;color:var(--secondary-text-color)}" +
        ".rating-row{display:flex;align-items:center;gap:10px}" +
        ".stars-display{font-size:1.22rem;letter-spacing:.06em;color:#d4a017;font-weight:700}" +
        ".detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}" +
        ".detail-card{padding:14px;border-radius:16px;background:color-mix(in srgb,var(--secondary-background-color) 70%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".detail-label{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--secondary-text-color);margin-bottom:6px}" +
        ".detail-value{font-size:1.05rem;font-weight:700}" +
        ".detail-list{display:grid;gap:10px}" +
        ".detail-line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".detail-line span{color:var(--secondary-text-color)}" +
        ".detail-line strong{font-size:.98rem}" +
        ".notes-box{padding:14px;border-radius:16px;background:color-mix(in srgb,var(--secondary-background-color) 62%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".notes-text{white-space:pre-wrap;line-height:1.5}" +
        ".image-column{display:flex;min-width:0}" +
        ".hero-image-frame{width:100%;min-height:260px;max-height:58vh;border-radius:20px;background:color-mix(in srgb,var(--secondary-background-color) 70%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 10%, transparent);overflow:hidden;display:flex;align-items:center;justify-content:center}" +
        ".hero-image-frame.placeholder{color:var(--secondary-text-color);font-size:1rem}" +
        ".hero-label-image{width:100%;height:100%;object-fit:contain;display:block;background:color-mix(in srgb,var(--secondary-background-color) 55%, transparent)}" +
        ".view-actions{padding:12px 20px 20px}" +
        ".sticky-footer{flex:0 0 auto;border-top:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent);background:var(--card-background-color)}" +
        ".shelf-editor{display:grid;gap:10px;padding:12px;border:1px solid color-mix(in srgb,var(--primary-text-color) 10%, transparent);border-radius:14px;background:color-mix(in srgb,var(--secondary-background-color) 55%, transparent)}" +
        ".shelf-editor-head{display:flex;align-items:center;justify-content:space-between;gap:8px}" +
        ".shelf-editor-row{display:grid;gap:8px;padding:10px;border-radius:12px;background:color-mix(in srgb,var(--card-background-color) 60%, transparent);border:1px solid color-mix(in srgb,var(--primary-text-color) 8%, transparent)}" +
        ".shelf-row-actions{display:flex;justify-content:flex-end}" +
        "@media (max-width:900px){.modal-body.split-view{grid-template-columns:1fr}.hero-image-frame{max-height:42vh}}" +
        "@media (max-width:780px){.cellars-grid,.grid2,.grid3,.detail-grid,.grid-shelf,.grid-location{grid-template-columns:1fr}.wrap{padding:12px}.modal{padding:12px;max-height:94vh;overflow-y:auto}.wine-view-modal{padding:0;display:grid !important;grid-template-columns:1fr !important}.wine-view-modal .modal-body.split-view{grid-row:2 !important;padding:16px}.row-slots{gap:8px}.slot{width:116px;height:164px;flex-basis:116px}.duplicate-item{grid-template-columns:1fr}.modal-actions,.view-actions{flex-direction:column;align-items:stretch}.right-actions,.left-actions,.helper-actions{width:100%}.right-actions .btn,.left-actions .btn,.helper-actions .btn{flex:1}.modal-banner{padding:16px;grid-row:1 !important}.view-actions{padding:12px 16px 16px}.hero-image-frame{min-height:220px;max-height:34vh}.modal-banner-title{font-size:1.28rem}.nav-tabs-container .btn{font-size:0.84rem;padding:8px 10px;text-align:center;line-height:1.2;display:flex;align-items:center;justify-content:center}.nav-tabs-container{flex-wrap:wrap;gap:8px 6px}.nav-tabs-container [data-view]{order:2;flex:1 1 calc(25% - 6px)}.nav-tabs-container [data-open-cleanup-tool]{order:1;flex:1 1 calc(50% - 6px);margin-left:0 !important}.nav-tabs-container [data-add-cellar]{order:1;flex:1 1 calc(50% - 6px);margin-left:0 !important}.filters input,.toolbar-actions input{min-width:140px !important}}" +
        "@media (max-width:780px) and (orientation: portrait){.cellar-panel{width:100% !important;max-width:100% !important}.shelf{width:100% !important}}" +
        "@media (max-width:960px) and (orientation: landscape){.cellar-panel{width:100% !important;max-width:100% !important}.shelf{width:100% !important}}" +
        "@media (max-width:780px){:host{position:static !important;height:auto !important}.wrap{height:auto !important;overflow:visible !important;border-radius:18px !important}.main-scroll-content{overflow-y:visible !important;height:auto !important}}" +
        ".custom-autocomplete-item{padding:12px 14px;cursor:pointer;border-bottom:1px solid color-mix(in srgb,var(--primary-text-color) 8%,transparent);font-size:0.95rem;text-align:left;color:var(--primary-text-color)}" +
        ".custom-autocomplete-item:last-child{border-bottom:none}" +
        ".custom-autocomplete-item:hover{background:color-mix(in srgb,var(--secondary-background-color) 85%,var(--primary-text-color))}" +
        ".main-scroll-content{flex:1 1 auto;overflow-y:auto;min-height:0;padding-right:4px}" +
        "</style>" +
        '<ha-card><div class="wrap">' + this._renderToolbar() + '<div class="main-scroll-content">' + body + "</div>" + modal + comparisonModal + cleanupModal + "</div></ha-card>";
      
      var self = this;
      var root = this.shadowRoot;

      // Récupération et application asynchrone pour laisser le DOM se dessiner
      var savedScroll = window.sessionStorage.getItem("wine_cellar_scroll_top");
      if (savedScroll !== null) {
        setTimeout(function() {
          var newScrollContainer = root.querySelector(".main-scroll-content");
          if (newScrollContainer) {
            newScrollContainer.scrollTop = Number(savedScroll);
          }
        }, 10);
      }

      root.querySelectorAll("[data-view]").forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._view = el.getAttribute("data-view");
          // Si on clique sur l'onglet Stats, on force un appel serveur (true) pour avoir des calculs 100% frais
          var forceRefresh = (self._view === "stats");
          self.render(forceRefresh);
        };
      });

      var search = root.querySelector("[data-search]");
      if (search) {
        search.addEventListener("click", function (e) { e.stopPropagation(); });
        search.addEventListener("focus", function (e) { e.stopPropagation(); }, true);
        search.addEventListener("input", function (e) {
          e.stopPropagation();
          self._search = search.value;
        });
        search.addEventListener("keydown", function (e) {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            self._search = search.value;
            self.render(true);
          }
        });
        search.addEventListener("blur", function () {
          self._search = search.value;
          self.render(true);
        });
      }

      var typeFilter = root.querySelector("[data-type-filter]");
      if (typeFilter) {
        typeFilter.addEventListener("click", function (e) { e.stopPropagation(); });
        typeFilter.addEventListener("change", function (e) {
          e.stopPropagation();
          self._filterType = typeFilter.value;
          self.render(true);
        });
      }

      // Écouteur pour le nouveau sélecteur de filtrage par Pays
      var countryFilter = root.querySelector("[data-country-filter]");
      if (countryFilter) {
        countryFilter.addEventListener("click", function (e) { e.stopPropagation(); });
        countryFilter.addEventListener("change", function (e) {
          e.stopPropagation();
          self._filterCountry = countryFilter.value;
          self.render(true);
        });
      }

      // Écouteur pour le nouveau menu déroulant de filtrage par Âge
      var ageFilter = root.querySelector("[data-age-filter]");
      if (ageFilter) {
        ageFilter.addEventListener("click", function (e) { e.stopPropagation(); });
        ageFilter.addEventListener("change", function (e) {
          e.stopPropagation();
          self._filterReady = ageFilter.value;
          self.render(true);
        });
      }

      // Écouteur pour le tri interactif des colonnes dans All Bottles et Ready
      root.querySelectorAll(".table-wrap th[data-sort]").forEach(function(th) {
        th.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          var clickedCol = th.getAttribute("data-sort");
          if (self._sortColumn === clickedCol) {
            self._sortOrder = self._sortOrder === "asc" ? "desc" : "asc";
          } else {
            self._sortColumn = clickedCol;
            self._sortOrder = "asc";
          }
          self.render(false); // Ré-afficher localement avec le nouveau tri sans forcer un appel WS
        };
      });

      var addCellar = root.querySelector("[data-add-cellar]");
      if (addCellar) {
        addCellar.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._openCellarModal();
        };
      }
      var addBottle = root.querySelector("[data-add-bottle]");
      if (addBottle) {
        addBottle.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();

          var firstCellar = data.cellars && data.cellars.length ? data.cellars[0] : null;
          var firstShelf = firstCellar ? self._getSortedShelves(firstCellar)[0] : null;
          var firstLane = firstShelf && Number(firstShelf.capacity_front || 0) > 0 ? "front" : "back";

          self._openBottleModal(null, {
            cellar_id: firstCellar ? firstCellar.id : "",
            shelf_id: firstShelf ? firstShelf.id : "",
            lane: firstLane,
            position: 1,
            wine_type: "red",
            rating: 0
          });
        };
      }

      root.querySelectorAll("[data-new-bottle]").forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var preset = JSON.parse(el.getAttribute("data-new-bottle"));
          
          // Sécurité temporelle : Si la copie a plus de 10 minutes (600 000 ms), on l'annule
          if (self._copiedBottleData && self._copyTimestamp && (Date.now() - self._copyTimestamp > 600000)) {
            self._copiedBottleData = null;
          }

          if (self._copiedBottleData) {
            // Sauvegarde explicite des données d'emplacement de la case vide cliquée
            var targetCellar = preset.cellar_id;
            var targetShelf = preset.shelf_id;
            var targetLane = preset.lane;
            var targetPos = preset.position;
            
            // Fusion complète des caractéristiques copiées (incluant type, notes et évaluation)
            preset = Object.assign({}, self._copiedBottleData);
            
            // Restauration de la nouvelle destination physique
            preset.cellar_id = targetCellar;
            preset.shelf_id = targetShelf;
            preset.lane = targetLane;
            preset.position = targetPos;
            
            // Nettoyage immédiat du tampon pour éviter les collages accidentels suivants
            self._copiedBottleData = null;
            self._copyTimestamp = null;
          }
          
          self._modal = {
            type: "bottle",
            bottle: null,
            preset: preset,
            mode: "edit"
          };
          self.render(true);
        };
      });

      root.querySelectorAll("[data-edit-bottle]").forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = el.getAttribute("data-edit-bottle");
          var bottle = null;
          (data.bottles || []).forEach(function (b) {
            if (b.id === id) bottle = b;
          });
          self._openBottleModal(bottle);
        };

        el.addEventListener("dragstart", function (e) {
          e.stopPropagation();
          // Reconstruction à l'abri du transcodage HTML des &quot;
          var dragMetaAttr = el.getAttribute("data-drag-source");
          // Si le texte contient des entités HTML issues de l'escape, on le nettoie
          var cleanMeta = dragMetaAttr ? dragMetaAttr.replace(/&quot;/g, '"') : "";
          
          if (!cleanMeta && el.id) {
            // Sécurité de secours : identification par ID si présent
            cleanMeta = JSON.stringify({ bottle_id: el.getAttribute("data-edit-bottle") });
          }
          
          e.dataTransfer.setData("text/plain", cleanMeta);
          el.style.opacity = "0.4";
        });

        el.addEventListener("dragend", function (e) {
          e.stopPropagation();
          el.style.opacity = "";
        });
      });

      root.querySelectorAll(".slot, .slot.empty, .slot.filled").forEach(function (el) {
        el.addEventListener("dragover", function (e) {
          e.preventDefault();
        });

        el.addEventListener("dragenter", function (e) {
          e.preventDefault();
        });

        el.addEventListener("drop", async function (e) {
          e.preventDefault();
          e.stopPropagation();

          try {
            var rawSource = e.dataTransfer.getData("text/plain");
            if (!rawSource) return;
            
            var decodedSource = rawSource.replace(/&quot;/g, '"');
            var source = JSON.parse(decodedSource);

            var targetNew = el.getAttribute("data-new-bottle");
            var targetFilled = el.getAttribute("data-drag-source");
            var dest = null;

            if (targetNew) {
              dest = JSON.parse(targetNew.replace(/&quot;/g, '"'));
            } else if (targetFilled) {
              dest = JSON.parse(targetFilled.replace(/&quot;/g, '"'));
            }

            if (!dest) return;

            var sourceId = source.bottle_id || source.id;
            var destId = dest.bottle_id || dest.id;
            var destPosition = Number(dest.position);
            var sourcePosition = Number(source.position);

            if (!sourceId) return;

            if (source.cellar_id === dest.cellar_id && source.shelf_id === dest.shelf_id && source.lane === dest.lane && sourcePosition === destPosition) {
              return;
            }

            self._clearActionMessage();
            self._clearFormError();

            if (targetNew) {
              // Cas A : Déplacement classique sur un slot vide
              await self._callWS({
                type: "wine_cellar_manager/move_bottle",
                bottle_id: String(sourceId),
                cellar_id: String(dest.cellar_id),
                shelf_id: String(dest.shelf_id),
                lane: String(dest.lane || "front"),
                position: Math.trunc(destPosition)
              });
            } else if (targetFilled && destId) {
              // Cas B : Interversion atomique via le serveur Python
              await self._callWS({
                type: "wine_cellar_manager/swap_bottles",
                source_id: String(sourceId),
                dest_id: String(destId)
              });
            }

            await self._loadData(true);
            self.render(true);

          } catch (err) {
            console.error("Drag and drop sequence broke:", err);
          }
        });
      });

      root.querySelectorAll("[data-edit-cellar]").forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = el.getAttribute("data-edit-cellar");
          var cellar = null;
          (data.cellars || []).forEach(function (c) {
            if (c.id === id) cellar = c;
          });
          self._openCellarModal(cellar);
        };
      });

      root.querySelectorAll("[data-close-modal]").forEach(function (el) {
        el.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._closeModal();
        };
      });

      var enterEditBtn = root.querySelector("[data-enter-edit]");
      if (enterEditBtn) {
        enterEditBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._setBottleModalMode("edit");
        };
      }

      var cancelEditBtn = root.querySelector("[data-cancel-edit]");
      if (cancelEditBtn) {
        cancelEditBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._setBottleModalMode("view");
        };
      }

      var copyMemoryBtn = root.querySelector("[data-copy-memory-btn]");
      if (copyMemoryBtn && this._modal && this._modal.bottle) {
        copyMemoryBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._copiedBottleData = Object.assign({}, self._modal.bottle);
          delete self._copiedBottleData.id;
          delete self._copiedBottleData.cellar_id;
          delete self._copiedBottleData.shelf_id;
          delete self._copiedBottleData.lane;
          delete self._copiedBottleData.position;
          self._copyTimestamp = Date.now(); // Initialisation indispensable du timestamp
          self._closeModal();
          self._setActionMessage("Bottle copied to memory. Click an empty slot to paste.");
        };
      }

      var modal = root.querySelector(".modal");
      if (modal) {
        modal.addEventListener("click", function (e) { e.stopPropagation(); });
        modal.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      }
      root.querySelectorAll(".modal input, .modal select, .modal textarea, .modal label, .modal button, .modal form").forEach(function (el) {
        el.addEventListener("click", function (e) { e.stopPropagation(); });
        el.addEventListener("mousedown", function (e) { e.stopPropagation(); });
        el.addEventListener("focus", function (e) { e.stopPropagation(); }, true);
        el.addEventListener("keydown", function (e) { e.stopPropagation(); });
        el.addEventListener("input", function () {
          if (typeof el.setCustomValidity === "function") {
            el.setCustomValidity("");
          }
          self._clearFormError();
        });
      });

      var bottleForm = root.querySelector("[data-save-bottle]");
      if (bottleForm) {
        var cellarSelect = bottleForm.querySelector('[name="cellar_id"]');
        var shelfSelect = bottleForm.querySelector('[name="shelf_id"]');
        var laneSelect = bottleForm.querySelector('[name="lane"]');

        if (cellarSelect) {
          cellarSelect.addEventListener("change", function (e) {
            e.stopPropagation();
            self._refreshBottleLocationSelectors(root);
          });
        }
        if (shelfSelect) {
          shelfSelect.addEventListener("change", function (e) {
            e.stopPropagation();
            self._refreshBottleLocationSelectors(root);
          });
        }
        if (laneSelect) {
          laneSelect.addEventListener("change", function (e) {
            e.stopPropagation();
            self._refreshBottleLocationSelectors(root);
          });
        }

        // AJOUT CORRECTEUR : Détection automatique des doublons textuels en cours de frappe
        var wineNameInp = bottleForm.querySelector('[name="wine_name"]');
        var producerInp = bottleForm.querySelector('[name="producer"]');

        function checkTextDuplicates() {
          var tempBottle = {
            wine_name: wineNameInp ? wineNameInp.value : "",
            producer: producerInp ? producerInp.value : ""
          };
          
          var count = self._countSimilarBottles(tempBottle);
          var lang = (self._hass && self._hass.language) || "en";
          
          if (count > 0) {
            var alertMsg = lang.startsWith("fr") 
              ? "⚠️ Attention : Vous possédez déjà " + count + " bouteille(s) identique(s) dans votre cellier."
              : "⚠️ Warning: You already have " + count + " identical bottle(s) in your cellar.";
            self._setActionMessage(alertMsg);
          } else {
            if (self._actionMessage && self._actionMessage.startsWith("⚠️")) {
              self._clearActionMessage();
            }
          }
        }

        if (wineNameInp) { wineNameInp.addEventListener("input", checkTextDuplicates); }
        if (producerInp) { producerInp.addEventListener("input", checkTextDuplicates); }

        if (wineNameInp) {
          var autocompletePanel = wineNameInp.parentElement.querySelector(".custom-autocomplete-panel");
          wineNameInp.addEventListener("input", function(e) {
            var inputVal = wineNameInp.value.trim().toLowerCase();
            if (!inputVal || !autocompletePanel) {
              if (autocompletePanel) autocompletePanel.style.display = "none";
              return;
            }
            var active = (self._data && self._data.bottles) ? self._data.bottles : [];
            var consumed = (self._data && self._data.consumed_bottles) ? self._data.consumed_bottles : [];
            var allBottles = active.concat(consumed);
            var uniqueNames = [];
            allBottles.forEach(function(b) {
              if (b.wine_name && b.wine_name.trim()) {
                var nameTrimmed = b.wine_name.trim();
                if (nameTrimmed.toLowerCase().indexOf(inputVal) !== -1 && uniqueNames.indexOf(nameTrimmed) === -1) {
                  uniqueNames.push(nameTrimmed);
                }
              }
            });
            if (uniqueNames.length === 0) {
              autocompletePanel.style.display = "none";
              return;
            }
            autocompletePanel.innerHTML = uniqueNames.slice(0, 8).map(function(name) {
              return '<div class="custom-autocomplete-item" data-value="' + self._escape(name) + '">' + self._escape(name) + '</div>';
            }).join("");
            autocompletePanel.style.display = "block";
            autocompletePanel.querySelectorAll(".custom-autocomplete-item").forEach(function(item) {
              var selectSuggestion = function(e) {
                e.preventDefault();
                e.stopPropagation();
                var isFr = ((self._hass && self._hass.language) || "en").startsWith("fr");
                var selectedName = item.getAttribute("data-value");
                wineNameInp.value = selectedName;
                autocompletePanel.style.display = "none";
                var match = allBottles.reverse().find(function(b) {
                  return String(b.wine_name || "").trim().toLowerCase() === selectedName.toLowerCase();
                });
                if (match) {
                  self._applySuggestionToBottleForm(bottleForm, {
                    wine_name: match.wine_name,
                    producer: match.producer,
                    region: match.region,
                    country: match.country,
                    varietal: match.varietal,
                    vintage: match.vintage,
                    wine_type: match.wine_type,
                    price: match.price,
                    image_path: match.image_path,
                    aging_start_year: match.aging_start_year,
                    aging_end_year: match.aging_end_year,
                    notes: match.notes
                  }, true);
                  if (self._modal && self._modal.type === "bottle") {
                    if (!self._modal.preset) self._modal.preset = {};
                    self._modal.preset.image_path = match.image_path || "";
                    if (self._modal.bottle) self._modal.bottle.image_path = match.image_path || "";
                  }
                  var isFr = ((self._hass && self._hass.language) || "en").startsWith("fr");
                  self._setActionMessage(isFr ? "✨ Caractéristiques et étiquette appliquées automatiquement !" : "✨ Wine details and label applied automatically!");
                  checkTextDuplicates();
                  self.render(false);
                }
              };
              item.addEventListener("click", selectSuggestion);
              item.addEventListener("touchstart", selectSuggestion, { passive: false });
            });
          });
          wineNameInp.addEventListener("blur", function() {
            setTimeout(function() {
              if (autocompletePanel) autocompletePanel.style.display = "none";
            }, 150);
          });
        }

        // Configuration générique de l'autocomplétion sur les autres champs textuels
        var activeB = (self._data && self._data.bottles) ? self._data.bottles : [];
        var consumedB = (self._data && self._data.consumed_bottles) ? self._data.consumed_bottles : [];
        var allBottlesList = activeB.concat(consumedB);

        ["producer", "varietal", "region", "country"].forEach(function(fieldName) {
          var targetInp = bottleForm.querySelector('[name="' + fieldName + '"]');
          if (!targetInp) return;

          var panelEl = targetInp.parentElement.querySelector(".custom-autocomplete-panel");
          if (!panelEl) return;

          targetInp.addEventListener("input", function(e) {
            var valClean = targetInp.value.trim().toLowerCase();
            if (!valClean) {
              panelEl.style.display = "none";
              return;
            }

            var uniqueMatches = [];
            allBottlesList.forEach(function(b) {
              var fieldVal = b[fieldName] && b[fieldName].trim();
              if (fieldVal && fieldVal.toLowerCase().indexOf(valClean) !== -1 && uniqueMatches.indexOf(fieldVal) === -1) {
                uniqueMatches.push(fieldVal);
              }
            });

            if (uniqueMatches.length === 0) {
              panelEl.style.display = "none";
              return;
            }

            panelEl.innerHTML = uniqueMatches.slice(0, 8).map(function(itemText) {
              return '<div class="custom-autocomplete-item" data-value="' + self._escape(itemText) + '">' + self._escape(itemText) + '</div>';
            }).join("");
            panelEl.style.display = "block";

            panelEl.querySelectorAll(".custom-autocomplete-item").forEach(function(itemRow) {
              var handleSelection = function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                targetInp.value = itemRow.getAttribute("data-value");
                panelEl.style.display = "none";
                if (fieldName === "producer") checkTextDuplicates();
                targetInp.dispatchEvent(new Event("input", { bubbles: true }));
                targetInp.dispatchEvent(new Event("change", { bubbles: true }));
              };
              itemRow.addEventListener("click", handleSelection);
              itemRow.addEventListener("touchstart", handleSelection, { passive: false });
            });
          });

          // Fermeture automatique quand le focus quitte le champ de texte
          targetInp.addEventListener("blur", function() {
            setTimeout(function() {
              if (panelEl) panelEl.style.display = "none";
            }, 150);
          });

          window.addEventListener("click", function(e) {
            if (e.target !== targetInp && panelEl) {
              panelEl.style.display = "none";
            }
          });
        });
      }

      var saveBottleBtn = root.querySelector("[data-save-bottle-btn]");
      if (saveBottleBtn && bottleForm) {
        saveBottleBtn.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._saveBottleFromForm(bottleForm);
          if (!self._modal) self.render(true);
        };
      }

      var historySearchInput = root.querySelector('[name="history_search"]');
      if (historySearchInput) {
        historySearchInput.addEventListener("input", function (e) {
          e.stopPropagation();
          self._historySearchValue = historySearchInput.value || "";
          clearTimeout(self._historySearchTimer);
          self._historySearchTimer = setTimeout(function () {
            self._searchHistory(self._historySearchValue);
          }, 300);
        });
      }

      this._bindSearchResultButtons();

      // Gestionnaires pour les nouveaux boutons de téléversement du haut de formulaire
      var pickBarcodeBtn = root.querySelector("[data-pick-barcode-btn]");
      var barcodeFileInput = root.querySelector("[data-barcode-file-input]");
      var pickLabelBtn = root.querySelector("[data-pick-label-btn]");
      var labelFileInput = root.querySelector("[data-label-file-input]");

      if (pickBarcodeBtn && barcodeFileInput && bottleForm) {
        pickBarcodeBtn.onclick = function(e) {
          e.preventDefault(); e.stopPropagation();
          self._clearFormError();
          self._setActionMessage(isFr ? "Sélectionnez la photo du code-barres..." : "Select barcode photo...");
          barcodeFileInput.value = "";
          barcodeFileInput.click();
        };

        barcodeFileInput.onchange = async function(e) {
          e.preventDefault(); e.stopPropagation();
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          
          self._clearFormError();
          self._setActionMessage(isFr ? "Lecture de la photo du code-barres..." : "Reading barcode photo...");
          
          try {
            var dataUrl = await new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () { resolve(reader.result); };
              reader.onerror = function () { reject(new Error("File read failed")); };
              reader.readAsDataURL(file);
            });

            self._setActionMessage(isFr ? "Envoi de la photo à l'IA..." : "Sending photo to AI...");
            var base64Data = dataUrl.split(",")[1] || dataUrl;

            // Téléversement temporaire sécurisé
            var uploadResult = await self._callWS({
              type: "wine_cellar_manager/upload_label_image",
              data_base64: base64Data,
              filename: "temp_barcode_" + file.name
            });

            if (uploadResult && uploadResult.image_path) {
              self._setActionMessage(isFr ? "L'IA extrait le code-barres..." : "AI extracting barcode...");
              // Déclenchement automatique de l'analyse unifiée sur cette image temporelle
              var analyzeResult = await self._callWS({
                type: "wine_cellar_manager/unified_analyze",
                barcode: "",
                image_path: uploadResult.image_path
              });

              if (analyzeResult && analyzeResult.suggestion) {
                self._applySuggestionToBottleForm(bottleForm, analyzeResult.suggestion, true);
                if (analyzeResult.suggestion.barcode) {
                  var barcodeInp = bottleForm.querySelector('[name="barcode"]');
                  if (barcodeInp) barcodeInp.value = analyzeResult.suggestion.barcode;
                }
                self._setActionMessage(isFr ? "Code-barres détecté et appliqué !" : "Barcode detected and applied!");
              } else {
                self._setActionMessage(analyzeResult.message || "Aucun code-barres trouvé.");
              }
            }
          } catch(err) {
            console.error("Barcode image extraction failed", err);
            self._setFormError(isFr ? "L'extraction du code-barres a échoué." : "Barcode extraction failed.");
          }
        };
      }

      if (pickLabelBtn && labelFileInput && bottleForm) {
        pickLabelBtn.onclick = function(e) {
          e.preventDefault(); e.stopPropagation();
          self._clearFormError();
          self._setActionMessage("Sélectionnez la photo de l'étiquette...");
          labelFileInput.value = "";
          labelFileInput.click();
        };

        labelFileInput.onchange = async function(e) {
          e.preventDefault(); e.stopPropagation();
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          await self._uploadLabelFile(file, bottleForm);
        };
      }

      // Bouton unique UNIVERSAL ANALYZE avec sécurité anti-réanalyse
      var universalAnalyzeBtn = root.querySelector("[data-universal-analyze-btn]");
      if (universalAnalyzeBtn && bottleForm) {
        universalAnalyzeBtn.onclick = async function(e) {
          e.preventDefault(); e.stopPropagation();
          
          var isAnalyzed = bottleForm.querySelector('[name="analyzed_flag"]').value === "true";
          if (isAnalyzed) {
            if (!confirm("Ce vin a déjà été analysé avec succès. Voulez-vous écraser les données et relancer l'analyse ?")) {
              return;
            }
          }

          var barcodeVal = bottleForm.querySelector('[name="barcode"]').value.trim();
          var labelVal = bottleForm.querySelector('[name="image_path"]').value.trim();

          if (!barcodeVal && !labelVal) {
            self._setFormError("Veuillez fournir un code-barres (chiffres) ou téléverser une étiquette avant de lancer l'analyse.");
            return;
          }

          self._clearFormError();
          self._setActionMessage("Lancement de l'analyse intelligente...");

          try {
            var result = await self._callWS({
              type: "wine_cellar_manager/unified_analyze",
              barcode: barcodeVal,
              image_path: labelVal
            });

            if (result && result.suggestion) {
              // Sauvegarde les données retournées par l'IA dans l'état du modal avant de rafraîchir le DOM
              if (self._modal.bottle) {
                self._modal.bottle = Object.assign({}, self._modal.bottle, result.suggestion, { analyzed: true });
              } else {
                self._modal.preset = Object.assign({}, self._modal.preset, result.suggestion, { analyzed: true });
              }

              var lang = (self._hass && self._hass.language) || "en";
              self._setActionMessage(lang.startsWith("fr") ? "✨ Analyse complétée avec succès ! Caractéristiques appliquées." : "✨ Analysis completed successfully! Details applied.");
              
              // Redessine le formulaire de manière sécurisée en conservant l'état mis à jour
              self.render(false);
            } else {
              self._setActionMessage(result.message || "Aucun résultat trouvé.");
            }
          } catch(err) {
            self._setFormError("L'analyse a échoué : " + (err.message || err));
          }
        };
      }

      // Écouteurs pour la bulle comparative d'images (Pop-up de choix)
      var keepLocalBtn = root.querySelector("[data-keep-local-img-btn]");
      var keepOfficialBtn = root.querySelector("[data-keep-official-img-btn]");

      if (keepLocalBtn) {
        keepLocalBtn.onclick = async function(e) {
          e.preventDefault(); e.stopPropagation();
          // L'utilisateur garde sa photo : on demande au serveur d'effacer l'image officielle temporaire
          try {
            await self._callWS({
              type: "wine_cellar_manager/cleanup_temp_image",
              action: "keep_local",
              local_path: self._imageComparisonData.local_path || "",
              official_path: self._imageComparisonData.official_path || ""
            });
          } catch(err) { console.error(err); }
          self._imageComparisonData = null;
          self.render(true);
        };
      }

      if (keepOfficialBtn) {
        keepOfficialBtn.onclick = async function(e) {
          e.preventDefault();
          e.stopPropagation();

          try {
            var result = await self._callWS({
              type: "wine_cellar_manager/cleanup_temp_image",
              action: "keep_official",
              local_path: self._imageComparisonData.local_path || "",
              official_path: self._imageComparisonData.official_path || ""
            });

            if (result && result.new_image_path) {
              bottleForm.querySelector('[name="image_path"]').value = result.new_image_path;
            } else if (self._imageComparisonData.official_path) {
              bottleForm.querySelector('[name="image_path"]').value = self._imageComparisonData.official_path;
            }
          } catch (err) {
            console.error(err);
          }

          self._imageComparisonData = null;
          self.render(true);
        };
      }
      var addShelfBtn = root.querySelector("[data-add-shelf-row]");
      if (addShelfBtn) {
        addShelfBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self._appendShelfRow(root);
        };
      }

      root.querySelectorAll("[data-remove-shelf]").forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var rowsWrap = root.querySelector("[data-shelf-rows]");
          var rows = rowsWrap ? rowsWrap.querySelectorAll("[data-shelf-row]") : [];
          if (rows.length <= 1) {
            self._setFormError("A cellar must have at least one shelf.");
            return;
          }
          var row = el.closest("[data-shelf-row]");
          if (row) row.remove();
        };
      });

      var saveCellarBtn = root.querySelector("[data-save-cellar-btn]");
      var cellarForm = root.querySelector("[data-save-cellar]");
      if (saveCellarBtn && cellarForm) {
        saveCellarBtn.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._saveCellarFromForm(cellarForm);
          self.render(true);
        };
      }

      var consumeBottle = root.querySelector("[data-consume-bottle]");
      if (consumeBottle) {
        consumeBottle.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._consumeBottle(consumeBottle.getAttribute("data-consume-bottle"));
          self.render(true);
        };
      }

      var delBottle = root.querySelector("[data-delete-bottle]");
      if (delBottle) {
        delBottle.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._deleteBottle(delBottle.getAttribute("data-delete-bottle"));
          self.render(true);
        };
      }

      var delCellar = root.querySelector("[data-delete-cellar]");
      if (delCellar) {
        delCellar.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();
          await self._deleteCellar(delCellar.getAttribute("data-delete-cellar"));
          self.render(true);
        };
      }
      var openCleanup = root.querySelector("[data-open-cleanup-tool]");
      if (openCleanup) {
        openCleanup.onclick = function(e) {
          e.preventDefault(); e.stopPropagation();
          self._rendering = false; 
          self._viewingDuplicateManager = true;
          self._foundSyntaxDuplicates = [];
          self._duplicateManagerHasSearched = false; // Réinitialise l'accueil à chaque ouverture
          self._clearFormError();
          self._clearActionMessage();
          self.render(true); 
        };
      }

      if (this._viewingDuplicateManager) {
        var closeCleanup = function() {
          self._viewingDuplicateManager = false;
          self._foundSyntaxDuplicates = [];
          self._duplicateManagerHasSearched = false; // Réinitialise à la fermeture
          self._clearFormError();
          self._clearActionMessage();
          self.render(false);
        };

        var closeBtn1 = root.querySelector("[data-close-cleanup-btn]");
        var closeBtn2 = root.querySelector("[data-close-cleanup-bottom]");
        var backdrop = root.querySelector("[data-close-cleanup-backdrop]");
        if (closeBtn1) closeBtn1.onclick = closeCleanup;
        if (closeBtn2) closeBtn2.onclick = closeCleanup;
        if (backdrop) {
          backdrop.onclick = closeCleanup;
          var cleanModalInner = backdrop.querySelector(".modal");
          if (cleanModalInner) {
            cleanModalInner.onclick = function(e) { e.stopPropagation(); };
          }
        }

        var searchCleanBtn = root.querySelector("[data-trigger-cleanup-search-btn]");
        if (searchCleanBtn) {
          searchCleanBtn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            self._duplicateManagerSearching = true;
            self._clearFormError();
            self._clearActionMessage();
            self.render(false);
            setTimeout(() => { self._findSyntaxAnomalies(); }, 200);
          };
        }

        var mergeAllBtn = root.querySelector("[data-cleanup-merge-all-btn]");
        if (mergeAllBtn) {
          mergeAllBtn.onclick = async function(e) {
            e.preventDefault(); e.stopPropagation();
            if (confirm(isFr ? "Voulez-vous fusionner et uniformiser toutes les syntaxes listées ?" : "Do you want to merge and standardize all listed syntaxes?")) {
              await self._executeMergeAllSyntax();
            }
          };
        }

        root.querySelectorAll("[data-select-variant-a]").forEach(function(btn, index) {
          btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            var item = self._foundSyntaxDuplicates[index];
            if (item) {
              item.selectedValue = item.valueA;
              self.render(false);
            }
          };
        });

        root.querySelectorAll("[data-select-variant-b]").forEach(function(btn, index) {
          btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            var item = self._foundSyntaxDuplicates[index];
            if (item) {
              item.selectedValue = item.valueB;
              self.render(false);
            }
          };
        });

        root.querySelectorAll("[data-accept-cleanup]").forEach(function(btn, index) {
          btn.onclick = async function(e) {
            e.preventDefault(); e.stopPropagation();
            var item = self._foundSyntaxDuplicates[index];
            if (item) await self._executeSyntaxMerge(item);
          };
        });

        root.querySelectorAll("[data-reject-cleanup]").forEach(function(btn, index) {
          btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            self._foundSyntaxDuplicates.splice(index, 1);
            self.render(false);
          };
        });
      }

    } catch (err) {
      console.error("Wine Cellar render failed", err);
      var message = err && err.message ? err.message : "unknown error";
      this.shadowRoot.innerHTML =
        "<ha-card><div style='padding:16px;color:var(--error-color,#db4437)'>" +
        "<strong>Wine Cellar card error:</strong><br>" +
        this._escape(message) +
        "</div></ha-card>";
    } finally {
      this._rendering = false;
    }
  }
}

customElements.define("wine-cellar-card", WineCellarCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "wine-cellar-card",
  name: "Wine Cellar Card",
  description: "Shelf-based wine dashboard with popup editing"
});
