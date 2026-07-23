/**
 * card-cooldowns.js - Sistema de Gerenciamento de Cooldowns de Cartas
 *
 * Responsabilidades:
 * - Gerenciar cooldowns globais de cartas (não limitado a slots)
 * - Rastrear uso de cartas ao longo do jogo
 * - Prevenir uso repetido dentro do cooldown
 * - Sincronizar com sistema de turnos
 * - Fornecer feedback visual de cooldown
 * - Histórico de uso de cartas
 * - Sistema de "uma vez por jogo"
 *
 * @module CardCooldowns
 */

import { sessionState } from "@core/session-state.js";
import { notificationManager } from "@interface/notification-manager.js";
import { turnSystem } from "@core/turn-system.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} CardCooldownEntry
 * @property {number} cardNumber - Número da carta
 * @property {number} cooldownRemaining - Turnos restantes
 * @property {number} maxCooldown - Cooldown máximo
 * @property {number} usedAtTurn - Turno em que foi usada
 * @property {boolean} oneTimeOnly - Só pode ser usada uma vez?
 * @property {boolean} canUseAgain - Pode usar novamente?
 */

/**
 * @typedef {Object} CardUseHistory
 * @property {number} cardNumber - Número da carta
 * @property {number} turn - Turno de uso
 * @property {string} playerId - Quem usou
 * @property {string} targetId - Alvo (se aplicável)
 * @property {number} value - Valor do efeito
 * @property {string} type - Tipo da carta
 */

class CardCooldowns {
  constructor() {
    this.initialized = false;

    // Armazena cooldowns ativos por carta
    // Map<cardNumber, CooldownEntry>
    this.activeCooldowns = new Map();

    // Armazena cartas de uso único já utilizadas
    // Set<cardNumber>
    this.oneTimeUsedCards = new Set();

    // Histórico completo de uso de cartas
    // Array<CardUseHistory>
    this.useHistory = [];

    // Limite de histórico
    this.maxHistorySize = 200;

    // Estatísticas
    this.stats = {
      totalUses: 0,
      blockedByCD: 0,
      blockedByOneTime: 0,
    };
  }

  /**
   * Inicializa o sistema de cooldowns
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ CardCooldowns já foi inicializado");
      return;
    }

    console.log("⏳ CardCooldowns inicializando...");

    // Configura listeners de eventos
    this._setupEventListeners();

    this.initialized = true;
    console.log("✅ CardCooldowns inicializado");
  }

  /**
   * Configura listeners de eventos
   * @private
   */
  _setupEventListeners() {
    // Listener para avanço de turno
    turnSystem.on(() => this.processTurnCooldowns());

    // Listener para uso de carta
    document.addEventListener("card-used", (e) => {
      const { cardNumber, playerId, targetId, value, type } = e.detail || {};

      if (cardNumber) {
        this._recordCardUse(cardNumber, playerId, targetId, value, type);
      }
    });
  }

  // ============================================
  // VERIFICAÇÃO DE COOLDOWN
  // ============================================

  /**
   * Verifica se carta pode ser usada
   * @param {number} cardNumber - Número da carta
   * @param {Object} cardConfig - Configuração da carta
   * @returns {Object} { canUse: boolean, reason?: string, turnsRemaining?: number }
   */
  canUseCard(cardNumber, cardConfig) {
    // 1. Verifica se é carta de uso único já usada
    if (this._isOneTimeCard(cardConfig) && this.oneTimeUsedCards.has(cardNumber)) {
      this.stats.blockedByOneTime++;

      return {
        canUse: false,
        reason: "one_time_used",
        message: languageManager.translate("card_cooldowns.one_time_error"),
      };
    }

    // 2. Verifica se está em cooldown ativo
    if (this.activeCooldowns.has(cardNumber)) {
      const cooldown = this.activeCooldowns.get(cardNumber);

      if (cooldown.cooldownRemaining > 0) {
        this.stats.blockedByCD++;

        return {
          canUse: false,
          reason: "cooldown",
          message: languageManager
            .translate("card_cooldowns.cooldown_error")
            .replace("{remaining}", cooldown.cooldownRemaining),
          turnsRemaining: cooldown.cooldownRemaining,
        };
      }
    }

    // 3. Carta pode ser usada
    return {
      canUse: true,
    };
  }

