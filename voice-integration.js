/**
 * voice-integration.js
 * Integra o reconhecimento de voz com o sistema de comandos do jogo
 */

import VoiceCommandManager from "@managers/voice-command-manager.js";

class VoiceIntegration {
  constructor() {
    this.voiceManager = new VoiceCommandManager();
    this.setupUI();
    this.setupListeners();
  }

  setupUI() {
    // Cria o botão de voz
    const container = document.createElement('div');
    container.id = 'voice-container';
    container.innerHTML = `
      <div class="voice-widget">
        <button id="voice-toggle-btn" class="voice-btn" title="Clique ou pressione V para ativar voz">
          🎤 Voz
        </button>
        <div id="voice-status" class="voice-status">Desativado</div>
        <div id="voice-text" class="voice-text"></div>
      </div>
    `;
    document.body.appendChild(container);

    // Estilos CSS
    const style = document.createElement('style');
    style.textContent = `
      #voice-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: Arial, sans-serif;
      }

      .voice-widget {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .voice-btn {
        padding: 12px 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }

      .voice-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
      }

      .voice-btn.active {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        animation: pulse 1s infinite;
        box-shadow: 0 0 20px rgba(245, 87, 108, 0.6);
      }

      @keyframes pulse {
        0%, 100% { 
          box-shadow: 0 0 0 0 rgba(245, 87, 108, 0.7);
        }
        50% { 
          box-shadow: 0 0 0 15px rgba(245, 87, 108, 0);
        }
      }

      .voice-status {
        color: #333;
        font-weight: bold;
        font-size: 12px;
        padding: 5px 10px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 20px;
        min-width: 100px;
        text-align: center;
      }

      .voice-status.listening {
        color: #f5576c;
        background: rgba(245, 87, 108, 0.1);
        animation: blink 1s infinite;
      }

      @keyframes blink {
        0%, 50%, 100% { opacity: 1; }
        25%, 75% { opacity: 0.6; }
      }

      .voice-text {
        max-width: 200px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.8);
        color: #4CAF50;
        border-radius: 5px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        min-height: 20px;
        max-height: 60px;
        overflow-y: auto;
        display: none;
        text-align: center;
        border: 1px solid #4CAF50;
      }

      .voice-text.active {
        display: block;
      }
    `;
    document.head.appendChild(style);

    // Event listeners do botão
    const btn = document.getElementById('voice-toggle-btn');
    btn.addEventListener('click', () => this.voiceManager.toggle());

    // Atalho de teclado: V
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
          this.voiceManager.toggle();
        }
      }
    });
  }

  setupListeners() {
    // Quando começa a escutar
    document.addEventListener('voiceStarted', () => {
      const btn = document.getElementById('voice-toggle-btn');
      const status = document.getElementById('voice-status');
      const text = document.getElementById('voice-text');
      
      btn.classList.add('active');
      status.classList.add('listening');
      status.textContent = '🎤 Escutando...';
      text.classList.add('active');
      text.textContent = 'Fale um comando...';
    });

    // Quando termina de escutar
    document.addEventListener('voiceEnded', () => {
      const btn = document.getElementById('voice-toggle-btn');
      const status = document.getElementById('voice-status');
      
      btn.classList.remove('active');
      status.classList.remove('listening');
      status.textContent = '✅ Pronto';
    });

    // Quando há erro
    document.addEventListener('voiceError', (e) => {
      const status = document.getElementById('voice-status');
      const text = document.getElementById('voice-text');
      
      status.textContent = `❌ Erro`;
      text.textContent = `Erro: ${e.detail.error}`;
    });

    // Quando recebe um comando de voz
    document.addEventListener('voiceCommand', (e) => {
      const cmd = e.detail.command;
      const text = document.getElementById('voice-text');
      
      text.textContent = `Executando: ${cmd}`;
      
      // Aqui é onde o comando é processado
      this.executeCommand(cmd);
    });
  }

  executeCommand(command) {
    console.log(`🎮 Processando comando: "${command}"`);

    // Se o commandRegistry existir, usa ele
    if (window.commandRegistry) {
      window.commandRegistry.execute('player1', command);
    } else {
      // Senão, dispara um evento customizado
      document.dispatchEvent(new CustomEvent('gameCommand', {
        detail: { command: command }
      }));
    }
  }

  start() {
    this.voiceManager.start();
  }

  stop() {
    this.voiceManager.stop();
  }

  toggle() {
    this.voiceManager.toggle();
  }
}

// Inicializa automaticamente quando carrega
window.addEventListener('load', () => {
  if (!window.voiceIntegration) {
    window.voiceIntegration = new VoiceIntegration();
    console.log('✅ Sistema de voz inicializado');
  }
});

export default VoiceIntegration;
