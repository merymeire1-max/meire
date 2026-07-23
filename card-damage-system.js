/**
 * card-damage-system.js - Sistema de Dano em Duas Etapas
 *
 * Responsabilidades:
 * - Preparar cartas de dano com /game usar slot X
 * - Aplicar dano com /game atak
 * - Gerenciar timeout e estado de ataques preparados
 * - Calcular dano com base em atributos do jogador
 *
 * Fluxo:
 * 1. /game usar slot X -> Prepara a carta de dano
 * 2. /game atak [target] -> Aplica o dano ao adversário
 * 3. /game status-ataque -> Mostra status do ataque preparado
 * 4. /game cancelar-ataque -> Cancela o ataque preparado
 *
 * @module CardDamageSystem
 */

/**
 * @typedef {Object} PreparedAttack
 * @property {string} playerId - ID do jogador que preparou
 * @property {number} slot - Slot da carta
 * @property {Object} cardData - Dados da carta
 * @property {number} timestamp - Timestamp de quando foi preparado
 * @property {Object} damage - Objeto com cálculos de dano
 * @property {string} status - Estado ('prepared', 'cancelled', 'expired')
 */

class CardDamageSystem {
  constructor() {
    this.preparedAttacks = new Map(); // { playerId => PreparedAttack }
    this.ATTACK_TIMEOUT = 30000; // 30 segundos
    this.config = {
      debug: true,
      applyToMascote: true, // Aplica 60% do dano ao mascote
      mascotePercentage: 0.6,
    };
  }

  /**
   * Ao usar /game usar slot X, se for dano, apenas PREPARA o ataque
   * @param {string} playerId - ID do jogador
   * @param {number} slot - Número do slot
   * @param {Object} cardData - Dados da carta
   * @returns {Object} Resultado da operação
   */
  async prepareCard(playerId, slot, cardData) {
    if (!cardData || !cardData.config) {
      return {
        success: false,
        message: "❌ Dados da carta inválidos!",
        action: "INVALID_CARD_DATA",
      };
    }

    // Se não for dano, executa normalmente
    if (cardData.config.tipo !== "dano") {
      return {
        success: true,
        message: `✅ Carta "${cardData.config.nome}" usada!`,
        action: "CARD_EXECUTED_NORMAL",
        cardName: cardData.config.nome,
        isNormal: true,
      };
    }

    // Se for dano, PREPARA o ataque
    try {
      const damage = this.calculateDamage(playerId, cardData);

      const preparedAttack = {
        playerId,
        slot,
        cardData,
        timestamp: Date.now(),
        damage,
        status: "prepared",
      };

      this.preparedAttacks.set(playerId, preparedAttack);

      if (this.config.debug) {
        console.log(`[CardDamageSystem] Ataque preparado para ${playerId}:`, {
          cardName: cardData.config.nome,
          baseDamage: damage.currentDamage,
          mascoteDamage: damage.mascoteDamage,
          timeout: `${this.ATTACK_TIMEOUT / 1000}s`,
        });
      }

      return {
        success: true,
        message: `⚔️ Carta de dano "${cardData.config.nome}" preparada!<br><small>Execute /game atak [alvo] para aplicar o dano</small>`,
        action: "ATTACK_PREPARED",
        cardName: cardData.config.nome,
        damage: damage.currentDamage,
        mascoteDamage: damage.mascoteDamage,
        timeout: this.ATTACK_TIMEOUT / 1000,
        prepared: preparedAttack,
      };
    } catch (error) {
      console.error("[CardDamageSystem] Erro ao preparar carta:", error);
      return {
        success: false,
        message: "❌ Erro ao preparar a carta de dano!",
        action: "PREPARE_ERROR",
        error: error.message,
      };
    }
  }

