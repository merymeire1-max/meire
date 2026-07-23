/**
 * join.js - Comando /game entrar
 *
 * Registra o autor da mensagem como jogador no lobby live.
 * Funciona mesmo antes do usuário ser identificado pelo identifyPlayer(),
 * pois usa metadata.username diretamente.
 *
 * Respostas StreamElements:
 *   ✅ "@user entrou como Jogador X!"
 *   ❌ vagas esgotadas (apenas se tentar entrar com lobby cheio)
 *   — silencioso: já registrado, lobby fechado
 *
 * @module JoinGameCommand
 */

export const joinGameCommand = {
  id: "entrar",
  name: "entrar",
  description: "Entra no jogo como jogador",
  usage: "/game entrar",
  lobbyAllowed: true,
  minArgs: 0,
  maxArgs: 0,

  /**
   * @param {string} playerId - ID resolvido (pode ser "spectator" antes do join)
   * @param {Array<string>} args
   * @param {Object} metadata - { username, displayName, isOwner }
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const username = metadata?.username || metadata?.displayName;

    if (!username) {
      console.warn("⚠️ join: username ausente no metadata");
      return false;
    }

    // Import dinâmico evita circular dependency com live-lobby
    const { characterSelector } = await import("@systems/player/character-selector.js");

    // Se o lobby estiver fechado, abre automaticamente
    if (characterSelector.state === "closed") {
      console.log("🎮 join: Lobby fechado, abrindo automaticamente...");
      characterSelector.openAsLobby();
    }

    const result = characterSelector.registerPlayer(username);

    switch (result.reason || (result.success ? "ok" : "unknown")) {
      case "ok":
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `🎮 @${username} entrou como Jogador ${result.slot}!` },
          }),
        );
        console.log(`✅ join: ${username} → ${result.playerId}`);
        return true;

      case "already_registered":
        // Silencioso — não spama o chat
        return false;

      case "lobby_full":
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: as vagas estão esgotadas!` },
          }),
        );
        return false;

      case "lobby_closed":
      default:
        return false;
    }
  },
};

console.log("✅ Comando 'entrar' carregado");
