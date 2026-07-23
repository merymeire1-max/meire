/**
 * card-held.js - Sistema de Gerenciamento de Cartas Seguradas
 *
 * Responsabilidades:
 * - Gerenciar cartas nos slots das mãos (1-6)
 * - Sincronizar com SessionState
 * - Atualizar UI dos slots
 * - Processar durações (turnos/usos)
 * - Gerenciar cooldowns de ultimates
 * - Fornecer cartas para buffs/bloqueios
 * - Validar slots disponíveis
 * - Modal de substituição de slots
 *
 * @module CardHeld
 */

import { sessionState } from "@core/session-state.js";
import { assetResolver } from "@core/asset-resolver.js";
import { animationSystem } from "@interface/enhanced-animations.js";
import { notificationManager } from "@interface/notification-manager.js";
import { configManager } from "@core/config-manager.js";
import { turnSystem } from "@core/turn-system.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} HeldCardSlot
 * @property {string} url - URL da imagem da carta
 * @property {Object} config - Configuração completa da carta
 * @property {number} slot - Número do slot (1-6)
 * @property {number|null} cooldown - Cooldown restante (para ultimates)
 * @property {number|null} maxCooldown - Cooldown máximo
 * @property {boolean} isUltimate - É uma ultimate?
 */

class CardHeld {
  constructor() {
    this.initialized = false;

    // Definida em init() via config (2, 4, 6, 8 ou 10)
    this.totalSlots = 6;

    // Mapeamento de elementos DOM
    this.slotElements = new Map();
  }

  /**
   * Retorna os IDs de jogadores ativos do SessionState
   * @private
   * @returns {string[]}
   */
  _getPlayerIds() {
    return Object.keys(sessionState.getAllPlayers());
  }

  /**
   * Inicializa o sistema de cartas seguradas
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ CardHeld já foi inicializado");
      return;
    }

    console.log("🃏 CardHeld inicializando...");

    // Lê quantidade de slots da config (2, 4, 6, 8 ou 10)
    this.totalSlots = configManager.get("general.handSlots") ?? 6;
    console.log(`  🎴 Total de slots por jogador: ${this.totalSlots}`);

    // Injeta slots extras no DOM se handSlots > 6 (HTML base tem 6)
    this._renderExtraHandSlots();

    // Registra todos os slots do DOM
    this._registerSlotElements();

    // Configura listeners de eventos
    this._setupEventListeners();

    // Configura interações visuais
    this._setupSlotInteractions();

    turnSystem.on(() => {
      this.processTurnDurations();
      this.processUltimateCooldowns();
    });

    this.initialized = true;
    console.log("✅ CardHeld inicializado");
    console.log(`  📊 ${this.slotElements.size} slots registrados`);
  }

  /**
   * Injeta elementos .held-card extras no DOM para slots além de 6.
   * Novos slots são inseridos ao final de cada .hand-row.
   * @private
   */
  _renderExtraHandSlots() {
    if (this.totalSlots <= 6) return; // HTML base já tem 6

    this._getPlayerIds().forEach((playerId) => {
      const handRow = document.querySelector(`#${playerId} .hand-row`);
      if (!handRow) return;

      for (let slot = 7; slot <= this.totalSlots; slot++) {
        if (handRow.querySelector(`.held-card[data-slot="${slot}"]`)) continue; // Evita duplicatas

        const el = document.createElement("div");
        el.className = "held-card";
        el.dataset.player = playerId;
        el.dataset.slot = String(slot);
        handRow.appendChild(el);
      }
    });

    console.log(`  🎴 Slots extras injetados: ${this.totalSlots - 6} por jogador`);
  }

  /**
   * Registra elementos de slot do DOM
   * @private
   */
  _registerSlotElements() {
    this._getPlayerIds().forEach((playerId) => {
      for (let slot = 1; slot <= this.totalSlots; slot++) {
        const element = document.querySelector(`.held-card[data-player="${playerId}"][data-slot="${slot}"]`);

        if (element) {
          const key = `${playerId}_${slot}`;
          this.slotElements.set(key, element);
        } else {
          console.warn(`⚠️ Slot não encontrado: ${playerId} - slot ${slot}`);
        }
      }
    });
  }

