/**
 * info.js - Comando /game info
 *
 * Retorna no chat informações sobre o slot, a passiva ou o suporte do jogador.
 * Resposta somente via StreamElements (live:response).
 *
 * Exemplos:
 * /game info slot 1  → "Slot 1 [NomeCarta]: Descrição da carta."
 * /game info passiva → "@user: Sua classe [NomeClasse] - Descrição."
 * /game info suporte → "@user: Seu suporte [NomeSuporte] - Descrição."
 *
 * @module InfoCommand
 */

import { cardManager } from "@systems/cards/card-manager.js";
import { sessionState } from "@core/session-state.js";

export const slotInfoCommand = {
  id: "info",
  name: "info",
  aliases: ["descrição", "i"],
  description: "Mostra a descrição da carta num slot, da sua passiva ou do seu suporte atual",
  usage: "/game info slot [número] | /game info passiva | /game info suporte",
  minArgs: 1,
  maxArgs: 2,

  /**
   * @param {string} playerId
   * @param {Array<string>} args - ["slot", "N"], ["passiva"] ou ["suporte"]
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const username = metadata?.username || metadata?.displayName || playerId;
    const subCommand = args[0].toLowerCase();

    // ==========================================
    // Lógica 1: /game info passiva
    // ==========================================
    if (subCommand === "passiva" || subCommand === "classe") {
      const player = sessionState.getPlayer(playerId);

      if (!player || !player.class) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: Você ainda não selecionou uma classe.` },
          }),
        );
        return true;
      }

      const nome = player.class.name || "Classe Desconhecida";
      const descricao = player.class.description || "Sem descrição disponível.";

      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username}: Sua classe [${nome}] - ${descricao}` },
        }),
      );

      return true;
    }

    // ==========================================
    // Lógica 2: /game info suporte
    // ==========================================
    if (subCommand === "suporte" || subCommand === "support" || subCommand === "comandante") {
      const player = sessionState.getPlayer(playerId);
      const suporte = player?.support;

      if (!player || !suporte) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: Você ainda não selecionou um suporte.` },
          }),
        );
        return true;
      }

      const nome = suporte.name || "Suporte Desconhecido";
      const descricao = suporte.description || "Sem descrição disponível.";

      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username}: Seu suporte [${nome}] - ${descricao}` },
        }),
      );

      return true;
    }

    // ==========================================
    // Lógica 3: /game info slot [número]
    // ==========================================
    if (subCommand === "slot") {
      if (args.length < 2) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: uso correto — /game info slot [número]` },
          }),
        );
        return false;
      }

      const slotNum = parseInt(args[1], 10);

      if (isNaN(slotNum) || slotNum < 1) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: uso correto — /game info slot [número]` },
          }),
        );
        return false;
      }

      const card = cardManager.held.getCard(playerId, slotNum);

      if (!card) {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: slot ${slotNum} está vazio.` },
          }),
        );
        return true;
      }

      const config = card.config || {};
      const nome = config.nome || "Carta sem nome";
      const descricao = config.descricao || config.description || "Sem descrição.";

      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `Slot ${slotNum} — ${nome}: ${descricao}` },
        }),
      );

      return true;
    }

    // ==========================================
    // Fallback: Argumento desconhecido
    // ==========================================
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: {
          message: `@${username}: uso correto — /game info slot [número] | /game info passiva | /game info suporte`,
        },
      }),
    );
    return false;
  },
};
