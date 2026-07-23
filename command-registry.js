/**
 * command-registry.js - Sistema de Registro e Execução de Comandos
 *
 * Responsabilidades:
 * - Registrar comandos disponíveis
 * - Parsear e validar mensagens de comando
 * - Executar handlers de comandos
 * - Fornecer sistema de ajuda
 * - Gerenciar aliases de comandos
 * - Validação de argumentos
 *
 * @module CommandRegistry
 */

import { notificationManager } from "@interface/notification-manager.js";
import { configManager } from "@core/config-manager.js";

/**
 * @typedef {Object} CommandDefinition
 * @property {string} id - ID único do comando (geralmente o nome original)
 * @property {string} name - Nome de exibição/gatilho do comando
 * @property {Array<string>} [aliases] - Aliases alternativos
 * @property {string} description - Descrição do comando
 * @property {string} usage - Exemplo de uso
 * @property {Function} execute - Handler (playerId, args, metadata) => Promise<boolean>
 * @property {number} [minArgs] - Mínimo de argumentos
 * @property {number} [maxArgs] - Máximo de argumentos
 * @property {boolean} [requiresTarget] - Requer seleção de alvo?
 * @property {Array<string>} [permissions] - Permissões necessárias
 * @property {number} [cooldown] - Cooldown em ms (por usuário)
 * @property {boolean} [lobbyAllowed] - Permitido durante a fase de lobby?
 */

/**
 * @typedef {Object} ParsedCommand
 * @property {string} command - Nome do comando
 * @property {Array<string>} args - Argumentos
 * @property {string} rawArgs - String bruta de argumentos
 */

class CommandRegistry {
  constructor() {
    this.initialized = false;

    // Definições originais (indexadas por ID imutável)
    // Map<commandId, CommandDefinition>
    this.commandsById = new Map();

    // Mapa de comandos ativos (nome customizado -> Definição)
    // Map<commandName, CommandDefinition>
    this.commands = new Map();

    // Mapa de aliases ativos para nomes de comando ativos
    // Map<alias, commandName>
    this.aliases = new Map();

    // Cooldowns por usuário
    // Map<username_commandName, lastUsedTime>
    this.cooldowns = new Map();

    // Prefixo de comando (carregado do configManager se disponível)
    this.commandPrefix = "/game";

    // Estatísticas
    this.stats = {
      commandsRegistered: 0,
      commandsExecuted: 0,
      commandsFailed: 0,
      aliasesRegistered: 0,
    };
  }

  /**
   * Inicializa o registro de comandos
   */
  async init() {
    if (this.initialized) {
      console.warn("⚠️ CommandRegistry já foi inicializado");
      return;
    }

    console.log("🎮 CommandRegistry inicializando...");

    // Sincroniza prefixo inicial
    const savedPrefix = configManager.getGlobal("live.commandPrefix");
    if (savedPrefix) this.commandPrefix = savedPrefix;

    // Registra comandos padrão
    await this.registerDefaultCommands();

    // Aplica customizações iniciais
    this.refreshFromConfig();

    // Escuta mudanças na configuração
    configManager.on("live.commandPrefix", (val) => {
      this.commandPrefix = val;
      console.log(`🔧 Prefixo de comando atualizado via config: ${val}`);
    });

    configManager.on("live.customCommands", () => {
      this.refreshFromConfig();
      console.log("🔄 Comandos da live atualizados via config");
    });

    this.initialized = true;
    console.log("✅ CommandRegistry inicializado");
    console.log(`  📊 ${this.commandsById.size} comando(s) base registrado(s)`);
  }