  /**
   * Verifica se é carta de uso único
   * @private
   * @param {Object} cardConfig
   * @returns {boolean}
   */
  _isOneTimeCard(cardConfig) {
    // Verifica se tem flag explícita
    if (cardConfig.oneTimeOnly === true) {
      return true;
    }

    // Verifica se duração é "nenhuma" e categoria é "special" (heurística)
    const duracao = cardConfig.duração || cardConfig.duracao;

    if (cardConfig.categoria === "special" && duracao && duracao.tipo === "nenhuma") {
      return true;
    }

    return false;
  }

  // ============================================
  // REGISTRAR USO DE CARTA
  // ============================================

  /**
   * Registra uso de uma carta e inicia cooldown
   * @param {number} cardNumber
   * @param {Object} cardConfig
   * @param {string} playerId
   * @param {string} [targetId]
   * @returns {boolean}
   */
  registerCardUse(cardNumber, cardConfig, playerId, targetId = null) {
    try {
      console.log(`⏳ Registrando uso de carta ${cardNumber}`);

      // 1. Marca como usada se for one-time
      if (this._isOneTimeCard(cardConfig)) {
        this.oneTimeUsedCards.add(cardNumber);
        console.log(`🔒 Carta ${cardNumber} marcada como usada (uso único)`);
      }

      // 2. Inicia cooldown (se houver)
      const cooldownTurns = cardConfig.cooldown || cardConfig.ultimateCooldown || 0;

      if (cooldownTurns > 0) {
        this._startCooldown(cardNumber, cooldownTurns);
      }

      // 3. Registra no histórico
      this._recordCardUse(cardNumber, playerId, targetId, cardConfig.valor, cardConfig.tipo);

      // 4. Atualiza estatísticas
      this.stats.totalUses++;

      console.log(`✅ Uso de carta ${cardNumber} registrado`);

      return true;
    } catch (error) {
      console.error("❌ Erro ao registrar uso de carta:", error);
      return false;
    }
  }

  /**
   * Inicia cooldown de uma carta
   * @private
   * @param {number} cardNumber
   * @param {number} turns
   */
  _startCooldown(cardNumber, turns) {
    const currentTurn = sessionState.getGameState().turn;

    const cooldownEntry = {
      cardNumber: cardNumber,
      cooldownRemaining: turns,
      maxCooldown: turns,
      usedAtTurn: currentTurn,
      canUseAgain: true,
    };

    this.activeCooldowns.set(cardNumber, cooldownEntry);

    console.log(`⏳ Cooldown iniciado: carta ${cardNumber} - ${turns} turnos`);

    // Feedback visual (opcional)
    if (notificationManager) {
      notificationManager.show({
        type: "main",
        text: languageManager
          .translate("card_cooldowns.cooldown_started")
          .replace("{card}", cardNumber)
          .replace("{turns}", turns),
        duration: 3000,
      });
    }
  }

  /**
   * Registra uso no histórico
   * @private
   * @param {number} cardNumber
   * @param {string} playerId
   * @param {string|null} targetId
   * @param {number} value
   * @param {string} type
   */
  _recordCardUse(cardNumber, playerId, targetId, value, type) {
    const currentTurn = sessionState.getGameState().turn;

    const historyEntry = {
      cardNumber: cardNumber,
      turn: currentTurn,
      playerId: playerId,
      targetId: targetId,
      value: value,
      type: type,
      timestamp: Date.now(),
    };

    this.useHistory.push(historyEntry);

    // Limita tamanho do histórico
    if (this.useHistory.length > this.maxHistorySize) {
      this.useHistory.shift();
    }

    console.log(`📝 Uso registrado no histórico: carta ${cardNumber} (turno ${currentTurn})`);
  }

