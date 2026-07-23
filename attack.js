/**
 * attack.js - Comando de Ataque (Versão Debug)
 */

import { notificationManager } from "@interface/notification-manager.js";

export const attackCommand = {
  id: "attack",
  name: "attack",
  aliases: ["atak", "ataque"],
  description: "Realiza um ataque ao alvo selecionado",
  usage: "/game attack [alvo]",
  minArgs: 1,
  maxArgs: 1,
  requiresTarget: true,
  cooldown: 1000,
  lobbyAllowed: false,

  execute: async (playerId, args, metadata) => {
    const targetId = args[0];

    console.log("🔍 DEBUG: Procurando dados do jogo...");
    console.log("window.gameState:", window.gameState);
    console.log("window.gameStateManager:", window.gameStateManager);
    console.log("window.game:", window.game);
    console.log("Todas as chaves do window:", Object.keys(window).filter(k => !k.startsWith('_')).slice(0, 50));

    // Tenta encontrar qualquer objeto que tenha "player1"
    let gameState = null;
    for (const key in window) {
      if (typeof window[key] === 'object' && window[key] !== null) {
        if (window[key].player1 || window[key]['player1']) {
          gameState = window[key];
          console.log(`✅ Encontrado gameState em: window.${key}`);
          break;
        }
      }
    }

    if (!gameState) {
      console.error("❌ Não consegui encontrar gameState em lugar nenhum!");
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: "❌ Sistema de jogo não inicializado. Veja o console.",
          duration: 3000,
        });
      }
      return false;
    }

    const attacker = gameState[playerId];
    const target = gameState[targetId];

    if (!attacker || !target) {
      console.error("❌ Jogadores não encontrados:", { attacker, target });
      return false;
    }

    // Se chegou aqui, funciona!
    if (!attacker.hand || attacker.hand.length === 0) {
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: "❌ Sem cartas!",
          duration: 3000,
        });
      }
      return false;
    }

    const card = attacker.hand[0];
    const damage = card.damage || 5;

    target.health = Math.max(0, target.health - damage);
    attacker.hand.splice(0, 1);

    console.log(`⚔️ Ataque realizado! ${playerId} → ${targetId}: ${damage} dano`);
    console.log(`Estado atualizado:`, { attacker, target });

    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: `⚔️ Você atacou com ${damage} dano!`,
        duration: 3000,
      });
      notificationManager.show({
        type: targetId,
        text: `🛡️ Você sofreu ${damage} dano! HP: ${target.health}`,
        duration: 3000,
      });
    }

    return true;
  },
};