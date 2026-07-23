/**
 * sfx-manager.js - Sistema de Efeitos Sonoros
 *
 * Responsabilidades:
 * - Reproduzir efeitos sonoros (SFX)
 * - Gerenciar volume de SFX
 * - Cache de áudios pré-carregados
 * - Controle de sobreposição de sons
 * - Fade in/out de efeitos
 * - Pool de objetos Audio para performance
 *
 * @module SFXManager
 */

import { configManager } from "@core/config-manager.js";
import { assetResolver } from "@core/asset-resolver.js";

/**
 * @typedef {Object} SFXOptions
 * @property {number} [volume] - Volume individual (0-1), null = usa global
 * @property {boolean} [loop] - Repetir som?
 * @property {number} [fadeIn] - Fade in em ms
 * @property {number} [fadeOut] - Fade out em ms
 * @property {Function} [onEnded] - Callback ao terminar
 * @property {Function} [onError] - Callback de erro
 * @property {number} [delay] - Delay antes de tocar (ms)
 * @property {number} [rate] - Velocidade de reprodução (0.5-2.0)
 */

/**
 * @typedef {Object} PlayingSFX
 * @property {string} id - ID único do som
 * @property {HTMLAudioElement} audio - Elemento de áudio
 * @property {string} path - Caminho do arquivo
 * @property {number} startTime - Timestamp de início
 * @property {boolean} fading - Está em fade?
 * @property {number} targetVolume - Volume alvo
 */

