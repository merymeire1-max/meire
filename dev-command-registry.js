/**
 * dev-command-registry.js - Sistema de Comandos Restritos para Desenvolvedores
 *
 * Responsabilidades:
 * - Registrar comandos exclusivos para o desenvolvedor
 * - Validar identidade estrita (@Imperador-0)
 * - Responder somente ao desenvolvedor via overlay/notificações
 * - TOTALMENTE ISOLADO do CommandRegistry padrão para garantir invisibilidade
 *
 * @module DevCommandRegistry
 */

import { notificationManager } from "@interface/notification-manager.js";

class DevCommandRegistry {
  constructor() {
    this.commands = new Map();
    this.commandPrefix = "/dev";
    this.developerUsername = "@Imperador-0";
    this.initialized = false;
  }

  /**
   * Inicializa comandos padrão de dev
   */
  async init() {
    if (this.initialized) return;

    this.register({
      name: "help",
      description: "Lista comandos dev",
      execute: async () => {
        let help = "<strong>🛠️ Console Developer:</strong><br><small>";
        this.commands.forEach((def, name) => {
          help += `• ${name}: ${def.description}<br>`;
        });
        help += "</small>";
        this._respond(help);
        return true;
      },
    });

    this.register({
      name: "reload",
      description: "Recarrega a aplicação imediatamente",
      execute: async () => {
        this._respond("🔄 Recarregando CiberVerso...");
        setTimeout(() => window.location.reload(), 1000);
        return true;
      },
    });

    this.register({
      name: "debug",
      description: "Exibe estado atual no console do navegador",
      execute: async () => {
        const { sessionState } = await import("@core/session-state.js");
        const { playerManager } = await import("@systems/player/player-manager.js");

        console.group("🛠️ DEV DEBUG STATE");
        console.log("SessionState:", sessionState.getState());
        console.log("Players:", playerManager.players);
        console.groupEnd();

        this._respond("✅ Estado enviado para o console do navegador (F12)");
        return true;
      },
    });

    this.initialized = true;
    console.log("✅ DevCommandRegistry inicializado (Invisível)");
  }

  /**
   * Registra um comando de dev
   * @param {Object} definition
   */
  register(definition) {
    this.commands.set(definition.name.toLowerCase(), definition);
  }

  /**
   * Executa um comando de dev com verificação estrita de usuário
   * @param {string} author - Username do autor (deve ser @Imperador-0)
   * @param {string} message - Mensagem completa (incluindo prefixo)
   * @param {Object} metadata
   */
  async execute(author, message, metadata = {}) {
    // 1. Verificação estrita de identidade (case-sensitive)
    if (author !== this.developerUsername) {
      // Silêncio absoluto para usuários não autorizados
      return false;
    }

    if (!this.isDevCommand(message)) return false;

    const cleanMessage = this.removePrefix(message);
    const parts = cleanMessage.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const definition = this.commands.get(commandName);

    if (!definition) {
      this._respond(`❌ Comando dev desconhecido: "${commandName}"`);
      return false;
    }

    try {
      console.log(`🛠️ [Dev] Executando: ${commandName}`, { args });
      const success = await definition.execute(args, metadata);
      return success;
    } catch (error) {
      console.error(`❌ [Dev] Erro no comando ${commandName}:`, error);
      this._respond(`❌ Erro em ${commandName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Verifica se a mensagem tem o prefixo dev
   */
  isDevCommand(message) {
    return message.trim().toLowerCase().startsWith(this.commandPrefix);
  }

  /**
   * Remove o prefixo dev
   */
  removePrefix(message) {
    return message.trim().substring(this.commandPrefix.length).trim();
  }

  /**
   * Responde ao desenvolvedor de forma privada (notificação)
   * @private
   */
  _respond(text) {
    if (notificationManager) {
      notificationManager.show({
        type: "main",
        variant: "info",
        title: "DEV CONSOLE",
        text,
        duration: 7000,
      });
    }

    // Também loga no console real
    console.log(`[Dev Response] ${text}`);
  }
}

export const devCommandRegistry = new DevCommandRegistry();
window.devCommandRegistry = devCommandRegistry;
