/**
 * live-turn-manager.js - Gerenciador de Turno para Modo Live
 *
 * Responsabilidades:
 * - Rastrear qual jogador está no turno
 * - Controlar limite de cartas por turno (padrão: 2)
 * - Permitir que o GM conceda ou revogue cartas extras (NumpadAdd / NumpadSubtract)
 * - Expor canOpenCard() para open-card.js consultar antes de abrir
 *
 * Eventos disparados:
 *   live:turn-started  → { playerId }
 *   live:turn-ended    → { previousPlayer, nextPlayer, roundComplete }
 *   live:extra-granted → { playerId, totalLimit }
 *   live:extra-revoked → { playerId, totalLimit }
 *
 * @module LiveTurnManager
 */

import { configManager } from "@core/config-manager.js";

class LiveTurnManager {
  constructor() {
    this.active = false;
    this.currentPlayer = null;
    this.playerOrder = ["player1", "player2"];
    this.cardsOpened = 0;
    this.supportCardsOpened = 0;
    this.extraCards = 0;
    this.defaultCardLimit = 3;
    // Jogador que iniciou a rodada — roundComplete dispara quando voltamos a ele
    this._roundStartPlayer = null;
  }

  // ============================================
  // ATIVAÇÃO
  // ============================================

  /**
   * Ativa o modo live e inicia o turno do primeiro jogador
   * @param {string} [startingPlayer="player1"]
   */
  activate(startingPlayer = "player1") {
    this.active = true;
    this._roundStartPlayer = startingPlayer;
    this._startTurn(startingPlayer);
    console.log(`🔴 LiveTurnManager ativado — turno: ${startingPlayer}`);
  }

  /**
   * Desativa o modo live (jogo encerrado ou lobby fechado)
   */
  deactivate() {
    this.active = false;
    this.currentPlayer = null;
    this._roundStartPlayer = null;
    this.cardsOpened = 0;
    this.extraCards = 0;
    console.log("⚫ LiveTurnManager desativado");
  }

  // ============================================
  // CONTROLE DE TURNO
  // ============================================

  /**
   * Inicia o turno de um jogador, zerando contadores
   * @private
   * @param {string} playerId
   */
  _startTurn(playerId) {
    this.currentPlayer = playerId;
    this.cardsOpened = 0;
    this.supportCardsOpened = 0;
    this.extraCards = 0;

    document.dispatchEvent(new CustomEvent("live:turn-started", { detail: { playerId } }));
  }

  /**
   * Encerra o turno atual e avança para o próximo jogador.
   * Zera os contadores de cartas (mesmo que não tenham sido usadas).
   *
   * roundComplete é true quando o ciclo volta ao primeiro jogador da ordem,
   * ou seja, todos os jogadores já jogaram nesta rodada.
   * O turno global (sessionState) só deve ser incrementado neste caso.
   *
   * @returns {{ nextPlayer: string|null, roundComplete: boolean }}
   */
  endTurn() {
    if (!this.active || !this.currentPlayer) return { nextPlayer: null, roundComplete: false };

    const currentIndex = this.playerOrder.indexOf(this.currentPlayer);
    const nextIndex = (currentIndex + 1) % this.playerOrder.length;
    const nextPlayer = this.playerOrder[nextIndex];
    const previousPlayer = this.currentPlayer;

    // Rodada completa quando voltamos ao jogador que iniciou a rodada
    const roundComplete = nextPlayer === this._roundStartPlayer;

    this._startTurn(nextPlayer);

    document.dispatchEvent(
      new CustomEvent("live:turn-ended", {
        detail: { previousPlayer, nextPlayer, roundComplete },
      }),
    );

    console.log(`🔄 Turno: ${previousPlayer} → ${nextPlayer}${roundComplete ? " | ✅ Rodada completa" : ""}`);
    return { nextPlayer, roundComplete };
  }

  // ============================================
  // CONTROLE DE CARTAS
  // ============================================

