/**
 * interactive-card-variables.js - Sistema de Variáveis Dinâmicas
 *
 * Responsabilidades:
 * - Resolver variáveis ${variavel} em strings
 * - Gerenciar registry de variáveis disponíveis
 * - Suporte a variáveis customizadas
 * - Validação e escape de valores
 * - Cache de resoluções frequentes
 *
 * @module InteractiveCardVariables
 */

import { playerManager } from "@systems/player/player-manager.js";
import { sessionState } from "@core/session-state.js";
import { gameTimer } from "@core/game-timer.js";
import { turnSystem } from "@core/turn-system.js";

/**
 * @typedef {Object} VariableDefinition
 * @property {string} name - Nome da variável
 * @property {string} description - Descrição
 * @property {string} example - Exemplo de uso
 * @property {Function} resolver - Função que resolve o valor
 * @property {string} [category] - Categoria (player, game, etc)
 */

class VariableResolver {
  constructor() {
    // Registry de variáveis
    this.variables = new Map();

    // Cache de resoluções (para otimização)
    this.cache = new Map();
    this.cacheEnabled = true;
    this.cacheTTL = 1000; // ms

    // Estatísticas
    this.stats = {
      resolutions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
    };

    // Registra variáveis padrão
    this._registerDefaultVariables();
  }

  // ============================================
  // REGISTRO DE VARIÁVEIS
  // ============================================

  /**
   * Registra variáveis padrão do sistema
   * @private
   */
  _registerDefaultVariables() {
    // ========== VARIÁVEIS DE JOGADOR ==========

    this.register({
      name: "player",
      description: "ID do jogador alvo (player1 ou player2)",
      example: "/game ${player} abrir 5",
      category: "player",
      resolver: (context) => context.targetPlayerId,
    });

    this.register({
      name: "playerrival",
      description: "ID do jogador rival (oposto ao alvo)",
      example: "/game ${playerrival} abrir 10",
      category: "player",
      resolver: (context) => {
        return context.targetPlayerId === "player1" ? "player2" : "player1";
      },
    });

    this.register({
      name: "playername",
      description: "Nome do jogador alvo",
      example: "Parabéns ${playername}!",
      category: "player",
      resolver: (context) => {
        return playerManager.getPlayerName(context.targetPlayerId);
      },
    });

    this.register({
      name: "playerrivalname",
      description: "Nome do jogador rival",
      example: "${playerrivalname} perdeu!",
      category: "player",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        return playerManager.getPlayerName(rivalId);
      },
    });

    // ========== VARIÁVEIS DE STATUS ==========

    this.register({
      name: "playerhp",
      description: "HP atual do jogador alvo",
      example: "HP: ${playerhp}",
      category: "status",
      resolver: (context) => {
        const player = sessionState.getPlayer(context.targetPlayerId);
        return player ? player.hp : 0;
      },
    });