  /**
   * Configura listeners de eventos
   * @private
   */
  _setupEventListeners() {
    // Listener para mudanças em cartas seguradas no SessionState
    sessionState.on("players.*.heldCards", (newCards, oldCards, path) => {
      const playerId = path.split(".")[1];
      console.log(`🃏 Cartas seguradas atualizadas (${playerId}):`, newCards.length);
    });

    // Listener para limpeza de slot
    document.addEventListener("clear-held-slot", (e) => {
      const { player, slot } = e.detail || {};
      if (player && slot) {
        this.clearSlot(player, slot);
      }
    });
  }

  /**
   * Configura interações visuais dos slots
   * @private
   */
  _setupSlotInteractions() {
    this.slotElements.forEach((element, key) => {
      const [playerId, slotStr] = key.split("_");
      const slot = parseInt(slotStr, 10);

      // Click: Abre modal de carta segurada ou permite adicionar
      element.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this._handleSlotClick(playerId, slot, element);
      });

      // Context Menu: Remove carta
      element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.clearSlot(playerId, slot);
      });

      // Hover: Mostra tooltip
      element.addEventListener("mouseenter", async () => {
        await this._showSlotTooltip(playerId, slot, element);
      });

      element.addEventListener("mouseleave", () => {
        this._hideSlotTooltip();
      });
    });
  }

  // ============================================
  // ADICIONAR CARTA A SLOT
  // ============================================

  /**
   * Adiciona carta a um slot (encontra vazio ou permite substituir)
   * @param {string} playerId
   * @param {string} cardUrl - URL da imagem da carta
   * @param {Object} cardConfig - Configuração da carta
   * @returns {Promise<boolean>}
   */
  async addCard(playerId, cardUrl, cardConfig) {
    try {
      console.log(`🃏 Adicionando carta ao ${playerId}:`, cardConfig.tipo);

      // Valida configuração
      if (!cardConfig || !cardConfig.tipo) {
        console.error("❌ Configuração de carta inválida");
        return false;
      }

      // Procura slot vazio
      const emptySlot = this._findEmptySlot(playerId);

      if (emptySlot !== null) {
        // Adiciona ao slot vazio
        return await this._assignToSlot(playerId, emptySlot, cardUrl, cardConfig);
      } else {
        // Mostra modal de substituição
        const selectedSlot = await this._showReplaceModal(playerId, cardUrl, cardConfig);

        if (selectedSlot !== null) {
          return await this._assignToSlot(playerId, selectedSlot, cardUrl, cardConfig);
        }

        console.log("❌ Jogador cancelou substituição de slot");
        return false;
      }
    } catch (error) {
      console.error("❌ Erro ao adicionar carta:", error);
      return false;
    }
  }

  /**
   * Atribui carta a um slot específico
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @param {string} cardUrl
   * @param {Object} cardConfig
   * @returns {Promise<boolean>}
   */
  async _assignToSlot(playerId, slot, cardUrl, cardConfig) {
    try {
      // Obtém elemento do slot
      const element = this._getSlotElement(playerId, slot);

      if (!element) {
        console.error(`❌ Elemento de slot não encontrado: ${playerId} - ${slot}`);
        return false;
      }

      // Animação de transferência (se disponível)
      if (animationSystem && animationSystem.animateCardTransfer) {
        await animationSystem.animateCardTransfer(cardUrl, element);
      }

      // Atualiza visual
      element.style.backgroundImage = `url("${cardUrl}")`;
      element.style.backgroundSize = "cover";
      element.style.backgroundPosition = "center";

      // Cria estrutura de dados
      const heldCard = {
        url: cardUrl,
        config: cardConfig,
        slot: slot,
        cooldown: null,
        maxCooldown: null,
        isUltimate: cardConfig.categoria === "ultimate",
      };

      // Se for ultimate, inicia cooldown
      if (heldCard.isUltimate && cardConfig.ultimateCooldown) {
        heldCard.cooldown = cardConfig.ultimateCooldown;
        heldCard.maxCooldown = cardConfig.ultimateCooldown;

        // Aplica visual de cooldown
        this._applyUltimateCooldown(element, cardConfig.ultimateCooldown);
      }

      // Adiciona ao SessionState
      sessionState.addHeldCard(playerId, heldCard);

      // Feedback visual
      if (animationSystem) {
        const cardType = cardConfig.tipo === "bloqueio" ? "shield" : "buff";
        animationSystem.showEnhancedBuff(playerId, cardConfig.valor, cardType);
      }

      console.log(`✅ Carta adicionada ao ${playerId} - slot ${slot}`);

      return true;
    } catch (error) {
      console.error("❌ Erro ao atribuir carta ao slot:", error);
      return false;
    }
  }

  /**
   * Procura slot vazio
   * @private
   * @param {string} playerId
   * @returns {number|null} Número do slot ou null
   */
  _findEmptySlot(playerId) {
    for (let slot = 1; slot <= this.totalSlots; slot++) {
      const element = this._getSlotElement(playerId, slot);

      if (!element) continue;

      const bgImage = element.style.backgroundImage;

      if (!bgImage || bgImage === "none" || bgImage === "") {
        return slot;
      }
    }

    return null;
  }

  /**
   * Mostra modal de substituição de slot
   * @private
   * @param {string} playerId
   * @param {string} cardUrl
   * @param {Object} cardConfig
   * @returns {Promise<number|null>}
   */
  async _showReplaceModal(playerId, cardUrl, cardConfig) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "slot-replace-modal";

      const slots = [];

      for (let slot = 1; slot <= this.totalSlots; slot++) {
        const element = this._getSlotElement(playerId, slot);
        if (element) {
          const bg = element.style.backgroundImage;
          const url = bg ? bg.slice(5, -2) : ""; // Remove url("")

          slots.push({ slot, element, url });
        }
      }

      modal.innerHTML = `
        <div class="slot-replace-container">
          <h3>${languageManager.translate("card_held.replace_title")}</h3>
          <div class="slot-replace-new-card">
            <p>${languageManager.translate("card_held.new_card")}</p>
            <img src="${cardUrl}" alt="Nova carta">
            <span>${cardConfig.tipo} - ${cardConfig.valor}</span>
          </div>
          <div class="slot-options-grid">
            ${slots
              .map(
                (s) => `
              <div data-slot="${s.slot}" class="slot-option">
                <img src="${s.url}" alt="Slot ${s.slot}">
                <div class="slot-label">${languageManager.translate("card_held.slot_label").replace("{slot}", s.slot)}</div>
              </div>
            `,
              )
              .join("")}
          </div>
          <button class="slot-cancel-btn">${languageManager.translate("notification.cancel")}</button>
        </div>
      `;

      document.body.appendChild(modal);

      // Listeners
      modal.querySelectorAll("[data-slot]").forEach((el) => {
        el.addEventListener("click", () => {
          const slot = parseInt(el.getAttribute("data-slot"), 10);
          document.body.removeChild(modal);
          resolve(slot);
        });
      });

      modal.querySelector(".slot-cancel-btn").addEventListener("click", () => {
        document.body.removeChild(modal);
        resolve(null);
      });

      // Fecha ao clicar fora
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
          resolve(null);
        }
      });
    });
  }

  // ============================================
  // REMOVER/LIMPAR CARTA
  // ============================================

  /**
   * Remove carta de um slot
   * @param {string} playerId
   * @param {number} slot
   * @returns {boolean}
   */
  clearSlot(playerId, slot) {
    try {
      // Remove do SessionState
      sessionState.removeHeldCard(playerId, slot);

      // Limpa visual
      const element = this._getSlotElement(playerId, slot);

      if (element) {
        element.style.backgroundImage = "none";

        // Remove classes de cooldown
        element.classList.remove("ultimate-cooldown", "ultimate-ready");
        element.style.removeProperty("--ultimate-progress");

        delete element.dataset.ultimateCooldown;
        delete element.dataset.ultimateTurnsRemaining;
      }

      console.log(`🗑️ Slot limpo: ${playerId} - ${slot}`);

      return true;
    } catch (error) {
      console.error("❌ Erro ao limpar slot:", error);
      return false;
    }
  }

  /**
   * Limpa todos os slots de um jogador
   * @param {string} playerId
   */
  clearAllSlots(playerId) {
    console.log(`🗑️ Limpando todos os slots de ${playerId}`);

    for (let slot = 1; slot <= this.totalSlots; slot++) {
      this.clearSlot(playerId, slot);
    }
  }

  // ============================================
  // COOLDOWNS DE ULTIMATE
  // ============================================

  /**
   * Aplica visual de cooldown de ultimate
   * @private
   * @param {HTMLElement} element
   * @param {number} totalTurns
   */
  _applyUltimateCooldown(element, totalTurns) {
    element.dataset.ultimateCooldown = totalTurns;
    element.dataset.ultimateTurnsRemaining = totalTurns;
    element.classList.add("ultimate-cooldown");

    // Atualiza barra de progresso
    this._updateUltimateCooldownVisual(element, totalTurns, totalTurns);

    console.log(`⏳ Ultimate cooldown iniciado: ${totalTurns} turnos`);
  }

  /**
   * Atualiza visual de cooldown
   * @private
   * @param {HTMLElement} element
   * @param {number} turnsRemaining
   * @param {number} totalTurns
   */
  _updateUltimateCooldownVisual(element, turnsRemaining, totalTurns) {
    if (!element) return;

    const progress = ((totalTurns - turnsRemaining) / totalTurns) * 100;
    element.style.setProperty("--ultimate-progress", `${100 - progress}%`);

    console.log(`🎨 Ultimate visual: ${turnsRemaining}/${totalTurns} turnos (${progress.toFixed(0)}% pronto)`);
  }

  /**
   * Processa cooldowns de ultimate (chamado a cada turno)
   */
  processUltimateCooldowns() {
    console.log("⏳ Processando cooldowns de ultimate...");

    let ultimatesReady = 0;

    this._getPlayerIds().forEach((playerId) => {
      const player = sessionState.getPlayer(playerId);
      if (!player || !player.heldCards) return;

      player.heldCards.forEach((card) => {
        if (card.isUltimate && card.cooldown !== null && card.cooldown > 0) {
          const oldCooldown = card.cooldown;
          card.cooldown--;

          // Atualiza visual
          const element = this._getSlotElement(playerId, card.slot);

          if (element) {
            element.dataset.ultimateTurnsRemaining = card.cooldown;
            this._updateUltimateCooldownVisual(element, card.cooldown, card.maxCooldown);
          }

          console.log(`⏳ ${playerId} - Slot ${card.slot}: ${oldCooldown} → ${card.cooldown} turnos`);

          // Se chegou a 0, marca como pronta
          if (card.cooldown === 0) {
            this._markUltimateReady(playerId, card.slot, element);
            ultimatesReady++;
          }
        }
      });
    });

    if (ultimatesReady > 0) {
      console.log(`✨ ${ultimatesReady} ultimate(s) pronta(s)!`);
    }
  }

  /**
   * Marca ultimate como pronta
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @param {HTMLElement} element
   */
  _markUltimateReady(playerId, slot, element) {
    if (!element) return;

    element.classList.remove("ultimate-cooldown");
    element.style.removeProperty("--ultimate-progress");
    element.classList.add("ultimate-ready");

    // Animação de pronto
    element.animate(
      [
        { filter: "brightness(1) drop-shadow(0 0 0px gold)", transform: "scale(1)" },
        { filter: "brightness(1.8) drop-shadow(0 0 20px gold)", transform: "scale(1.15)" },
        { filter: "brightness(1.3) drop-shadow(0 0 10px gold)", transform: "scale(1.05)" },
        { filter: "brightness(1) drop-shadow(0 0 0px gold)", transform: "scale(1)" },
      ],
      {
        duration: 1200,
        easing: "ease-in-out",
        iterations: 1,
      },
    );

    // Áudio
    try {
      const audioManager = window.audioManager;
      if (audioManager) {
        audioManager.playSFX(assetResolver.appAsset("ui/", "ultimate_ready.mp3"), false);
      }
    } catch (e) {
      console.warn("Som de ultimate ready não disponível");
    }

    // Notificação
    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: languageManager.translate("card_held.ultimate_ready").replace("{slot}", slot),
        duration: 5000,
      });
    }

    console.log(`✨ ${playerId} - Ultimate pronta no slot ${slot}!`);
  }

  // ============================================
  // PROCESSAMENTO DE DURAÇÕES
  // ============================================

  /**
   * Processa durações de cartas (turnos)
   */
  processTurnDurations() {
    console.log("🔄 Processando durações de cartas...");

    let cardsExpired = 0;

    this._getPlayerIds().forEach((playerId) => {
      const player = sessionState.getPlayer(playerId);
      if (!player || !player.heldCards) return;

      // Itera em cópia para evitar problemas ao remover
      const cards = [...player.heldCards];

      cards.forEach((card) => {
        const duracao = card.config?.duração || card.config?.duracao;

        if (duracao && duracao.tipo === "turnos") {
          duracao.valor = Math.max(0, (Number(duracao.valor) || 0) - 1);

          console.log(`⏳ ${playerId} - Slot ${card.slot}: ${duracao.valor} turno(s) restante(s)`);

          if (duracao.valor <= 0) {
            this.clearSlot(playerId, card.slot);
            cardsExpired++;
          }
        }
      });
    });

    if (cardsExpired > 0) {
      console.log(`🗑️ ${cardsExpired} carta(s) expirada(s)`);
    }
  }

  /**
   * Consome uso de uma carta (para durações de "usos")
   * @param {string} playerId
   * @param {number} slot
   * @returns {boolean} True se carta ainda existe
   */
  consumeUse(playerId, slot) {
    const player = sessionState.getPlayer(playerId);
    if (!player || !player.heldCards) return false;

    const card = player.heldCards.find((c) => c.slot === slot);
    if (!card) return false;

    const duracao = card.config?.duração || card.config?.duracao;

    if (!duracao || duracao.tipo !== "usos") {
      // Sem duração ou não é por usos = consome imediatamente
      this.clearSlot(playerId, slot);
      return false;
    }

    // Reduz uso
    duracao.valor = Math.max(0, (Number(duracao.valor) || 1) - 1);

    console.log(`📊 ${playerId} - Slot ${slot}: ${duracao.valor} uso(s) restante(s)`);

    if (duracao.valor <= 0) {
      this.clearSlot(playerId, slot);
      return false;
    }

    return true;
  }

  // ============================================
  // GETTERS E CONSULTAS
  // ============================================

  /**
   * Obtém carta de um slot específico
   * @param {string} playerId
   * @param {number} slot
   * @returns {HeldCardSlot|null}
   */
  getCard(playerId, slot) {
    const player = sessionState.getPlayer(playerId);
    if (!player || !player.heldCards) return null;

    return player.heldCards.find((c) => c.slot === slot) || null;
  }

  /**
   * Obtém todas as cartas de um jogador
   * @param {string} playerId
   * @returns {Array<HeldCardSlot>}
   */
  getAllCards(playerId) {
    const player = sessionState.getPlayer(playerId);
    if (!player || !player.heldCards) return [];

    return [...player.heldCards];
  }

  /**
   * Obtém cartas de um tipo específico
   * @param {string} playerId
   * @param {string} type - 'buff', 'bloqueio', etc
   * @returns {Array<HeldCardSlot>}
   */
  getCardsByType(playerId, type) {
    const cards = this.getAllCards(playerId);
    return cards.filter((c) => c.config && c.config.tipo === type);
  }

  /**
   * Verifica se jogador tem slot vazio
   * @param {string} playerId
   * @returns {boolean}
   */
  hasEmptySlot(playerId) {
    return this._findEmptySlot(playerId) !== null;
  }

  /**
   * Conta slots usados
   * @param {string} playerId
   * @returns {number}
   */
  countUsedSlots(playerId) {
    return this.getAllCards(playerId).length;
  }

  /**
   * Obtém elemento de slot do DOM
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @returns {HTMLElement|null}
   */
  _getSlotElement(playerId, slot) {
    const key = `${playerId}_${slot}`;
    return this.slotElements.get(key) || null;
  }

  // ============================================
  // INTERAÇÕES VISUAIS
  // ============================================

  /**
   * Manipula clique em slot
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @param {HTMLElement} element
   */
  async _handleSlotClick(playerId, slot, _element) {
    const card = this.getCard(playerId, slot);

    if (!card) {
      // Slot vazio - Mostra modal de seleção de cartas viradas
      console.log(`📭 Slot vazio clicado: ${playerId} - ${slot}`);
      // Dispara evento para ser tratado pelo card-manager
      document.dispatchEvent(
        new CustomEvent("open-held-card-modal", {
          detail: { playerId, slot },
        }),
      );
      return;
    }

    // Slot com carta - Usa a carta
    console.log(`🃏 Carta clicada: ${playerId} - ${slot}`);

    // Dispara evento para usar carta
    document.dispatchEvent(
      new CustomEvent("use-held-card", {
        detail: { playerId, slot, card },
      }),
    );
  }

  /**
   * Mostra tooltip de slot
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @param {HTMLElement} element
   */
  async _showSlotTooltip(playerId, slot, _element) {
    const card = this.getCard(playerId, slot);
    if (!card) return;

    const tooltip = document.getElementById("globalCardTooltip");
    if (!tooltip) return;

    const config = card.config;
    const duracao = config.duração || config.duracao;
    const tipo = (config.tipo || "").toLowerCase();
    const nomeCarta = config.nome || config.id || config.tipo || "Carta";

    tooltip.innerHTML = `
      <div class="gct-header">
        <span class="gct-name">${nomeCarta}</span>
        <span class="gct-type-badge ${tipo}">${tipo}</span>
      </div>
      <div class="gct-body">
        ${config.descricao ? `<div class="gct-desc">${config.descricao}</div>` : ""}
        <div class="gct-meta">
          <span class="gct-meta-label">${languageManager.translate("card_held.tooltip_value")}</span>
          <span class="gct-meta-value">${config.valor || 0}</span>
        </div>
        ${
          duracao
            ? `
        <div class="gct-meta">
          <span class="gct-meta-label">${languageManager.translate("card_held.tooltip_duration")}</span>
          <span class="gct-meta-value">${duracao.valor || 0} ${duracao.tipo === "turnos" ? languageManager.translate("card_held.tooltip_turns") : duracao.tipo || ""}</span>
        </div>`
            : ""
        }
        ${card.isUltimate ? `<div class="gct-ultimate">${languageManager.translate("card_held.tooltip_ultimate")}</div>` : ""}
        ${
          card.cooldown
            ? `
        <div class="gct-meta">
          <span class="gct-meta-label">${languageManager.translate("card_held.tooltip_cooldown")}</span>
          <span class="gct-meta-value">${card.cooldown} ${languageManager.translate("card_held.tooltip_turns")}</span>
        </div>`
            : ""
        }
      </div>
    `;

    tooltip.style.display = "block";
  }

  /**
   * Esconde tooltip
   * @private
   */
  _hideSlotTooltip() {
    const tooltip = document.getElementById("globalCardTooltip");
    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Mostra cartas de um jogador
   * @param {string} playerId
   */
  debugPlayer(playerId) {
    const cards = this.getAllCards(playerId);

    console.log(`🃏 Cartas seguradas (${playerId}):`, {
      total: cards.length,
      empty: this.totalSlots - cards.length,
      cards: cards.map((c) => ({
        slot: c.slot,
        tipo: c.config.tipo,
        valor: c.config.valor,
        ultimate: c.isUltimate,
        cooldown: c.cooldown,
      })),
    });
  }

  /**
   * Debug: Mostra todas as cartas
   */
  debugAll() {
    console.log("🃏 DEBUG DE CARTAS SEGURADAS:");
    this._getPlayerIds().forEach((id) => this.debugPlayer(id));
  }

  /**
   * Debug: Força expiração de cooldowns
   */
  debugExpireAll() {
    console.log("🔥 Expirando todos os cooldowns (DEBUG)");

    this._getPlayerIds().forEach((playerId) => {
      const player = sessionState.getPlayer(playerId);
      if (!player || !player.heldCards) return;

      player.heldCards.forEach((card) => {
        if (card.cooldown !== null) {
          card.cooldown = 0;
          const element = this._getSlotElement(playerId, card.slot);
          if (element) {
            this._markUltimateReady(playerId, card.slot, element);
          }
        }
      });
    });
  }
}

// Singleton
export const cardHeld = new CardHeld();

// Expõe globalmente para debug
window.cardHeld = cardHeld;

console.log("✅ CardHeld carregado");
console.log("💡 Use window.cardHeld.debugAll() para ver cartas seguradas");
console.log("💡 Use window.cardHeld.debugExpireAll() para resetar cooldowns");
