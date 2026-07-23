/**
 * image-manager.js - Sistema de Visualização de Imagens PNG
 *
 * Responsabilidades:
 * - Reproduzir imagens PNG em modal fullscreen
 * - Gerenciar upload e download de imagens
 * - Suporte a zoom e navegação
 * - Renderização de imagens
 *
 * @module ImageManager
 */

import { configManager } from "@core/config-manager.js";
import { assetResolver } from "@core/asset-resolver.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} ImageOptions
 * @property {number} [initialScale] - Escala inicial (0.5-3.0)
 * @property {boolean} [showControls] - Mostrar controles?
 * @property {boolean} [showCloseButton] - Mostrar botão X?
 * @property {string} [backgroundOpacity] - Opacidade do fundo (0-1)
 * @property {Function} [onClose] - Callback ao fechar
 * @property {Function} [onError] - Callback de erro
 */

/**
 * @typedef {Object} ActiveImage
 * @property {HTMLElement} modal - Elemento do modal
 * @property {HTMLImageElement} image - Elemento de imagem
 * @property {number} scale - Escala atual
 * @property {string} path - Caminho do arquivo
 * @property {ImageOptions} options - Opções de visualização
 */

class ImageManager {
  constructor() {
    this.initialized = false;

    // Imagem ativa
    this.activeImage = null;

    // Configurações padrão
    this.defaults = {
      initialScale: 1.0,
      showControls: true,
      showCloseButton: true,
      backgroundOpacity: "0.95",
      minScale: 0.5,
      maxScale: 3.0,
    };

    // Estatísticas
    this.stats = {
      totalOpened: 0,
      totalClosed: 0,
      totalErrors: 0,
    };
  }

