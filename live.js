/**
 * live.js - Sistema de Integração com Plataformas de Streaming
 *
 * Responsabilidades:
 * - Gerenciar conexões com YouTube e StreamElements
 * - Processar mensagens de chat
 * - Coordenar execução de comandos
 * - Sincronizar estado de conexão
 * - Feedback visual de status
 *
 * FLUXO DE CONEXÃO v2:
 *  1. Aba Live salva o handle/URL do canal
 *  2. Sistema resolve channelId + liveId via IPC (main process, sem CORS)
 *  3. IDs resolvidos são salvos em configManager global
 *  4. connectYouTube() lê os IDs resolvidos e passa diretamente à biblioteca
 *     evitando a etapa interna de resolução que falhava
 *
 * @module Live
 */

import { commandRegistry } from "@systems/integrations/command-registry.js";
import { configManager } from "@core/config-manager.js";
import { playerManager } from "@systems/player/player-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { characterSelector } from "@systems/player/character-selector.js";
import { transitionSystem } from "@interface/transition-system.js";
import { languageManager } from "@core/language-manager.js";
import { devCommandRegistry } from "@systems/integrations/dev-command-registry.js";
import { supportManager } from "@systems/player/support-manager.js";

/**
 * @typedef {Object} ChatMessage
 * @property {string} author - Nome do autor
 * @property {string} message - Conteúdo da mensagem
 * @property {boolean} isOwner - É o dono do canal?
 * @property {boolean} isModerator - É moderador?
 * @property {number} timestamp - Timestamp da mensagem
 */

/**
 * @typedef {Object} ConnectionStatus
 * @property {boolean} connected - Está conectado?
 * @property {string} platform - 'youtube' | 'streamelements' | null
 * @property {string} [liveId] - ID da live (YouTube)
 * @property {string} [error] - Mensagem de erro (se houver)
 */

class Live {
  constructor() {
    this.initialized = false;

    // Estado de conexão
    this.status = {
      youtube: {
        connected: false,
        liveId: null,
        channelId: null,
        lastError: null,
      },
      streamElements: {
        configured: false,
        jwt: null,
        channelId: null,
      },
    };

    // Configurações
    this.config = {
      commandPrefix: "/game",
      enableAutoResponse: true,
      logMessages: true,
      allowedRoles: ["owner", "moderator", "all"],
    };

    // Histórico de mensagens
    this.messageHistory = [];
    this.maxHistorySize = 1000;

    // Estatísticas
    this.stats = {
      messagesReceived: 0,
      commandsProcessed: 0,
      commandsFailed: 0,
      connectionAttempts: 0,
    };

    // Rate limiting (previne spam)
    this.rateLimits = new Map();
    this.rateLimitWindow = 3000;

    // Timer de cleanup periódico do rate limit (a cada 2 minutos)
    this._rateLimitCleanupTimer = null;

    // Timeout de segurança para conexão
    this._connectionTimeout = null;
    this._connectionTimeoutMs = 7000;

    // Timestamp do momento em que a conexão foi confirmada.
    // Mensagens com publishedAt anterior a este valor são ignoradas
    // (evita processar o histórico do chat ao reconectar).
    this._connectedAt = null;

    // Textos de mensagens enviadas pelo bot SE aguardando eco do YouTube.
    // Chave: texto normalizado, valor: Date.now() + TTL (15s).
    // Quando o YouTube devolve a mensagem do bot ela é descartada silenciosamente.
    this._pendingBotMessages = new Map();

    // ── Bug 1: Mensagens históricas ───────────────────────────────────────────
    // youtube-chat não retorna publishedAt confiável e envia um burst de msgs
    // históricas logo após conectar. Solução em duas camadas:
    //   A) Janela de aquecimento: durante WARM_UP_MS após conexão, mensagens
    //      chegam ao overlay mas NÃO executam comandos.
    //   B) Deduplicação por ID: evita reprocessar a mesma mensagem em
    //      reconexões dentro da mesma sessão.
    this.WARM_UP_MS = 3500;
    this._warmupUntil = 0;
    this._seenMessageIds = new Set();
    this._seenIdsMaxSize = 500;
  }

