/**
 * interactive-card-commands.js - Executor de Comandos de Cartas Interativas
 *
 * Responsabilidades:
 * - Executar comandos via commandRegistry (sem passar pelo debugConsole)
 * - Resolver variáveis antes de executar
 * - Delay configurável entre comandos
 * - Logging e tratamento de erros
 * - Suporte para múltiplos playerIds em um único comando
 *
 * @module InteractiveCardCommands
 */

import { commandRegistry } from "@systems/integrations/command-registry.js";

/**
 * @typedef {Object} CommandResult
 * @property {boolean} success
 * @property {string} command
 * @property {string} [error]
 * @property {number} executionTime
 */

class CommandExecutor {
  constructor() {
    this.config = {
      commandDelay: 100, // ms entre comandos
      maxCommandsPerOption: 50,
    };
  }

  /**
   * Executa lista de comandos com variáveis já resolvidas
   * @param {string[]} resolvedCommands - Comandos prontos (variáveis já substituídas)
   * @param {string} playerId - ID do jogador alvo (fallback)
   * @returns {Promise<CommandResult[]>}
   */
  async executeAll(resolvedCommands, playerId) {
    if (!Array.isArray(resolvedCommands) || resolvedCommands.length === 0) return [];

    const results = [];

    for (let i = 0; i < resolvedCommands.length; i++) {
      const cmd = resolvedCommands[i];
      if (!cmd || typeof cmd !== "string" || !cmd.trim()) continue;

      const startTime = Date.now();
      console.log(`🎮 [CardCmd] ${i + 1}/${resolvedCommands.length}: "${cmd}"`);

      try {
        if (!commandRegistry?.initialized) {
          throw new Error("CommandRegistry não inicializado");
        }

        // Executa diretamente no registry — sem passar pelo debugConsole
        const prefix = commandRegistry.commandPrefix ?? "/game";
        const cleanCmd = cmd.trim().toLowerCase().startsWith(prefix.toLowerCase())
          ? cmd.trim().slice(prefix.length).trim()
          : cmd.trim();

        // Comandos gerados pelo block-builder podem incluir playerIds como tokens iniciais
        // ex: "player1 player2 mudarprefixo BREAK" — executar em ambos
        // ex: "player1 mudarprefixo BREAK" — executar em player1
        // ex: "mudarprefixo BREAK" — usar playerId do contexto
        const PLAYER_TOKENS = ["player1", "player2", "player3", "player4"];
        const cmdParts = cleanCmd.split(/\s+/);
        
        // Extrai todos os playerIds do início do comando
        const playerIds = [];
        let cmdStartIndex = 0;
        
        for (let j = 0; j < cmdParts.length; j++) {
          const part = cmdParts[j]?.toLowerCase();
          if (PLAYER_TOKENS.includes(part)) {
            playerIds.push(part);
            cmdStartIndex = j + 1;
          } else {
            break; // Parar no primeiro não-player-token
          }
        }

        const finalCmd = cmdParts.slice(cmdStartIndex).join(" ");
        const targetsPlayerIds = playerIds.length > 0 ? playerIds : [playerId].filter(Boolean);

        if (targetsPlayerIds.length === 0) {
          const executionTime = Date.now() - startTime;
          const errMsg = "Player alvo não resolvido para execução do comando (nenhum playerId disponível)";
          console.warn(`   ⚠️ ${errMsg} — comando: "${cmd}"`);
          results.push({ success: false, command: cmd, error: errMsg, executionTime });
          continue;
        }

        // Executa o comando para cada jogador alvo
        let allSuccess = true;
        for (const targetPlayerId of targetsPlayerIds) {
          const metadata = {
            source: "interactive-card",
            invokedBy: "card",
            rawCommand: cmd,
            actorId: targetPlayerId,
          };

          const success = await commandRegistry.execute(targetPlayerId, finalCmd, metadata);

          if (!success) {
            allSuccess = false;
          }
        }

        const executionTime = Date.now() - startTime;

        results.push({ 
          success: allSuccess, 
          command: cmd, 
          executionTime,
          targetPlayers: targetsPlayerIds.length > 1 ? targetsPlayerIds : undefined
        });

        if (allSuccess) {
          const targets = targetsPlayerIds.length > 1 
            ? ` (${targetsPlayerIds.join(", ")})` 
            : "";
          console.log(`   ✅ OK${targets} (${executionTime}ms)`);
        } else {
          console.warn(`   ⚠️ Falhou (${executionTime}ms)`);
        }
      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`   ❌ Erro: ${error.message}`);
        results.push({ success: false, command: cmd, error: error.message, executionTime });
      }

      // Delay entre comandos (exceto no último)
      if (i < resolvedCommands.length - 1 && this.config.commandDelay > 0) {
        await new Promise((r) => setTimeout(r, this.config.commandDelay));
      }
    }

    const ok = results.filter((r) => r.success).length;
    console.log(`🎮 [CardCmd] Concluído: ${ok}/${results.length} com sucesso`);

    return results;
  }

  /**
   * Atualiza configurações
   * @param {Object} config
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }
}

export { CommandExecutor };

console.log("✅ CommandExecutor carregado (usa commandRegistry direto, suporta múltiplos playerIds)");
