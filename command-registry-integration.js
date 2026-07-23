// Adicione isso ao seu command-registry.js

const CardDamageSystem = require('./card-damage-system');
const cardDamageSystem = new CardDamageSystem();

// Modifique o comando /game usar slot
registerCommand('usar', {
  usage: '/game usar slot <número>',
  description: 'Usa uma carta de um slot. Se for dano, prepara o ataque.',
  handler: async (args, playerId) => {
    if (args[0] !== 'slot' || !args[1]) {
      return { error: 'Uso: /game usar slot <número>' };
    }

    const slot = parseInt(args[1]);
    const cardData = cardManager.getCardInSlot(playerId, slot);

    if (!cardData) {
      return { error: `Nenhuma carta no slot ${slot}` };
    }

    // AQUI: Usa o novo sistema
    const result = await cardDamageSystem.prepareCard(playerId, slot, cardData);
    return result;
  }
});

// Novo comando /game atak
registerCommand('atak', {
  usage: '/game atak <id-alvo>',
  description: 'Aplica o dano da carta preparada ao adversário',
  handler: async (args, playerId) => {
    const targetId = args[0] || 'player2'; // Ajuste conforme sua lógica

    const result = await cardDamageSystem.executeAttack(playerId, targetId);
    return result;
  }
});

// Comando auxiliar /game status-ataque
registerCommand('status-ataque', {
  usage: '/game status-ataque',
  description: 'Mostra o status do ataque preparado',
  handler: async (args, playerId) => {
    return cardDamageSystem.getPreparedAttackStatus(playerId);
  }
});

// Comando auxiliar /game cancelar-ataque
registerCommand('cancelar-ataque', {
  usage: '/game cancelar-ataque',
  description: 'Cancela o ataque preparado',
  handler: async (args, playerId) => {
    return cardDamageSystem.cancelPreparedAttack(playerId);
  }
});