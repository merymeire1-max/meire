/**
 * deck.js - Comando /game deck
 *
 * Permite listar os decks disponíveis e trocar o deck ativo via chat da live.
 *
 * Uso:
 *   /game deck listar                — Lista todos os decks
 *   /game deck trocar <nome_ou_id>   — Alterna para o deck especificado
 *
 * @module DeckCommand
 */

import { deckManager } from "@systems/cards/deck-manager.js";
import { cardManager } from "@systems/cards/card-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { languageManager } from "@core/language-manager.js";

export const deckCommand = {
  id: "deck",
  name: "deck",
  aliases: ["baralho", "baralhos"],
  description: "Gerencia e alterna entre os baralhos de cartas ativos",
  usage: "/game deck listar | trocar <nome_ou_id>",
  minArgs: 1,
  maxArgs: 2,
  lobbyAllowed: true, // Permite rodar no lobby antes da partida iniciar

  async execute(playerId, args, metadata = {}) {
    const subCmd = (args[0] || "").toLowerCase();
    const targetParam = args[1] || null;

    // ── 1. Subcomando: LISTAR DECKS ─────────────────────────────────────────
    if (subCmd === "listar" || subCmd === "lista") {
      const decks = deckManager.getDecks();
      if (!decks || decks.length === 0) {
        this._respond(metadata, playerId, languageManager.translate("deck.none_configured"));
        return true;
      }

      const activeDeckId = deckManager.currentDeckId;
      const deckLines = decks.map((d, index) => {
        const isCurrent = d.id === activeDeckId;
        const statusText = isCurrent ? " [ATIVO]" : "";
        const cardCount = d.activeCardIds ? d.activeCardIds.length : 0;
        return `${index + 1}. "${d.name}" (${cardCount} cartas)${statusText}`;
      });

      const responseText = `🃏 Baralhos de Cartas:\n${deckLines.join("\n")}`;
      this._respond(metadata, playerId, responseText);
      return true;
    }

    // ── 2. Subcomando: ALTERNAR DECK ────────────────────────────────────────
    if (subCmd === "trocar" || subCmd === "mudar") {
      if (!targetParam) {
        const errMsg = languageManager.translate("deck.specify_deck");
        notificationManager?.show({ type: playerId, text: errMsg, duration: 3000 });
        this._respond(metadata, playerId, errMsg);
        return false;
      }

      // Validação de Permissão: Apenas Broadcaster/Owner ou Moderadores
      const isLiveChat = !!metadata.platform;
      const isAuthorized = !isLiveChat || metadata.isOwner || metadata.isModerator;

      if (!isAuthorized) {
        console.warn(`🚫 Jogador ${playerId} tentou alternar o baralho sem permissão.`);
        this._respond(metadata, playerId, languageManager.translate("deck.unauthorized"));
        return false;
      }

      const decks = deckManager.getDecks();

      // Procura primeiro por correspondência exata do ID
      let targetDeck = decks.find((d) => d.id === targetParam);

      // Se não achar por ID, procura por correspondência do nome (parcial/case-insensitive)
      if (!targetDeck) {
        const query = targetParam.toLowerCase().trim();
        targetDeck =
          decks.find((d) => d.name.toLowerCase().trim() === query) ||
          decks.find((d) => d.name.toLowerCase().includes(query));
      }

      if (!targetDeck) {
        const errorMsg = languageManager.translate("deck.not_found").replace("{param}", targetParam);
        notificationManager?.show({ type: playerId, text: errorMsg, duration: 3000 });
        this._respond(metadata, playerId, errorMsg);
        return false;
      }

      // Realiza a troca dinâmica via deckManager
      await deckManager.switchDeck(targetDeck.id, cardManager);

      // Notificação Visual HUD
      notificationManager?.show({
        type: "system",
        text: languageManager
          .translate("deck.hud_changed")
          .replace("{name}", targetDeck.name)
          .replace("{count}", targetDeck.activeCardIds?.length || 0),
        duration: 5000,
      });

      this._respond(
        metadata,
        playerId,
        languageManager
          .translate("deck.changed")
          .replace("{name}", targetDeck.name)
          .replace("{count}", targetDeck.activeCardIds?.length || 0),
      );
      return true;
    }

    // Subcomando desconhecido
    const helpMsg = languageManager.translate("deck.invalid_subcmd").replace("{subcmd}", subCmd);
    notificationManager?.show({ type: playerId, text: helpMsg, duration: 4000 });
    this._respond(metadata, playerId, helpMsg);
    return false;
  },

  /**
   * Responde no canal correto (StreamElements ou local no log)
   * @private
   */
  _respond(metadata, playerId, text) {
    if (metadata.platform === "streamelements" || metadata.platform === "youtube") {
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { text, originalMetadata: metadata },
        }),
      );
    } else {
      console.log(`🤖 [Comando Deck] Resposta para ${playerId}: ${text}`);
    }
  },
};