  /**
   * Verifica se um jogador pode abrir uma carta.
   * Se o modo live não está ativo, sempre permite.
   *
   * @param {string} playerId
   * @param {boolean} [isSupport=false]
   * @returns {{ allowed: boolean, reason?: string, remaining?: number, limit?: number }}
   */
  canOpenCard(playerId, isSupport = false) {
    if (!this.active) return { allowed: true };

    if (playerId !== this.currentPlayer) {
      return { allowed: false, reason: "not_your_turn" };
    }

    if (isSupport) {
      const supportLimit = configManager.getGlobal("live.supportActionsPerTurn") || 2;
      if (this.supportCardsOpened >= supportLimit) {
        return { allowed: false, reason: "support_limit_reached", limit: supportLimit };
      }
    } else {
      const limit = this.defaultCardLimit + this.extraCards;
      if (this.cardsOpened >= limit) {
        return { allowed: false, reason: "limit_reached", limit };
      }
    }

    return { allowed: true };
  }

  /**
   * Registra que uma carta foi aberta pelo jogador do turno atual.
   * Deve ser chamado após cada abertura bem-sucedida.
   * @param {boolean} [isSupport=false]
   */
  recordCardOpened(isSupport = false) {
    if (!this.active) return;

    if (isSupport) {
      this.supportCardsOpened++;
    } else {
      this.cardsOpened++;
    }

    console.log(
      `🃏 Cartas: ${this.cardsOpened}/${this.defaultCardLimit + this.extraCards} | Suporte: ${this.supportCardsOpened}`,
    );
  }

  /**
   * Concede cartas extras ao jogador do turno atual (atalho do GM).
   * @param {number} [count=1] Quantas cartas extras conceder
   * @returns {number} Total de extras acumulados (0 se inativo)
   */
  grantExtra(count = 1) {
    if (!this.active || !this.currentPlayer) return 0;

    this.extraCards += count;
    const totalLimit = this.defaultCardLimit + this.extraCards;

    document.dispatchEvent(
      new CustomEvent("live:extra-granted", {
        detail: { playerId: this.currentPlayer, totalLimit },
      }),
    );

    console.log(`⭐ +${count} carta(s) extra — total: ${totalLimit}`);
    return this.extraCards;
  }

  /**
   * Remove cartas extras do jogador do turno atual (atalho do GM).
   * Nunca desce abaixo de 0 extras (limite mínimo = defaultCardLimit).
   * Também não permite que o limite fique abaixo das cartas já abertas
   * (sem efeito retroativo — cartas abertas não são desfeitas).
   * @param {number} [count=1] Quantas cartas extras remover
   * @returns {number} Total de extras restantes (0 se inativo)
   */
  revokeExtra(count = 1) {
    if (!this.active || !this.currentPlayer) return 0;

    // Não deixa extraCards ficar negativo
    this.extraCards = Math.max(0, this.extraCards - count);
    const totalLimit = this.defaultCardLimit + this.extraCards;

    document.dispatchEvent(
      new CustomEvent("live:extra-revoked", {
        detail: { playerId: this.currentPlayer, totalLimit },
      }),
    );

    console.log(`🔻 -${count} carta(s) extra — total: ${totalLimit}`);
    return this.extraCards;
  }

  // ============================================
  // GETTERS
  // ============================================

  /** @returns {string|null} */
  getCurrentPlayer() {
    return this.currentPlayer;
  }

  /** @returns {number} Cartas restantes que o jogador atual pode abrir */
  getRemainingCards() {
    const limit = this.defaultCardLimit + this.extraCards;
    return Math.max(0, limit - this.cardsOpened);
  }

  /** @returns {Object} Estado atual do turn manager */
  getStatus() {
    return {
      active: this.active,
      currentPlayer: this.currentPlayer,
      cardsOpened: this.cardsOpened,
      extraCards: this.extraCards,
      limit: this.defaultCardLimit + this.extraCards,
      remaining: this.getRemainingCards(),
    };
  }
}

export const liveTurnManager = new LiveTurnManager();

console.log("✅ LiveTurnManager carregado");
