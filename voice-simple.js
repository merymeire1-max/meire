/**
 * voice-simple.js
 * Sistema simples de reconhecimento de voz
 * Atalho: Tecla M
 */

class SimpleVoiceSystem {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.init();
    this.createUI();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('⚠️ Seu navegador não suporta reconhecimento de voz');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pt-BR';
    this.recognition.continuous = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI('listening');
      console.log('🎤 Escutando...');
    };

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      this.processCommand(transcript.toLowerCase());
    };

    this.recognition.onerror = (event) => {
      console.error('❌ Erro:', event.error);
      this.updateUI('error', event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateUI('ready');
    };
  }

  createUI() {
    const container = document.createElement('div');
    container.id = 'voice-ui';
    container.innerHTML = `
      <div class="voice-box">
        <button id="voice-btn" class="voice-btn" title="Pressione M ou clique para ativar voz">
          🎤 VOZ (M)
        </button>
        <div id="voice-display" class="voice-display"></div>
      </div>
    `;
    document.body.appendChild(container);

    const styles = document.createElement('style');
    styles.textContent = `
      #voice-ui {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
      }

      .voice-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .voice-btn {
        padding: 12px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 25px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.3s;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }

      .voice-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
      }

      .voice-btn.listening {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(245, 87, 108, 0.7); }
        50% { box-shadow: 0 0 0 12px rgba(245, 87, 108, 0); }
      }

      .voice-display {
        width: 200px;
        padding: 10px;
        background: #1a1a1a;
        color: #00FF41;
        border: 2px solid #00FF41;
        border-radius: 8px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        text-align: center;
        min-height: 25px;
        display: none;
      }

      .voice-display.show {
        display: block;
      }

      .voice-display.error {
        color: #FF6B6B;
        border-color: #FF6B6B;
      }
    `;
    document.head.appendChild(styles);

    // Click listener
    document.getElementById('voice-btn').addEventListener('click', () => {
      this.toggle();
    });

    // Tecla M
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.toggle();
        }
      }
    });
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (this.recognition && !this.isListening) {
      this.recognition.start();
    }
  }

  stop() {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  processCommand(transcript) {
    console.log(`📢 Ouvido: "${transcript}"`);
    this.showDisplay(`"${transcript}"`);

    const commands = {
      'usar slot um': 'usar slot 1',
      'usar slot 1': 'usar slot 1',
      'usar slot dois': 'usar slot 2',
      'usar slot 2': 'usar slot 2',
      'usar slot três': 'usar slot 3',
      'usar slot 3': 'usar slot 3',
      'guardar': 'guardar',
      'descartar': 'descartar',
      'passar': 'passar',
      'passar turno': 'passar',
    };

    let found = null;
    for (const [voice, cmd] of Object.entries(commands)) {
      if (transcript.includes(voice)) {
        found = cmd;
        break;
      }
    }

    if (found) {
      console.log(`🎮 Executando: ${found}`);
      this.executeCommand(found);
      this.showDisplay(`✅ ${found}`, 'success');
    } else {
      console.warn(`⚠️ Não reconhecido: "${transcript}"`);
      this.showDisplay(`❌ Não reconhecido`, 'error');
    }
  }

  executeCommand(command) {
    if (window.commandRegistry) {
      window.commandRegistry.execute('player1', command);
    } else {
      document.dispatchEvent(new CustomEvent('voiceCommand', {
        detail: { command: command }
      }));
    }
  }

  updateUI(state, error = null) {
    const btn = document.getElementById('voice-btn');
    
    if (state === 'listening') {
      btn.classList.add('listening');
      btn.textContent = '⏹️ PARAR';
      this.showDisplay('Escutando...');
    } else if (state === 'ready') {
      btn.classList.remove('listening');
      btn.textContent = '🎤 VOZ (M)';
    } else if (state === 'error') {
      btn.classList.remove('listening');
      btn.textContent = '🎤 VOZ (M)';
      this.showDisplay(`❌ Erro: ${error}`, 'error');
    }
  }

  showDisplay(text, type = 'info') {
    const display = document.getElementById('voice-display');
    display.classList.add('show');
    display.textContent = text;
    
    if (type === 'error') {
      display.classList.add('error');
    } else {
      display.classList.remove('error');
    }

    setTimeout(() => {
      display.classList.remove('show');
    }, 3000);
  }
}

// Inicializa quando a página carrega
window.addEventListener('DOMContentLoaded', () => {
  window.voiceSystem = new SimpleVoiceSystem();
  console.log('✅ Sistema de Voz pronto - Pressione M ou clique no botão 🎤');
});

export default SimpleVoiceSystem;