  // ============================================
  // PROCESSAMENTO DE COOLDOWNS
  // ============================================

  /**
   * Processa cooldowns a cada turno
   */
  processTurnCooldowns() {
    if (this.activeCooldowns.size === 0) {
      return;
    }

    console.log(`⏳ Processando ${this.activeCooldowns.size} cooldown(s)...`);

    let cooldownsExpired = 0;

    // Itera sobre cópia para poder remover durante iteração
    const entries = Array.from(this.activeCooldowns.entries());

    entries.forEach(([cardNumber, cooldown]) => {
      const oldRemaining = cooldown.cooldownRemaining;
      cooldown.cooldownRemaining = Math.max(0, cooldown.cooldownRemaining - 1);

      console.log(`  Carta ${cardNumber}: ${oldRemaining} → ${cooldown.cooldownRemaining} turnos`);

      // Se chegou a 0, remove cooldown
      if (cooldown.cooldownRemaining === 0) {
        this._expireCooldown(cardNumber);
        cooldownsExpired++;
      }
    });

    if (cooldownsExpired > 0) {
      console.log(`✅ ${cooldownsExpired} cooldown(s) expirado(s)`);
    }
  }

  /**
   * Expira um cooldown
   * @private
   * @param {number} cardNumber
   */
  _expireCooldown(cardNumber) {
    this.activeCooldowns.delete(cardNumber);

    console.log(`✨ Carta ${cardNumber} pronta novamente!`);

    // Feedback visual (opcional)
    if (notificationManager) {
      notificationManager.show({
        type: "main",
        text: languageManager.translate("card_cooldowns.ready").replace("{card}", cardNumber),
        duration: 4000,
      });
    }
  }

  // ============================================
  // CONSULTAS E GETTERS
  // ============================================

  /**
   * Obtém cooldown de uma carta
   * @param {number} cardNumber
   * @returns {CooldownEntry|null}
   */
  getCooldown(cardNumber) {
    return this.activeCooldowns.get(cardNumber) || null;
  }

  /**
   * Obtém cooldown restante
   * @param {number} cardNumber
   * @returns {number} Turnos restantes (0 se não está em cooldown)
   */
  getCooldownRemaining(cardNumber) {
    const cooldown = this.getCooldown(cardNumber);
    return cooldown ? cooldown.cooldownRemaining : 0;
  }

  /**
   * Verifica se carta está em cooldown
   * @param {number} cardNumber
   * @returns {boolean}
   */
  isInCooldown(cardNumber) {
    return this.getCooldownRemaining(cardNumber) > 0;
  }

  /**
   * Verifica se carta foi usada (para one-time)
   * @param {number} cardNumber
   * @returns {boolean}
   */
  wasUsed(cardNumber) {
    return this.oneTimeUsedCards.has(cardNumber);
  }

  /**
   * Obtém todos os cooldowns ativos
   * @returns {Array<CooldownEntry>}
   */
  getActiveCooldowns() {
    return Array.from(this.activeCooldowns.values());
  }

  /**
   * Obtém histórico de uso de uma carta
   * @param {number} cardNumber
   * @returns {Array<CardUseHistory>}
   */
  getCardHistory(cardNumber) {
    return this.useHistory.filter((entry) => entry.cardNumber === cardNumber);
  }

  /**
   * Obtém histórico de uso de um jogador
   * @param {string} playerId
   * @returns {Array<CardUseHistory>}
   */
  getPlayerHistory(playerId) {
    return this.useHistory.filter((entry) => entry.playerId === playerId);
  }

  /**
   * Obtém histórico recente (últimos N usos)
   * @param {number} [limit=10]
   * @returns {Array<CardUseHistory>}
   */
  getRecentHistory(limit = 10) {
    return this.useHistory.slice(-limit);
  }

