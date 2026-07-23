/**
 * audio-manager.js - Orquestrador de Áudio (REFATORADO)
 *
 * Responsabilidades:
 * - Interface unificada para SFX, Vídeo e PNG
 * - Delegar chamadas aos managers especializados
 * - Manter compatibilidade com código legado
 * - Gerenciar volume global
 * - Coordenar inicialização dos sistemas
 *
 * @module AudioManager
 */

import { sfxManager } from "@systems/audio/sfx-manager.js";
import { videoManager } from "@systems/audio/video-manager.js";
import { imageManager } from "@systems/audio/image-manager.js";
import { configManager } from "@core/config-manager.js";
import { assetResolver } from "@core/asset-resolver.js";

class AudioManager {
  constructor() {
    this.initialized = false;

    // Referências aos managers especializados
    this.sfx = sfxManager;
    this.video = videoManager;
    this.image = imageManager;

    // Base path — DEPRECATED (app:// removido na v3.0).
    this.basePath = null;
  }

  /**
   * Inicializa todos os sistemas de áudio
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ AudioManager já foi inicializado");
      return;
    }

    console.log("🎵 AudioManager (Orquestrador) inicializando...");

    // Inicializa subsistemas
    this.sfx.init();
    this.video.init();
    this.image.init();

    this.initialized = true;
    console.log("✅ AudioManager inicializado");
    console.log(`  🔊 SFX Volume: ${this.sfx.getGlobalVolume()}%`);
    console.log(`  🎬 Vídeo Volume: ${this.video.getGlobalVolume()}%`);
    console.log(`  🖼️ Image Manager: Pronto`);
  }

  // ============================================
  // SFX (EFEITOS SONOROS)
  // ============================================

  /**
   * Reproduz efeito sonoro
   * @param {string} path - Caminho relativo
   * @param {boolean} [useBasePath=true] - Usar basePath?
   * @param {number|null} [individualVolume=null] - Volume específico (0-1)
   * @returns {string|null} ID do som
   */
  playSFX(path, useBasePath = true, individualVolume = null) {
    return this.sfx.play(path, {
      useBasePath,
      volume: individualVolume,
    });
  }

  /**
   * Para um som específico
   * @param {string} soundId
   * @param {number} [fadeOut=0] - Fade out em ms
   * @returns {Promise<boolean>}
   */
  stopSFX(soundId, fadeOut = 0) {
    return this.sfx.stop(soundId, fadeOut);
  }

  /**
   * Para todos os sons
   * @param {number} [fadeOut=0] - Fade out em ms
   * @returns {Promise<number>}
   */
  stopAllSFX(fadeOut = 0) {
    return this.sfx.stopAll(fadeOut);
  }

  /**
   * Pausa um som
   * @param {string} soundId
   * @returns {boolean}
   */
  pauseSFX(soundId) {
    return this.sfx.pause(soundId);
  }

  /**
   * Resume um som
   * @param {string} soundId
   * @returns {boolean}
   */
  resumeSFX(soundId) {
    return this.sfx.resume(soundId);
  }

  /**
   * Define volume de SFX
   * @param {number} value - Volume (0-100)
   */
  setSFXVolume(value) {
    this.sfx.setGlobalVolume(value);
  }

  /**
   * Obtém volume de SFX
   * @returns {number} Volume (0-100)
   */
  getSFXVolume() {
    return this.sfx.getGlobalVolume();
  }

  /**
   * Pré-carrega um áudio
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  preloadSFX(path) {
    return this.sfx.preload(path);
  }

  // ============================================
  // VÍDEO
  // ============================================

  /**
   * Reproduz vídeo em modal fullscreen
   * @param {string} path - Caminho relativo
   * @param {boolean} [useBasePath=true] - Usar basePath?
   * @returns {Promise<void>}
   */
  async playVideo(path, useBasePath = true) {
    return this.video.play(path, { useBasePath });
  }

  /**
   * Pausa vídeo ativo
   */
  pauseVideo() {
    this.video.pause();
  }

  /**
   * Resume vídeo ativo
   */
  async resumeVideo() {
    return this.video.resume();
  }

  /**
   * Para vídeo ativo
   */
  stopVideo() {
    this.video.stop();
  }

  /**
   * Fecha modal de vídeo
   * @returns {Promise<void>}
   */
  closeVideo() {
    return this.video.close();
  }

  /**
   * Define volume de vídeo
   * @param {number} value - Volume (0-100)
   */
  setVideoVolume(value) {
    this.video.setGlobalVolume(value);
  }

  /**
   * Obtém volume de vídeo
   * @returns {number} Volume (0-100)
   */
  getVideoVolume() {
    return this.video.getGlobalVolume();
  }

  /**
   * Verifica se há vídeo reproduzindo
   * @returns {boolean}
   */
  isVideoPlaying() {
    return this.video.isPlaying();
  }

  // ============================================
  // PNG (IMAGENS)
  // ============================================

  /**
   * Abre imagem PNG em modal fullscreen
   * @param {string} path - Caminho relativo
   * @param {Object} [options] - Opções de visualização
   * @returns {Promise<void>}
   */
  async openImage(path, options = {}) {
    return this.image.open(path, options);
  }