  /**
   * Inicializa o sistema de imagens
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ ImageManager já foi inicializado");
      return;
    }

    console.log("🖼️ ImageManager inicializando...");

    // Injeta estilos CSS
    this.injectStyles();

    this.initialized = true;
    console.log("✅ ImageManager inicializado");
  }

  /**
   * Injeta estilos CSS
   * @private
   */
  injectStyles() {
    if (document.getElementById("image-manager-styles")) return;

    const style = document.createElement("style");
    style.id = "image-manager-styles";
    style.textContent = `
      /* Modal de Imagem Fullscreen */
      .image-modal-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: imageFadeIn 0.3s ease-out;
      }

      .image-modal-overlay.closing {
        animation: imageFadeOut 0.3s ease-out forwards;
      }

      @keyframes imageFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes imageFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }

      /* Container da Imagem */
      .image-container {
        position: relative;
        width: 90%;
        height: 90%;
        display: flex;
        flex-direction: column;
        background: white;
        border-radius: 8px;
        box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
        overflow: hidden;
      }

      /* Wrapper da Imagem */
      .image-wrapper {
        flex: 1;
        overflow: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .image-display {
        max-width: 100%;
        max-height: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      /* Controles */
      .image-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        background: #f5f5f5;
        padding: 15px;
        border-top: 1px solid #ddd;
        flex-wrap: wrap;
      }

      .image-controls-left {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .image-controls-right {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      /* Botão */
      .image-control-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 0.9rem;
        font-family: Arial, sans-serif;
      }

      .image-control-btn:hover {
        background: #0056b3;
      }

      .image-control-btn:active {
        transform: scale(0.95);
      }

      .image-control-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
        opacity: 0.6;
      }

      /* Informações */
      .image-info {
        color: #666;
        font-size: 0.9rem;
        font-family: Arial, sans-serif;
      }

      /* Zoom */
      .image-zoom-control {
        display: flex;
        gap: 5px;
        align-items: center;
      }

      .image-zoom-btn {
        background: #28a745;
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .image-zoom-btn:hover {
        background: #218838;
      }

      /* Botão Fechar */
      .image-close-button {
        position: absolute;
        top: 15px;
        right: 15px;
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

      .image-close-button:hover {
        background: rgba(255, 0, 0, 1);
        transform: scale(1.1);
      }

      .image-close-button:active {
        transform: scale(0.95);
      }

      /* Loading spinner */
      .image-loading-spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-top-color: #007bff;
        border-radius: 50%;
        animation: imageSpin 1s linear infinite;
        z-index: 10000;
      }

      @keyframes imageSpin {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }

      /* Mensagem de erro */
      .image-error-message {
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
        font-family: Arial, sans-serif;
      }

      .image-error-message small {
        display: block;
        margin-top: 10px;
        font-size: 0.8rem;
        opacity: 0.8;
      }

      /* Responsivo */
      @media (max-width: 768px) {
        .image-container {
          width: 100%;
          height: 100%;
          border-radius: 0;
        }

        .image-controls {
          flex-direction: column;
          gap: 8px;
        }

        .image-controls-left,
        .image-controls-right {
          width: 100%;
          justify-content: center;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================
  // VISUALIZAÇÃO DE IMAGEM
  // ============================================

  /**
   * Abre e exibe uma imagem PNG
   * @param {string} path - Caminho relativo ao assets
   * @param {ImageOptions} [options] - Opções de visualização
   * @returns {Promise<void>}
   */
  async open(path, options = {}) {
    if (!this.initialized) {
      console.warn("⚠️ ImageManager não inicializado");
      await this.init();
    }

    try {
      // Valida path
      if (!path || typeof path !== "string") {
        throw new Error("Caminho de imagem inválido");
      }

      // Fecha imagem ativa se houver
      if (this.activeImage) {
        await this.close();
      }

      // Mescla opções
      const finalOptions = { ...this.defaults, ...options };

      // Resolve caminho completo
      const fullPath = this._resolveImagePath(path, finalOptions.useBasePath !== false);

      console.log(`🖼️ Abrindo imagem: ${fullPath}`);

      // Cria modal
      const modal = this._createModal(finalOptions);

      // Cria elemento de imagem
      const imageElement = new Image();
      imageElement.className = "image-display";

      // Armazena referência
      this.activeImage = {
        modal,
        image: imageElement,
        scale: finalOptions.initialScale,
        path: fullPath,
        options: finalOptions,
      };

      // Adiciona ao wrapper
      const wrapper = modal.querySelector(".image-wrapper");
      wrapper.appendChild(imageElement);

      // Adiciona ao DOM
      document.body.appendChild(modal);

      // Carrega imagem
      await this._loadImage(fullPath, imageElement);

      // Atualiza controles
      this._updateControls();

      this.stats.totalOpened++;

      console.log(`✅ Imagem aberta: ${path}`);
    } catch (error) {
      console.error("❌ Erro ao abrir imagem:", error);
      this.stats.totalErrors++;

      if (options.onError) {
        options.onError(error);
      }

      // Remove modal se foi criado
      if (this.activeImage) {
        this._removeModal();
      }

      throw error;
    }
  }

  /**
   * Carrega imagem
   * @private
   * @param {string} path
   * @param {HTMLImageElement} imageElement
   * @returns {Promise<void>}
   */
  _loadImage(path, imageElement) {
    return new Promise((resolve, reject) => {
      imageElement.onload = () => {
        console.log(`✅ Imagem carregada: ${path}`);
        this._applyScale();
        resolve();
      };

      imageElement.onerror = () => {
        reject(new Error(`Não foi possível carregar a imagem: ${path}`));
      };

      imageElement.src = path;
    });
  }

  /**
   * Resolve caminho da imagem
   * @private
   * @param {string} path
   * @param {boolean} useBasePath
   * @returns {string}
   */
  _resolveImagePath(path, useBasePath = true) {
    // Path já resolvido (file:// ou http) — usa direto
    if (path.startsWith("file://") || path.startsWith("http")) {
      return path;
    }

    // Path relativo de app asset — resolve via assetResolver
    if (useBasePath) {
      return assetResolver.appAsset(path);
    }

    return path;
  }

  /**
   * Cria modal de imagem
   * @private
   * @param {ImageOptions} options
   * @returns {HTMLElement}
   */
  _createModal(options) {
    const overlay = document.createElement("div");
    overlay.className = "image-modal-overlay";
    overlay.style.background = `rgba(0, 0, 0, ${options.backgroundOpacity})`;

    const container = document.createElement("div");
    container.className = "image-container";

    // Wrapper da imagem
    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    container.appendChild(wrapper);

    // Loading spinner
    const spinner = document.createElement("div");
    spinner.className = "image-loading-spinner";
    overlay.appendChild(spinner);

    // Controles
    if (options.showControls) {
      const controls = this._createControls();
      container.appendChild(controls);
    }

    // Botão fechar
    if (options.showCloseButton) {
      const closeButton = this._createCloseButton();
      overlay.appendChild(closeButton);
    }

    container.appendChild(spinner);
    overlay.appendChild(container);

    // Fecha ao clicar no overlay
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    return overlay;
  }

  /**
   * Cria controles de navegação
   * @private
   * @returns {HTMLElement}
   */
  _createControls() {
    const controls = document.createElement("div");
    controls.className = "image-controls";

    const left = document.createElement("div");
    left.className = "image-controls-left";

    // Botão download
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "image-control-btn";
    downloadBtn.textContent = "⬇️ Baixar";
    downloadBtn.onclick = () => this.download();

    left.appendChild(downloadBtn);

    // Informações
    const info = document.createElement("span");
    info.className = "image-info";
    info.textContent = "Imagem PNG";

    left.appendChild(info);

    // Controles de zoom
    const right = document.createElement("div");
    right.className = "image-controls-right";

    const zoomControl = document.createElement("div");
    zoomControl.className = "image-zoom-control";

    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.className = "image-zoom-btn";
    zoomOutBtn.textContent = "−";
    zoomOutBtn.onclick = () => this.zoomOut();

    const zoomLabel = document.createElement("span");
    zoomLabel.className = "image-info";
    zoomLabel.textContent = `${Math.round(this.activeImage?.scale * 100 || 100)}%`;

    const zoomInBtn = document.createElement("button");
    zoomInBtn.className = "image-zoom-btn";
    zoomInBtn.textContent = "+";
    zoomInBtn.onclick = () => this.zoomIn();

    zoomControl.appendChild(zoomOutBtn);
    zoomControl.appendChild(zoomLabel);
    zoomControl.appendChild(zoomInBtn);

    right.appendChild(zoomControl);

    controls.appendChild(left);
    controls.appendChild(right);

    return controls;
  }

  /**
   * Cria botão de fechar
   * @private
   * @returns {HTMLElement}
   */
  _createCloseButton() {
    const button = document.createElement("button");
    button.className = "image-close-button";
    button.textContent = "✕";
    button.setAttribute("aria-label", "Fechar imagem");

    button.addEventListener("click", () => {
      this.close();
    });

    return button;
  }

  /**
   * Aplica escala à imagem
   * @private
   */
  _applyScale() {
    if (!this.activeImage) return;

    const { image, scale } = this.activeImage;
    image.style.transform = `scale(${scale})`;
  }

  /**
   * Atualiza controles
   * @private
   */
  _updateControls() {
    if (!this.activeImage) return;

    const modal = this.activeImage.modal;
    const zoomLabel = modal.querySelector(".image-zoom-control .image-info");

    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.activeImage.scale * 100)}%`;
    }
  }

  // ============================================
  // ZOOM
  // ============================================

  /**
   * Zoom in
   * @returns {void}
   */
  zoomIn() {
    if (!this.activeImage) return;

    const newScale = Math.min(
      this.activeImage.scale + 0.2,
      this.defaults.maxScale
    );

    this.activeImage.scale = newScale;
    this._applyScale();
    this._updateControls();

    console.log(`🔍 Zoom: ${Math.round(newScale * 100)}%`);
  }

  /**
   * Zoom out
   * @returns {void}
   */
  zoomOut() {
    if (!this.activeImage) return;

    const newScale = Math.max(
      this.activeImage.scale - 0.2,
      this.defaults.minScale
    );

    this.activeImage.scale = newScale;
    this._applyScale();
    this._updateControls();

    console.log(`🔍 Zoom: ${Math.round(newScale * 100)}%`);
  }

  /**
   * Resetar zoom
   * @returns {void}
   */
  resetZoom() {
    if (!this.activeImage) return;

    this.activeImage.scale = this.defaults.initialScale;
    this._applyScale();
    this._updateControls();

    console.log("🔍 Zoom resetado");
  }

  // ============================================
  // CONTROLE GERAL
  // ============================================

  /**
   * Baixa a imagem
   * @returns {void}
   */
  download() {
    if (!this.activeImage) return;

    const link = document.createElement("a");
    link.href = this.activeImage.path;
    link.download = this.activeImage.path.split("/").pop() || "imagem.png";
    link.click();

    console.log("⬇️ Download iniciado");
  }

  /**
   * Fecha imagem ativa
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.activeImage) {
      return;
    }

    return new Promise((resolve) => {
      const { modal, options } = this.activeImage;

      // Animação de saída
      modal.classList.add("closing");

      setTimeout(() => {
        this._removeModal();
        this.stats.totalClosed++;

        if (options.onClose) {
          options.onClose();
        }

        console.log("❌ Imagem fechada");
        resolve();
      }, 300);
    });
  }

  /**
   * Remove modal do DOM
   * @private
   */
  _removeModal() {
    if (!this.activeImage) return;

    const { modal } = this.activeImage;

    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }

    this.activeImage = null;
  }

  // ============================================
  // UTILITÁRIOS E DEBUG
  // ============================================

  /**
   * Obtém informações da imagem ativa
   * @returns {Object|null}
   */
  getActiveImageInfo() {
    if (!this.activeImage) {
      return null;
    }

    return {
      path: this.activeImage.path,
      scale: this.activeImage.scale,
    };
  }

  /**
   * Verifica se há imagem aberta
   * @returns {boolean}
   */
  isOpen() {
    return !!this.activeImage;
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isOpen: this.isOpen(),
      currentImage: this.getActiveImageInfo(),
    };
  }

  /**
   * Debug: Mostra estado atual
   */
  debug() {
    console.log("🖼️ ImageManager Debug:");
    console.log("  Stats:", this.getStats());
    console.log("  Imagem Ativa:", this.getActiveImageInfo());
  }

  /**
   * Reset completo
   */
  async reset() {
    await this.close();

    this.stats = {
      totalOpened: 0,
      totalClosed: 0,
      totalErrors: 0,
    };

    console.log("🔄 ImageManager resetado");
  }
}

// Singleton
export const imageManager = new ImageManager();

// Expõe globalmente para debug
window.imageManager = imageManager;

console.log("✅ ImageManager carregado");
console.log("💡 Use window.imageManager.debug() para diagnóstico");
