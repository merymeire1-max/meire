/**
 * card-overview.js - Sistema de Visualização Temporária de Cartas
 *
 * Responsabilidades:
 * - Exibir todas as cartas não viradas em grade adaptativa
 * - Calcular layout otimizado baseado em quantidade e proporções de tela
 * - Gerenciar transições visuais (ativação/desativação)
 * - Atualizar contador de cartas disponíveis
 * - Integração com atalho de teclado (V)
 *
 * @module CardOverview
 */

import { sessionState } from "@core/session-state.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} LayoutCalculation
 * @property {number} columns - Número de colunas
 * @property {number} rows - Número de linhas
 * @property {number} cardWidth - Largura de cada carta (px)
 * @property {number} cardHeight - Altura de cada carta (px)
 */

class CardOverview {
  constructor() {
    this.initialized = false;
    this.isActive = false;

    // Referências DOM
    this.cardsArea = null;
    this.cardsContainer = null;
    this.infoOverlay = null;

    // Estado
    this.originalScrollPosition = { left: 0, top: 0 };
    this.originalCardStyles = new Map();

    // Configurações de layout
    this.config = {
      gap: 10, // Espaçamento entre cartas
      padding: 15, // Padding da grade
      minCardSize: 80, // Tamanho mínimo de carta
      aspectRatio: 2 / 3, // Proporção padrão de cartas (largura/altura)
    };

    // Estatísticas
    this.stats = {
      activations: 0,
      lastCardCount: 0,
      lastLayout: null,
    };
  }

  /**
   * Inicializa o sistema de visualização
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ CardOverview já foi inicializado");
      return;
    }

    console.log("👁️ CardOverview inicializando...");

    // Obtém referências DOM
    this._setupDOMReferences();

    // Cria overlay de informações
    this._createInfoOverlay();

    // Configura listeners de eventos
    this._setupEventListeners();

    this.initialized = true;
    console.log("✅ CardOverview inicializado");
  }

  /**
   * Configura referências DOM
   * @private
   */
  _setupDOMReferences() {
    this.cardsArea = document.querySelector(".cards-area");
    this.cardsContainer = document.getElementById("cardsContainer");

    if (!this.cardsArea) {
      console.error("❌ .cards-area não encontrada no DOM");
    }

    if (!this.cardsContainer) {
      console.error("❌ #cardsContainer não encontrado no DOM");
    }
  }

  /**
   * Cria overlay de informações
   * @private
   */
  _createInfoOverlay() {
    // Remove overlay existente se houver
    const existing = document.getElementById("overview-info");
    if (existing) {
      existing.remove();
    }

    this.infoOverlay = document.createElement("div");
    this.infoOverlay.id = "overview-info";
    this.infoOverlay.className = "overview-info";

    document.body.appendChild(this.infoOverlay);

    console.log("✅ Overlay de informações criado");
  }