  /**
   * Ao usar /game atak, aplica o dano da carta preparada
   * @param {string} playerId - ID do jogador que ataca
   * @param {string} targetId - ID do alvo
   * @returns {Object} Resultado da operação
   */
  async executeAttack(playerId, targetId) {
    const prepared = this.preparedAttacks.get(playerId);

    if (!prepared) {
      return {
        success: false,
        message: "❌ Nenhuma carta de dano preparada!<br><small>Use /game usar slot [número] primeiro</small>",
        action: "NO_PREPARED_ATTACK",
      };
    }

    // Verifica timeout
    const timePassed = Date.now() - prepared.timestamp;
    if (timePassed > this.ATTACK_TIMEOUT) {
      this.preparedAttacks.delete(playerId);
      return {
        success: false,
        message: `⏰ A carta preparada expirou! (${this.ATTACK_TIMEOUT / 1000}s)<br><small>Use /game usar slot [número] novamente</small>`,
        action: "ATTACK_EXPIRED",
      };
    }

    try {
      // Aqui aplicaríamos o dano real no sistema de combate
      const result = await this.applyDamage(playerId, targetId, prepared);

      // Limpa o ataque preparado
      this.preparedAttacks.delete(playerId);

      return result;
    } catch (error) {
      console.error("[CardDamageSystem] Erro ao executar ataque:", error);
      return {
        success: false,
        message: "❌ Erro ao aplicar o dano!",
        action: "ATTACK_ERROR",
        error: error.message,
      };
    }
  }

  /**
   * Calcula o dano da carta
   * @private
   * @param {string} playerId - ID do jogador
   * @param {Object} cardData - Dados da carta
   * @returns {Object} Objeto com cálculos de dano
   */
  calculateDamage(playerId, cardData) {
    const baseCardDamage = cardData.config.valor || 0;
    const cardElement = cardData.config.elemento || cardData.config.categoria || "normal";

    // Bônus de elemento (integrar com seu sistema)
    const elementBonus = this.getElementBonus(playerId, cardElement);

    // Bônus flat (ex: bloquear valor)
    const flatBonus = cardData.config.blValor || 0;

    // Bônus percentual (integrar com buffs do jogador)
    const generalPercent = 0;

    // Multiplicador de evento (crítico, etc)
    const multiply = 1;

    // Cálculo final
    const currentDamage = Math.floor(
      (baseCardDamage + flatBonus) * (1 + generalPercent) * multiply + elementBonus
    );

    // Dano ao mascote (60% por padrão)
    const mascoteDamage = Math.floor(currentDamage * this.config.mascotePercentage);

    return {
      baseCardDamage,
      cardElement,
      elementBonus,
      flatBonus,
      generalPercent,
      multiply,
      currentDamage,
      mascoteDamage,
    };
  }

  /**
   * Obtém bônus de elemento
   * @private
   * @param {string} playerId - ID do jogador
   * @param {string} element - Tipo de elemento
   * @returns {number} Bônus de dano
   */
  getElementBonus(playerId, element) {
    // Implementar integração com sistema de atributos do jogador
    const elementBonusMap = {
      fogo: 20,
      agua: 20,
      eletro: 20,
      planta: 20,
      normal: 0,
    };

    return elementBonusMap[element] || 0;
  }

  /**
   * Aplica o dano real ao adversário
   * @private
   * @param {string} playerId - ID do atacante
   * @param {string} targetId - ID do alvo
   * @param {PreparedAttack} prepared - Dados do ataque preparado
   * @returns {Object} Resultado da aplicação de dano
   */
  async applyDamage(playerId, targetId, prepared) {
    const { cardData, damage } = prepared;

    try {
      // TODO: Integrar com seus sistemas de combate
      // await this.reducePlayerHP(targetId, damage.currentDamage);
      // await this.reduceMascoteHP(targetId, damage.mascoteDamage);
      // await this.applyCooldown(playerId, prepared.slot, cardData.config.cooldown);

      if (this.config.debug) {
        console.log(`[CardDamageSystem] Dano aplicado:`, {
          attacker: playerId,
          target: targetId,
          cardName: cardData.config.nome,
          playerDamage: damage.currentDamage,
          mascoteDamage: damage.mascoteDamage,
        });
      }

      return {
        success: true,
        message: `⚔️ Ataque aplicado!<br>-${damage.currentDamage} HP de ${targetId}<br>-${damage.mascoteDamage} HP do mascote`,
        action: "ATTACK_EXECUTED",
        damage: damage.currentDamage,
        mascoteDamage: damage.mascoteDamage,
        target: targetId,
        card: cardData.config.nome,
      };
    } catch (error) {
      console.error("[CardDamageSystem] Erro ao aplicar dano:", error);
      throw error;
    }
  }

