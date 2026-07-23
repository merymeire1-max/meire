/**
 * deck-manager.js — Sistema de Múltiplos Decks por Jogo
 *
 * Responsabilidades:
 * - Persistência de decks via configManager (por jogo)
 * - Estado runtime por deck (somente em memória — reseta ao recarregar)
 * - Troca de deck preservando estado da sessão (cartas viradas, ordem do shuffle)
 * - CRUD de decks: criar, renomear, deletar, copiar cartas entre decks
 *
 * Limite: MAX_DECKS (10) decks por jogo
 * Migração: converte activeCardIds legado → deck_default automaticamente
 *
 * @module DeckManager
 */

import { configManager } from "@core/config-manager.js";

const MAX_DECKS = 10;
export const DEFAULT_DECK_ID = "deck_default";

class DeckManager {
  constructor() {
    this.initialized = false;
    this.currentDeckId = DEFAULT_DECK_ID;

    /**
     * Estado runtime por deck — NÃO persistido.
     * @type {Map<string, { shuffleOrder: number[], flippedCards: Map<number, string>, gridInitialized: boolean }>}
     */
    this.deckStates = new Map();
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  init() {
    if (this.initialized) return;
    console.log("🃏 DeckManager inicializando...");

    this._migrateIfNeeded();
    this._syncStates();

    // Carrega o deck ativo salvo na config
    const savedActive = configManager.get("activeDeckId");
    const decks = this.getDecks();

    if (savedActive && decks.find((d) => d.id === savedActive)) {
      this.currentDeckId = savedActive;
    } else if (decks.length > 0) {
      this.currentDeckId = decks[0].id;
      configManager.set("activeDeckId", this.currentDeckId, false);
    }

    // Reinicia quando o jogo ativo mudar
    document.addEventListener("game-changed", () => this._onGameChanged());

    this.initialized = true;
    const deck = this.getCurrentDeck();
    console.log(`✅ DeckManager pronto | Deck ativo: "${deck?.name}" | Total: ${decks.length}`);
  }

  _migrateIfNeeded() {
    const existingDecks = configManager.get("decks");
    if (Array.isArray(existingDecks) && existingDecks.length > 0) return;

    console.log("🔄 DeckManager: migrando para sistema de decks...");

    // ── Backup da configuração atual ──────────────────────────────────────
    try {
      const backupKey = `liveCardGameConfig_${configManager.currentGameId || "default"}_pre_decks_backup`;
      localStorage.setItem(backupKey, JSON.stringify(configManager.getFullConfig()));
      console.log(`💾 Backup salvo em localStorage: "${backupKey}"`);
    } catch (e) {
      console.warn("⚠️ Não foi possível criar backup no localStorage:", e.message);
    }

    // ── Cria deck padrão a partir do activeCardIds legado ─────────────────
    const legacyIds = configManager.get("activeCardIds");
    const allCards = configManager.getCards().map((c) => c.id);
    const cardIds = Array.isArray(legacyIds) && legacyIds.length > 0 ? legacyIds : allCards;

    configManager.set("decks", [{ id: DEFAULT_DECK_ID, name: "Deck Principal", activeCardIds: cardIds }], false);
    configManager.set("activeDeckId", DEFAULT_DECK_ID, false);
    configManager.save();

    console.log(`✅ Deck Principal criado com ${cardIds.length} carta(s)`);
  }

  _syncStates() {
    for (const deck of this.getDecks()) {
      if (!this.deckStates.has(deck.id)) {
        this.deckStates.set(deck.id, {
          shuffleOrder: [],
          flippedCards: new Map(),
          gridInitialized: false,
        });
      }
    }
  }

  _onGameChanged() {
    console.log("🔄 DeckManager: jogo trocado, reiniciando...");
    this.initialized = false;
    this.deckStates = new Map();
    this.init();
    document.dispatchEvent(new CustomEvent("deck-list-changed"));
  }

  // ============================================
  // GETTERS
  // ============================================

  getDecks() {
    return configManager.get("decks") || [];
  }

  getCurrentDeck() {
    return this.getDeckById(this.currentDeckId);
  }

  getDeckById(deckId) {
    return this.getDecks().find((d) => d.id === deckId) || null;
  }

  getCurrentDeckCardIds() {
    return this.getCurrentDeck()?.activeCardIds || [];
  }

  getAllDeckCardIds() {
    const all = new Set();
    this.getDecks().forEach((d) => (d.activeCardIds || []).forEach((id) => all.add(id)));
    return [...all];
  }

  isCardInDeck(cardId, deckId) {
    return this.getDeckById(deckId)?.activeCardIds?.includes(cardId) ?? false;
  }

  isCardInCurrentDeck(cardId) {
    return this.isCardInDeck(cardId, this.currentDeckId);
  }

  // ============================================
  // TROCA DE DECK (runtime)
  // ============================================

  async switchDeck(deckId, cardManagerRef) {
    if (!this.initialized) {
      console.warn("⚠️ DeckManager não inicializado");
      return;
    }
    if (deckId === this.currentDeckId) return;

    const target = this.getDeckById(deckId);
    if (!target) {
      console.error(`❌ Deck "${deckId}" não encontrado`);
      return;
    }

    const prevName = this.getCurrentDeck()?.name || this.currentDeckId;
    console.log(`🃏 Trocando deck: "${prevName}" → "${target.name}"`);

    this._saveCurrentStateFrom(cardManagerRef);

    this.currentDeckId = deckId;
    configManager.set("activeDeckId", deckId, false);

    if (!this.deckStates.has(deckId)) {
      this.deckStates.set(deckId, {
        shuffleOrder: [],
        flippedCards: new Map(),
        gridInitialized: false,
      });
    }

    const state = this.deckStates.get(deckId);

    if (!state.gridInitialized) {
      cardManagerRef.shuffleCards();
      state.gridInitialized = true;
    } else {
      this._restoreStateInto(deckId, cardManagerRef);
    }

    document.dispatchEvent(new CustomEvent("deck-switched", { detail: { deckId, deck: target } }));
    console.log(`✅ Deck ativo: "${target.name}" (${target.activeCardIds?.length ?? 0} cartas)`);
  }

  _saveCurrentStateFrom(cardManagerRef) {
    if (!cardManagerRef || !this.deckStates.has(this.currentDeckId)) return;

    const state = this.deckStates.get(this.currentDeckId);

    // Salva cartas viradas: Map<cardNumber, url>
    state.flippedCards = new Map();
    const grid = document.getElementById("cardsContainer");
    if (grid) {
      grid.querySelectorAll(".card.flipped").forEach((cardEl) => {
        const cardNumber = parseInt(cardEl.dataset.cardNumber);
        const img = cardEl.querySelector(".card-front-img");
        if (!isNaN(cardNumber) && img) {
          state.flippedCards.set(cardNumber, img.src);
        }
      });

      state.shuffleOrder = Array.from(grid.querySelectorAll(".card"))
        .map((el) => parseInt(el.dataset.cardNumber))
        .filter((n) => !isNaN(n));
    }

    state.gridInitialized = true;
  }

  _restoreStateInto(deckId, cardManagerRef) {
    const state = this.deckStates.get(deckId);
    const deck = this.getDeckById(deckId);
    if (!state || state.shuffleOrder.length === 0 || !deck) {
      cardManagerRef.shuffleCards();
      return;
    }

    cardManagerRef.createCardsGrid(state.shuffleOrder);

    // Atualiza flippedCards no manager para referência futura
    cardManagerRef.flippedCards = new Set(state.flippedCards.values());

    const grid = document.getElementById("cardsContainer");
    if (!grid) return;

    grid.querySelectorAll(".card").forEach((cardEl) => {
      const cardNumber = parseInt(cardEl.dataset.cardNumber, 10);
      if (isNaN(cardNumber)) return;

      if (state.flippedCards.has(cardNumber)) {
        const url = state.flippedCards.get(cardNumber);
        const frontImg = cardEl.querySelector(".card-front-img");
        if (frontImg) frontImg.src = url;
        cardEl.classList.add("flipped");
      }
    });
  }

  recordFlip(cardNumber, cardUrl) {
    const state = this.deckStates.get(this.currentDeckId);
    if (!state) return;

    if (cardNumber !== null) {
      state.flippedCards.set(cardNumber, cardUrl);
    }
  }

  resetAllStates() {
    this.deckStates.forEach((state) => {
      state.shuffleOrder = [];
      state.flippedCards = new Map();
      state.gridInitialized = false;
    });
    console.log("🔄 DeckManager: todos os estados resetados");
  }

  // ============================================
  // CRUD DE DECKS
  // ============================================

  createDeck(name) {
    const decks = this.getDecks();
    if (decks.length >= MAX_DECKS) {
      console.warn(`⚠️ Limite de ${MAX_DECKS} decks atingido`);
      return null;
    }

    const id = `deck_${Date.now()}`;
    const newDeck = {
      id,
      name: name?.trim() || `Deck ${decks.length + 1}`,
      activeCardIds: [],
    };

    decks.push(newDeck);
    configManager.set("decks", decks);

    this.deckStates.set(id, {
      shuffleOrder: [],
      flippedCards: new Map(),
      gridInitialized: false,
    });

    console.log(`✅ Deck criado: "${newDeck.name}" (${id})`);
    document.dispatchEvent(new CustomEvent("deck-list-changed"));
    return newDeck;
  }

  renameDeck(deckId, name) {
    const decks = this.getDecks();
    const deck = decks.find((d) => d.id === deckId);
    if (!deck || !name?.trim()) return false;

    deck.name = name.trim();
    configManager.set("decks", decks);
    document.dispatchEvent(new CustomEvent("deck-list-changed"));
    return true;
  }

  deleteDeck(deckId) {
    if (deckId === DEFAULT_DECK_ID) {
      console.warn("⚠️ Não é possível deletar o Deck Principal");
      return false;
    }
    const decks = this.getDecks();
    if (decks.length <= 1) {
      console.warn("⚠️ Não é possível deletar o único deck");
      return false;
    }

    configManager.set(
      "decks",
      decks.filter((d) => d.id !== deckId),
    );
    this.deckStates.delete(deckId);

    if (this.currentDeckId === deckId) {
      this.currentDeckId = DEFAULT_DECK_ID;
      configManager.set("activeDeckId", DEFAULT_DECK_ID, false);
    }

    console.log(`🗑️ Deck deletado: ${deckId}`);
    document.dispatchEvent(new CustomEvent("deck-list-changed"));
    return true;
  }

  setDeckCards(deckId, cardIds) {
    const decks = this.getDecks();
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return false;
    deck.activeCardIds = [...cardIds];
    configManager.set("decks", decks);
    return true;
  }

  toggleCardInDeck(cardId, deckId, active) {
    const decks = this.getDecks();
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;

    if (!deck.activeCardIds) deck.activeCardIds = [];

    if (active) {
      if (!deck.activeCardIds.includes(cardId)) deck.activeCardIds.push(cardId);
    } else {
      deck.activeCardIds = deck.activeCardIds.filter((id) => id !== cardId);
    }

    configManager.set("decks", decks);
  }

  copyCardToDeck(cardId, targetDeckId) {
    const decks = this.getDecks();
    const target = decks.find((d) => d.id === targetDeckId);
    if (!target) return false;

    if (!target.activeCardIds) target.activeCardIds = [];
    if (target.activeCardIds.includes(cardId)) return false;

    target.activeCardIds.push(cardId);
    configManager.set("decks", decks);
    console.log(`✅ Carta "${cardId}" copiada para deck "${target.name}"`);
    return true;
  }

  debug() {
    const decks = this.getDecks();
    console.log("🃏 DeckManager Debug:");
    console.log(`  Inicializado: ${this.initialized}`);
    console.log(`  Deck ativo: ${this.currentDeckId}`);
    console.log(`  Total de decks: ${decks.length}`);
    decks.forEach((d) => {
      const state = this.deckStates.get(d.id);
      console.log(
        `  [${d.id}] "${d.name}" — ${d.activeCardIds?.length ?? 0} cartas | grid: ${state?.gridInitialized ? "✓" : "—"} | viradas: ${state?.flippedCards?.size ?? 0}`,
      );
    });
  }
}

// ============================================
// SINGLETON
// ============================================

export const deckManager = new DeckManager();
window.deckManager = deckManager;

console.log("✅ DeckManager carregado");
console.log("💡 Use window.deckManager.debug() para ver estado dos decks");
