/**
 * interactive-card-effects.js - Sistema de Efeitos Visuais
 *
 * Responsabilidades:
 * - Aplicar backgrounds dinâmicos
 * - Mudar verso de cartas
 * - Efeitos de partículas
 * - Animações de transição
 * - Feedback visual para escolhas
 * - Gerenciamento de temas
 *
 * @module InteractiveCardEffects
 */

import { assetResolver } from "@core/asset-resolver.js";
import { animationSystem } from "@interface/enhanced-animations.js";

/**
 * @typedef {Object} EffectConfig
 * @property {string} [bgImg] - Imagem de fundo
 * @property {string} [backImg] - Imagem do verso das cartas
 * @property {string} [bgColor] - Cor de fundo
 * @property {string} [filter] - Filtro CSS (blur, brightness, etc)
 * @property {number} [duration] - Duração da transição (ms)
 * @property {string} [easing] - Função de easing CSS
 */

/**
 * @typedef {Object} AnimationConfig
 * @property {string} type - Tipo de animação
 * @property {string} target - Seletor do alvo
 * @property {number} duration - Duração (ms)
 * @property {Object} [properties] - Propriedades customizadas
 */

class EffectApplicator {
  constructor() {
    // Estado atual
    this.currentTheme = {
      background: null,
      cardBack: null,
      filters: [],
    };

    // Defaults do jogo ativo (injetados por applyGameAssets em main.js)
    // Usados por removeBackground/removeCardBack para restaurar ao asset do jogo
    // em vez do fallback hardcoded original.
    this._gameDefaultBackground = null;
    this._gameDefaultCardBack = null;

    // Configurações padrão
    this.config = {
      transitionDuration: 800, // ms
      defaultEasing: "ease-in-out",
      particleCount: 20,
      enableAnimations: true,
    };

    // Cache de estilos dinâmicos
    this.dynamicStyles = new Map();

    // Contador de IDs únicos
    this.effectIdCounter = 0;

    // Estatísticas
    this.stats = {
      backgroundsApplied: 0,
      cardBacksApplied: 0,
      animationsPlayed: 0,
      particlesCreated: 0,
    };
  }

  // ============================================
  // EFEITOS DE FUNDO
  // ============================================

  /**
   * Aplica imagem de fundo ao body
   * @param {string} imagePath - Caminho da imagem
   * @param {Object} [options] - Opções de aplicação
   */
  applyBackground(imagePath, options = {}) {
    if (!imagePath) {
      console.warn("⚠️ Caminho de imagem vazio");
      return;
    }

    console.log(`🎨 [Effects] Aplicando background: ${imagePath}`);

    const resolvedPath = assetResolver.customAsset(`cards/temas/${imagePath}`);
    const duration = options.duration || this.config.transitionDuration;
    const easing = options.easing || this.config.defaultEasing;

    // Aplica com transição suave
    document.body.style.transition = `background-image ${duration}ms ${easing}`;
    document.body.style.backgroundImage = `url('${resolvedPath}')`;
    document.body.style.backgroundSize = options.size || "cover";
    document.body.style.backgroundPosition = options.position || "center";
    document.body.style.backgroundRepeat = options.repeat || "no-repeat";

    // Aplica filtros se especificado
    if (options.filter) {
      document.body.style.filter = options.filter;
    }

    // Atualiza estado
    this.currentTheme.background = imagePath;
    this.stats.backgroundsApplied++;

    console.log(`✅ [Effects] Background aplicado`);
  }

  /**
   * Aplica cor de fundo sólida
   * @param {string} color - Cor CSS
   * @param {Object} [options] - Opções
   */
  applyBackgroundColor(color, options = {}) {
    console.log(`🎨 [Effects] Aplicando cor de fundo: ${color}`);

    const duration = options.duration || this.config.transitionDuration;
    const easing = options.easing || this.config.defaultEasing;

    document.body.style.transition = `background-color ${duration}ms ${easing}`;
    document.body.style.backgroundColor = color;

    // Remove imagem se houver
    document.body.style.backgroundImage = "none";

    this.currentTheme.background = color;
    this.stats.backgroundsApplied++;
  }

  /**
   * Remove background (volta ao padrão)
   * @param {Object} [options] - Opções
   */
  removeBackground(options = {}) {
    console.log("🎨 [Effects] Removendo background customizado");

    const duration = options.duration || this.config.transitionDuration;

    document.body.style.transition = `background-image ${duration}ms ease-out`;

    if (this._gameDefaultBackground) {
      // Restaura para o background do jogo ativo (setado por applyGameAssets)
      document.body.style.backgroundImage = `url('${this._gameDefaultBackground}')`;
    } else {
      // Fallback: remove background customizado, deixa o CSS de style.css agir
      document.body.style.backgroundImage = "";
    }

    document.body.style.filter = "none";
    this.currentTheme.background = null;
  }

  // ============================================
  // VERSO DE CARTAS
  // ============================================