  /**
   * Fecha imagem PNG ativa
   * @returns {Promise<void>}
   */
  closeImage() {
    return this.image.close();
  }

  /**
   * Zoom in na imagem PNG
   * @returns {Promise<void>}
   */
  async zoomInImage() {
    return this.image.zoomIn();
  }

  /**
   * Zoom out na imagem PNG
   * @returns {Promise<void>}
   */
  async zoomOutImage() {
    return this.image.zoomOut();
  }

  /**
   * Reseta zoom da imagem PNG
   * @returns {Promise<void>}
   */
  async resetImageZoom() {
    return this.image.resetZoom();
  }

  /**
   * Verifica se há imagem PNG aberta
   * @returns {boolean}
   */
  isImageOpen() {
    return this.image.isOpen();
  }

  /**
   * Obtém informações da imagem PNG ativa
   * @returns {Object|null}
   */
  getActiveImageInfo() {
    return this.image.getActiveImageInfo();
  }

  // ============================================
  // COMPATIBILIDADE COM CÓDIGO LEGADO
  // ============================================

  /**
   * @deprecated Use setSFXVolume
   * Define volume geral (mantido para compatibilidade)
   * @param {number} value - Volume (0-1)
   */
  setVolume(value) {
    console.warn("⚠️ audioManager.setVolume() deprecated - use setSFXVolume()");
    const percentage = Math.round(value * 100);
    this.setSFXVolume(percentage);
  }

  /**
   * @deprecated Use closeVideo
   * Fecha vídeo ativo (mantido para compatibilidade)
   */
  closeActiveVideo() {
    console.warn("⚠️ audioManager.closeActiveVideo() deprecated - use closeVideo()");
    return this.closeVideo();
  }

  /**
   * Toca áudio de classe via characterId (userData/characters/audio/)
   * @param {string} characterId - ID do personagem (ex: "character_001")
   */
  playClassAudio(characterId) {
    if (!characterId) return;

    try {
      const url = assetResolver.characterAudio(characterId);
      console.log(`🔊 Tentando tocar áudio da classe: ${url}`);
      this.playSFX(url, false, 0.5);
    } catch (error) {
      console.warn("⚠️ Erro ao tocar áudio de classe:", error);
    }
  }

  // ============================================
  // VOLUME GLOBAL
  // ============================================

  /**
   * Define volume de todos os sistemas
   * @param {Object} volumes - { sfx: 0-100, video: 0-100 }
   */
  setAllVolumes(volumes) {
    if (volumes.sfx !== undefined) {
      this.setSFXVolume(volumes.sfx);
    }

    if (volumes.video !== undefined) {
      this.setVideoVolume(volumes.video);
    }

    console.log("🔊 Volumes atualizados:", {
      sfx: this.getSFXVolume(),
      video: this.getVideoVolume(),
    });
  }

  /**
   * Obtém volumes de todos os sistemas
   * @returns {Object} { sfx: 0-100, video: 0-100 }
   */
  getAllVolumes() {
    return {
      sfx: this.getSFXVolume(),
      video: this.getVideoVolume(),
    };
  }

  /**
   * Silencia tudo
   */
  muteAll() {
    this.setSFXVolume(0);
    this.setVideoVolume(0);
    console.log("🔇 Tudo silenciado");
  }

  /**
   * Restaura volumes salvos
   */
  restoreVolumes() {
    const sfxVolume = configManager.getGlobal("app.sfxVolume");
    const videoVolume = configManager.getGlobal("app.videoVolume");

    if (sfxVolume !== undefined) {
      this.setSFXVolume(sfxVolume);
    }

    if (videoVolume !== undefined) {
      this.setVideoVolume(videoVolume);
    }

    console.log("🔊 Volumes restaurados:", {
      sfx: this.getSFXVolume(),
      video: this.getVideoVolume(),
    });
  }

  // ============================================
  // CONTROLE GLOBAL
  // ============================================

  /**
   * Pausa tudo
   */
  pauseAll() {
    this.sfx.pauseAll();
    this.pauseVideo();
    console.log("⏸️ Tudo pausado");
  }

  /**
   * Resume tudo
   */
  async resumeAll() {
    this.sfx.resumeAll();
    await this.resumeVideo();
    console.log("▶️ Tudo resumido");
  }

  /**
   * Para tudo
   * @param {number} [fadeOut=0] - Fade out em ms
   */
  async stopAll(fadeOut = 0) {
    await this.stopAllSFX(fadeOut);
    this.stopVideo();
    console.log("⏹️ Tudo parado");
  }

  // ============================================
  // ESTATÍSTICAS E DEBUG
  // ============================================

  /**
   * Obtém estatísticas completas
   * @returns {Object}
   */
  getStats() {
    return {
      sfx: this.sfx.getStats(),
      video: this.video.getStats(),
      image: this.image.getStats(),
      volumes: this.getAllVolumes(),
    };
  }