  /**
   * Registra comandos padrão
   * @private
   */
  async registerDefaultCommands() {
    // Importa e registra comandos específicos
    const { openCardCommand } = await import("@systems/integrations/commands/open-card.js");
    const { activatePassiveCommand } = await import("@systems/integrations/commands/activate-passive.js");
    const { changeClassCommand, changeClassByPrefixCommand } =
      await import("@systems/integrations/commands/change-class.js");
    const { temaCommand } = await import("@systems/integrations/commands/tema.js");
    const { deckCommand } = await import("@systems/integrations/commands/deck.js");

    // Comandos do modo live
    const { joinGameCommand } = await import("@systems/integrations/commands/join.js");
    const { endTurnCommand } = await import("@systems/integrations/commands/end-turn.js");
    const { selectSupportCommand } = await import("@systems/integrations/commands/select-support.js");
    const { slotInfoCommand } = await import("@systems/integrations/commands/slot-info.js");
    const { slotUseCommand } = await import("@systems/integrations/commands/slot-use.js");
    const { overviewCommand } = await import("@systems/integrations/commands/overview.js");
    const { cyberCommand } = await import("@systems/integrations/commands/cyber.js");

    // Novos comandos de suporte
    const { inviteCommand, supportJoinCommand, supportLeaveCommand } =
      await import("@systems/integrations/commands/support-commands.js");
    const { buffCommand, bloquearCommand, qteSelectionCommand, optionSelectionCommand } =
      await import("@systems/integrations/commands/combat-decision.js");

    // ============ NOVO: Comando de segurar cartas ============
    const { holdCardCommand } = await import("@systems/integrations/commands/hold-card.js");
    // ========================================================

    // ============ NOVO: Comando de ataque ============
    const { attackCommand } = await import("@systems/integrations/commands/attack.js");
    // ==================================================

    this.register(openCardCommand);
    this.register(activatePassiveCommand);
    this.register(changeClassCommand);
    this.register(changeClassByPrefixCommand);
    this.register(temaCommand);
    this.register(deckCommand);

    // Live mode
    this.register(joinGameCommand);
    this.register(endTurnCommand);
    this.register(selectSupportCommand);
    this.register(slotInfoCommand);
    this.register(slotUseCommand);
    this.register(overviewCommand);
    this.register(cyberCommand);
    this.register(buffCommand);
    this.register(bloquearCommand);
    this.register(qteSelectionCommand);
    this.register(optionSelectionCommand);

    // ============ REGISTRA attackCommand ============
    this.register(attackCommand);
    // ================================================

    // Support System
    this.register(inviteCommand);
    this.register(supportJoinCommand);
    this.register(supportLeaveCommand);

    // ============ NOVO: Registra comando de segurar cartas ============
    this.register(holdCardCommand);
    // ==================================================================

    // Comando de ajuda (built-in)
    this.register({
      id: "help",
      name: "help",
      aliases: ["ajuda", "comandos", "?"],
      description: "Mostra lista de comandos disponíveis",
      usage: "[prefixo] help [comando]",
      lobbyAllowed: true,
      execute: async (playerId, args) => {
        if (args.length > 0) {
          // Ajuda de comando específico
          return this.showCommandHelp(playerId, args[0]);
        } else {
          // Lista todos os comandos
          return this.showAllCommands(playerId);
        }
      },
    });

    console.log("📋 Comandos padrão registrados");
  }

  // ============================================
  // REGISTRO DE COMANDOS
  // ============================================

  /**
   * Registra um comando na base original (commandsById)
   * @param {CommandDefinition} definition
   * @returns {boolean}
   */
  register(definition) {
    if (!this.validateDefinition(definition)) {
      console.error("❌ Definição de comando inválida:", definition);
      return false;
    }

    // O ID é o nome original se não for fornecido explicitamente
    const id = definition.id || definition.name;
    const finalDef = { ...definition, id };

    if (this.commandsById.has(id)) {
      console.warn(`⚠️ Comando com ID "${id}" já está registrado. Sobrescrevendo...`);
    }

    this.commandsById.set(id, finalDef);

    // Se já estiver inicializado, atualiza os maps de busca
    if (this.initialized) {
      this.refreshFromConfig();
    } else {
      // No boot, apenas popula maps de busca iniciais
      this._applyToRegistry(finalDef);
    }

    return true;
  }

