/**
 * voice-command-manager.js
 * Gerencia o reconhecimento de voz do navegador
 */

class VoiceCommandManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn("⚠️ Navegador não suporta reconhecimento de voz");
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pt-BR';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('🎤 Escutando...');
      document.dispatchEvent(new CustomEvent('voiceStarted'));
    };

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      this.processCommand(transcript.toLowerCase());
    };

    this.recognition.onerror = (event) => {
      console.error('❌ Erro de voz:', event.error);
      document.dispatchEvent(new CustomEvent('voiceError', { detail: { error: event.error } }));
    };

    this.recognition.onend = () => {
      this.isListening = false;
      console.log('🎤 Parou de escutar');
      document.dispatchEvent(new CustomEvent('voiceEnded'));
    };
  }

  processCommand(transcript) {
    console.log(`📢 Ouvido: "${transcript}"`);

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

    const found = Object.entries(commands).find(([voice, _]) => 
      transcript.includes(voice)
    );

    if (found) {
      const cmd = found[1];
      console.log(`🎮 Executando: ${cmd}`);
      document.dispatchEvent(new CustomEvent('voiceCommand', { 
        detail: { command: cmd } 
      }));
    } else {
      console.warn(`⚠️ Comando não reconhecido: "${transcript}"`);
    }
  }

  start() {
    if (this.isSupported && !this.isListening && this.recognition) {
      this.recognition.start();
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  toggle() {
    this.isListening ? this.stop() : this.start();
  }
}

export default VoiceCommandManager;
