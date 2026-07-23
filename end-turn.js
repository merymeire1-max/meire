/**
 * end-turn.js - Comando /game fim
 *
 * Encerra o turno do jogador atual no modo live:
 * - Verifica se é de fato a vez deste jogador
 * - Zera contadores de carta (mesmo que não tenha aberto nada)
 * - Avança o turno no liveTurnManager (define próximo player, zera contadores)
 * - O turno global (sessionState + turno-avancado) só avança quando todos
 *   os jogadores completaram sua vez na rodada (roundComplete)
 * - Responde no chat quem é o próximo
 *
 * Respostas StreamElements:
 *   ✅ "⏭ Vez de {nome}!"
 *   ❌ "@user: não é sua vez ainda."  (silencioso no log)
 *
 * @module EndTurnCommand
 */

import { liveTurnManager } from "@systems/integrations/live-turn-manager.js";
import { turnSystem } from "@core/turn-system.js";
import { playerManager } from "@systems/player/player-manager.js";

export const endTurnCommand = {
  id: "fim",
  name: "fim",
  aliases: ["encerrar", "passar", "terminar"],
  description: "Encerra o turno atual do jogador",
  usage: "/game fim",
  minArgs: 0,
  maxArgs: 0,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata - { username, displayName }
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    if (!liveTurnManager.active) {
      // Modo live não está ativo — ignora silenciosamente
      return false;
    }

    // Não é a vez deste jogador
    if (liveTurnManager.getCurrentPlayer() !== playerId) {
      const username = metadata?.username || metadata?.displayName || playerId;
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username}: não é sua vez ainda.` },
        }),
      );
      return false;
    }

    // 1. Avança turno no LiveTurnManager (zera contadores, define próximo player)
    const { nextPlayer, roundComplete } = liveTurnManager.endTurn();

    // 2. Turno global avança apenas quando TODOS os jogadores completaram sua vez
    //    (roundComplete = true quando o ciclo voltou ao primeiro jogador)
    if (roundComplete) {
      turnSystem.next();

      // 3. Atualiza DOM do contador de turnos
      const turnoEl = document.getElementById("turnoCounter");
      if (turnoEl) turnoEl.textContent = `Turno ${turnSystem.current}`;

      // 4. Dispara evento global de turno avançado (playerManager, cardManager, notificationManager, etc.)
      // turnSystem.next() já dispara isso internamente via turnSystem.on() e CustomEvent
      console.log(`⏭ /game fim — rodada completa, turno global: ${turnSystem.current}, próximo: ${nextPlayer}`);
    } else {
      console.log(`⏭ /game fim — vez de ${nextPlayer} (turno global inalterado)`);
    }

    // 5. Resposta no chat com o nome do próximo jogador
    if (nextPlayer) {
      const nextName = playerManager.getPlayerName(nextPlayer);
      if (nextName) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `⏭ Vez de ${nextName}!` },
          }),
        );
      }
    }

    return true;
  },
};

console.log("✅ Comando 'fim' carregado");
