/**
 * activate-passive.js - Comando de Ativar Passiva
 *
 * Responsabilidades:
 * - Ativar habilidade passiva do jogador
 * - Verificar cooldown
 * - Aplicar dano (se houver)
 * - Fornecer feedback visual
 *
 * @module ActivatePassiveCommand
 */

import { playerManager } from "@systems/player/player-manager.js";
import { sessionState } from "@core/session-state.js";
import { notificationManager } from "@interface/notification-manager.js";

/**
 * Verifica se jogador pode ativar passiva
 * @private
 * @param {string} playerId
 * @returns {Object} { canActivate: boolean, reason?: string }
 */
function canActivatePassive(playerId) {
  const player = sessionState.getPlayer(playerId);

  if (!player) {
    return {
      canActivate: false,
      reason: "Jogador não encontrado",
    };
  }

  // Verifica se tem classe
  if (!player.class) {
    return {
      canActivate: false,
      reason: "Nenhuma classe selecionada",
    };
  }

  // Verifica cooldown
  if (player.passiveCooldown.current > 0) {
    return {
      canActivate: false,
      reason: `Cooldown: ${player.passiveCooldown.current} turno(s)`,
      turnsRemaining: player.passiveCooldown.current,
    };
  }

  return { canActivate: true };
}

/**
 * Ativa passiva de um jogador
 * @private
 * @param {string} playerId
 * @returns {Promise<boolean>}
 */
async function activatePassive(playerId) {
  const player = sessionState.getPlayer(playerId);

  if (!player || !player.class) {
    return false;
  }

  console.log(`⚡ Ativando passiva: ${player.class.name} (${playerId})`);

  try {
    // Usa PlayerManager para ativar.
    // player-passive.js::_executePassive já dispara animação e notificação internamente —
    // não repetir aqui para evitar feedback duplicado.
    playerManager.activatePassive(playerId);

    console.log(`✅ Passiva ativada: ${player.class.name}`);

    return true;
  } catch (error) {
    console.error("❌ Erro ao ativar passiva:", error);
    return false;
  }
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

/**
 * Comando: Ativar Passiva
 */
export const activatePassiveCommand = {
  id: "passiva",
  name: "passiva",
  aliases: ["passive", "ativar", "pass"],
  description: "Ativa a habilidade passiva da classe",
  usage: "/game passiva",
  minArgs: 0,
  maxArgs: 0,
  cooldown: 1000, // 1 segundo entre tentativas (cooldown real é por turno)

  /**
   * Executa comando de ativar passiva
   * @param {string} playerId - ID do jogador
   * @param {Array<string>} args - Argumentos (não usa)
   * @param {Object} metadata - Metadados
   * @returns {Promise<boolean>}
   */
  async execute(playerId, _args, _metadata) {
    console.log(`⚡ Comando passiva: ${playerId}`);

    // Verifica se pode ativar
    const check = canActivatePassive(playerId);

    if (!check.canActivate) {
      console.warn(`⚠️ Não pode ativar passiva: ${check.reason}`);

      if (notificationManager) {
        let message = `⚠️ ${check.reason}`;

        if (check.turnsRemaining) {
          message = `⏳ Passiva em cooldown<br><small>${check.turnsRemaining} turno(s) restante(s)</small>`;
        }

        notificationManager.show({
          type: playerId,
          text: message,
          duration: 3000,
        });
      }

      return false;
    }

    try {
      // Ativa passiva
      const success = await activatePassive(playerId);

      return success;
    } catch (error) {
      console.error("❌ Erro ao processar comando passiva:", error);

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Erro ao ativar passiva`,
          duration: 3000,
        });
      }

      return false;
    }
  },
};

console.log("✅ Comando 'passiva' carregado");
