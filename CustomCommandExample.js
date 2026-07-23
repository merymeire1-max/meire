import { assetResolver } from "@core/asset-resolver.js";
/*
 * .js - Template de Comando Customizado
 *
 * Este arquivo serve como exemplo de como criar novos comandos.
 *
 * COMO USAR:
 * 1. Copie este arquivo e renomeie (ex: my-command.js)
 * 2. Modifique a definição do comando abaixo
 * 3. Implemente a lógica no método execute()
 * 4. Importe e registre em command-registry.js
 *
 * @module CustomCommandExample
 */

// Importe apenas o que você precisar
import { playerManager } from "@systems/player/player-manager.js";
import { sessionState } from "@core/session-state.js";
import { cardManager } from "@systems/cards/card-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { animationSystem } from "@interface/enhanced-animations.js";
import { audioManager } from "@systems/audio/audio-manager.js";
import { configManager } from "@core/config-manager.js";

// ============================================
// FUNÇÕES AUXILIARES (OPCIONAL)
// ============================================

/**
 * Exemplo de função auxiliar
 * @private
 * @param {string} playerId
 * @returns {boolean}
 */
function myHelperFunction(playerId) {
  // Sua lógica aqui
  const player = sessionState.getPlayer(playerId);

  if (!player) {
    return false;
  }

  // ...

  return true;
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

/**
 * Comando: [SEU COMANDO]
 *
 * DOCUMENTAÇÃO:
 * - name: Nome principal do comando (obrigatório)
 * - aliases: Nomes alternativos (opcional)
 * - description: Descrição curta (obrigatório)
 * - usage: Exemplo de uso (recomendado)
 * - minArgs: Mínimo de argumentos (opcional, padrão: 0)
 * - maxArgs: Máximo de argumentos (opcional, padrão: Infinity)
 * - cooldown: Cooldown em ms (opcional)
 * - execute: Função que executa o comando (obrigatório)
 */
export const myCustomCommand = {
  // Nome principal (será /game meucomando)
  name: "meucomando",

  // Aliases opcionais
  aliases: ["mc", "comando"],

  // Descrição (aparece no help)
  description: "Descrição do que o comando faz",

  // Exemplo de uso (aparece no help detalhado)
  usage: "/game meucomando [arg1] [arg2]",

  // Validação de argumentos
  minArgs: 0, // Mínimo de argumentos necessários
  maxArgs: 3, // Máximo de argumentos aceitos

  // Cooldown entre usos (em milissegundos)
  cooldown: 5000, // 5 segundos

  /**
   * Função que executa o comando
   *
   * @param {string} playerId - ID do jogador que executou ('player1' ou 'player2')
   * @param {Array<string>} args - Argumentos separados por espaço
   * @param {Object} metadata - Metadados adicionais
   * @param {string} metadata.rawArgs - String bruta dos argumentos
   * @param {string} metadata.commandName - Nome do comando usado
   * @param {boolean} [metadata.isOwner] - É dono do canal? (live)
   * @param {boolean} [metadata.isModerator] - É moderador? (live)
   * @returns {Promise<boolean>} true se executou com sucesso, false caso contrário
   */
  async execute(playerId, args, metadata) {
    console.log(`🎮 Executando meucomando: ${playerId}`, { args, metadata });

    // ============================================
    // VALIDAÇÃO CUSTOMIZADA
    // ============================================

    // Exemplo: Verifica se jogador tem HP suficiente
    const player = sessionState.getPlayer(playerId);

    if (!player) {
      console.error("❌ Jogador não encontrado");
      return false;
    }

    if (player.hp < 100) {
      // Feedback de erro
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ HP insuficiente (mínimo: 100)`,
          duration: 3000,
        });
      }

      return false;
    }

    // ============================================
    // LÓGICA DO COMANDO
    // ============================================

    try {
      // Exemplo 1: Modificar HP
      sessionState.damage(playerId, 50);

      // Exemplo 2: Tocar som
      if (audioManager) {
        audioManager.playSFX(assetResolver.appAsset("ui/", "notification_success.mp3"), false);
      }

      // Exemplo 3: Animação
      if (animationSystem && animationSystem.showEnhancedBuff) {
        animationSystem.showEnhancedBuff(playerId, "COMANDO ATIVADO", "special");
      }

      // Exemplo 4: Notificação de sucesso
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `✅ Comando executado!<br><small>Você perdeu 50 HP</small>`,
          duration: 4000,
        });
      }

      console.log(`✅ Comando meucomando executado com sucesso`);

      // Retorna true = sucesso
      return true;
    } catch (error) {
      console.error("❌ Erro ao executar meucomando:", error);

      // Feedback de erro
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Erro ao executar comando`,
          duration: 3000,
        });
      }

      // Retorna false = falha
      return false;
    }
  },
};

// ============================================
// EXEMPLOS DE COMANDOS COMUNS
// ============================================

/**
 * EXEMPLO 1: Comando simples sem argumentos
 */
export const simpleCommand = {
  name: "ping",
  description: "Responde com pong",
  usage: "/game ping",

  async execute(playerId) {
    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: "🏓 Pong!",
        duration: 2000,
      });
    }

    return true;
  },
};

/**
 * EXEMPLO 2: Comando com argumentos numéricos
 */
export const damageCommand = {
  name: "dano",
  description: "Causa dano customizado",
  usage: "/game dano [valor]",
  minArgs: 1,
  maxArgs: 1,

  async execute(playerId, args) {
    const valor = parseInt(args[0], 10);

    if (isNaN(valor) || valor <= 0) {
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ Valor inválido`,
          duration: 3000,
        });
      }

      return false;
    }

    // Aplica dano ao rival
    const rivalId = playerId === "player1" ? "player2" : "player1";
    sessionState.damage(rivalId, valor);

    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: `💥 ${valor} de dano causado!`,
        duration: 3000,
      });
    }

    return true;
  },
};

/**
 * EXEMPLO 3: Comando com múltiplos argumentos
 */
export const multiArgCommand = {
  name: "config",
  description: "Altera configuração",
  usage: "/game config [chave] [valor]",
  minArgs: 2,
  maxArgs: 2,

  async execute(playerId, args) {
    const [key, value] = args;

    console.log(`⚙️ Configurando: ${key} = ${value}`);

    // Sua lógica aqui...

    if (notificationManager) {
      notificationManager.show({
        type: playerId,
        text: `⚙️ ${key} definido como ${value}`,
        duration: 3000,
      });
    }

    return true;
  },
};

// ============================================
// COMO REGISTRAR SEUS COMANDOS
// ============================================

/*
  Para usar seus comandos customizados:

  1. Salve este arquivo como 'my-commands.js' em integrations/commands/

  2. Em command-registry.js, adicione no método registerDefaultCommands():

     const { myCustomCommand, simpleCommand } = await import("./commands/my-commands.js");
     this.register(myCustomCommand);
     this.register(simpleCommand);

  3. Reinicie o jogo para carregar os novos comandos

  4. Teste no debug console:
     live.testCommand("Jogador 1", "/game meucomando arg1 arg2")

  5. Use no chat:
     /game meucomando arg1 arg2
*/

console.log("✅ Template de comando carregado");
