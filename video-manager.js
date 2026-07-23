/**
 * video-manager.js - Sistema de Reprodução de Vídeos
 *
 * Responsabilidades:
 * - Reproduzir vídeos em modal fullscreen
 * - Controlar volume de vídeos
 * - Gerenciar vídeo ativo
 * - Animações de entrada/saída
 * - Controles de reprodução (pause/resume/stop)
 * - Suporte a diferentes formatos
 *
 * @module VideoManager
 */

import { configManager } from "@core/config-manager.js";
import { assetResolver } from "@core/asset-resolver.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} VideoOptions
 * @property {boolean} [controls] - Mostrar controles nativos?
 * @property {boolean} [autoplay] - Iniciar automaticamente?
 * @property {boolean} [loop] - Repetir vídeo?
 * @property {number} [volume] - Volume individual (0-1)
 * @property {boolean} [muted] - Iniciar sem áudio?
 * @property {Function} [onEnded] - Callback ao terminar
 * @property {Function} [onError] - Callback de erro
 * @property {Function} [onPlay] - Callback ao iniciar
 * @property {Function} [onPause] - Callback ao pausar
 * @property {boolean} [closeOnEnd] - Fechar modal ao terminar?
 * @property {boolean} [showCloseButton] - Mostrar botão X?
 * @property {string} [backgroundOpacity] - Opacidade do fundo (0-1)
 */

/**
 * @typedef {Object} ActiveVideo
 * @property {HTMLElement} modal - Elemento do modal
 * @property {HTMLVideoElement} video - Elemento de vídeo
 * @property {string} path - Caminho do arquivo
 * @property {number} startTime - Timestamp de início
 * @property {VideoOptions} options - Opções de reprodução
 */

class VideoManager {
  constructor() {
    this.initialized = false;

    // Volume global de vídeos (0-1)
    this.globalVolume = 0.5;

    // Vídeo ativo
    this.activeVideo = null;

    // Base path — DEPRECATED (app:// removido na v3.0). Paths chegam já resolvidos via assetResolver.
    this.basePath = null;

    // Configurações padrão
    this.defaults = {
      controls: false,
      autoplay: true,
      loop: false,
      muted: false,
      closeOnEnd: true,
      showCloseButton: true,
      backgroundOpacity: "0.95",
    };

    // Estatísticas
    this.stats = {
      totalPlayed: 0,
      totalClosed: 0,
      totalErrors: 0,
    };
  }

  /**
   * Inicializa o sistema de vídeos
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ VideoManager já foi inicializado");
      return;
    }

    console.log("🎬 VideoManager inicializando...");

    // Carrega volume salvo
    this.loadVolumeFromConfig();

    // Injeta estilos CSS
    this.injectStyles();

    this.initialized = true;
    console.log(`✅ VideoManager inicializado - Volume: ${Math.round(this.globalVolume * 100)}%`);
  }

  /**
   * Carrega volume do ConfigManager
   * @private
   */
  loadVolumeFromConfig() {
    const savedVolume = configManager.get("general.videoVolume");

    if (savedVolume !== undefined && savedVolume !== null) {
      this.globalVolume = Math.max(0, Math.min(1, savedVolume / 100));
      console.log(`📊 Volume de vídeo carregado: ${Math.round(this.globalVolume * 100)}%`);
    }
  }