  /**
   * Configura listeners de eventos
   * @private
   */
  _setupEventListeners() {
    // Listener para mudanças em cartas viradas (SessionState)
    sessionState.on("game.flippedCards", () => {
      if (this.isActive) {
        this._updateCardCount();
      }
    });

    // Listener para ESC fechar overview
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isActive) {
        this.deactivate();
      }
    });

    // Listener para clique fora do container
    this.cardsContainer?.addEventListener("click", (e) => {
      // Se clicou no próprio container (fundo), fecha
      if (e.target === this.cardsContainer) {
        this.deactivate();
      }
    });

    // Fecha overview quando UCM abre (ex: duplo clique numa carta durante overview)
    document.addEventListener("ucm-opened", () => {
      if (this.isActive) this.deactivate();
    });
  }

  // ============================================
  // ATIVAÇÃO E DESATIVAÇÃO
  // ============================================

  /**
   * Alterna entre ativo/inativo
   */
  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * Ativa visualização
   * @returns {boolean} Sucesso na ativação
   */
  activate() {
    if (!this.cardsArea || !this.cardsContainer) {
      console.error("❌ Elementos DOM não disponíveis");
      return false;
    }

    if (this.isActive) {
      console.warn("⚠️ Overview já está ativo");
      return false;
    }

    // Não abre se UCM estiver ativo
    if (window.universalCardModal?.isModalOpen?.()) {
      console.warn("⚠️ Overview bloqueado: UCM está ativo");
      return false;
    }

    console.log("👁️ Ativando Card Overview...");

    // Obtém cartas não viradas
    const unflippedCards = this._getUnflippedCards();

    if (unflippedCards.length === 0) {
      console.warn("⚠️ Nenhuma carta disponível para visualizar");

      // Mostra mensagem temporária
      this._showTemporaryMessage(languageManager.translate("card_overview.no_cards_available"));

      return false;
    }

    // Salva estado atual
    this._saveCurrentState();

    // Calcula layout otimizado
    const layout = this._calculateOptimalLayout(unflippedCards.length);

    // Aplica layout às cartas
    this._applyLayoutToCards(unflippedCards, layout);

    // Ativa modo overview
    this.cardsArea.classList.add("overview-mode");

    // Reseta scroll
    requestAnimationFrame(() => {
      this.cardsContainer.scrollLeft = 0;
      this.cardsContainer.scrollTop = 0;
    });

    // Atualiza overlay de informações
    this._updateInfoOverlay(unflippedCards.length);

    // Mostra overlay
    this.infoOverlay.classList.add("visible");

    // Atualiza estado
    this.isActive = true;
    this.stats.activations++;
    this.stats.lastCardCount = unflippedCards.length;
    this.stats.lastLayout = layout;

    console.log(`✅ Overview ativado: ${unflippedCards.length} carta(s) em ${layout.columns}×${layout.rows}`);

    return true;
  }

  /**
   * Desativa visualização
   */
  deactivate() {
    if (!this.isActive) {
      return;
    }

    console.log("👁️ Desativando Card Overview...");

    // Remove modo overview
    this.cardsArea.classList.remove("overview-mode");

    // Restaura estado original
    this._restoreOriginalState();

    // Esconde overlay
    this.infoOverlay.classList.remove("visible");

    // Atualiza estado
    this.isActive = false;

    console.log("✅ Overview desativado");
  }

  // ============================================
  // CÁLCULO DE LAYOUT
  // ============================================

  /**
   * Calcula layout otimizado para as cartas
   * @private
   * @param {number} cardCount - Quantidade de cartas
   * @returns {LayoutCalculation}
   */
  _calculateOptimalLayout(cardCount) {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Área útil (descontando padding)
    const usableWidth = screenWidth - this.config.padding * 2;
    const usableHeight = screenHeight - this.config.padding * 2;

    // Calcula número ideal de colunas baseado na proporção da tela
    const screenRatio = screenWidth / screenHeight;
    const cardRatio = this.config.aspectRatio;

    // Fórmula otimizada para distribuição uniforme
    let columns = Math.ceil(Math.sqrt((cardCount * screenRatio) / cardRatio));
    let rows = Math.ceil(cardCount / columns);

    // Calcula tamanho de carta baseado no espaço disponível
    let cardWidth = Math.floor((usableWidth - (columns - 1) * this.config.gap) / columns);

    let cardHeight = Math.floor((usableHeight - (rows - 1) * this.config.gap) / rows);

    // Ajusta para manter aspect ratio se necessário
    const calculatedRatio = cardWidth / cardHeight;

    if (calculatedRatio > cardRatio) {
      // Muito largo, ajusta largura
      cardWidth = Math.floor(cardHeight * cardRatio);
    } else if (calculatedRatio < cardRatio) {
      // Muito alto, ajusta altura
      cardHeight = Math.floor(cardWidth / cardRatio);
    }

    // Garante tamanho mínimo
    if (cardWidth < this.config.minCardSize || cardHeight < this.config.minCardSize) {
      const scale = this.config.minCardSize / Math.min(cardWidth, cardHeight);
      cardWidth = Math.floor(cardWidth * scale);
      cardHeight = Math.floor(cardHeight * scale);

      // Recalcula colunas e linhas se necessário
      columns = Math.max(1, Math.floor(usableWidth / (cardWidth + this.config.gap)));
      rows = Math.ceil(cardCount / columns);
    }

    return {
      columns,
      rows,
      cardWidth,
      cardHeight,
    };
  }

  /**
   * Aplica layout calculado às cartas
   * @private
   * @param {Array<HTMLElement>} cards
   * @param {LayoutCalculation} layout
   */
  _applyLayoutToCards(cards, layout) {
    // Configura grid do container
    this.cardsContainer.style.gridTemplateColumns = `repeat(${layout.columns}, ${layout.cardWidth}px)`;
    this.cardsContainer.style.gap = `${this.config.gap}px`;

    // Aplica tamanho a cada carta
    cards.forEach((card) => {
      // Salva estilos originais antes de modificar
      if (!this.originalCardStyles.has(card)) {
        this.originalCardStyles.set(card, {
          width: card.style.width,
          height: card.style.height,
        });
      }

      // Aplica novo tamanho
      card.style.width = `${layout.cardWidth}px`;
      card.style.height = `${layout.cardHeight}px`;
    });
  }

  // ============================================
  // GERENCIAMENTO DE ESTADO
  // ============================================

  /**
   * Salva estado atual antes de ativar overview
   * @private
   */
  _saveCurrentState() {
    // Salva posição do scroll
    this.originalScrollPosition = {
      left: this.cardsContainer.scrollLeft,
      top: this.cardsContainer.scrollTop,
    };

    // Limpa estilos salvos anteriores
    this.originalCardStyles.clear();
  }

  /**
   * Restaura estado original após desativar
   * @private
   */
  _restoreOriginalState() {
    // Restaura estilos de todas as cartas
    const allCards = this.cardsContainer.querySelectorAll(".card");

    allCards.forEach((card) => {
      const original = this.originalCardStyles.get(card);

      if (original) {
        card.style.width = original.width;
        card.style.height = original.height;
      } else {
        // Se não tinha estilo salvo, remove
        card.style.removeProperty("width");
        card.style.removeProperty("height");
      }
    });

    // Limpa configuração do grid
    this.cardsContainer.style.removeProperty("grid-template-columns");
    this.cardsContainer.style.removeProperty("gap");

    // Restaura scroll após animação
    setTimeout(() => {
      this.cardsContainer.scrollLeft = this.originalScrollPosition.left;
      this.cardsContainer.scrollTop = this.originalScrollPosition.top;
    }, 100);

    // Limpa mapa de estilos
    this.originalCardStyles.clear();
  }

  // ============================================
  // HELPERS E UTILIDADES
  // ============================================

  /**
   * Obtém todas as cartas não viradas
   * @private
   * @returns {Array<HTMLElement>}
   */
  _getUnflippedCards() {
    if (!this.cardsContainer) return [];

    return Array.from(this.cardsContainer.querySelectorAll(".card:not(.flipped)"));
  }

  /**
   * Atualiza overlay de informações
   * @private
   * @param {number} cardCount
   */
  _updateInfoOverlay(cardCount) {
    if (!this.infoOverlay) return;

    this.infoOverlay.innerHTML = `
      <span class="overview-icon">📋</span>
      <span class="overview-title">${languageManager.translate("card_overview.title")}</span>
      <span class="overview-counter">${languageManager.translate("card_overview.counter").replace("{count}", cardCount)}</span>
    `;
  }

  /**
   * Atualiza contador de cartas (quando overview está ativo)
   * @private
   */
  _updateCardCount() {
    const unflippedCards = this._getUnflippedCards();
    const count = unflippedCards.length;

    console.log(`🔄 Cartas restantes: ${count}`);

    // Atualiza overlay
    this._updateInfoOverlay(count);

    // Se não sobrou nenhuma carta, desativa overview
    if (count === 0) {
      setTimeout(() => {
        if (this.isActive) {
          this.deactivate();
          this._showTemporaryMessage(languageManager.translate("card_overview.all_cards_used"));
        }
      }, 500);
    }
  }

  /**
   * Mostra mensagem temporária
   * @private
   * @param {string} text
   */
  _showTemporaryMessage(text) {
    const message = document.createElement("div");
    message.className = "overview-message";
    message.textContent = text;

    document.body.appendChild(message);

    // Anima entrada
    requestAnimationFrame(() => {
      message.classList.add("visible");
    });

    // Remove após 3 segundos
    setTimeout(() => {
      message.classList.remove("visible");

      setTimeout(() => {
        if (message.parentNode) {
          message.remove();
        }
      }, 300);
    }, 3000);
  }

  // ============================================
  // CALLBACKS EXTERNOS
  // ============================================

  /**
   * Callback quando cartas são embaralhadas
   */
  onCardsShuffled() {
    if (this.isActive) {
      // Recalcula layout com nova quantidade
      const unflippedCards = this._getUnflippedCards();

      if (unflippedCards.length > 0) {
        const layout = this._calculateOptimalLayout(unflippedCards.length);
        this._applyLayoutToCards(unflippedCards, layout);
        this._updateInfoOverlay(unflippedCards.length);

        console.log("🔄 Layout recalculado após embaralhar");
      } else {
        this.deactivate();
      }
    }
  }

  /**
   * Callback quando uma carta é virada
   */
  onCardFlipped() {
    if (this.isActive) {
      this._updateCardCount();
    }
  }

  // ============================================
  // GETTERS E STATUS
  // ============================================

  /**
   * Verifica se overview está ativo
   * @returns {boolean}
   */
  isOverviewActive() {
    return this.isActive;
  }

  /**
   * Obtém estatísticas de uso
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isActive: this.isActive,
      currentCardCount: this.isActive ? this._getUnflippedCards().length : null,
    };
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Mostra informações do sistema
   */
  debug() {
    console.log("👁️ Card Overview Debug:");
    console.log("  Status:", this.isActive ? "ATIVO" : "INATIVO");
    console.log("  Estatísticas:", this.stats);

    if (this.isActive) {
      const cards = this._getUnflippedCards();
      console.log("  Cartas visíveis:", cards.length);
      console.log("  Layout atual:", this.stats.lastLayout);
    }
  }

  /**
   * Debug: Testa layout com quantidade customizada
   * @param {number} cardCount
   */
  debugLayout(cardCount) {
    console.log(`\n🧪 TESTE DE LAYOUT: ${cardCount} cartas`);
    console.log("================================");

    const layout = this._calculateOptimalLayout(cardCount);

    console.log("Resultado:");
    console.log(`  Colunas: ${layout.columns}`);
    console.log(`  Linhas: ${layout.rows}`);
    console.log(`  Tamanho carta: ${layout.cardWidth}×${layout.cardHeight}px`);
    console.log(`  Total slots: ${layout.columns * layout.rows}`);
    console.log("================================\n");

    return layout;
  }
}

// Singleton
export const cardOverview = new CardOverview();

// Expõe globalmente para debug
window.cardOverview = cardOverview;

console.log("✅ CardOverview carregado");
console.log("💡 Use window.cardOverview.debug() para ver status");
console.log("💡 Use window.cardOverview.debugLayout(30) para testar layout");
