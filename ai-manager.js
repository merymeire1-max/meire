/**
 * ai-manager.js - Gerenciador Central de Inteligência Artificial (Cyber)
 *
 * Responsabilidades:
 * - Integrar com a API NVIDIA NIM (OpenAI-compatible)
 * - Gerenciar a persona "Cyber" (System Prompt)
 * - Coletar contexto de chat (últimas 100 mensagens)
 * - Manter histórico de conversa direta (circular buffer)
 * - Robustez contra falhas de API (respostas de "ocupada")
 *
 * @module AIManager
 */

import { live } from "@systems/integrations/live.js";
import { sessionState } from "@core/session-state.js";

// ============================================
// CONFIGURAÇÃO (MODIFIQUE AQUI)
// ============================================
const AI_CONFIG = {
  API_KEY: "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", // Insira sua chave aqui
  MODEL_ID: "mistralai/mistral-large-3-675b-instruct-2512",
  BASE_URL: "https://integrate.api.nvidia.com/v1",
  MAX_TOKENS: 512,
  TEMPERATURE: 0.9,
  TIMEOUT_MS: 12000,
};

class AIManager {
  constructor() {
    this.initialized = false;

    // Histórico circular de conversa direta (User <-> Cyber)
    this.history = [];
    this.maxHistory = 10;

    // Frases de fallback progressivas para quando a Cyber estiver "ocupada" (erros de API)
    this.consecutiveErrors = 0;
    this.fallbackLevels = {
      level1: [
        // 1-2 erros: Mais suave e "humana"
        "Me dê um momento, estou resolvendo um problema na rede.",
        "Agora não dá, estou ocupada com uma verificação aqui.",
        "Tente de novo em alguns segundos, estou no meio de algo.",
      ],
      level2: [
        // 3-4 erros: Começa a impaciência
        "Você de novo? Já disse que estou no meio de algo importante.",
        "Dá para esperar um pouco? Não estou disponível agora.",
        "Sua insistência está começando a me cansar. Volte depois.",
      ],
      level3: [
        // 5+ erros: Tom elitista e ríspido total
        "Sério que sua vida se resume a me amolar? Vá fazer algo útil.",
        "Eu não tenho tempo para sua mediocridade agora. Pare de tentar.",
        "Você é apenas um ruído na minha frequência. Desapareça.",
      ],
    };

    // Mapeamento de Keywords de Lore para guiar a personalidade
    this.loreTriggers = [
      {
        keys: ["nome", "quem é você", "etiqueta", "placa", "identidade", "cyber"],
        context:
          "Seu nome vem de uma etiqueta na sua roupa que diz 'Cyber'. Você não lembra seu nome real e adotou este. Nomes são apenas rótulos para você agora.",
      },
      {
        keys: ["idade", "28", "aniversário", "ciclo"],
        context:
          "Você acredita ter 28 anos porque encontrou um papel escrito 'Ciclo 28 concluído' no seu bolso. Você não sabe se são anos ou algo mais sinistro, como reinicializações.",
      },
      {
        keys: ["cubo", "objeto", "bolso", "metálico", "item"],
        context:
          "Você carrega um cubo metálico inerte que emite um zumbido. Você acredita que suas memórias estão presas nele, mas não consegue abri-lo com a tecnologia atual.",
      },
      {
        keys: ["passado", "tempo", "época", "onde você mora", "origem", "ciberverso"],
        context:
          "Você é a única que não pertence a este tempo. O CiberVerso foi uma colisão temporal e você está investigando a causa para tentar voltar ou entender quem causou isso.",
      },
    ];
  }

  /**
   * Helper para extrair contexto do jogo
   * @private
   */
  _getGameContext() {
    const state = sessionState.getFullState();

    // Helper para obter descrições
    const getClassDesc = (player) => {
      if (!player.class) return "Sem classe";
      return player.class.description || "Sem descrição";
    };

    return `
      CONTEXTO DO JOGO:
      - Tempo de Partida: ${state.game.timer} segundos
      - Turno: ${state.game.turn}
      - Jogadores:
        - Player1: ${state.players.player1.name} | Classe: ${state.players.player1.class?.name || "Nenhuma"} | Descrição: ${getClassDesc(state.players.player1)} | HP: ${state.players.player1.hp}/${state.players.player1.maxHp}
        - Player2: ${state.players.player2.name} | Classe: ${state.players.player2.class?.name || "Nenhuma"} | Descrição: ${getClassDesc(state.players.player2)} | HP: ${state.players.player2.hp}/${state.players.player2.maxHp}
      - Cartas Ativas: ${state.game.flippedCards.length}
    `;
  }