  /**
   * Injeta estilos CSS
   * @private
   */
  injectStyles() {
    if (document.getElementById("video-manager-styles")) return;

    const style = document.createElement("style");
    style.id = "video-manager-styles";
    style.textContent = `
      /* Modal de Vídeo Fullscreen */
      .video-modal-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: videoFadeIn 0.3s ease-out;
      }

      .video-modal-overlay.closing {
        animation: videoFadeOut 0.3s ease-out forwards;
      }

      @keyframes videoFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes videoFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }

      /* Vídeo */
      .video-modal-overlay video {
        max-width: 100%;
        max-height: 100%;
        border-radius: 8px;
        box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
        animation: videoSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes videoSlideIn {
        from {
          opacity: 0;
          transform: scale(0.8) translateY(-50px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      /* Botão Fechar */
      .video-close-button {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        font-size: 1.5rem;
        cursor: pointer;
        z-index: 10001;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
      }

      .video-close-button:hover {
        background: rgba(255, 0, 0, 1);
        transform: scale(1.1);
      }

      .video-close-button:active {
        transform: scale(0.95);
      }

      /* Controles customizados (opcional) */
      .video-controls-overlay {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        padding: 10px 20px;
        border-radius: 8px;
        display: flex;
        gap: 15px;
        align-items: center;
        z-index: 10001;
      }

      .video-control-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .video-control-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Loading spinner */
      .video-loading-spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: videoSpin 1s linear infinite;
        z-index: 10000;
      }

      @keyframes videoSpin {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }

      /* Mensagem de erro */
      .video-error-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        font-size: 1.1rem;
        text-align: center;
        z-index: 10001;
        max-width: 80%;
      }

      .video-error-message small {
        display: block;
        margin-top: 10px;
        font-size: 0.8rem;
        opacity: 0.8;
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================
  // REPRODUÇÃO DE VÍDEO
  // ============================================

  /**
   * Reproduz um vídeo em modal fullscreen
   * @param {string} path - Caminho relativo ao assets
   * @param {VideoOptions} [options] - Opções de reprodução
   * @returns {Promise<void>}
   */
  async play(path, options = {}) {
    if (!this.initialized) {
      console.warn("⚠️ VideoManager não inicializado");
      this.init();
    }

    try {
      // Valida path
      if (!path || typeof path !== "string") {
        throw new Error("Caminho de vídeo inválido");
      }

      // Fecha vídeo ativo se houver
      if (this.activeVideo) {
        await this.close();
      }

      // Mescla opções
      const finalOptions = { ...this.defaults, ...options };

      // Resolve caminho completo
      const fullPath = this._resolveVideoPath(path, finalOptions.useBasePath !== false);

      console.log(`🎬 Reproduzindo vídeo: ${fullPath}`);

      // Cria modal
      const modal = this._createModal(fullPath, finalOptions);

      // Armazena referência
      this.activeVideo = {
        modal,
        video: modal.querySelector("video"),
        path: fullPath,
        startTime: Date.now(),
        options: finalOptions,
      };

      // Adiciona ao DOM
      document.body.appendChild(modal);

      // Tenta reproduzir
      await this._attemptPlay();

      this.stats.totalPlayed++;

      console.log(`✅ Vídeo reproduzindo: ${path}`);
    } catch (error) {
      console.error("❌ Erro ao reproduzir vídeo:", error);
      this.stats.totalErrors++;

      if (options.onError) {
        options.onError(error);
      }

      // Remove modal se foi criado
      if (this.activeVideo) {
        this._removeModal();
      }

      throw error;
    }
  }

  /**
   * Resolve caminho do vídeo
   * @private
   * @param {string} path
   * @param {boolean} useBasePath
   * @returns {string}
   */
  _resolveVideoPath(path, useBasePath = true) {
    // Path já resolvido (file:// ou http) — usa direto sem transformação
    if (path.startsWith("file://") || path.startsWith("http")) {
      return path;
    }

    // Path relativo de app asset (ex: "UI/intro1.mp4") — resolve via assetResolver
    if (useBasePath) {
      return assetResolver.appAsset(path);
    }

    return path;
  }

  /**
   * Cria modal de vídeo
   * @private
   * @param {string} videoPath
   * @param {VideoOptions} options
   * @returns {HTMLElement}
   */
  _createModal(videoPath, options) {
    const modal = document.createElement("div");
    modal.className = "video-modal-overlay";
    modal.style.background = `rgba(0, 0, 0, ${options.backgroundOpacity})`;

    // Vídeo
    const video = document.createElement("video");
    video.src = videoPath;
    video.controls = options.controls;
    video.autoplay = options.autoplay;
    video.loop = options.loop;
    video.muted = options.muted;
    video.playsInline = true;

    // Volume
    const finalVolume = this._calculateVolume(options.volume);
    video.volume = finalVolume;

    // Loading spinner
    const spinner = document.createElement("div");
    spinner.className = "video-loading-spinner";

    modal.appendChild(spinner);
    modal.appendChild(video);

    // Botão fechar
    if (options.showCloseButton) {
      const closeButton = this._createCloseButton();
      modal.appendChild(closeButton);
    }

    // Configura eventos
    this._setupVideoEvents(video, modal, spinner, options);

    // Fecha ao clicar fora do vídeo
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.close();
      }
    });

    return modal;
  }

  /**
   * Cria botão de fechar
   * @private
   * @returns {HTMLElement}
   */
  _createCloseButton() {
    const button = document.createElement("button");
    button.className = "video-close-button";
    button.textContent = "✕";
    button.setAttribute("aria-label", languageManager.translate("video.close_btn"));

    button.addEventListener("click", () => {
      this.close();
    });

    return button;
  }

  /**
   * Calcula volume final
   * @private
   * @param {number|null} individualVolume
   * @returns {number}
   */
  _calculateVolume(individualVolume) {
    if (individualVolume !== null && individualVolume !== undefined) {
      return Math.max(0, Math.min(1, individualVolume));
    }

    return this.globalVolume;
  }

  /**
   * Configura eventos do vídeo
   * @private
   * @param {HTMLVideoElement} video
   * @param {HTMLElement} modal
   * @param {HTMLElement} spinner
   * @param {VideoOptions} options
   */
  _setupVideoEvents(video, modal, spinner, options) {
    // Dados carregados
    video.addEventListener("loadeddata", () => {
      console.log("✅ Vídeo carregado");
      spinner.remove();
    });

    // Erro
    video.addEventListener("error", (e) => {
      console.error("❌ Erro ao carregar vídeo:", e);
      console.error("Detalhes do erro:", {
        code: video.error?.code,
        message: video.error?.message,
        src: video.src,
      });

      spinner.remove();

      this._showErrorMessage(modal);

      this.stats.totalErrors++;

      if (options.onError) {
        options.onError(e);
      }

      // Fecha após 3 segundos
      setTimeout(() => {
        this.close();
      }, 3000);
    });

    // Terminou
    video.addEventListener("ended", () => {
      console.log("✅ Vídeo finalizado");

      if (options.onEnded) {
        options.onEnded();
      }

      if (options.closeOnEnd) {
        this.close();
      }
    });

    // Play
    video.addEventListener("play", () => {
      console.log("▶️ Vídeo iniciado");

      if (options.onPlay) {
        options.onPlay();
      }
    });

    // Pause
    video.addEventListener("pause", () => {
      console.log("⏸️ Vídeo pausado");

      if (options.onPause) {
        options.onPause();
      }
    });
  }

  /**
   * Mostra mensagem de erro
   * @private
   * @param {HTMLElement} modal
   */
  _showErrorMessage(modal) {
    const errorMsg = document.createElement("div");
    errorMsg.className = "video-error-message";
    errorMsg.innerHTML = `
      ❌ ${languageManager.translate("video.err_play")}
      <small>${languageManager.translate("video.err_check_format")}</small>
    `;

    modal.appendChild(errorMsg);
  }

  /**
   * Tenta reproduzir vídeo
   * @private
   * @returns {Promise<void>}
   */
  async _attemptPlay() {
    if (!this.activeVideo) return;

    try {
      await this.activeVideo.video.play();
      console.log("🎬 Reprodução iniciada");
    } catch (error) {
      console.error("⚠️ Erro ao reproduzir vídeo:", error);
      throw error;
    }
  }

  // ============================================
  // CONTROLE DE VÍDEO
  // ============================================

  /**
   * Pausa vídeo ativo
   */
  pause() {
    if (!this.activeVideo) {
      console.warn("⚠️ Nenhum vídeo ativo");
      return;
    }

    this.activeVideo.video.pause();
    console.log("⏸️ Vídeo pausado");
  }

  /**
   * Resume vídeo ativo
   */
  async resume() {
    if (!this.activeVideo) {
      console.warn("⚠️ Nenhum vídeo ativo");
      return;
    }

    try {
      await this.activeVideo.video.play();
      console.log("▶️ Vídeo resumido");
    } catch (error) {
      console.error("❌ Erro ao resumir vídeo:", error);
    }
  }

  /**
   * Para vídeo ativo
   */
  stop() {
    if (!this.activeVideo) {
      console.warn("⚠️ Nenhum vídeo ativo");
      return;
    }

    this.activeVideo.video.pause();
    this.activeVideo.video.currentTime = 0;
    console.log("⏹️ Vídeo parado");
  }

  /**
   * Fecha modal e remove vídeo
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.activeVideo) {
      return;
    }

    return new Promise((resolve) => {
      const { modal, video } = this.activeVideo;

      // Para vídeo
      video.pause();

      // Animação de saída
      modal.classList.add("closing");

      setTimeout(() => {
        this._removeModal();
        this.stats.totalClosed++;
        console.log("❌ Modal de vídeo fechado");
        resolve();
      }, 300);
    });
  }

  /**
   * Remove modal do DOM
   * @private
   */
  _removeModal() {
    if (!this.activeVideo) return;

    const { modal } = this.activeVideo;

    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }

    this.activeVideo = null;
  }

  // ============================================
  // VOLUME
  // ============================================

  /**
   * Define volume global de vídeos
   * @param {number} value - Volume (0-100)
   */
  setGlobalVolume(value) {
    const normalized = Math.max(0, Math.min(100, value)) / 100;
    this.globalVolume = normalized;

    // Atualiza volume do vídeo ativo
    if (this.activeVideo) {
      this.activeVideo.video.volume = this.globalVolume;
    }

    // Salva no config
    configManager.update("general.videoVolume", Math.round(this.globalVolume * 100));

    console.log(`🔊 Volume de vídeo global: ${Math.round(this.globalVolume * 100)}%`);
  }

  /**
   * Obtém volume global
   * @returns {number} Volume (0-100)
   */
  getGlobalVolume() {
    return Math.round(this.globalVolume * 100);
  }

  // ============================================
  // GETTERS E UTILITÁRIOS
  // ============================================

  /**
   * Verifica se há vídeo ativo
   * @returns {boolean}
   */
  isPlaying() {
    return !!this.activeVideo && !this.activeVideo.video.paused;
  }

  /**
   * Obtém informações do vídeo ativo
   * @returns {Object|null}
   */
  getActiveVideoInfo() {
    if (!this.activeVideo) {
      return null;
    }

    const { video, path, startTime } = this.activeVideo;

    return {
      path,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      volume: video.volume,
      playbackTime: Date.now() - startTime,
    };
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isPlaying: this.isPlaying(),
      globalVolume: this.getGlobalVolume(),
    };
  }

  /**
   * Debug: Mostra estado atual
   */
  debug() {
    console.log("🎬 VideoManager Debug:");
    console.log("  Stats:", this.getStats());
    console.log("  Vídeo Ativo:", this.getActiveVideoInfo());
  }

  /**
   * Reset completo
   */
  async reset() {
    await this.close();

    this.stats = {
      totalPlayed: 0,
      totalClosed: 0,
      totalErrors: 0,
    };

    console.log("🔄 VideoManager resetado");
  }
}

// Singleton
export const videoManager = new VideoManager();

// Expõe globalmente para debug
window.videoManager = videoManager;

console.log("✅ VideoManager carregado");
console.log("💡 Use window.videoManager.debug() para diagnóstico");
