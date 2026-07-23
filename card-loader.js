/**
 * card-loader.js - Sistema de Carregamento de Configurações de Cartas
 *
 * Responsabilidades:
 * - Carregar configurações de cartas do ConfigManager
 * - Validar estruturas de dados
 * - Resolver caminhos de assets (imagem, áudio, vídeo)
 * - Cache de configurações carregadas
 * - Verificar existência de assets
 *
 * NOTA: Adaptado para novo sistema de cartas (v2.0)
 * - Cartas agora são criadas manualmente (não automaticamente)
 * - IDs no formato card_1, card_62, card_110 (sem zero-padding)
 * - Se carta não existe, retorna null (não cria)
 *
 * @module CardLoader
 */

import { configManager } from "@core/config-manager.js";
import { assetResolver } from "@core/asset-resolver.js";

/**
 * @typedef {Object} CardConfig
 * @property {string} tipo - 'dano', 'cura', 'bloqueio', 'buff', 'qte', 'interativa'
 * @property {number} valor - Valor numérico do efeito
 * @property {string} descricao - Descrição da carta
 * @property {string} categoria - 'normal', 'ultimate', 'special'
 * @property {string} [efeito] - 'adicionar', 'percentual', 'multiplicar', 'negar', 'fixo', 'refletir'
 * @property {string} [element] - Elemento da carta
 * @property {number} [elementDamage] - % de dano elemental (0-100)
 * @property {number} [blValor] - Modificação de BL
 * @property {Object} [duração] - { tipo: 'turnos'|'usos'|'nenhuma', valor: number }
 * @property {number} [cooldown] - Cooldown em turnos
 * @property {number} [ultimateCooldown] - Cooldown de ultimate
 * @property {boolean} [holdable] - Pode ser segurada?
 * @property {Object} [assets] - Assets customizados por jogo
 * @property {Object} assets.image - Configuração de imagem
 * @property {string} [assets.image.source] - 'default' | 'upload'
 * @property {string} [assets.audio] - Configuração de áudios
 * @property {string} [assets.audio.onReveal] - Áudio ao revelar
 * @property {string} [assets.audio.onPlay] - Áudio ao usar/jogar
 * @property {string} [assets.audio.onHit] - Áudio ao acertar
 * @property {Array<string>} [opcoes_interativa] - Opções para cartas interativas
 * @property {Array<Object>} [personagens] - Personagens para QTE
 * @property {Object} [resistances] - Resistências elementais
 */

/**
 * @typedef {Object} ResolvedCardAssets
 * @property {string} imagePath - URL da imagem
 * @property {string|null} audioRevealPath - URL do áudio de reveal
 * @property {string|null} audioUsePath - URL do áudio de uso
 * @property {string|null} videoRevealPath - URL do vídeo de reveal
 * @property {string|null} videoUsePath - URL do vídeo de uso
 */

class CardLoader {
  constructor() {
    // Cache de configurações carregadas
    this.configCache = new Map();

    // Cache de assets resolvidos
    this.assetCache = new Map();

    // Estatísticas
    this.stats = {
      configHits: 0,
      configMisses: 0,
      assetHits: 0,
      assetMisses: 0,
      validationErrors: 0,
    };

    // Tipos válidos de carta
    this.validTypes = ["dano", "cura", "bloqueio", "buff", "qte", "interativa"];

    // Categorias válidas
    this.validCategories = ["normal", "ultimate", "special"];

    // Efeitos válidos
    this.validEffects = ["adicionar", "percentual", "multiplicar", "negar", "fixo", "refletir"];

    this.initialized = false;
  }

  /**
   * Inicializa o sistema de carregamento
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ CardLoader já foi inicializado");
      return;
    }

    console.log("📦 CardLoader inicializando...");

    // Pré-carrega elementos disponíveis
    this.availableElements = this._loadAvailableElements();

    this.initialized = true;
    console.log("✅ CardLoader inicializado");
    console.log(`  📊 Elementos disponíveis: ${this.availableElements.join(", ")}`);
  }

  /**
   * Carrega elementos disponíveis do config
   * @private
   * @returns {Array<string>}
   */
  _loadAvailableElements() {
    const elements = configManager.get("elements") || [];

    if (elements.length === 0) {
      console.warn("⚠️ Nenhum elemento encontrado no config, usando padrões");
      return ["Physical", "Fire", "Ice", "Lightning", "Dark"];
    }

    return elements;
  }