  /**
   * Aplica imagem customizada ao verso das cartas
   * @param {string} imagePath - Caminho da imagem
   * @param {Object} [options] - Opções
   */
  applyCardBack(imagePath, options = {}) {
    if (!imagePath) {
      console.warn("⚠️ Caminho de imagem vazio");
      return;
    }

    console.log(`🃏 [Effects] Aplicando verso de carta: ${imagePath}`);

    const resolvedPath = assetResolver.customAsset(`cards/temas/${imagePath}`);
    const opacity = options.opacity !== undefined ? options.opacity : 0.79;

    // Remove estilo legado se existir
    document.getElementById("dynamic-card-back-style")?.remove();

    // Atualiza src de todas as cartas no DOM
    document.querySelectorAll(".card-back-img").forEach((img) => {
      img.src = resolvedPath;
      img.style.opacity = opacity;
    });

    // Salva para sincronizar cartas criadas depois
    this._currentCardBackSrc = resolvedPath;
    this._currentCardBackOpacity = opacity;

    // Atualiza estado
    this.currentTheme.cardBack = imagePath;
    this.stats.cardBacksApplied++;

    console.log(`✅ [Effects] Verso de carta aplicado`);
  }

  /**
   * Remove verso customizado (volta ao padrão)
   */
  removeCardBack() {
    console.log("🃏 [Effects] Removendo verso customizado");

    document.getElementById("dynamic-card-back-style")?.remove();

    // Restaura para o cardBack do jogo ativo, ou o verso padrão do app
    const restoreSrc = this._gameDefaultCardBack || assetResolver.appAsset("UI/verso.png");
    document.querySelectorAll(".card-back-img").forEach((img) => {
      img.src = restoreSrc;
      img.style.opacity = "";
    });

    this._currentCardBackSrc = this._gameDefaultCardBack || null;
    this._currentCardBackOpacity = null;
    this.currentTheme.cardBack = null;
  }

  // ============================================
  // ANIMAÇÕES E TRANSIÇÕES
  // ============================================