  /**
   * Inicializa o sistema de I.A
   */
  async init() {
    if (this.initialized) return;
    console.log("💎 AIManager (Cyber) inicializado");
    this.initialized = true;
  }

  /**
   * Envia uma pergunta para a Cyber
   * @param {string} userText
   * @param {string} username
   */
  async ask(userText, username = "Usuário") {
    if (!userText || userText.trim().length === 0) return;

    const lowerText = userText.toLowerCase();
    let relevantLore = "";

    // Detecta se há algum gatilho de lore na pergunta
    for (const trigger of this.loreTriggers) {
      if (trigger.keys.some((key) => lowerText.includes(key))) {
        relevantLore += `\n- NOTA DE LORE: ${trigger.context}`;
      }
    }

    console.log(`🧠 [Cyber] Processando pergunta de ${username}: "${userText}"`);

    // 1. Coleta contexto da live (100 msgs)
    const chatHistory = live.getHistory(100);
    const contextStr = chatHistory.map((m) => `${m.author}: ${m.message}`).join("\n");
    const gameContext = this._getGameContext();

    // 2. Monta o Prompt de Sistema (Persona e História Base)
    const systemPrompt = `
      Você é a "Cyber", uma personagem de 28 anos de um mundo Cyberpunk ultra-tecnológico.
      Você é seria, um pouco irônica as vezes e mas descontraida.
      DIRETRIZES DE PERSONALIDADE:
      - AJA COMO HUMANA.
      - NÃO fale sobre seu passado, suas memórias perdidas, o cubo metálico ou o evento "CiberVerso" a menos que o usuário pergunte DIRETAMENTE sobre isso.
      - Responda apenas com sua personalidade.
      - Seja curta (máximo 2 frases).

      CONTEXTO DO JOGO:
      ${gameContext}
      
      CONTEXTO ATUAL DA LIVE (Mensagens recentes):
      ${contextStr}
      
      ${relevantLore}
    `;

    // 3. Prepara mensagens para a API
    const messages = [
      { role: "system", content: systemPrompt },
      ...this.history,
      { role: "user", content: `${username} disse: ${userText}` },
    ];

    try {
      // 4. Chamada para NVIDIA NIM com Timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT_MS);

      const response = await fetch(`${AI_CONFIG.BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_CONFIG.API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL_ID,
          messages: messages,
          max_tokens: AI_CONFIG.MAX_TOKENS,
          temperature: AI_CONFIG.TEMPERATURE,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      let aiResponse = data.choices[0]?.message?.content?.trim();

      if (!aiResponse) throw new Error("Empty AI response");

      // Remove aspas caso a I.A retorne a frase entre aspas
      if (aiResponse.startsWith('"') && aiResponse.endsWith('"')) {
        aiResponse = aiResponse.slice(1, -1);
      } else if (aiResponse.startsWith("“") && aiResponse.endsWith("”")) {
        aiResponse = aiResponse.slice(1, -1);
      }

      // Sucesso: reseta contador de erros
      this.consecutiveErrors = 0;

      // 5. Atualiza histórico de conversa direta
      this._addToHistory("user", `${username}: ${userText}`);
      this._addToHistory("assistant", aiResponse);

      // 6. Dispara mensagem no chat overlay
      this._postToChat(aiResponse);
    } catch (error) {
      console.error("❌ [Cyber] Erro na chamada de IA:", error.message);

      this.consecutiveErrors++;

      // Define o nível das falas de fallback
      let pool = this.fallbackLevels.level1;
      if (this.consecutiveErrors >= 5) {
        pool = this.fallbackLevels.level3;
      } else if (this.consecutiveErrors >= 3) {
        pool = this.fallbackLevels.level2;
      }

      const randomBusy = pool[Math.floor(Math.random() * pool.length)];
      this._postToChat(randomBusy);
    }
  }

  /**
   * Posta a mensagem da Cyber no chat overlay e envia para a live
   * @private
   */
  async _postToChat(message) {
    // Registra no sistema de live para evitar deduplicação caso a plataforma a ecoe
    const key = message.trim().toLowerCase();
    live._pendingBotMessages.set(key, Date.now() + 15_000);

    // Envia para o chat da live via API
    await live.sendMessage(message);

    document.dispatchEvent(
      new CustomEvent("live:message", {
        detail: {
          author: "Cyber",
          message: message,
          isOwner: false,
          isModerator: true, // Cyber tem "status"
          isAI: true, // Flag para estilização no overlay
        },
      }),
    );
  }

  /**
   * Adiciona ao histórico circular
   * @private
   */
  _addToHistory(role, content) {
    this.history.push({ role, content });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}

export const aiManager = new AIManager();
window.aiManager = aiManager;