  /**
   * Inicializa o sistema de live
   */
  async init() {
    if (this.initialized) {
      console.warn("⚠️ Live já foi inicializado");
      return;
    }

    console.log("📺 Live inicializando...");

    this.loadConfig();
    this.setupAPIListeners();
    this._startRateLimitCleanup();
    devCommandRegistry.init();

    this.initialized = true;
    console.log("✅ Live inicializado");
    console.log(`  📊 Comandos registrados: ${commandRegistry.getCommandCount()}`);
    console.log(`  🎮 Prefixo: ${this.config.commandPrefix}`);
  }

  /**
   * Carrega configurações do ConfigManager
   * @private
   */
  loadConfig() {
    const liveConfig = configManager.getGlobal("live") || {};

    if (liveConfig.youtubeChannelId) {
      this.status.youtube.channelId = liveConfig.youtubeChannelId;
    }

    if (liveConfig.streamElementsJWT && liveConfig.streamElementsChannelId) {
      this.status.streamElements.configured = true;
      this.status.streamElements.jwt = liveConfig.streamElementsJWT;
      this.status.streamElements.channelId = liveConfig.streamElementsChannelId;
    }

    // Carrega prefixo inicial do config global
    const savedPrefix = configManager.getGlobal("live.commandPrefix");
    if (savedPrefix) this.config.commandPrefix = savedPrefix;

    // Escuta mudanças no prefixo
    configManager.on("live.commandPrefix", (val) => {
      this.config.commandPrefix = val;
    });

    console.log("⚙️ Configurações de live carregadas");
  }

  /**
   * Configura listeners da API do Electron
   * @private
   */
  setupAPIListeners() {
    if (!window.api) {
      console.warn("⚠️ API do Electron não disponível - modo web");
      return;
    }

    window.api.onYouTubeMessage((data) => {
      this.handleYouTubeMessage(data);
    });

    window.api.onYouTubeStatus((data) => {
      this.handleYouTubeStatus(data);
    });

    // Rastreia mensagens enviadas pelo bot SE para deduplicação no overlay.
    // Quando live:response é disparado, o texto vai para o YouTube via SE
    // e volta como live:message — registramos aqui para descartar na chegada.
    document.addEventListener("live:response", (e) => {
      const text = e.detail?.message;
      if (!text) return;
      const key = text.trim().toLowerCase();
      // TTL de 15s — tempo suficiente para o YouTube devolver a mensagem
      this._pendingBotMessages.set(key, Date.now() + 15_000);
    });

    console.log("📡 Listeners da API configurados");
  }

  // ============================================
  // CONEXÃO - YOUTUBE
  // ============================================