  /**
   * Reconstrói os maps de busca (commands/aliases) baseados na configuração customizada
   */
  refreshFromConfig() {
    this.commands.clear();
    this.aliases.clear();
    this.stats.aliasesRegistered = 0;

    const customs = configManager.getGlobal("live.customCommands") || {};
    const silent = !this.initialized; // Silencioso apenas no primeiro carregamento (boot)

    this.commandsById.forEach((baseDef, id) => {
      const custom = customs[id];
      const mergedDef = {
        ...baseDef,
        name: custom?.name || baseDef.name,
        aliases: Array.isArray(custom?.aliases) ? custom.aliases : baseDef.aliases || [],
      };

      this._applyToRegistry(mergedDef, silent);
    });
  }

  /**
   * Insere uma definição nos maps de busca ativos com proteção contra colisões
   * @private
   */
  _applyToRegistry(def) {
    const { name, aliases = [] } = def;
    const lowerName = name.toLowerCase();

    // 1. Verifica colisão do nome principal com comandos já registrados
    if (this.commands.has(lowerName)) {
      const conflict = this.commands.get(lowerName);
      if (conflict.id !== def.id) {
        console.error(
          `🚫 CONFLITO: O gatilho "${name}" do comando "${def.id}" já está sendo usado pelo comando "${conflict.id}". Ignorando gatilho.`,
        );
        // Se o nome principal colide, tentamos usar o ID original como fallback para não ficar sem gatilho
        if (!this.commands.has(def.id.toLowerCase())) {
          this.commands.set(def.id.toLowerCase(), def);
        }
        return;
      }
    }

    this.commands.set(lowerName, def);

    // 2. Registra aliases, evitando colisões com nomes principais ou outros aliases
    aliases.forEach((rawAlias) => {
      const alias = rawAlias.trim().toLowerCase();
      if (!alias) return;

      // Não permite que alias colida com NOME principal de qualquer comando
      if (this.commands.has(alias)) {
        console.warn(`⚠️ Conflito de Alias: "${alias}" (comando ${def.id}) ignorado pois já é um gatilho principal.`);
        return;
      }

      // Verifica colisão com outros aliases
      if (this.aliases.has(alias)) {
        const ownerName = this.aliases.get(alias);
        const ownerDef = this.commands.get(ownerName);
        if (ownerDef && ownerDef.id !== def.id) {
          console.warn(
            `⚠️ Conflito de Alias: "${alias}" (comando ${def.id}) ignorado pois já é usado por "${ownerDef.id}".`,
          );
          return;
        }
      }

      this.aliases.set(alias, lowerName);
      this.stats.aliasesRegistered++;
    });
  }

  /**
   * Retorna a lista de todos os comandos registrados (base original)
   * @returns {Array<CommandDefinition>}
   */
  getRegistry() {
    return Array.from(this.commandsById.values());
  }

  /**
   * Valida definição de comando
   * @private
   * @param {CommandDefinition} definition
   * @returns {boolean}
   */
  validateDefinition(definition) {
    if (!definition || typeof definition !== "object") {
      console.error("❌ Definição deve ser um objeto");
      return false;
    }

    // Campos obrigatórios
    const required = ["name", "description", "execute"];

    for (const field of required) {
      if (!definition[field]) {
        console.error(`❌ Campo obrigatório ausente: ${field}`);
        return false;
      }
    }

    // Valida tipos
    if (typeof definition.name !== "string") {
      console.error("❌ 'name' deve ser string");
      return false;
    }

    if (typeof definition.description !== "string") {
      console.error("❌ 'description' deve ser string");
      return false;
    }

    if (typeof definition.execute !== "function") {
      console.error("❌ 'execute' deve ser função");
      return false;
    }

    // Valida aliases (se fornecidos)
    if (definition.aliases && !Array.isArray(definition.aliases)) {
      console.error("❌ 'aliases' deve ser array");
      return false;
    }

    return true;
  }

