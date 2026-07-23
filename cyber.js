/**
 * cyber.js - Comando /game cyber [texto]
 *
 * Permite interagir com a I.A Cyber.
 *
 * @module CyberCommand
 */

import { aiManager } from "@systems/integrations/ai-manager.js";

export const cyberCommand = {
  id: "cyber",
  name: "cyber",
  aliases: ["ia", "bot"],
  description: "Interage com a I.A Cyber (personalidade impaciente)",
  usage: "/game cyber [pergunta]",
  lobbyAllowed: true,
  minArgs: 1,
  maxArgs: 50,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata - { username, displayName }
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const text = args.join(" ");
    const username = metadata?.username || metadata?.displayName || "Usuário";

    // Encaminha para o gerenciador de IA
    // Não damos await aqui para não bloquear o fluxo principal de comandos da live
    aiManager.ask(text, username);

    return true;
  },
};

console.log("✅ Comando 'cyber' carregado");