  /**
   * Anima um elemento com configuração customizada
   * @param {string|HTMLElement} target - Seletor ou elemento
   * @param {AnimationConfig} config - Configuração da animação
   * @returns {Promise<void>}
   */
  async animate(target, config) {
    const element = typeof target === "string" ? document.querySelector(target) : target;

    if (!element) {
      console.warn(`⚠️ Elemento não encontrado: ${target}`);
      return;
    }

    console.log(`✨ [Effects] Animando elemento`);

    const { type = "fade", duration = 500, easing = "ease-in-out", properties = {} } = config;

    // Animações pré-definidas
    const animations = {
      fade: [
        { opacity: 0, transform: "scale(0.95)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      slide: [
        { transform: "translateX(-100%)", opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      bounce: [
        { transform: "scale(1)" },
        { transform: "scale(1.2)" },
        { transform: "scale(0.95)" },
        { transform: "scale(1)" },
      ],
      shake: [
        { transform: "translateX(0)" },
        { transform: "translateX(-10px)" },
        { transform: "translateX(10px)" },
        { transform: "translateX(-10px)" },
        { transform: "translateX(0)" },
      ],
      pulse: [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(1.1)", opacity: 0.8 },
        { transform: "scale(1)", opacity: 1 },
      ],
    };

    const keyframes = animations[type] || animations.fade;

    // Aplica propriedades customizadas
    const finalKeyframes = keyframes.map((frame) => ({
      ...frame,
      ...properties,
    }));

    // Executa animação
    const animation = element.animate(finalKeyframes, {
      duration,
      easing,
      fill: "forwards",
    });

    this.stats.animationsPlayed++;

    return animation.finished;
  }

  /**
   * Mostra feedback visual para escolha de opção
   * @param {string} playerId - ID do jogador
   * @param {string} optionText - Texto da opção escolhida
   */
  showChoiceFeedback(playerId, optionText) {
    console.log(`💬 [Effects] Mostrando feedback para ${playerId}`);

    // Usa animationSystem se disponível
    if (animationSystem && animationSystem.showEnhancedBuff) {
      animationSystem.showEnhancedBuff(playerId, optionText, "special");
    } else {
      // Fallback: criação manual de feedback
      this._createTextFeedback(playerId, `✨ ${optionText}`);
    }
  }

  /**
   * Cria feedback de texto flutuante
   * @private
   * @param {string} playerId - ID do jogador
   * @param {string} text - Texto a exibir
   */
  _createTextFeedback(playerId, text) {
    const playerElement = document.getElementById(playerId);
    if (!playerElement) return;

    const feedback = document.createElement("div");
    feedback.className = "interactive-card-feedback";
    feedback.textContent = text;
    feedback.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 1.5rem;
      font-weight: bold;
      color: gold;
      text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8);
      pointer-events: none;
      z-index: 1000;
      animation: feedbackFloat 2s ease-out forwards;
    `;

    playerElement.appendChild(feedback);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 2000);
  }

  // ============================================
  // PARTÍCULAS
  // ============================================

  /**
   * Cria efeito de partículas em uma posição
   * @param {number} x - Posição X (px)
   * @param {number} y - Posição Y (px)
   * @param {Object} [options] - Opções das partículas
   */
  createParticles(x, y, options = {}) {
    const count = options.count || this.config.particleCount;
    const color = options.color || "gold";
    const size = options.size || "8px";
    const duration = options.duration || 1000;
    const symbol = options.symbol || "✨";

    console.log(`✨ [Effects] Criando ${count} partículas em (${x}, ${y})`);

    for (let i = 0; i < count; i++) {
      this._createSingleParticle(x, y, {
        color,
        size,
        duration,
        symbol,
        angle: (Math.PI * 2 * i) / count,
      });
    }

    this.stats.particlesCreated += count;
  }

  /**
   * Cria uma partícula individual
   * @private
   */
  _createSingleParticle(x, y, options) {
    const particle = document.createElement("div");
    particle.textContent = options.symbol;
    particle.className = "interactive-card-particle";

    const distance = 60 + Math.random() * 40;
    const endX = x + Math.cos(options.angle) * distance;
    const endY = y + Math.sin(options.angle) * distance;

    particle.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      font-size: ${options.size};
      color: ${options.color};
      pointer-events: none;
      z-index: 9999;
      text-shadow: 0 0 5px ${options.color};
    `;

    document.body.appendChild(particle);

    particle.animate(
      [
        {
          left: `${x}px`,
          top: `${y}px`,
          opacity: 1,
          transform: "scale(0.5)",
        },
        {
          left: `${endX}px`,
          top: `${endY}px`,
          opacity: 0,
          transform: "scale(1.5)",
        },
      ],
      {
        duration: options.duration,
        easing: "ease-out",
      },
    ).onfinish = () => {
      if (particle.parentNode) {
        particle.remove();
      }
    };
  }

  // ============================================
  // GERENCIAMENTO DE TEMAS
  // ============================================

  /**
   * Aplica tema completo (background + cardback)
   * @param {EffectConfig} config - Configuração do tema
   */
  applyTheme(config) {
    console.log("🎨 [Effects] Aplicando tema completo");

    if (config.bgImg) {
      this.applyBackground(config.bgImg, config);
    } else if (config.bgColor) {
      this.applyBackgroundColor(config.bgColor, config);
    }

    if (config.backImg) {
      this.applyCardBack(config.backImg, config);
    }

    console.log("✅ [Effects] Tema aplicado");
  }

  /**
   * Remove todos os efeitos customizados
   */
  resetTheme() {
    console.log("🔄 [Effects] Resetando tema");

    this.removeBackground();
    this.removeCardBack();

    this.currentTheme = {
      background: null,
      cardBack: null,
      filters: [],
    };

    console.log("✅ [Effects] Tema resetado");
  }

  /**
   * Obtém tema atual
   * @returns {Object}
   */
  getCurrentTheme() {
    return { ...this.currentTheme };
  }

  // ============================================
  // CONFIGURAÇÃO E ESTATÍSTICAS
  // ============================================

  /**
   * Atualiza configurações
   * @param {Object} newConfig
   */
  configure(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };

    console.log("⚙️ [Effects] Configurações atualizadas:", this.config);
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      currentTheme: this.getCurrentTheme(),
    };
  }

  /**
   * Reseta estatísticas
   */
  resetStats() {
    this.stats = {
      backgroundsApplied: 0,
      cardBacksApplied: 0,
      animationsPlayed: 0,
      particlesCreated: 0,
    };

    console.log("🔄 [Effects] Estatísticas resetadas");
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug: Mostra informações
   */
  debug() {
    console.log("🎨 EffectApplicator Debug:");
    console.log("  Tema atual:", this.currentTheme);
    console.log("  Configurações:", this.config);
    console.log("  Estatísticas:", this.stats);
  }

  /**
   * Debug: Testa efeito de partículas
   */
  debugParticles() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;

    console.log("🧪 Testando partículas no centro da tela");

    this.createParticles(x, y, {
      count: 30,
      color: "gold",
      symbol: "✨",
      duration: 1500,
    });
  }

  /**
   * Debug: Testa animação
   * @param {string} type - Tipo de animação
   */
  async debugAnimation(type = "bounce") {
    const target = document.querySelector(".card:not(.flipped)");

    if (!target) {
      console.warn("⚠️ Nenhuma carta disponível para testar");
      return;
    }

    console.log(`🧪 Testando animação: ${type}`);

    await this.animate(target, {
      type,
      duration: 800,
    });

    console.log("✅ Animação concluída");
  }
}

// ============================================
// EXPORT
// ============================================

export { EffectApplicator };

// Singleton compartilhado — usado pelo tema.js e por outros módulos
export const effectApplicator = new EffectApplicator();

// Expõe globalmente para debug
window.effectApplicator = effectApplicator;

console.log("✅ EffectApplicator carregado");