  /**
   * Conta quantas vezes uma carta foi usada
   * @param {number} cardNumber
   * @returns {number}
   */
  countCardUses(cardNumber) {
    return this.useHistory.filter((entry) => entry.cardNumber === cardNumber).length;
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      activeCooldowns: this.activeCooldowns.size,
      oneTimeUsed: this.oneTimeUsedCards.size,
      historySize: this.useHistory.length,
    };
  }

  // ============================================
  // MANIPULAÇÃO MANUAL (DEBUG/ADMIN)
  // ============================================

  /**
   * Força expiração de cooldown de uma carta
   * @param {number} cardNumber
   * @returns {boolean}
   */
  forceExpireCooldown(cardNumber) {
    if (this.activeCooldowns.has(cardNumber)) {
      this._expireCooldown(cardNumber);
      console.log(`🔥 Cooldown forçado a expirar: carta ${cardNumber}`);
      return true;
    }

    console.warn(`⚠️ Carta ${cardNumber} não está em cooldown`);
    return false;
  }

  /**
   * Força expiração de todos os cooldowns
   */
  forceExpireAllCooldowns() {
    console.log("🔥 Expirando TODOS os cooldowns (ADMIN)");

    const cardNumbers = Array.from(this.activeCooldowns.keys());

    cardNumbers.forEach((num) => {
      this._expireCooldown(num);
    });

    console.log(`✅ ${cardNumbers.length} cooldown(s) expirados`);
  }

  /**
   * Reseta marca de uso único de uma carta
   * @param {number} cardNumber
   * @returns {boolean}
   */
  resetOneTimeCard(cardNumber) {
    if (this.oneTimeUsedCards.has(cardNumber)) {
      this.oneTimeUsedCards.delete(cardNumber);
      console.log(`🔓 Carta ${cardNumber} pode ser usada novamente`);
      return true;
    }

    console.warn(`⚠️ Carta ${cardNumber} não estava marcada como usada`);
    return false;
  }

  /**
   * Reseta todas as cartas de uso único
   */
  resetAllOneTimeCards() {
    const count = this.oneTimeUsedCards.size;
    this.oneTimeUsedCards.clear();
    console.log(`🔓 ${count} carta(s) de uso único resetadas`);
  }

  /**
   * Limpa histórico de uso
   * @param {number} [keepLast=0] - Quantos registros manter
   */
  clearHistory(keepLast = 0) {
    if (keepLast > 0) {
      this.useHistory = this.useHistory.slice(-keepLast);
      console.log(`🧹 Histórico limpo (mantidos últimos ${keepLast})`);
    } else {
      this.useHistory = [];
      console.log("🧹 Histórico completamente limpo");
    }
  }

  /**
   * Reset completo (volta ao estado inicial)
   */
  reset() {
    this.activeCooldowns.clear();
    this.oneTimeUsedCards.clear();
    this.useHistory = [];

    this.stats = {
      totalUses: 0,
      blockedByCD: 0,
      blockedByOneTime: 0,
    };

    console.log("🔄 CardCooldowns resetado completamente");
  }

  // ============================================
  // PERSISTÊNCIA (OPCIONAL)
  // ============================================

  /**
   * Exporta estado atual (para salvar progresso)
   * @returns {Object}
   */
  exportState() {
    return {
      activeCooldowns: Array.from(this.activeCooldowns.entries()),
      oneTimeUsedCards: Array.from(this.oneTimeUsedCards),
      useHistory: this.useHistory,
      stats: this.stats,
      exportedAt: Date.now(),
    };
  }

  /**
   * Importa estado salvo
   * @param {Object} state
   * @returns {boolean}
   */
  importState(state) {
    try {
      if (!state || typeof state !== "object") {
        throw new Error("Estado inválido");
      }

      // Restaura cooldowns
      if (state.activeCooldowns) {
        this.activeCooldowns = new Map(state.activeCooldowns);
      }

      // Restaura cartas de uso único
      if (state.oneTimeUsedCards) {
        this.oneTimeUsedCards = new Set(state.oneTimeUsedCards);
      }

      // Restaura histórico
      if (state.useHistory) {
        this.useHistory = state.useHistory;
      }

      // Restaura stats
      if (state.stats) {
        this.stats = state.stats;
      }

      console.log("✅ Estado importado com sucesso");
      console.log(`  Cooldowns: ${this.activeCooldowns.size}`);
      console.log(`  One-time usadas: ${this.oneTimeUsedCards.size}`);
      console.log(`  Histórico: ${this.useHistory.length} entradas`);

      return true;
    } catch (error) {
      console.error("❌ Erro ao importar estado:", error);
      return false;
    }
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Mostra cooldowns ativos
   */
  debugActiveCooldowns() {
    console.log(`⏳ Cooldowns Ativos (${this.activeCooldowns.size}):`);

    if (this.activeCooldowns.size === 0) {
      console.log("  (nenhum)");
      return;
    }

    this.activeCooldowns.forEach((cooldown, cardNumber) => {
      console.log(`  Carta ${cardNumber}:`, {
        restante: cooldown.cooldownRemaining,
        max: cooldown.maxCooldown,
        usadoNoTurno: cooldown.usedAtTurn,
      });
    });
  }

  /**
   * Debug: Mostra cartas de uso único usadas
   */
  debugOneTimeCards() {
    console.log(`🔒 Cartas de Uso Único Usadas (${this.oneTimeUsedCards.size}):`);

    if (this.oneTimeUsedCards.size === 0) {
      console.log("  (nenhuma)");
      return;
    }

    console.log(`  Cartas: ${Array.from(this.oneTimeUsedCards).join(", ")}`);
  }

  /**
   * Debug: Mostra histórico recente
   * @param {number} [limit=10]
   */
  debugHistory(limit = 10) {
    console.log(`📜 Histórico Recente (últimos ${limit}):`);

    const recent = this.getRecentHistory(limit);

    if (recent.length === 0) {
      console.log("  (vazio)");
      return;
    }

    recent.forEach((entry, index) => {
      console.log(`  [${index + 1}] Turno ${entry.turn}:`, {
        carta: entry.cardNumber,
        tipo: entry.type,
        jogador: entry.playerId,
        alvo: entry.targetId || "N/A",
        valor: entry.value,
      });
    });
  }

  /**
   * Debug: Mostra estatísticas completas
   */
  debugStats() {
    console.log("📊 Estatísticas de Cooldowns:");

    const stats = this.getStats();

    console.log("  Total de usos:", stats.totalUses);
    console.log("  Bloqueados por CD:", stats.blockedByCD);
    console.log("  Bloqueados por one-time:", stats.blockedByOneTime);
    console.log("  Cooldowns ativos:", stats.activeCooldowns);
    console.log("  One-time usadas:", stats.oneTimeUsed);
    console.log("  Tamanho do histórico:", stats.historySize);

    // Taxa de bloqueio
    if (stats.totalUses > 0) {
      const totalBlocked = stats.blockedByCD + stats.blockedByOneTime;
      const totalAttempts = stats.totalUses + totalBlocked;
      const blockRate = ((totalBlocked / totalAttempts) * 100).toFixed(2);

      console.log(`  Taxa de bloqueio: ${blockRate}%`);
    }
  }

  /**
   * Debug completo
   */
  debug() {
    console.log("\n⏳ === CARD COOLDOWNS DEBUG ===");
    this.debugActiveCooldowns();
    console.log("");
    this.debugOneTimeCards();
    console.log("");
    this.debugHistory(5);
    console.log("");
    this.debugStats();
    console.log("================================\n");
  }
}

// Singleton
export const cardCooldowns = new CardCooldowns();

// Expõe globalmente para debug
window.cardCooldowns = cardCooldowns;

console.log("✅ CardCooldowns carregado");
console.log("💡 Use window.cardCooldowns.debug() para ver estado completo");
console.log("💡 Use window.cardCooldowns.forceExpireAllCooldowns() para resetar");
