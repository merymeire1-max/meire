/**
 * overview.js - Comando /game overview
 *
 * Abre a visão geral das cartas (card-overview), equivalente a pressionar V.
 * Disponível apenas para o dono do canal / moderadores.
 * Não precisa de jogador registrado — não requer lobbyAllowed.
 *
 * @module OverviewCommand
 */

import { cardOverview } from "@systems/cards/card-overview.js";
import { notificationManager } from "@interface/notification-manager.js";

export const overviewCommand = {
  id: "visão",
  name: "overview",
  aliases: ["view", "mesa", "board"],
  description: "Abre a visão geral das cartas (equivalente à tecla V)",
  usage: "/game overview",
  minArgs: 0,
  maxArgs: 0,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata - { isOwner, isModerator }
   * @returns {Promise<boolean>}
   */
  async execute(_playerId, _args, _metadata) {
    if (!cardOverview.initialized) {
      cardOverview.init();
    }

    if (cardOverview.isActive) {
      cardOverview.deactivate();
      console.log("👁️ [overview] Card Overview fechado via comando");
      return true;
    }

    const success = cardOverview.activate();

    if (!success) {
      notificationManager?.show({
        type: "main",
        text: "⚠️ Nenhuma carta disponível para exibir",
        duration: 3000,
      });
      return false;
    }

    console.log("👁️ [overview] Card Overview aberto via comando");
    return true;
  },
};

console.log("✅ Comando 'overview' carregado");