  /**
   * Remove um comando
   * @param {string} name
   * @returns {boolean}
   */
  unregister(name) {
    const definition = this.commands.get(name);

    if (!definition) {
      console.warn(`⚠️ Comando "${name}" não está registrado`);
      return false;
    }

    // Remove comando
    this.commands.delete(name);

    // Remove aliases
    if (definition.aliases) {
      definition.aliases.forEach((alias) => {
        this.aliases.delete(alias);
      });
    }

    console.log(`🗑️ Comando removido: ${name}`);

    return true;
  }

  // ============================================
  // EXECUÇÃO DE COMANDOS
  // ============================================

  /**
   * Executa um comando
   * @param {string} playerId - ID do jogador que executou
   * @param {string} message - Mensagem completa (sem prefixo)
   * @param {Object} [metadata] - Metadados adicionais
   * @returns {Promise<boolean>}
   */
  async execute(playerId, message, metadata = {}) {
    console.log(`[CommandRegistry.execute] INICIADO - playerId: ${playerId}, message: "${message}"`);
    
    // Parseia comando
    const parsed = this.parseCommand(message);

    if (!parsed) {
      console.warn("⚠️ Falha ao parsear comando");
      return false;
    }

    const { command, args, rawArgs } = parsed;
    console.log(`[CommandRegistry.execute] Parseado - command: "${command}", args:`, args);

    // Resolve nome real do comando (pode ser alias)
    const commandName = this.resolveCommandName(command);

    if (!commandName) {
      console.log(`ℹ️ Comando desconhecido: "${command}"`);

      // Feedback
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Comando desconhecido: "${command}"<br><small>Use /game help</small>`,
          duration: 4000,
        });
      }

      return false;
    }

    console.log(`[CommandRegistry.execute] Nome resolvido: "${commandName}"`);

    // Obtém definição
    const definition = this.commands.get(commandName);

    if (!definition) {
      console.error(`❌ Definição não encontrada: ${commandName}`);
      return false;
    }

    console.log(`[CommandRegistry.execute] Definição encontrada:`, {
      id: definition.id,
      name: definition.name,
      minArgs: definition.minArgs,
      maxArgs: definition.maxArgs,
      hasExecute: typeof definition.execute === 'function'
    });

    console.log(`🎮 Executando: ${commandName}`, { args, playerId });

    // Valida argumentos
    const validationResult = this.validateArgs(definition, args);

    if (!validationResult.valid) {
      console.warn(`⚠️ Argumentos inválidos: ${validationResult.error}`);

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ ${validationResult.error}<br><small>Uso: ${definition.usage || commandName}</small>`,
          duration: 5000,
        });
      }

      return false;
    }

    console.log(`[CommandRegistry.execute] Argumentos válidos ✅`);

    // Verifica cooldown
    const cooldownResult = this.checkCooldown(playerId, commandName, definition.cooldown);

    if (!cooldownResult.allowed) {
      console.warn(`⏳ Cooldown ativo: ${cooldownResult.remaining}ms`);

      if (notificationManager) {
        const seconds = Math.ceil(cooldownResult.remaining / 1000);
        notificationManager.show({
          type: playerId,
          text: `⏳ Aguarde ${seconds}s`,
          duration: 2000,
        });
      }

      return false;
    }

    console.log(`[CommandRegistry.execute] Cooldown OK ✅`);

    try {
      console.log(`[CommandRegistry.execute] Chamando definition.execute()...`);
      
      // Executa handler
      const success = await definition.execute(playerId, args, {
        ...metadata,
        rawArgs,
        commandName,
      });

      console.log(`[CommandRegistry.execute] definition.execute() retornou: ${success} (tipo: ${typeof success})`);

      if (success) {
        this.stats.commandsExecuted++;

        // Atualiza cooldown
        if (definition.cooldown) {
          this.updateCooldown(playerId, commandName);
        }

        console.log(`✅ Comando executado: ${commandName}`);
      } else {
        this.stats.commandsFailed++;
        console.warn(`⚠️ Comando falhou: ${commandName}`);
      }

      return success;
    } catch (error) {
      console.error(`❌ Erro ao executar comando "${commandName}":`, error);
      console.error(`[CommandRegistry.execute] Stack trace:`, error.stack);
      this.stats.commandsFailed++;

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Erro ao executar comando`,
          duration: 3000,
        });
      }

      return false;
    }
  }

  // ============================================
  // PARSING E VALIDAÇÃO
  // ============================================

  /**
   * Parseia comando e argumentos
   * @private
   * @param {string} message
   * @returns {ParsedCommand|null}
   */
  parseCommand(message) {
    if (!message || typeof message !== "string") {
      return null;
    }

    const trimmed = message.trim();

    if (trimmed.length === 0) {
      return null;
    }

    // Separa comando e argumentos
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const rawArgs = parts.slice(1).join(" ");

    return {
      command,
      args,
      rawArgs,
    };
  }

  /**
   * Resolve nome real do comando (alias → nome)
   * @private
   * @param {string} input
   * @returns {string|null}
   */
  resolveCommandName(input) {
    const lower = input.toLowerCase();

    // Verifica se é comando direto
    if (this.commands.has(lower)) {
      return lower;
    }

    // Verifica se é alias
    if (this.aliases.has(lower)) {
      return this.aliases.get(lower);
    }

    return null;
  }

  /**
   * Valida argumentos do comando
   * @private
   * @param {CommandDefinition} definition
   * @param {Array<string>} args
   * @returns {Object} { valid: boolean, error?: string }
   */
  validateArgs(definition, args) {
    const { minArgs = 0, maxArgs = Infinity } = definition;

    // Valida mínimo
    if (args.length < minArgs) {
      return {
        valid: false,
        error: `Mínimo de ${minArgs} argumento(s)`,
      };
    }

    // Valida máximo
    if (args.length > maxArgs) {
      return {
        valid: false,
        error: `Máximo de ${maxArgs} argumento(s)`,
      };
    }

    return { valid: true };
  }

  // ============================================
  // COOLDOWNS
  // ============================================

  /**
   * Verifica cooldown de comando
   * @private
   * @param {string} playerId
   * @param {string} commandName
   * @param {number} [cooldownMs]
   * @returns {Object} { allowed: boolean, remaining?: number }
   */
  checkCooldown(playerId, commandName, cooldownMs) {
    if (!cooldownMs || cooldownMs <= 0) {
      return { allowed: true };
    }

    const key = `${playerId}_${commandName}`;
    const lastUsed = this.cooldowns.get(key);

    if (!lastUsed) {
      return { allowed: true };
    }

    const elapsed = Date.now() - lastUsed;
    const remaining = cooldownMs - elapsed;

    if (remaining <= 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      remaining,
    };
  }

  /**
   * Atualiza cooldown de comando
   * @private
   * @param {string} playerId
   * @param {string} commandName
   */
  updateCooldown(playerId, commandName) {
    const key = `${playerId}_${commandName}`;
    this.cooldowns.set(key, Date.now());

    // Cleanup de cooldowns antigos
    if (this.cooldowns.size > 200) {
      const now = Date.now();
      const toDelete = [];

      this.cooldowns.forEach((time, k) => {
        if (now - time > 60000) {
          // 1 minuto
          toDelete.push(k);
        }
      });

      toDelete.forEach((k) => this.cooldowns.delete(k));
    }
  }

  /**
   * Limpa todos os cooldowns
   */
  clearCooldowns() {
    this.cooldowns.clear();
    console.log("🧹 Cooldowns limpos");
  }

  // ============================================
  // SISTEMA DE AJUDA
  // ============================================

  /**
   * Mostra ajuda de comando específico
   * @private
   * @param {string} playerId
   * @param {string} commandInput
   * @returns {boolean}
   */
  showCommandHelp(playerId, commandInput) {
    const commandName = this.resolveCommandName(commandInput);

    if (!commandName) {
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Comando desconhecido: "${commandInput}"`,
          duration: 4000,
        });
      }

      return false;
    }

    const definition = this.commands.get(commandName);

    if (!definition) {
      return false;
    }

    // Monta mensagem de ajuda
    let helpText = `${this.commandPrefix} ${commandName}\n`;
    helpText += `${definition.description}\n`;

    if (definition.usage) {
      helpText += `Uso: ${definition.usage}\n`;
    }

    if (definition.aliases && definition.aliases.length > 0) {
      helpText += `Aliases: ${definition.aliases.join(", ")}`;
    }

    // Notificação UI
    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: helpText.replace(/\n/g, "<br>"),
        duration: 8000,
      });
    }

    // Chat da Live
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: { message: helpText },
      }),
    );

    return true;
  }

  /**
   * Mostra todos os comandos
   * @private
   * @param {string} playerId
   * @returns {boolean}
   */
  showAllCommands(playerId) {
    const commandList = Array.from(this.commands.keys()).sort();

    let helpText = "Comandos Disponíveis:\n";
    commandList.forEach((cmd) => {
      helpText += `• ${cmd}\n`;
    });
    helpText += `Use ${this.commandPrefix} help [comando] para detalhes`;

    // Notificação UI
    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: helpText.replace(/\n/g, "<br>"),
        duration: 10000,
      });
    }

    // Chat da Live
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: { message: helpText },
      }),
    );

    return true;
  }

  // ============================================
  // UTILITÁRIOS E GETTERS
  // ============================================

  /**
   * Define prefixo de comando
   * @param {string} prefix
   */
  setCommandPrefix(prefix) {
    this.commandPrefix = prefix;
    console.log(`🔧 Prefixo de comando: ${prefix}`);
  }

  /**
   * Obtém número de comandos registrados
   * @returns {number}
   */
  getCommandCount() {
    return this.commands.size;
  }

  /**
   * Lista todos os comandos
   * @returns {Array<string>}
   */
  listCommands() {
    return Array.from(this.commands.keys()).sort();
  }

  /**
   * Obtém definição de um comando
   * @param {string} name
   * @returns {CommandDefinition|null}
   */
  getCommand(name) {
    const commandName = this.resolveCommandName(name);
    return commandName ? this.commands.get(commandName) : null;
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      activeCooldowns: this.cooldowns.size,
    };
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Lista comandos com detalhes
   */
  debug() {
    console.log("\n🎮 === COMMAND REGISTRY DEBUG ===");
    console.log(`Prefixo: ${this.commandPrefix}`);
    console.log(`Comandos: ${this.commands.size}`);
    console.log(`Aliases: ${this.aliases.size}`);
    console.log("");

    this.commands.forEach((def, name) => {
      console.log(`📌 ${name}`, {
        aliases: def.aliases || [],
        minArgs: def.minArgs || 0,
        maxArgs: def.maxArgs || "∞",
        cooldown: def.cooldown || "none",
      });
    });

    console.log("\nStats:", this.getStats());
    console.log("=================================\n");
  }

  /**
   * Reset completo
   */
  reset() {
    this.commands.clear();
    this.aliases.clear();
    this.cooldowns.clear();

    this.stats = {
      commandsRegistered: 0,
      commandsExecuted: 0,
      commandsFailed: 0,
      aliasesRegistered: 0,
    };

    console.log("🔄 CommandRegistry resetado");
  }
}

// Singleton
export const commandRegistry = new CommandRegistry();

// Expõe globalmente para debug
window.commandRegistry = commandRegistry;

console.log("✅ CommandRegistry carregado");
console.log("💡 Use commandRegistry.debug() para ver comandos");
