// Handler geral de comandos (ex.: chat input)
async function handleSlashCommand(text) {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== '/game') return false;

  const cmd = parts[1];
  if (cmd === 'atacar') {
    // permitir: /game atacar <pendingActionId> <targetPlayerId>
    const pendingId = parts[2];
    const targetId = parts[3];
    if (!pendingId || !targetId) {
      showToast('Uso: /game atacar <pendingActionId> <targetPlayerId>');
      return true;
    }

    const res = await fetch(`/api/pending-actions/${pendingId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executorId: currentPlayerId, targetId })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`Erro: ${data.message || 'não foi possível executar a ação'}`);
    } else {
      showToast('Ataque realizado.');
    }
    return true;
  }

  return false;
}