  /**
   * Conecta ao chat do YouTube usando os IDs já resolvidos no config.
   * Se não houver IDs resolvidos, tenta resolver agora antes de conectar.
   * @returns {Promise<boolean>}
   */
  async connectYouTube() {
    if (!window.api) {
      console.error("❌ API não disponível");
      return false;
    }

    // Lê IDs resolvidos do config global
    const liveConfig = configManager.getGlobal("live") || {};
    let channelId = liveConfig.youtubeChannelId_resolved || null;
    let liveId = liveConfig.youtubeLiveId || null;
    const rawInput = liveConfig.youtubeChannelId || null; // handle/@URL original

    if (!rawInput && !channelId) {
      console.error("❌ Nenhum canal configurado");
      notificationManager?.show({
        type: "main",
        text: languageManager.translate("live.err_no_channel"),
        duration: 5000,
      });
      return false;
    }

    // Se não tiver IDs resolvidos, resolve agora
    if (!channelId || !liveId) {
      console.log("📺 IDs não resolvidos — resolvendo antes de conectar...");

      try {
        const resolved = await window.api.resolveYoutubeLiveInfo(rawInput || channelId);

        if (resolved?.channelId) {
          channelId = resolved.channelId;
          liveId = resolved.liveId; // pode ser null se offline

          // Persiste no config para uso futuro
          configManager.setGlobal("live.youtubeChannelId_resolved", channelId);
          configManager.setGlobal("live.youtubeLiveId", liveId || "");
        } else {
          console.warn("⚠️ Não foi possível resolver o channelId — tentando com input original");
          channelId = rawInput;
        }
      } catch (err) {
        console.warn("⚠️ Falha ao resolver live info:", err.message);
        channelId = channelId || rawInput;
      }
    }

    if (!channelId && !liveId) {
      console.error("❌ Não foi possível obter channelId ou liveId");
      notificationManager?.show({
        type: "main",
        text: languageManager.translate("live.err_channel_not_found"),
        duration: 7000,
      });
      return false;
    }

    console.log(`📺 Conectando — channelId: ${channelId}, liveId: ${liveId ?? "não resolvido"}`);
    this.stats.connectionAttempts++;
    this.status.youtube.channelId = channelId;

    try {
      // Passa ambos — o main process usa liveId quando disponível
      const result = await window.api.startYouTubeChat({ channelId, liveId });

      if (result.success) {
        console.log("🔄 Tentativa de conexão iniciada...");

        // Race condition fix: o evento "youtube-chat-connected" pode chegar ANTES
        // deste ponto (via IPC assíncrono durante o await acima) e já ter limpado
        // um timeout anterior. Se já estamos conectados, não seta novo timeout.
        if (this.status.youtube.connected) {
          console.log("✅ [YouTube] Já conectado (evento chegou durante o await) — timeout cancelado");
          return true;
        }

        this._clearConnectionTimeout();
        this._connectionTimeout = setTimeout(async () => {
          // Dupla checagem: se conectou entre o setTimeout e o disparo, ignora
          if (this.status.youtube.connected) {
            console.log("✅ [YouTube] Conectado antes do timeout disparar — ignorando");
            return;
          }
          console.error("❌ [YouTube] Timeout de conexão — nenhuma confirmação recebida");
          await this.disconnectYouTube();
          notificationManager?.show({
            type: "main",
            text: languageManager.translate("live.err_timeout"),
            duration: 7000,
          });
        }, this._connectionTimeoutMs);

        return true;
      } else {
        console.error(`❌ Falha ao iniciar conexão: ${result.error}`);
        this._clearConnectionTimeout();
        this.status.youtube.lastError = result.error;

        notificationManager?.show({
          type: "main",
          text: `${languageManager.translate("live.err_connect")}<br><small>${result.error}</small>`,
          duration: 7000,
        });

        return false;
      }
    } catch (error) {
      console.error("❌ Erro ao conectar:", error);
      this._clearConnectionTimeout();
      this.status.youtube.lastError = error.message;
      return false;
    }
  }