  /**
   * Obtém sons ativos
   * @returns {Object}
   */
  getActiveSounds() {
    return {
      sfx: this.sfx.getActiveSounds(),
      video: this.video.getActiveVideoInfo(),
      image: this.image.getActiveImageInfo(),
    };
  }

  /**
   * Debug: Mostra estado completo
   */
  debug() {
    console.log("\n🎵 === AUDIO MANAGER DEBUG ===");

    console.log("\n📊 Estatísticas Gerais:");
    console.log(this.getStats());

    console.log("\n🔊 SFX Manager:");
    this.sfx.debug();

    console.log("\n🎬 Video Manager:");
    this.video.debug();

    console.log("\n🖼️ Image Manager:");
    this.image.debug();

    console.log("================================\n");
  }

  /**
   * Reset completo de todos os sistemas
   */
  async reset() {
    console.log("🔄 Resetando AudioManager completo...");

    await this.sfx.reset();
    await this.video.reset();
    await this.image.reset();

    console.log("✅ AudioManager resetado");
  }

  // ============================================
  // ATALHOS DE CONVENIÊNCIA
  // ============================================

  /**
   * Toca som de notificação
   * @param {string} type - 'info', 'success', 'warning', 'error'
   */
  playNotificationSound(type = "info") {
    const soundMap = {
      info: "UI/SFX/notification_info.mp3",
      success: "UI/SFX/notification_success.mp3",
      warning: "UI/SFX/notification_warning.mp3",
      error: "UI/SFX/notification_error.mp3",
    };

    const path = soundMap[type] || soundMap.info;
    this.playSFX(path, true, 0.4);
  }

  /**
   * Toca som de carta
   * @param {string} cardSound - 'flip', 'critical', 'parry'
   */
  playCardSound(cardSound = "flip") {
    const soundMap = {
      flip: "UI/SFX/virar_carta.mp3",
      critical: "UI/SFX/critico.mp3",
      parry: "UI/parry.mp3",
    };

    const path = soundMap[cardSound];

    if (path) {
      this.playSFX(path, true, 0.6);
    }
  }

  /**
   * Toca som de UI
   * @param {string} uiSound - Nome do arquivo (sem extensão)
   */
  playUISound(uiSound) {
    const path = `UI/SFX/${uiSound}.mp3`;
    this.playSFX(path, true, 0.4);
  }

  // ============================================
  // TESTE E SIMULAÇÃO
  // ============================================

  /**
   * Testa sistema de SFX
   */
  async testSFX() {
    console.log("🧪 Testando SFX Manager...");

    const testSounds = ["UI/SFX/virar_carta.mp3", "UI/SFX/critico.mp3", "UI/parry.mp3"];

    for (const sound of testSounds) {
      console.log(`  Tocando: ${sound}`);
      this.playSFX(sound, true, 0.3);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("✅ Teste de SFX completo");
  }

  /**
   * Testa sistema de vídeo
   */
  async testVideo() {
    console.log("🧪 Testando Video Manager...");

    try {
      await this.playVideo("UI/intro1.mp4");
      console.log("✅ Teste de vídeo iniciado");
    } catch (error) {
      console.error("❌ Erro no teste de vídeo:", error);
    }
  }

  /**
   * Testa sistema de imagem PNG
   */
  async testImage() {
    console.log("🧪 Testando Image Manager...");

    try {
      await this.openImage("UI/sample.png");
      console.log("✅ Teste de imagem PNG iniciado");
    } catch (error) {
      console.error("❌ Erro no teste de imagem PNG:", error);
    }
  }

  // ============================================
  // VALIDAÇÃO
  // ============================================

  /**
   * Valida se todos os sistemas estão funcionando
   * @returns {Object} Resultado da validação
   */
  validate() {
    const results = {
      sfx: {
        initialized: this.sfx.initialized,
        volume: this.getSFXVolume(),
        activeSounds: this.sfx.activeSounds.size,
        cacheSize: this.sfx.audioCache.size,
      },
      video: {
        initialized: this.video.initialized,
        volume: this.getVideoVolume(),
        isPlaying: this.isVideoPlaying(),
      },
      image: {
        initialized: this.image.initialized,
        isOpen: this.isImageOpen(),
      },
      overall: true,
    };

    // Verifica se tudo está OK
    if (!this.sfx.initialized || !this.video.initialized || !this.image.initialized) {
      results.overall = false;
    }

    console.log("✅ Validação do AudioManager:", results);

    return results;
  }
}

// Singleton
export const audioManager = new AudioManager();

// Expõe globalmente para compatibilidade
window.audioManager = audioManager;

// Expõe subsistemas para acesso direto (opcional)
window.sfxManager = sfxManager;
window.videoManager = videoManager;
window.imageManager = imageManager;

console.log("✅ AudioManager (Orquestrador) carregado");
console.log("💡 Comandos disponíveis:");
console.log("   - audioManager.debug()");
console.log("   - audioManager.testSFX()");
console.log("   - audioManager.testVideo()");
console.log("   - audioManager.testImage()");
console.log("   - audioManager.validate()");
console.log("   - audioManager.openImage('caminho/arquivo.png')");