  // ============================================
  // CARREGAMENTO DE CONFIGURAÇÕES
  // ============================================

  /**
   * Carrega configuração de uma carta
   *
   * ⭐ IMPORTANTE (v2.0):
   * - Cartas não são mais criadas automaticamente
   * - Se carta não existir no sistema, retorna null
   * - Use configManager.addCard() para criar novas cartas
   *
   * @param {string|number} cardIdentifier - Número da carta, ID ou URL da imagem
   * @returns {Promise<CardConfig|null>}
   */
  async loadConfig(cardIdentifier) {
    try {
      // Extrai número da carta do identificador
      const cardNumber = this._extractCardNumber(cardIdentifier);

      if (!cardNumber) {
        console.error(`❌ Identificador de carta inválido: ${cardIdentifier}`);
        return null;
      }

      // Verifica cache
      const cacheKey = `card_${cardNumber}`;

      if (this.configCache.has(cacheKey)) {
        this.stats.configHits++;
        return this.configCache.get(cacheKey);
      }

      this.stats.configMisses++;

      // Carrega do ConfigManager
      const config = await this._loadFromConfigManager(cardNumber);

      if (!config) {
        console.warn(`⚠️ Configuração não encontrada para carta ${cardNumber}`);
        return null;
      }

      // Valida estrutura
      const validatedConfig = this._validateAndEnrich(config, cardNumber);

      if (!validatedConfig) {
        console.error(`❌ Validação falhou para carta ${cardNumber}`);
        this.stats.validationErrors++;
        return null;
      }

      // Armazena no cache
      this.configCache.set(cacheKey, validatedConfig);

      console.log(`📦 Configuração carregada: card_${cardNumber} (${validatedConfig.tipo})`);

      return validatedConfig;
    } catch (error) {
      console.error(`❌ Erro ao carregar configuração:`, error);
      return null;
    }
  }