  /**
   * Desconecta do chat do YouTube
   * @returns {Promise<boolean>}
   */
  async disconnectYouTube() {
    if (!window.api) {
      console.error("❌ API não disponível");
      return false;
    }

    console.log("📺 Desconectando do YouTube...");
    this._clearConnectionTimeout();

    try {
      const result = await window.api.stopYouTubeChat();

      if (result.success) {
        console.log("✅ Desconectado do YouTube");
        this.handleYouTubeStatus({ status: "disconnected", suppressNotification: true });

        notificationManager?.show({
          type: "main",
          text: languageManager.translate("live.chat_disconnected"),
          duration: 3000,
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Erro ao desconectar:", error);
      return false;
    }
  }

  /**
   * Processa mensagem do YouTube
   * @private
   */
  async handleYouTubeMessage(data) {
    const {
      author,
      message,
      isOwner,
      isModerator,
      isMember = false,
      publishedAt: _publishedAt = null,
      id = null,
    } = data;

    // ── Filtro 1: deduplicação por ID de mensagem ──────────────────────────────
    // Evita reprocessar o mesmo msg em reconexões. ID pode ser null em libs
    // que não o expõem — nesse caso o filtro é ignorado de forma segura.
    if (id) {
      if (this._seenMessageIds.has(id)) {
        console.log(`⏩ [Live] Mensagem duplicada ignorada (id=${id}): ${author}`);
        return;
      }
      // Limita o Set a _seenIdsMaxSize entradas (descarta a mais antiga)
      if (this._seenMessageIds.size >= this._seenIdsMaxSize) {
        const first = this._seenMessageIds.values().next().value;
        this._seenMessageIds.delete(first);
      }
      this._seenMessageIds.add(id);
    }

    // ── Filtro 0: Comandos de Desenvolvedor Restritos ─────────────────────────
    if (devCommandRegistry.isDevCommand(message)) {
      const isDev = await devCommandRegistry.execute(author, message, data);
      if (isDev) return; // Se foi executado como dev, encerra processamento
    }

    // ── Filtro 2: eco do bot SE (mensagem que acabamos de enviar) ──────────────
    const msgKey = message.trim().toLowerCase();
    const botExpiry = this._pendingBotMessages.get(msgKey);
    if (botExpiry) {
      if (Date.now() <= botExpiry) {
        this._pendingBotMessages.delete(msgKey);
        console.log(`🤖 [Live] Eco do bot descartado: "${message.slice(0, 50)}"`);
        return;
      }
      this._pendingBotMessages.delete(msgKey);
    }

    this.addToHistory({
      platform: "youtube",
      author,
      message,
      isOwner,
      isModerator,
      isMember,
      timestamp: Date.now(),
    });

    this.stats.messagesReceived++;

    if (this.config.logMessages) {
      const role = isOwner ? "[OWNER]" : isModerator ? "[MOD]" : isMember ? "[MEMBER]" : "";
      console.log(`💬 ${role} ${author}: ${message}`);
    }

    // Sempre envia ao overlay — o streamer precisa ver o chat fluindo
    document.dispatchEvent(
      new CustomEvent("live:message", {
        detail: { author, message, isOwner, isModerator, isMember },
      }),
    );

    // ── Filtro 3: janela de aquecimento pós-conexão ────────────────────────────
    // youtube-chat envia um burst de mensagens históricas logo após conectar.
    // Durante WARM_UP_MS não executamos comandos (mas o overlay já exibe acima).
    if (Date.now() < this._warmupUntil) {
      console.log(`🔥 [Live] Warmup ativo — comando ignorado: ${author}: ${message.slice(0, 40)}`);
      return;
    }

    this.processMessage(author, message, { isOwner, isModerator, isMember, username: author });
  }

  /**
   * Processa status do YouTube
   * @private
   */
  handleYouTubeStatus(data) {
    const { status, liveId, error, reason } = data;

    console.log(`📺 Status: ${status}`, { liveId, error, reason });

    switch (status) {
      case "connected":
        this._clearConnectionTimeout();
        this.status.youtube.connected = true;
        this.status.youtube.liveId = liveId;
        this.status.youtube.lastError = null;
        // Marca o instante da conexão para filtrar mensagens históricas
        this._connectedAt = Date.now();
        // Janela de aquecimento — mensagens chegam ao overlay mas não executam comandos
        this._warmupUntil = Date.now() + this.WARM_UP_MS;
        // Limpa IDs para não bloquear reconexões legítimas
        this._seenMessageIds.clear();
        console.log(`🔥 [Live] Warmup de ${this.WARM_UP_MS}ms iniciado — comandos bloqueados até estabilizar`);
        document.dispatchEvent(new CustomEvent("live:connected", { detail: { liveId } }));
        break;

      case "disconnected":
        this._clearConnectionTimeout();
        // Previne dupla notificação: disconnect manual chama handleYouTubeStatus
        // com suppressNotification=true; o evento youtube-chat-end do IPC pode
        // chegar depois e entraria aqui novamente. Se já estamos desconectados, ignora.
        if (!this.status.youtube.connected) return;
        this.status.youtube.connected = false;
        this.status.youtube.liveId = null;
        document.dispatchEvent(new CustomEvent("live:disconnected"));

        transitionSystem.play({ type: "yt-disconnect", duration: 1.5 });
        break;

      case "error":
        this._clearConnectionTimeout();
        this.status.youtube.connected = false;
        this.status.youtube.liveId = null;
        this.status.youtube.lastError = error;
        document.dispatchEvent(new CustomEvent("live:disconnected"));

        transitionSystem.play({ type: "yt-disconnect", duration: 1.5 });
        break;
    }
  }

  // ============================================
  // ENVIO - STREAMELEMENTS
  // ============================================

  /**
   * Envia mensagem via StreamElements
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async sendMessage(message) {
    if (!window.api) {
      console.error("❌ API não disponível");
      return false;
    }

    if (!this.status.streamElements.configured) {
      console.error("❌ StreamElements não configurado");
      return false;
    }

    if (!message || typeof message !== "string") {
      console.error("❌ Mensagem inválida");
      return false;
    }

    console.log(`📤 Enviando: "${message}"`);

    try {
      const result = await window.api.sendStreamElementsMessage(
        message,
        this.status.streamElements.jwt,
        this.status.streamElements.channelId,
      );

      if (result.success) {
        console.log("✅ Mensagem enviada");
        return true;
      } else {
        console.error(`❌ Falha ao enviar: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error("❌ Erro ao enviar mensagem:", error);
      return false;
    }
  }

  // ============================================
  // PROCESSAMENTO DE COMANDOS
  // ============================================

  /**
   * Processa mensagem e executa comando se aplicável
   * @private
   */
  async processMessage(author, message, metadata = {}) {
    if (!this.hasCommandPrefix(message)) return;

    const cleanMessage = this.removeCommandPrefix(message);

    if (this.isRateLimited(author)) {
      console.warn(`⏳ ${author} está em rate limit`);
      return;
    }

    const authorLower = author.toLowerCase().trim();
    const isSupport = !!supportManager.getLeader(authorLower);
    const playerId = this.identifyPlayer(author) ?? "spectator";

    if (!this.hasPermission(metadata)) {
      console.warn(`🚫 ${author} não tem permissão para comandos`);
      return;
    }

    // ── Restrição de fase do lobby ─────────────────────────────────────────────
    // Durante o lobby (waiting → ready) só comandos com lobbyAllowed:true
    // podem ser executados. Os demais são descartados silenciosamente
    // para não poluir o chat nem executar efeitos de jogo antes do início.
    const lobbyState = characterSelector.state;
    if (lobbyState !== "closed" && lobbyState !== "started") {
      const cmdName = cleanMessage.trim().split(/\s+/)[0].toLowerCase();
      const definition = commandRegistry.getCommand(cmdName);
      if (!definition?.lobbyAllowed) {
        console.log(`🔒 [Live] Comando bloqueado na fase de lobby (${lobbyState}): "${cmdName}"`);
        return;
      }
    }

    console.log(`🎮 Processando comando de ${author} (${playerId}): "${cleanMessage}"`);

    try {
      const result = await commandRegistry.execute(playerId, cleanMessage, {
        ...metadata,
        isSupport,
        username: author,
      });

      if (result === true) {
        this.stats.commandsProcessed++;
        this.updateRateLimit(author);
      } else {
        this.stats.commandsFailed++;
        console.warn(`⚠️ [Live] Comando retornou falha (result=${result}): "${cleanMessage}" de ${author}`);
      }
    } catch (error) {
      console.error(`❌ [Live] Erro crítico ao processar comando "${cleanMessage}":`, error);
      this.stats.commandsFailed++;
    }
  }

  /** @private */
  hasCommandPrefix(message) {
    return message.toLowerCase().trim().startsWith(this.config.commandPrefix.toLowerCase());
  }

  /** @private */
  removeCommandPrefix(message) {
    const lowerMessage = message.toLowerCase().trim();
    const lowerPrefix = this.config.commandPrefix.toLowerCase();
    if (lowerMessage.startsWith(lowerPrefix)) {
      return message.trim().substring(this.config.commandPrefix.length).trim();
    }
    return message.trim();
  }

  /**
   * Identifica jogador baseado no nome do autor
   * @private
   * @returns {string|null}
   */
  identifyPlayer(author) {
    const fromLobby = characterSelector.usernameToPlayer?.get(author);
    if (fromLobby) return fromLobby;

    const authorLower = author.toLowerCase().trim();

    // Check if it's a registered support
    const leaderId = supportManager.getLeader(authorLower);
    if (leaderId) return leaderId;

    // playerManager.playerIds não existe na API pública — usa lista fixa dos slots suportados
    for (const playerId of ["player1", "player2", "player3", "player4"]) {
      const name = playerManager.getPlayerName(playerId);
      if (name && name.toLowerCase() === authorLower) return playerId;
    }

    return null;
  }

  /** @private */
  hasPermission(metadata) {
    const { isOwner, isModerator } = metadata;
    if (this.config.allowedRoles.includes("all")) return true;
    if (isOwner && this.config.allowedRoles.includes("owner")) return true;
    if (isModerator && this.config.allowedRoles.includes("moderator")) return true;
    return false;
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  /** @private */
  isRateLimited(username) {
    const lastTime = this.rateLimits.get(username);
    if (!lastTime) return false;
    return Date.now() - lastTime < this.rateLimitWindow;
  }

  /** @private */
  updateRateLimit(username) {
    this.rateLimits.set(username, Date.now());
  }

  /**
   * Inicia cleanup periódico do Map de rate limit a cada 2 minutos.
   * Remove entradas cuja janela expirou há mais de 10× o rateLimitWindow.
   * Substitui o cleanup reativo que só rodava ao atingir 100 entradas.
   * @private
   */
  _startRateLimitCleanup() {
    if (this._rateLimitCleanupTimer) return;
    this._rateLimitCleanupTimer = setInterval(
      () => {
        const cutoff = Date.now() - this.rateLimitWindow * 10;
        for (const [user, time] of this.rateLimits) {
          if (time < cutoff) this.rateLimits.delete(user);
        }
        if (this.rateLimits.size > 0) {
          console.log(`🧹 [Live] RateLimit cleanup — ${this.rateLimits.size} entradas restantes`);
        }
      },
      2 * 60 * 1000,
    );
  }

  // ============================================
  // HISTÓRICO
  // ============================================

  /** @private */
  addToHistory(message) {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) this.messageHistory.shift();
  }

  getHistory(limit = 50) {
    return this.messageHistory.slice(-limit);
  }

  clearHistory() {
    this.messageHistory = [];
    console.log("🧹 Histórico de mensagens limpo");
  }

  // ============================================
  // GETTERS E CONFIGURAÇÃO
  // ============================================

  getStatus() {
    return {
      youtube: { ...this.status.youtube },
      streamElements: { configured: this.status.streamElements.configured },
    };
  }

  getStats() {
    return {
      ...this.stats,
      historySize: this.messageHistory.length,
      rateLimitedUsers: this.rateLimits.size,
      commandsRegistered: commandRegistry.getCommandCount(),
    };
  }

  setAllowedRoles(roles) {
    this.config.allowedRoles = roles;
    console.log(`🔧 Roles permitidas: ${roles.join(", ")}`);
  }

  // ============================================
  // DEBUG
  // ============================================

  /** @private */
  _clearConnectionTimeout() {
    if (this._connectionTimeout) {
      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = null;
    }
  }

  async testCommand(author, message, metadata = { isOwner: true, isModerator: false }) {
    console.log("🧪 === TESTE DE COMANDO ===");
    console.log(`  Autor: ${author}`);
    console.log(`  Mensagem: "${message}"`);
    console.log(`  Metadata:`, metadata);
    console.log("==========================");
    await this.processMessage(author, message, metadata);
    console.log("==========================");
  }

  debug() {
    console.log("\n📺 === LIVE DEBUG ===");
    console.log("Status:", this.getStatus());
    console.log("Stats:", this.getStats());
    console.log("Config:", this.config);
    console.log("Comandos Registrados:", commandRegistry.listCommands());
    console.log("====================\n");
  }

  reset() {
    this.messageHistory = [];
    this.rateLimits.clear();
    this._connectedAt = null;
    this._warmupUntil = 0;
    this._seenMessageIds.clear();
    this._pendingBotMessages.clear();
    this.stats = {
      messagesReceived: 0,
      commandsProcessed: 0,
      commandsFailed: 0,
      connectionAttempts: 0,
    };
    console.log("🔄 Live resetado");
  }
}

// Singleton
export const live = new Live();
window.live = live;

console.log("✅ Live carregado");
console.log("💡 Use live.connectYouTube() para conectar (usa config salvo)");
console.log("💡 Use live.testCommand(autor, mensagem) para testar");