    this.register({
      name: "playerrivalhp",
      description: "HP atual do jogador rival",
      example: "HP rival: ${playerrivalhp}",
      category: "status",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        const rival = sessionState.getPlayer(rivalId);
        return rival ? rival.hp : 0;
      },
    });

    this.register({
      name: "playerbl",
      description: "BL (comandante) do jogador alvo",
      example: "BL: ${playerbl}",
      category: "status",
      resolver: (context) => {
        const player = sessionState.getPlayer(context.targetPlayerId);
        return player ? player.bl : 0;
      },
    });

    this.register({
      name: "playerrivalbl",
      description: "BL do jogador rival",
      example: "BL rival: ${playerrivalbl}",
      category: "status",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        const rival = sessionState.getPlayer(rivalId);
        return rival ? rival.bl : 0;
      },
    });

    // ========== VARIÁVEIS DE CLASSE ==========

    this.register({
      name: "playerclass",
      description: "Nome COMPLETO da classe do jogador alvo",
      example: "Classe: ${playerclass}",
      category: "class",
      resolver: (context) => {
        const player = sessionState.getPlayer(context.targetPlayerId);
        return player && player.class ? player.class.name : "none";
      },
    });

    this.register({
      name: "playerrivalclass",
      description: "Nome COMPLETO da classe do jogador rival",
      example: "Rival: ${playerrivalclass}",
      category: "class",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        const rival = sessionState.getPlayer(rivalId);
        return rival && rival.class ? rival.class.name : "none";
      },
    });

    this.register({
      name: "playerclassbase",
      description: "Classe BASE do jogador (sem prefixos DPS/Break/etc)",
      example: "/game ${player} ${playerclassbase}",
      category: "class",
      resolver: (context) => {
        const player = sessionState.getPlayer(context.targetPlayerId);
        const fullName = player && player.class ? player.class.name : "";
        return this._extractBaseClass(fullName);
      },
    });

    this.register({
      name: "playerrivalclassbase",
      description: "Classe BASE do rival (sem prefixos)",
      example: "/game ${playerrival} DPS${playerrivalclassbase}",
      category: "class",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        const rival = sessionState.getPlayer(rivalId);
        const fullName = rival && rival.class ? rival.class.name : "";
        return this._extractBaseClass(fullName);
      },
    });

    this.register({
      name: "playerclassprefix",
      description: "Apenas o PREFIXO da classe do jogador (DPS, Break, etc)",
      example: "Prefixo: ${playerclassprefix}",
      category: "class",
      resolver: (context) => {
        const player = sessionState.getPlayer(context.targetPlayerId);
        const fullName = player && player.class ? player.class.name : "";
        return this._extractClassPrefix(fullName);
      },
    });

    this.register({
      name: "playerrivalclassprefix",
      description: "Apenas o PREFIXO da classe do rival",
      example: "Rival é: ${playerrivalclassprefix}",
      category: "class",
      resolver: (context) => {
        const rivalId = context.targetPlayerId === "player1" ? "player2" : "player1";
        const rival = sessionState.getPlayer(rivalId);
        const fullName = rival && rival.class ? rival.class.name : "";
        return this._extractClassPrefix(fullName);
      },
    });

    // ========== VARIÁVEIS DE JOGO ==========

    this.register({
      name: "turn",
      description: "Número do turno atual",
      example: "Turno ${turn}",
      category: "game",
      resolver: () => {
        return turnSystem.current;
      },
    });

    this.register({
      name: "timer",
      description: "Tempo de jogo em segundos",
      example: "Tempo: ${timer}s",
      category: "game",
      resolver: () => {
        return gameTimer.seconds;
      },
    });

    // ========== VARIÁVEIS DE OPÇÃO ==========

    this.register({
      name: "optionindex",
      description: "Número da opção selecionada (1-N)",
      example: "Você escolheu opção ${optionindex}",
      category: "option",
      resolver: (context) => {
        return context.selectedIndex + 1;
      },
    });

    this.register({
      name: "optiontext",
      description: "Texto da opção selecionada",
      example: "Você escolheu: ${optiontext}",
      category: "option",
      resolver: (context) => {
        return context.selectedOptionText;
      },
    });

    console.log(`✅ ${this.variables.size} variáveis padrão registradas`);
  }

  /**
   * Registra uma nova variável
   * @param {VariableDefinition} definition
   */
  register(definition) {
    if (!definition.name || !definition.resolver) {
      console.error("❌ Definição de variável inválida:", definition);
      return;
    }

    this.variables.set(definition.name.toLowerCase(), definition);
  }

  /**
   * Remove uma variável
   * @param {string} name
   */
  unregister(name) {
    this.variables.delete(name.toLowerCase());
  }

  // ============================================
  // RESOLUÇÃO DE VARIÁVEIS
  // ============================================

  /**
   * Processa string substituindo todas as variáveis
   * @param {string} text - Texto com variáveis
   * @param {Object} context - Contexto de execução
   * @returns {string}
   */
  resolve(text, context) {
    if (!text || typeof text !== "string") return text;

    this.stats.resolutions++;

    // Verifica cache
    const cacheKey = this._getCacheKey(text, context);
    if (this.cacheEnabled) {
      const cached = this._getFromCache(cacheKey);
      if (cached !== null) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    let processed = text;

    // Processa cada variável registrada
    this.variables.forEach((definition, varName) => {
      const regex = new RegExp(`\\$\\{${varName}\\}`, "gi");

      if (regex.test(processed)) {
        try {
          const value = definition.resolver(context);
          const safeValue = this._sanitizeValue(value);
          processed = processed.replace(regex, safeValue);
        } catch (error) {
          console.error(`❌ Erro ao resolver variável ${varName}:`, error);
          this.stats.errors++;
          // Mantém variável original em caso de erro
        }
      }
    });

    // Salva no cache
    if (this.cacheEnabled) {
      this._saveToCache(cacheKey, processed);
    }

    return processed;
  }

  /**
   * Sanitiza valor antes de inserir na string
   * @private
   * @param {*} value
   * @returns {string}
   */
  _sanitizeValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // ============================================
  // HELPERS DE CLASSE
  // ============================================

  /**
   * Extrai classe base removendo prefixos
   * @private
   * @param {string} fullClassName
   * @returns {string}
   */
  _extractBaseClass(fullClassName) {
    if (!fullClassName || typeof fullClassName !== "string") return "";

    const knownPrefixes = ["DPS", "Break", "Tank", "Support", "Healer"];
    let baseName = fullClassName.trim();

    for (const prefix of knownPrefixes) {
      const pattern = new RegExp(`^${prefix}\\s+`, "i");
      if (pattern.test(baseName)) {
        baseName = baseName.replace(pattern, "").trim();
        break;
      }
    }

    return baseName;
  }

  /**
   * Extrai apenas o prefixo da classe
   * @private
   * @param {string} fullClassName
   * @returns {string}
   */
  _extractClassPrefix(fullClassName) {
    if (!fullClassName || typeof fullClassName !== "string") return "";

    const knownPrefixes = ["DPS", "Break", "Tank", "Support", "Healer"];
    const parts = fullClassName.trim().split(/\s+/);

    if (parts.length === 1) return "";

    const firstWord = parts[0];
    if (knownPrefixes.some((prefix) => prefix.toLowerCase() === firstWord.toLowerCase())) {
      return firstWord;
    }

    return "";
  }

  // ============================================
  // SISTEMA DE CACHE
  // ============================================

  /**
   * Gera chave de cache
   * @private
   * @param {string} text
   * @param {Object} context
   * @returns {string}
   */
  _getCacheKey(text, context) {
    // Cache baseado em texto + turno (para invalidar quando jogo avança)
    const turn = turnSystem.current;
    return `${text}_${turn}_${context.targetPlayerId}`;
  }

  /**
   * Obtém do cache
   * @private
   * @param {string} key
   * @returns {string|null}
   */
  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Verifica TTL
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Salva no cache
   * @private
   * @param {string} key
   * @param {string} value
   */
  _saveToCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });

    // Limita tamanho do cache
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Limpa cache
   */
  clearCache() {
    this.cache.clear();
    console.log("🧹 Cache de variáveis limpo");
  }

  // ============================================
  // INFORMAÇÕES E DEBUG
  // ============================================

  /**
   * Lista todas as variáveis disponíveis
   * @param {string} [category] - Filtrar por categoria
   * @returns {Array<VariableDefinition>}
   */
  listVariables(category = null) {
    const vars = Array.from(this.variables.values());

    if (category) {
      return vars.filter((v) => v.category === category);
    }

    return vars;
  }

  /**
   * Mostra ajuda sobre variáveis
   */
  showHelp() {
    console.log("📖 [Variáveis Interativas] Disponíveis:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const categories = ["player", "status", "class", "game", "option"];

    categories.forEach((category) => {
      const vars = this.listVariables(category);
      if (vars.length === 0) return;

      console.log(`\n📁 ${category.toUpperCase()}:`);
      vars.forEach((v) => {
        console.log(`  ${v.name.padEnd(25)} - ${v.description}`);
        console.log(`  ${"".padEnd(25)}   Ex: ${v.example}`);
        console.log("");
      });
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 Dica: Combine variáveis para criar comandos dinâmicos!");
    console.log("   Ex: /game ${playerrival} DPS${playerrivalclassbase}");
    console.log("       (Muda rival para versão DPS da classe base dele)");
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    const hitRate =
      this.stats.resolutions > 0 ? ((this.stats.cacheHits / this.stats.resolutions) * 100).toFixed(2) + "%" : "0%";

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: hitRate,
      variablesRegistered: this.variables.size,
    };
  }

  /**
   * Debug: Mostra informações
   */
  debug() {
    console.log("📖 VariableResolver Debug:");
    console.log("  Estatísticas:", this.getStats());
    console.log("  Categorias:", Array.from(new Set(Array.from(this.variables.values()).map((v) => v.category))));
  }
}

// ============================================
// EXPORT
// ============================================

export { VariableResolver };

console.log("✅ VariableResolver carregado");