class SFXManager {
  constructor() {
    this.initialized = false;

    // Volume global de SFX (0-1)
    this.globalVolume = 0.3;

    // Sons ativos
    this.activeSounds = new Map(); // Map<id, PlayingSFX>

    // Cache de áudio pré-carregado
    this.audioCache = new Map(); // Map<path, HTMLAudioElement>

    // Pool de objetos Audio para reutilização
    this.audioPool = [];
    this.maxPoolSize = 20;

    // Configurações
    this.maxSimultaneousSounds = 10;
    this.allowDuplicates = true; // Permitir mesmo som múltiplas vezes?

    // Contador de IDs
    this.soundIdCounter = 0;

    // Estatísticas
    this.stats = {
      totalPlayed: 0,
      totalStopped: 0,
      totalErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    // Base path — DEPRECATED (app:// removido na v3.0). Paths resolvidos via assetResolver.
    this.basePath = null;
  }

  /**
   * Inicializa o sistema de SFX
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ SFXManager já foi inicializado");
      return;
    }

    console.log("🔊 SFXManager inicializando...");

    // Carrega volume salvo
    this.loadVolumeFromConfig();

    // Pré-carrega sons comuns
    this.preloadCommonSounds();

    this.initialized = true;
    console.log(`✅ SFXManager inicializado - Volume: ${Math.round(this.globalVolume * 100)}%`);
  }

  /**
   * Carrega volume do ConfigManager
   * @private
   */
  loadVolumeFromConfig() {
    const savedVolume = configManager.getGlobal("app.sfxVolume");

    if (savedVolume !== undefined && savedVolume !== null) {
      this.globalVolume = Math.max(0, Math.min(1, savedVolume / 100));
      console.log(`📊 Volume SFX carregado: ${Math.round(this.globalVolume * 100)}%`);
    }
  }

  /**
   * Pré-carrega sons comuns
   * @private
   */
  async preloadCommonSounds() {
    const commonSounds = ["gameplay/critico.mp3", "gameplay/parry.mp3", "theme/Lobby_theme.mp3"];

    console.log(`🔄 Pré-carregando ${commonSounds.length} som(ns) comum(ns)...`);

    const results = await Promise.allSettled(commonSounds.map((path) => this.preload(path)));

    const successful = results.filter((r) => r.status === "fulfilled").length;
    console.log(`✅ ${successful}/${commonSounds.length} som(ns) pré-carregado(s)`);
  }

  // ============================================
  // REPRODUÇÃO DE SFX
  // ============================================

  /**
   * Reproduz um efeito sonoro
   * @param {string} path - Caminho relativo ao assets
   * @param {SFXOptions} [options] - Opções de reprodução
   * @returns {string|null} ID do som (para controle posterior)
   */
  play(path, options = {}) {
    if (!this.initialized) {
      console.warn("⚠️ SFXManager não inicializado");
      this.init();
    }

    try {
      // Valida path
      if (!path || typeof path !== "string") {
        console.error("❌ Caminho de áudio inválido:", path);
        this.stats.totalErrors++;
        return null;
      }

      // Resolve caminho completo
      const fullPath = this._resolveAudioPath(path, options.useBasePath !== false);

      // Verifica limite de sons simultâneos
      if (this.activeSounds.size >= this.maxSimultaneousSounds) {
        console.warn("⚠️ Limite de sons simultâneos atingido");
        this._stopOldestSound();
      }

      // Verifica duplicatas
      if (!this.allowDuplicates && this._isSoundPlaying(fullPath)) {
        console.log(`🔇 Som já está tocando: ${path}`);
        return null;
      }

      // Gera ID único
      const soundId = this._generateSoundId();

      // Obtém ou cria elemento de áudio
      const audio = this._getAudioElement(fullPath);

      if (!audio) {
        console.error(`❌ Não foi possível criar áudio para: ${path}`);
        this.stats.totalErrors++;
        return null;
      }

      // Configura áudio
      const finalVolume = this._calculateVolume(options.volume);
      const targetVolume = finalVolume;

      audio.volume = options.fadeIn ? 0 : finalVolume;
      audio.loop = options.loop || false;
      audio.playbackRate = options.rate || 1.0;

      // Armazena informações
      const soundData = {
        id: soundId,
        audio,
        path: fullPath,
        startTime: Date.now(),
        fading: false,
        targetVolume,
        options,
      };

      this.activeSounds.set(soundId, soundData);

      // Configura eventos
      this._setupAudioEvents(soundData);

      // Reproduz (com delay se necessário)
      const playAudio = async () => {
        try {
          await audio.play();

          // Fade in
          if (options.fadeIn) {
            this._fadeIn(soundData, options.fadeIn);
          }

          this.stats.totalPlayed++;
          console.log(`🔊 SFX tocando: ${path} (ID: ${soundId})`);
        } catch (error) {
          console.error(`❌ Erro ao reproduzir ${path}:`, error);
          this.stats.totalErrors++;
          this.activeSounds.delete(soundId);

          if (options.onError) {
            options.onError(error);
          }
        }
      };

      if (options.delay && options.delay > 0) {
        setTimeout(playAudio, options.delay);
      } else {
        playAudio();
      }

      return soundId;
    } catch (error) {
      console.error("❌ Erro ao reproduzir SFX:", error);
      this.stats.totalErrors++;
      return null;
    }
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
   * Resolve caminho do áudio
   * @private
   * @param {string} path
   * @param {boolean} useBasePath
   * @returns {string}
   */
  _resolveAudioPath(path, useBasePath = true) {
    // Path já resolvido (file:// ou http) — usa direto
    if (path.startsWith("file://") || path.startsWith("http")) {
      return path;
    }

    // Path de app asset (ex: "UI/SFX/virar_carta.mp3") — resolve via assetResolver
    if (useBasePath) {
      return assetResolver.appSounds(path);
    }

    return path;
  }

  /**
   * Obtém elemento de áudio (cache ou novo)
   * @private
   * @param {string} path
   * @returns {HTMLAudioElement|null}
   */
  _getAudioElement(path) {
    // Verifica cache
    if (this.audioCache.has(path)) {
      const cachedAudio = this.audioCache.get(path);
      this.stats.cacheHits++;

      // Clona para permitir múltiplas instâncias
      return cachedAudio.cloneNode();
    }

    // Tenta obter do pool
    const pooledAudio = this._getFromPool();

    if (pooledAudio) {
      pooledAudio.src = path;
      this.stats.cacheMisses++;
      return pooledAudio;
    }

    // Cria novo
    const audio = new Audio(path);
    this.stats.cacheMisses++;

    return audio;
  }

  /**
   * Obtém áudio do pool
   * @private
   * @returns {HTMLAudioElement|null}
   */
  _getFromPool() {
    if (this.audioPool.length > 0) {
      return this.audioPool.pop();
    }

    return null;
  }

  /**
   * Retorna áudio ao pool
   * @private
   * @param {HTMLAudioElement} audio
   */
  _returnToPool(audio) {
    if (this.audioPool.length >= this.maxPoolSize) {
      return; // Pool cheio
    }

    // Limpa áudio
    audio.pause();
    audio.currentTime = 0;
    audio.src = "";
    audio.removeAttribute("src");

    this.audioPool.push(audio);
  }

  /**
   * Gera ID único para som
   * @private
   * @returns {string}
   */
  _generateSoundId() {
    return `sfx_${++this.soundIdCounter}_${Date.now()}`;
  }

  /**
   * Verifica se som já está tocando
   * @private
   * @param {string} path
   * @returns {boolean}
   */
  _isSoundPlaying(path) {
    for (const sound of this.activeSounds.values()) {
      if (sound.path === path && !sound.audio.paused) {
        return true;
      }
    }

    return false;
  }

  /**
   * Para o som mais antigo
   * @private
   */
  _stopOldestSound() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, sound] of this.activeSounds.entries()) {
      if (sound.startTime < oldestTime) {
        oldestTime = sound.startTime;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.stop(oldestId);
    }
  }

  // ============================================
  // EVENTOS DE ÁUDIO
  // ============================================