  /**
   * Extrai número da carta de um identificador
   * @private
   * @param {string|number} identifier - URL, número ou nome
   * @returns {number|null}
   */
  _extractCardNumber(identifier) {
    if (identifier == null) return null;

    // 1. Se já for número
    if (typeof identifier === "number") {
      return identifier;
    }

    const str = String(identifier);

    // 2. Se for string puramente numérica ("5", "123")
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10);
    }

    // 3. Remove query string (ex: ?t=123) antes de analisar caminhos
    const cleanStr = str.split("?")[0];

    // 4. Se for URL ou caminho com prefixo (ex: "cards/card_5.gif" ou "card_5")
    const cardMatch = cleanStr.match(/card[_-]?(\d+)/i);
    if (cardMatch && cardMatch[1]) {
      return parseInt(cardMatch[1], 10);
    }

    // 5. Se for número puro no final de um path (ex: "cards/5" ou "cards/5.gif")
    const pathMatch = cleanStr.match(/(?:^|\/)(\d+)(?:\.[a-z0-9]+)?$/i);
    if (pathMatch && pathMatch[1]) {
      return parseInt(pathMatch[1], 10);
    }

    console.warn(`⚠️ Não foi possível extrair número de: ${identifier}`);
    console.log(`DEBUG: Input type: ${typeof identifier}, string value: ${str}`);
    return null;
  }

  /**
   * Carrega configuração do ConfigManager
   * @private
   * @param {number} cardNumber
   * @returns {Promise<Object|null>}
   */
  async _loadFromConfigManager(cardNumber) {
    // IDs no config não usam zero-padding (card_62, não card_062)
    const cardId = `card_${cardNumber}`;
    const card = configManager.getCardById(cardId);

    if (!card) {
      // ⭐ IMPORTANTE: Não cria mais automaticamente!
      // No novo sistema, cartas só existem quando criadas manualmente
      console.warn(`⚠️ Carta ${cardId} não encontrada no sistema`);
      return null;
    }

    return card;
  }

  /**
   * Valida e enriquece configuração
   * @private
   * @param {Object} rawConfig
   * @param {number} cardNumber
   * @returns {CardConfig|null}
   */
  _validateAndEnrich(rawConfig, cardNumber) {
    if (!rawConfig || typeof rawConfig !== "object") {
      console.error(`❌ Config inválida para carta ${cardNumber}:`, rawConfig);
      return null;
    }

    // Cria cópia para não modificar original
    const config = { ...rawConfig };

    // 1. Valida campos obrigatórios
    if (!config.tipo) {
      console.error(`❌ Carta ${cardNumber}: campo 'tipo' ausente`);
      return null;
    }

    if (!this.validTypes.includes(config.tipo)) {
      console.error(`❌ Carta ${cardNumber}: tipo inválido '${config.tipo}'`);
      console.log(`   Tipos válidos: ${this.validTypes.join(", ")}`);
      return null;
    }

    // 2. Valores padrão essenciais
    config.valor = Number(config.valor) || 0;
    config.descricao = config.descricao || `Carta ${cardNumber}`;
    config.categoria = config.categoria || "normal";

    // 3. Valida categoria
    if (!this.validCategories.includes(config.categoria)) {
      console.warn(`⚠️ Carta ${cardNumber}: categoria '${config.categoria}' inválida, usando 'normal'`);
      config.categoria = "normal";
    }

    // 4. Valida efeito (se presente)
    if (config.efeito && !this.validEffects.includes(config.efeito)) {
      console.warn(`⚠️ Carta ${cardNumber}: efeito '${config.efeito}' inválido`);
    }

    // 5. Valida elemento (se presente)
    if (config.element && !this.availableElements.includes(config.element)) {
      console.warn(`⚠️ Carta ${cardNumber}: elemento '${config.element}' não está registrado`);
    }

    // 6. Valida elementDamage
    if (config.elementDamage !== undefined) {
      config.elementDamage = Math.max(0, Math.min(100, Number(config.elementDamage) || 0));
    }

    // 7. Normaliza duração
    config.duração = this._normalizeDuration(config.duração || config.duracao);

    // 8. Valida cooldowns
    if (config.cooldown !== undefined) {
      config.cooldown = Math.max(0, Number(config.cooldown) || 0);
    }

    if (config.ultimateCooldown !== undefined) {
      config.ultimateCooldown = Math.max(0, Number(config.ultimateCooldown) || 0);
    }

    // 9. Valida BL
    if (config.blValor !== undefined) {
      config.blValor = Number(config.blValor) || 0;
    }

    // 10. Validações específicas por tipo
    const typeValidation = this._validateByType(config, cardNumber);

    if (!typeValidation.valid) {
      console.error(`❌ Carta ${cardNumber}: ${typeValidation.error}`);
      return null;
    }

    // 11. Adiciona metadados
    config._cardNumber = cardNumber;
    config._validated = true;
    config._validatedAt = Date.now();

    return config;
  }

  /**
   * Normaliza campo de duração
   * @private
   * @param {Object|undefined} duracao
   * @returns {Object}
   */
  _normalizeDuration(duracao) {
    if (!duracao) {
      return { tipo: "nenhuma", valor: 0 };
    }

    const normalized = {
      tipo: duracao.tipo || "nenhuma",
      valor: Number(duracao.valor) || 0,
    };

    // Valida tipo de duração
    const validDurationTypes = ["turnos", "usos", "nenhuma"];

    if (!validDurationTypes.includes(normalized.tipo)) {
      console.warn(`⚠️ Tipo de duração inválido: ${normalized.tipo}, usando 'nenhuma'`);
      normalized.tipo = "nenhuma";
    }

    return normalized;
  }

  /**
   * Valida configuração específica por tipo
   * @private
   * @param {CardConfig} config
   * @param {number} cardNumber
   * @returns {Object} { valid: boolean, error?: string }
   */
  _validateByType(config, cardNumber) {
    switch (config.tipo) {
      case "interativa":
        if (!config.opcoes_interativa || !Array.isArray(config.opcoes_interativa)) {
          return {
            valid: false,
            error: "Carta interativa requer 'opcoes_interativa' (array)",
          };
        }

        if (config.opcoes_interativa.length === 0) {
          return {
            valid: false,
            error: "Carta interativa precisa de pelo menos 1 opção",
          };
        }
        break;

      case "qte":
        // Personagens vêm de characters (configuração global)
        if (config.personagens) {
          if (!Array.isArray(config.personagens)) {
            return {
              valid: false,
              error: "QTE 'personagens' deve ser um array",
            };
          }

          if (config.personagens.length > 0 && config.personagens.length < 1) {
            console.warn(`⚠️ Carta ${cardNumber}: QTE com personagens deve ter pelo menos 1`);
          }
        }
        break;

      case "bloqueio":
        // Validação de resistências (se houver)
        if (config.resistances) {
          if (typeof config.resistances !== "object") {
            return {
              valid: false,
              error: "Bloqueio 'resistances' deve ser um objeto",
            };
          }

          // Valida valores de resistência (0-100)
          Object.keys(config.resistances).forEach((element) => {
            const value = config.resistances[element];

            if (typeof value !== "number" || value < 0 || value > 100) {
              console.warn(`⚠️ Carta ${cardNumber}: resistência '${element}' com valor inválido (${value})`);
              config.resistances[element] = Math.max(0, Math.min(100, Number(value) || 0));
            }
          });
        }
        break;
    }

    return { valid: true };
  }

  // ============================================
  // RESOLUÇÃO DE ASSETS
  // ============================================

  /**
   * Helper: obtém áudio filename da nova estrutura ou legacy
   * @param {CardConfig} config
   * @param {string} audioType - 'onReveal' | 'onPlay' | 'onHit'
   * @returns {string|null}
   */
  _getAudioFilename(config, audioType) {
    // NOVA estrutura: config.assets.audio.{audioType}.filename
    if (config.assets?.audio?.[audioType]?.filename) {
      return config.assets.audio[audioType].filename;
    }

    // LEGACY estrutura: config.audioOn{Capitalized}
    const legacyKey = `audio${audioType.charAt(0).toUpperCase()}${audioType.slice(1)}`;
    return config[legacyKey] || null;
  }

  /**
   * Helper: obtém vídeo filename da nova estrutura ou legacy
   * @param {CardConfig} config
   * @param {string} videoType - 'onReveal' | 'onPlay' | 'onUse'
   * @returns {string|null}
   */
  _getVideoFilename(config, videoType) {
    // NOVA estrutura: config.assets.video.{videoType}.filename
    if (config.assets?.video?.[videoType]?.filename) {
      return config.assets.video[videoType].filename;
    }

    // LEGACY estrutura: config.videoOn{Capitalized}
    const legacyKey = `video${videoType.charAt(0).toUpperCase()}${videoType.slice(1)}`;
    return config[legacyKey] || null;
  }

  /**
   * Resolve todos os assets de uma carta
   * @param {number} cardNumber
   * @param {CardConfig} config
   * @returns {Promise<ResolvedCardAssets>}
   */
  async resolveAssets(cardNumber, config) {
    // Verifica cache de assets
    const cacheKey = `assets_${cardNumber}`;

    if (this.assetCache.has(cacheKey)) {
      this.stats.assetHits++;
      return this.assetCache.get(cacheKey);
    }

    this.stats.assetMisses++;

    const resolved = {
      imagePath: null,
      audioRevealPath: null,
      audioPlayPath: null,
      audioHitPath: null,
      videoRevealPath: null,
      videoPlayPath: null,
      videoUsePath: null,
    };

    // 1. Imagem (obrigatória)
    // Tenta nova estrutura customizada primeiro
    if (config.assets?.image?.filename) {
      resolved.imagePath = assetResolver.customAsset(`cards/${config.assets.image.filename}`);
    } else {
      resolved.imagePath = assetResolver.card(cardNumber);
    }

    // 2. Áudio de Reveal (opcional)
    const audioRevealFile = this._getAudioFilename(config, "onReveal");
    if (audioRevealFile) {
      resolved.audioRevealPath = assetResolver.audio(audioRevealFile);
    }

    // 3. Áudio de Play (opcional) - ERA "audioOnUse"
    const audioPlayFile = this._getAudioFilename(config, "onPlay");
    if (audioPlayFile) {
      resolved.audioPlayPath = assetResolver.audio(audioPlayFile);
    }

    // 4. Áudio de Hit (opcional)
    const audioHitFile = this._getAudioFilename(config, "onHit");
    if (audioHitFile) {
      resolved.audioHitPath = assetResolver.audio(audioHitFile);
    }

    // 5. Vídeo de Reveal (opcional)
    const videoRevealFile = this._getVideoFilename(config, "onReveal");
    if (videoRevealFile) {
      resolved.videoRevealPath = assetResolver.cardVideo(videoRevealFile);
    }

    // 6. Vídeo de Play (opcional)
    const videoPlayFile = this._getVideoFilename(config, "onPlay");
    if (videoPlayFile) {
      resolved.videoPlayPath = assetResolver.cardVideo(videoPlayFile);
    }

    // 7. Vídeo de Uso (opcional)
    const videoUseFile = this._getVideoFilename(config, "onUse");
    if (videoUseFile) {
      resolved.videoUsePath = assetResolver.cardVideo(videoUseFile);
    }

    // Armazena no cache
    this.assetCache.set(cacheKey, resolved);

    console.log(`🎨 Assets resolvidos para card_${cardNumber}`);

    return resolved;
  }

  /**
   * Verifica se assets existem (para validação)
   * @param {ResolvedCardAssets} assets
   * @returns {Promise<Object>}
   */
  async validateAssets(assets) {
    const results = {
      image: false,
      audioReveal: null,
      audioUse: null,
      videoReveal: null,
      videoUse: null,
    };

    // Verifica imagem (obrigatória)
    results.image = await assetResolver.exists(assets.imagePath);

    // Verifica opcionais se definidos
    if (assets.audioRevealPath) {
      results.audioReveal = await assetResolver.exists(assets.audioRevealPath);
    }

    if (assets.audioUsePath) {
      results.audioUse = await assetResolver.exists(assets.audioUsePath);
    }

    if (assets.videoRevealPath) {
      results.videoReveal = await assetResolver.exists(assets.videoRevealPath);
    }

    if (assets.videoUsePath) {
      results.videoUse = await assetResolver.exists(assets.videoUsePath);
    }

    return results;
  }

  // ============================================
  // CARREGAMENTO EM LOTE
  // ============================================

  /**
   * Carrega múltiplas cartas de uma vez
   * @param {Array<number>} cardNumbers
   * @returns {Promise<Map<number, CardConfig>>}
   */
  async loadMultiple(cardNumbers) {
    console.log(`📦 Carregando ${cardNumbers.length} carta(s)...`);

    const results = new Map();
    const promises = cardNumbers.map(async (num) => {
      const config = await this.loadConfig(num);
      return { num, config };
    });

    const settled = await Promise.allSettled(promises);

    settled.forEach((result) => {
      if (result.status === "fulfilled" && result.value.config) {
        results.set(result.value.num, result.value.config);
      }
    });

    console.log(`✅ ${results.size}/${cardNumbers.length} carta(s) carregadas com sucesso`);

    return results;
  }

  /**
   * Pré-carrega configurações de cartas ativas
   * @returns {Promise<Map<number, CardConfig>>}
   */
  async preloadActiveCards() {
    const activeCards = configManager.getActiveCards();

    console.log(`🔄 Pré-carregando ${activeCards.length} carta(s) ativa(s)...`);

    const configs = await this.loadMultiple(activeCards);

    console.log(`✅ Pré-carregamento concluído`);

    return configs;
  }

  // ============================================
  // CACHE E LIMPEZA
  // ============================================

  /**
   * Limpa cache de configurações
   * @param {number|null} cardNumber - Carta específica ou null para limpar tudo
   */
  clearConfigCache(cardNumber = null) {
    if (cardNumber !== null) {
      const key = `card_${cardNumber}`;
      this.configCache.delete(key);
      console.log(`🧹 Cache limpo para card_${cardNumber}`);
    } else {
      this.configCache.clear();
      console.log("🧹 Cache de configurações limpo completamente");
    }
  }

  /**
   * Limpa cache de assets
   * @param {number|null} cardNumber - Carta específica ou null para limpar tudo
   */
  clearAssetCache(cardNumber = null) {
    if (cardNumber !== null) {
      const key = `assets_${cardNumber}`;
      this.assetCache.delete(key);
      console.log(`🧹 Cache de assets limpo para card_${cardNumber}`);
    } else {
      this.assetCache.clear();
      console.log("🧹 Cache de assets limpo completamente");
    }
  }

  /**
   * Limpa todos os caches
   */
  clearAllCaches() {
    this.clearConfigCache();
    this.clearAssetCache();
    this.resetStats();
    console.log("🧹 Todos os caches limpos e stats resetadas");
  }

  /**
   * Reseta estatísticas
   */
  resetStats() {
    this.stats = {
      configHits: 0,
      configMisses: 0,
      assetHits: 0,
      assetMisses: 0,
      validationErrors: 0,
    };
  }

  // ============================================
  // UTILITÁRIOS E GETTERS
  // ============================================

  /**
   * Obtém estatísticas do loader
   * @returns {Object}
   */
  getStats() {
    const configTotal = this.stats.configHits + this.stats.configMisses;
    const assetTotal = this.stats.assetHits + this.stats.assetMisses;

    return {
      ...this.stats,
      configCacheSize: this.configCache.size,
      assetCacheSize: this.assetCache.size,
      configHitRate: configTotal > 0 ? ((this.stats.configHits / configTotal) * 100).toFixed(2) + "%" : "0%",
      assetHitRate: assetTotal > 0 ? ((this.stats.assetHits / assetTotal) * 100).toFixed(2) + "%" : "0%",
    };
  }

  /**
   * Extrai número da carta de um identificador (método público)
   * Wrapper público de _extractCardNumber para uso por módulos externos
   * @param {string|number} identifier - URL, número ou ID (ex: "card_5", 5, "cards/card_62.gif")
   * @returns {number|null}
   */
  extractCardNumber(identifier) {
    return this._extractCardNumber(identifier);
  }

  /**
   * Retorna números das cartas ativas (converte IDs para números)
   * Evita que módulos externos acessem o configManager diretamente
   * @returns {Array<number>}
   */
  getActiveCardNumbers() {
    const activeIds = configManager.getActiveCards();
    return activeIds.map((id) => this._extractCardNumber(id)).filter((num) => num !== null);
  }

  /**
   * Resolve caminho de asset de tema de carta interativa
   * Evita que módulos externos chamem assetResolver diretamente para assets de cartas
   * @param {string} filename - Nome do arquivo (ex: "fundo.png")
   * @returns {string} URL resolvida
   */
  resolveThemeAsset(filename) {
    return assetResolver.customAsset(`cards/temas/${filename}`);
  }

  /**
   * Verifica se uma carta está em cache
   * @param {number} cardNumber
   * @returns {boolean}
   */
  isConfigCached(cardNumber) {
    return this.configCache.has(`card_${cardNumber}`);
  }

  /**
   * Verifica se assets de uma carta estão em cache
   * @param {number} cardNumber
   * @returns {boolean}
   */
  areAssetsCached(cardNumber) {
    return this.assetCache.has(`assets_${cardNumber}`);
  }

  /**
   * Lista todas as cartas em cache
   * @returns {Array<number>}
   */
  getCachedCards() {
    return Array.from(this.configCache.keys())
      .map((key) => {
        const match = key.match(/card_(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((num) => num !== null);
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Mostra informações do loader
   */
  debug() {
    console.log("📦 CardLoader Debug:");
    console.log("  Stats:", this.getStats());
    console.log("  Cartas em cache:", this.getCachedCards());
    console.log("  Elementos disponíveis:", this.availableElements);
  }

  /**
   * Debug: Valida uma carta e mostra resultado
   * @param {number} cardNumber
   */
  async debugCard(cardNumber) {
    console.log(`\n🔍 DEBUG: Carta ${cardNumber}`);
    console.log("================================");

    const config = await this.loadConfig(cardNumber);

    if (!config) {
      console.error("❌ Falha ao carregar configuração");
      return;
    }

    console.log("✅ Configuração:", config);

    const assets = await this.resolveAssets(cardNumber, config);
    console.log("\n🎨 Assets Resolvidos:", assets);

    const validation = await this.validateAssets(assets);
    console.log("\n✓ Validação de Assets:", validation);

    console.log("================================\n");
  }
}

// Singleton
export const cardLoader = new CardLoader();

// Expõe globalmente para debug
window.cardLoader = cardLoader;

console.log("✅ CardLoader carregado");
console.log("💡 Use window.cardLoader.debugCard(5) para validar carta 5");
console.log("💡 Use window.cardLoader.debug() para ver estatísticas");

// ============================================
// INVALIDAÇÃO REATIVA DE CACHE
// ============================================

// Limpa cache quando qualquer config é salva (edição de cartas, personagens, etc.)
document.addEventListener("config-changed", () => {
  cardLoader.clearAllCaches();
  console.log("🔄 CardLoader: cache invalidado por config-changed");
});

// Limpa cache ao trocar de jogo (cartas de outro jogo não devem vazar)
document.addEventListener("game-changed", () => {
  cardLoader.clearAllCaches();
  console.log("🔄 CardLoader: cache invalidado por game-changed");
});
