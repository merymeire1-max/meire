import { supportManager } from "@systems/player/support-manager.js";

export const inviteCommand = {
  id: "convidar",
  name: "convidar",
  description: "Abre/fecha porta para jogadores de suporte",
  usage: "/game convidar",
  execute: async (playerId, args, metadata) => {
    if (playerId !== "player1" && playerId !== "player2") return false;
    const isOpen = supportManager.toggleDoor(playerId);
    const username = metadata.username;
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: { message: `@${username} ${isOpen ? "ABRIU" : "FECHOU"} as vagas para suporte!` },
      }),
    );
    return true;
  },
};

export const supportJoinCommand = {
  id: "apoiar",
  name: "apoiar",
  description: "Entra como suporte de um jogador (p1 ou p2)",
  usage: "/game apoiar p1",
  minArgs: 1,
  execute: async (playerId, args, metadata) => {
    const target = args[0].toLowerCase();
    const leaderId = target === "p1" ? "player1" : target === "p2" ? "player2" : null;
    if (!leaderId) return false;

    const username = metadata.username;
    const result = supportManager.addSupport(username, leaderId);

    if (result.success) {
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username} agora é SUPORTE de ${target.toUpperCase()}!` },
        }),
      );
      return true;
    } else {
      const msg = result.reason === "door_closed" ? "as vagas estão fechadas!" : "o time está cheio!";
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username}: ${msg}` },
        }),
      );
      return false;
    }
  },
};

export const supportLeaveCommand = {
  id: "sair",
  name: "sair",
  description: "Sair do time de suporte",
  usage: "/game sair",
  execute: async (playerId, args, metadata) => {
    const username = metadata.username;
    if (supportManager.removeSupport(username)) {
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message: `@${username} saiu do time de suporte.` },
        }),
      );
      return true;
    }
    return false;
  },
};