  /**
   * Configura listeners de eventos do áudio
   * @private
   * @param {PlayingSFX} soundData
   */
  _setupAudioEvents(soundData) {
    const { id, audio, options } = soundData;

    // Quando terminar
    audio.addEventListener("ended", () => {
      console.log(`✅ SFX finalizado: ${id}`);

      // Callback
      if (options.onEnded) {
        options.onEnded(id);
      }

      // Remove e retorna ao pool
      this._cleanupSound(id);
    });

    // Erro
    audio.addEventListener("error", (e) => {
      console.error(`❌ Erro no áudio ${id}:`, e);
      this.stats.totalErrors++;

      // Callback
      if (options.onError) {
        options.onError(e);
      }

      this._cleanupSound(id);
    });
  }

  /**
   * Limpa som após terminar
   * @private
   * @param {string} soundId
   */
  _cleanupSound(soundId) {
    const sound = this.activeSounds.get(soundId);

    if (!sound) return;

    // Retorna ao pool
    this._returnToPool(sound.audio);

    // Remove do mapa
    this.activeSounds.delete(soundId);
  }

  // ============================================
  // FADE IN/OUT
  // ============================================

  /**
   * Fade in
   * @private
   * @param {PlayingSFX} soundData
   * @param {number} duration - Duração em ms
   */
  _fadeIn(soundData, duration) {
    const { audio, targetVolume } = soundData;

    soundData.fading = true;

    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = targetVolume / steps;

    let currentStep = 0;

    const fadeInterval = setInterval(() => {
      currentStep++;

      audio.volume = Math.min(targetVolume, volumeStep * currentStep);

      if (currentStep >= steps) {
        clearInterval(fadeInterval);
        soundData.fading = false;
        audio.volume = targetVolume;
      }
    }, stepDuration);
  }

  /**
   * Fade out
   * @private
   * @param {PlayingSFX} soundData
   * @param {number} duration - Duração em ms
   * @returns {Promise<void>}
   */
  _fadeOut(soundData, duration) {
    return new Promise((resolve) => {
      const { audio } = soundData;
      const initialVolume = audio.volume;

      soundData.fading = true;

      const steps = 20;
      const stepDuration = duration / steps;
      const volumeStep = initialVolume / steps;

      let currentStep = 0;

      const fadeInterval = setInterval(() => {
        currentStep++;

        audio.volume = Math.max(0, initialVolume - volumeStep * currentStep);

        if (currentStep >= steps) {
          clearInterval(fadeInterval);
          soundData.fading = false;
          audio.volume = 0;
          resolve();
        }
      }, stepDuration);
    });
  }

  // ============================================
  // CONTROLE DE SOM
  // ============================================

  /**
   * Para um som específico
   * @param {string} soundId
   * @param {number} [fadeOutDuration] - Fade out em ms
   * @returns {Promise<boolean>}
   */
  async stop(soundId, fadeOutDuration = 0) {
    const sound = this.activeSounds.get(soundId);

    if (!sound) {
      console.warn(`⚠️ Som ${soundId} não encontrado`);
      return false;
    }

    if (fadeOutDuration > 0) {
      await this._fadeOut(sound, fadeOutDuration);
    }

    sound.audio.pause();
    sound.audio.currentTime = 0;

    this._cleanupSound(soundId);
    this.stats.totalStopped++;

    console.log(`⏹️ SFX parado: ${soundId}`);

    return true;
  }

  /**
   * Para todos os sons ativos
   * @param {number} [fadeOutDuration] - Fade out em ms
   * @returns {Promise<number>} Quantidade parada
   */
  async stopAll(fadeOutDuration = 0) {
    const soundIds = Array.from(this.activeSounds.keys());

    if (soundIds.length === 0) {
      return 0;
    }

    console.log(`⏹️ Parando ${soundIds.length} som(ns)...`);

    await Promise.all(soundIds.map((id) => this.stop(id, fadeOutDuration)));

    return soundIds.length;
  }

  /**
   * Pausa um som
   * @param {string} soundId
   * @returns {boolean}
   */
  pause(soundId) {
    const sound = this.activeSounds.get(soundId);

    if (!sound) {
      console.warn(`⚠️ Som ${soundId} não encontrado`);
      return false;
    }

    sound.audio.pause();
    console.log(`⏸️ SFX pausado: ${soundId}`);

    return true;
  }

  /**
   * Resume um som pausado
   * @param {string} soundId
   * @returns {boolean}
   */
  resume(soundId) {
    const sound = this.activeSounds.get(soundId);

    if (!sound) {
      console.warn(`⚠️ Som ${soundId} não encontrado`);
      return false;
    }

    sound.audio.play().catch((e) => {
      console.error("❌ Erro ao resumir:", e);
    });

    console.log(`▶️ SFX resumido: ${soundId}`);

    return true;
  }

