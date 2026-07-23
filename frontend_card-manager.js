// Trecho: intercepta o uso da carta
async function playCard(cardId) {
  const card = await api.getCard(cardId); // função fictícia que pega a carta
  if (card.type === 'damage') {
    // cria pending action no servidor (retorna id)
    const res = await fetch('/api/pending-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'damage',
        cardId,
        playerId: currentPlayerId, // variável do contexto
        payload: { damage: card.damage }
      })
    });
    const pending = await res.json(); // { id: 'uuid', ... }
    openUCM(card, pending.id);
    return;
  }

  // fluxo normal para outras cartas:
  await api.applyCardImmediate(cardId, currentPlayerId);
}