/**
 * select-support.js - Comando /game suporte [nome]
 *
 * Permite que o jogador selecione seu suporte via chat durante o lobby.
 * Match case-insensitive no nome exato do suporte.
 *
 * Respostas StreamElements:
 *   ✅ "@user escolheu {nome} como suporte!"
 *   ❌ "@user: suporte '{nome}' não encontrado." (se nome errado)
 *   — silencioso: jogador não está registrado no lobby
 *
 * @module SelectSupportCommand
 */

import { configManager } from "@core/config-manager.js";
import { sessionState } from "@core/session-state.js";
import { assetResolver } from "@core/asset-resolver.js";
import { audioManager } from "@systems/audio/audio-manager.js";

/**
 * Busca suporte por nome, case-insensitive e ignorando espaços extras.
 * @param {string} name
 * @returns {Object|null}
 */
function findSupportByName(name) {
  const characters = configManager.getCharacters("support", true);
  if (!characters?.length) return null;

  const searchName = name.toLowerCase().trim();
  return characters.find((c) => c.name.toLowerCase().trim() === searchName) || null;
}

/**
 * Aplica o suporte diretamente ao jogador (sem abrir o modal).
 * Replica o que support-selector.js#applySupportToPlayer faz internamente.
 * @param {string} playerId
 * @param {Object} supportData
 * @returns {Promise<boolean>}
 */
async function applySupport(playerId, supportData) {
  try {
    // 1. Atualiza retrato no DOM
    const playerEl = document.getElementById(playerId);
    if (playerEl) {
      const img = playerEl.querySelector(".support-portrait img");
      if (img) {
        img.src = assetResolver.character(supportData.imagem);
        img.alt = supportData.name;
        img.title = `${supportData.name}\n${supportData.description || ""}`;
      }
    }

    // 2. Atualiza suporte no sessionState
    sessionState.setPlayerSupport(playerId, supportData);

    // 3. Aplica bônus de supportHP (se configurado no suporte)
    if (supportData.blBonus && supportData.blBonus > 0) {
      try {
        sessionState.modifySupportHP(playerId, supportData.blBonus);
      } catch {}
    }

    // 4. Toca áudio do personagem (se existir)
    try {
      const audioPath = assetResolver.characterAudio?.(supportData.id);
      if (audioPath && audioManager) {
        audioManager.playSFX?.(audioPath);
      }
    } catch {}

    console.log(`✅ Suporte "${supportData.name}" aplicado a ${playerId}`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao aplicar suporte:", err);
    return false;
  }
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

export const selectSupportCommand = {
  id: "suporte",
  name: "suporte",
  aliases: ["sup"],
  description: "Seleciona um suporte (nome exato, sem distinção de maiúsculas)",
  usage: "/game suporte [nome]",
  lobbyAllowed: true,
  minArgs: 1,
  maxArgs: 20, // suporta nomes compostos

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata - { username, displayName }
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const { characterSelector } = await import("@systems/player/character-selector.js");
    // Só executa se o jogador estiver registrado no lobby
    if (!characterSelector.isPlayerRegistered(playerId)) return false;

    const name = metadata.rawArgs || args.join(" ");
    const support = findSupportByName(name);
    const username = metadata?.username || metadata?.displayName || playerId;

    if (!support) {
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username}: suporte "${name}" não encontrado.` },
        }),
      );
      return false;
    }

    const success = await applySupport(playerId, support);

    if (success) {
      // Notifica lobby para atualizar estado (progressão de fase)
      characterSelector.onSupportSelected(playerId);

      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username} escolheu ${support.name} como suporte!` },
        }),
      );
    }

    return success;
  },
};

console.log("✅ Comando 'suporte' carregado");