  /**
   * Pausa todos os sons
   */
  pauseAll() {
    const soundIds = Array.from(this.activeSounds.keys());
    soundIds.forEach((id) => this.pause(id));

    console.log(`⏸️ ${soundIds.length} som(ns) pausado(s)`);
  }

  /**
   * Resume todos os sons pausados
   */
  resumeAll() {
    const soundIds = Array.from(this.activeSounds.keys());
    soundIds.forEach((id) => this.resume(id));

    console.log(`▶️ ${soundIds.length} som(ns) resumido(s)`);
  }

  // ============================================
  // VOLUME
  // ============================================

  /**
   * Define volume global de SFX
   * @param {number} value - Volume (0-100)
   */
  setGlobalVolume(value) {
    const normalized = Math.max(0, Math.min(100, value)) / 100;
    this.globalVolume = normalized;

    // Atualiza volume de todos os sons ativos
    this.activeSounds.forEach((sound) => {
      if (!sound.fading) {
        sound.audio.volume = this._calculateVolume(sound.options.volume);
      }
    });

    // Salva no config
    configManager.setGlobal("app.sfxVolume", Math.round(this.globalVolume * 100));

    console.log(`🔊 Volume SFX global: ${Math.round(this.globalVolume * 100)}%`);
  }

  /**
   * Define volume de um som específico
   * @param {string} soundId
   * @param {number} volume - Volume (0-1)
   */
  setVolume(soundId, volume) {
    const sound = this.activeSounds.get(soundId);

    if (!sound) {
      console.warn(`⚠️ Som ${soundId} não encontrado`);
      return;
    }

    sound.audio.volume = Math.max(0, Math.min(1, volume));
    sound.targetVolume = sound.audio.volume;
  }

  /**
   * Obtém volume global
   * @returns {number} Volume (0-100)
   */
  getGlobalVolume() {
    return Math.round(this.globalVolume * 100);
  }

  // ============================================
  // PRÉ-CARREGAMENTO
  // ============================================

  /**
   * Pré-carrega um áudio
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async preload(path) {
    try {
      const fullPath = this._resolveAudioPath(path);

      // Já está em cache
      if (this.audioCache.has(fullPath)) {
        console.log(`✅ Áudio já em cache: ${path}`);
        return true;
      }

      const audio = new Audio(fullPath);

      // Aguarda carregar metadados
      await new Promise((resolve, reject) => {
        audio.addEventListener("loadeddata", resolve);
        audio.addEventListener("error", reject);
      });

      this.audioCache.set(fullPath, audio);
      console.log(`📥 Áudio pré-carregado: ${path}`);

      return true;
    } catch (error) {
      console.warn(`⚠️ Erro ao pré-carregar ${path}:`, error);
      return false;
    }
  }

  /**
   * Limpa cache de áudio
   * @param {string} [specificPath] - Caminho específico ou null para limpar tudo
   */
  clearCache(specificPath = null) {
    if (specificPath) {
      const fullPath = this._resolveAudioPath(specificPath);
      this.audioCache.delete(fullPath);
      console.log(`🗑️ Cache limpo: ${specificPath}`);
    } else {
      const size = this.audioCache.size;
      this.audioCache.clear();
      console.log(`🗑️ Cache completo limpo (${size} arquivo(s))`);
    }
  }

  // ============================================
  // UTILITÁRIOS E DEBUG
  // ============================================

  /**
   * Obtém sons ativos
   * @returns {Array<Object>}
   */
  getActiveSounds() {
    return Array.from(this.activeSounds.values()).map((sound) => ({
      id: sound.id,
      path: sound.path,
      paused: sound.audio.paused,
      currentTime: sound.audio.currentTime,
      duration: sound.audio.duration,
      volume: sound.audio.volume,
      loop: sound.audio.loop,
    }));
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      activeSounds: this.activeSounds.size,
      cacheSize: this.audioCache.size,
      poolSize: this.audioPool.length,
      globalVolume: this.getGlobalVolume(),
    };
  }

  /**
   * Debug: Mostra estado atual
   */
  debug() {
    console.log("🔊 SFXManager Debug:");
    console.log("  Stats:", this.getStats());
    console.log("  Sons Ativos:", this.getActiveSounds());
    console.log("  Cache:", Array.from(this.audioCache.keys()));
  }

  /**
   * Reset completo
   */
  async reset() {
    await this.stopAll();
    this.clearCache();
    this.audioPool = [];
    this.stats = {
      totalPlayed: 0,
      totalStopped: 0,
      totalErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    console.log("🔄 SFXManager resetado");
  }
}

// Singleton
export const sfxManager = new SFXManager();

// Expõe globalmente para debug
window.sfxManager = sfxManager;

console.log("✅ SFXManager carregado");
console.log("💡 Use window.sfxManager.debug() para diagnóstico");
