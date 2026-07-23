/**
 * interactive-card-core.js - Sistema Core de Cartas Interativas
 *
 * Responsabilidades:
 * - Orquestrar execução de uma opção de carta interativa
 * - Resolver variáveis dinâmicas (${player}, ${turn}, etc.)
 * - Executar comandos via commandRegistry (sem depender do debugConsole)
 * - Rastrear histórico de escolhas
 * - Fornecer hooks extensíveis para features futuras
 *
 * Extensível: a carta interativa poderá fazer muito mais coisas no futuro.
 * executeOption() é o ponto de entrada que orquestra tudo.
 *
 * @module InteractiveCardCore
 */

import { sessionState } from "@core/session-state.js";
import { VariableResolver } from "@systems/cards/interativa/interactive-card-variables.js";
import { CommandExecutor } from "@systems/cards/interativa/interactive-card-commands.js";

/**
 * @typedef {Object} InteractiveOption
 * @property {string} texto          - Texto exibido ao jogador
 * @property {string[]|string} [commands] - Comandos a executar ao escolher
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} targetPlayerId   - ID do jogador alvo (quem jogou a carta)
 * @property {number} selectedIndex    - Índice da opção
 * @property {string} selectedOptionText
 * @property {number} timestamp
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} ChoiceRecord
 * @property {string} cardId
 * @property {string} playerId
 * @property {number} optionIndex
 * @property {string} optionText
 * @property {number} turn
 * @property {number} timestamp
 */

// ============================================
// HISTÓRICO DE ESCOLHAS (interno)
// ============================================

class ChoiceHistory {
  constructor(maxSize = 100) {
    this.records = [];
    this.maxSize = maxSize;
  }

  record(entry) {
    this.records.push(entry);
    if (this.records.length > this.maxSize) this.records.shift();
  }

  getRecords(playerId = null, limit = null) {
    let result = playerId ? this.records.filter((r) => r.playerId === playerId) : [...this.records];
    if (limit) result = result.slice(-limit);
    return result;
  }

  clear() {
    this.records = [];
  }
  size() {
    return this.records.length;
  }
}

// ============================================
// CLASSE PRINCIPAL
// ============================================

class InteractiveCardCore {
  constructor() {
    this.initialized = false;

    // Módulos internos (importados)
    this.variableResolver = new VariableResolver();
    this.commandExecutor = new CommandExecutor();
    this.choiceHistory = new ChoiceHistory(100);

    // Hooks extensíveis para features futuras da carta interativa
    this.hooks = {
      beforeExecution: [],
      afterExecution: [],
    };

    // Estatísticas
    this.stats = {
      totalExecutions: 0,
      totalCommands: 0,
      errors: 0,
    };
  }

  /**
   * Inicializa o sistema (deve ser chamado uma vez no boot)
   */
  init() {
    if (this.initialized) return;

    console.log("💬 InteractiveCardCore inicializando...");

    // Escuta evento para execução via DOM
    document.addEventListener("execute-interactive-card", async (e) => {
      const { option, context, cardId } = e.detail || {};
      if (option && context) await this.executeOption(option, context, cardId);
    });

    this.initialized = true;
    console.log("✅ InteractiveCardCore inicializado");
  }

  // ============================================
  // EXECUÇÃO DE OPÇÕES
  // ============================================