  /**
   * Cancela um ataque preparado
   * @param {string} playerId - ID do jogador
   * @returns {Object} Resultado da operação
   */
  cancelPreparedAttack(playerId) {
    if (this.preparedAttacks.has(playerId)) {
      const prepared = this.preparedAttacks.get(playerId);
      this.preparedAttacks.delete(playerId);

      if (this.config.debug) {
        console.log(`[CardDamageSystem] Ataque cancelado para ${playerId}`);
      }

      return {
        success: true,
        message: `❌ Ataque cancelado: "${prepared.cardData.config.nome}"`,
        action: "ATTACK_CANCELLED",
        cardName: prepared.cardData.config.nome,
      };
    }

    return {
      success: false,
      message: "❌ Nenhum ataque preparado para cancelar!",
      action: "NO_ATTACK_TO_CANCEL",
    };
  }

  /**
   * Retorna o estado do ataque preparado
   * @param {string} playerId - ID do jogador
   * @returns {Object} Status do ataque
   */
  getPreparedAttackStatus(playerId) {
    const prepared = this.preparedAttacks.get(playerId);

    if (!prepared) {
      return {
        hasPrepared: false,
        message: "❌ Nenhum ataque preparado",
        action: "NO_PREPARED",
      };
    }

    const timePassed = Date.now() - prepared.timestamp;
    const timeRemaining = Math.max(0, this.ATTACK_TIMEOUT - timePassed);
    const timeRemainingSeconds = Math.ceil(timeRemaining / 1000);

    return {
      hasPrepared: true,
      card: prepared.cardData.config.nome,
      damage: prepared.damage.currentDamage,
      mascoteDamage: prepared.damage.mascoteDamage,
      timeRemaining: timeRemainingSeconds,
      message: `⚔️ Ataque preparado: <strong>${prepared.cardData.config.nome}</strong><br>Dano: <strong>${prepared.damage.currentDamage} HP</strong><br>Tempo restante: <strong>${timeRemainingSeconds}s</strong>`,
      action: "ATTACK_STATUS",
      prepared,
    };
  }

  /**
   * Obtém se há ataque preparado
   * @param {string} playerId - ID do jogador
   * @returns {boolean}
   */
  hasPreparedAttack(playerId) {
    return this.preparedAttacks.has(playerId);
  }

  /**
   * Limpa todos os ataques preparados
   */
  clearAll() {
    this.preparedAttacks.clear();
    console.log("[CardDamageSystem] Todos os ataques preparados foram limpos");
  }

  /**
   * Debug
   */
  debug() {
    console.log("\n🎮 === CARD DAMAGE SYSTEM DEBUG ===");
    console.log(`Ataques preparados: ${this.preparedAttacks.size}`);
    console.log(`Timeout: ${this.ATTACK_TIMEOUT}ms`);

    this.preparedAttacks.forEach((attack, playerId) => {
      const timePassed = Date.now() - attack.timestamp;
      const timeRemaining = this.ATTACK_TIMEOUT - timePassed;
      console.log(`  📌 ${playerId}:`, {
        card: attack.cardData.config.nome,
        damage: attack.damage.currentDamage,
        timeRemaining: `${Math.ceil(timeRemaining / 1000)}s`,
      });
    });

    console.log("==================================\n");
  }
}

// Singleton
export const cardDamageSystem = new CardDamageSystem();

console.log("✅ CardDamageSystem carregado");