  /**
   * Ponto de entrada principal: executa uma opção de carta interativa.
   * É intencionalmente extensível — no futuro pode orquestrar
   * animações, efeitos sonoros, etc.
   *
   * @param {InteractiveOption} option
   * @param {ExecutionContext}  context
   * @param {string}            [cardId]
   * @returns {Promise<{success: boolean, commandsExecuted: number, error?: string}>}
   */
  async executeOption(option, context, cardId = null) {
    try {
      console.log(`💬 [InteractiveCard] Executando opção: "${context.selectedOptionText}"`);
      this.stats.totalExecutions++;

      if (!this._validateOption(option)) throw new Error("Opção inválida");

      // Hook: antes da execução
      await this._runHooks("beforeExecution", { option, context, cardId });

      // Registra no histórico
      this.choiceHistory.record({
        cardId: cardId || "unknown",
        playerId: context.targetPlayerId,
        optionIndex: context.selectedIndex,
        optionText: context.selectedOptionText,
        turn: sessionState.getGameState().turn,
        timestamp: context.timestamp,
      });

      // Extrai comandos (suporta array ou string multiline)
      const rawCommands = this._extractCommands(option);

      // Resolve variáveis em cada comando
      const resolvedCommands = rawCommands.map((cmd) => this.variableResolver.resolve(cmd, context));

      // Executa via commandRegistry (sem debugConsole)
      let commandsExecuted = 0;
      if (resolvedCommands.length > 0) {
        const results = await this.commandExecutor.executeAll(resolvedCommands, context.targetPlayerId);
        commandsExecuted = results.filter((r) => r.success).length;
        this.stats.totalCommands += resolvedCommands.length;
      }

      // Hook: após execução (para features futuras — animações, QTE, etc.)
      await this._runHooks("afterExecution", { option, context, cardId, commandsExecuted });

      console.log(`✅ [InteractiveCard] Opção concluída (${commandsExecuted} comandos)`);

      return { success: true, commandsExecuted };
    } catch (error) {
      console.error("❌ [InteractiveCard] Erro:", error);
      this.stats.errors++;
      return { success: false, commandsExecuted: 0, error: error.message };
    }
  }

  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  _validateOption(option) {
    if (!option) return false;
    if (typeof option === "string") return true;
    return typeof option === "object" && !!option.texto;
  }

  _extractCommands(option) {
    if (typeof option === "string") return [];
    const raw = option.commands;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((c) => c?.trim()).slice(0, 50);
    if (typeof raw === "string") {
      return raw
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    return [];
  }

  async _runHooks(name, data) {
    for (const fn of this.hooks[name] || []) {
      try {
        await fn(data);
      } catch (e) {
        console.error(`❌ Hook "${name}" falhou:`, e);
      }
    }
  }

  // ============================================
  // API PÚBLICA
  // ============================================

  /**
   * Cria um contexto de execução padrão
   */
  createContext(targetPlayerId, selectedIndex, selectedOptionText, metadata = {}) {
    return { targetPlayerId, selectedIndex, selectedOptionText, timestamp: Date.now(), metadata };
  }

  /**
   * Registra um hook (retorna função de cleanup)
   * @param {"beforeExecution"|"afterExecution"} hookName
   * @param {Function} callback
   */
  registerHook(hookName, callback) {
    if (!this.hooks[hookName]) this.hooks[hookName] = [];
    this.hooks[hookName].push(callback);
    return () => {
      const idx = this.hooks[hookName].indexOf(callback);
      if (idx > -1) this.hooks[hookName].splice(idx, 1);
    };
  }

  hasCommands(option) {
    return this._extractCommands(option).length > 0;
  }

  extractCommands(option) {
    return this._extractCommands(option);
  }

  getHistory(playerId = null, limit = null) {
    return this.choiceHistory.getRecords(playerId, limit);
  }

  clearHistory() {
    this.choiceHistory.clear();
    console.log("🧹 Histórico de escolhas limpo");
  }

  getStats() {
    return { ...this.stats, historySize: this.choiceHistory.size() };
  }

  showHelp() {
    this.variableResolver.showHelp();
  }

  debug() {
    console.log("💬 InteractiveCardCore:", {
      initialized: this.initialized,
      stats: this.getStats(),
      hooks: Object.fromEntries(Object.entries(this.hooks).map(([k, v]) => [k, v.length])),
    });
  }
}

// ============================================
// SINGLETON
// ============================================

export const interactiveCard = new InteractiveCardCore();

window.interactiveCard = interactiveCard;

console.log("✅ InteractiveCardCore carregado");
console.log("💡 interactiveCard.showHelp() para ver variáveis disponíveis");
