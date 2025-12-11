// Web MIDI Service for Patchwork
// Handles MIDI device discovery and CC transmission

class MidiService {
  constructor() {
    this.midiAccess = null;
    this.selectedOutput = null;
    this.isSupported = !!navigator.requestMIDIAccess;
    this.isInitialized = false;
    this.onDevicesChanged = null;
  }

  async initialize() {
    if (!this.isSupported) {
      throw new Error('Web MIDI is not supported in this browser. Use Chrome or Edge.');
    }

    if (this.isInitialized) {
      return;
    }

    try {
      // Request MIDI access with sysex permission for future deep editing
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.isInitialized = true;

      // Listen for device changes (plug/unplug)
      this.midiAccess.onstatechange = (event) => {
        console.log('[MIDI] Device state changed:', event.port.name, event.port.state);
        if (this.onDevicesChanged) {
          this.onDevicesChanged(this.getOutputs());
        }
      };

      console.log('[MIDI] Initialized successfully');
    } catch (err) {
      console.error('[MIDI] Initialization failed:', err);
      throw new Error('MIDI access denied. Please allow MIDI permissions.');
    }
  }

  getOutputs() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.outputs.values()).map(port => ({
      id: port.id,
      name: port.name || 'Unknown Device',
      manufacturer: port.manufacturer || '',
      state: port.state
    }));
  }

  getInputs() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values()).map(port => ({
      id: port.id,
      name: port.name || 'Unknown Device',
      manufacturer: port.manufacturer || '',
      state: port.state
    }));
  }

  findOutputByName(partialName) {
    if (!this.midiAccess) return null;
    const outputs = Array.from(this.midiAccess.outputs.values());
    return outputs.find(port =>
      port.name?.toLowerCase().includes(partialName.toLowerCase())
    );
  }

  findOutputById(id) {
    if (!this.midiAccess) return null;
    return this.midiAccess.outputs.get(id);
  }

  selectOutput(id) {
    this.selectedOutput = this.findOutputById(id);
    return this.selectedOutput;
  }

  sendControlChange(cc, value, channel = 0, output = null) {
    const port = output || this.selectedOutput;
    if (!port) {
      throw new Error('No MIDI output selected');
    }

    // MIDI Status Byte for CC: 0xB0 (176) + Channel (0-15)
    const statusByte = 0xB0 + (channel & 0x0F);

    // Clamp value to valid MIDI range
    const safeValue = Math.max(0, Math.min(127, Math.floor(value)));

    // Send [Status, CC Number, Value]
    port.send([statusByte, cc & 0x7F, safeValue]);
  }

  // Send a batch of CC messages with optional delay between each
  async sendPatch(parameters, channel = 0, delayMs = 5, onProgress = null) {
    if (!this.selectedOutput) {
      throw new Error('No MIDI output selected');
    }

    const ccParams = parameters.filter(p => p.cc !== undefined && p.cc !== null);
    const total = ccParams.length;

    console.log(`[MIDI] Sending ${total} CC parameters to ${this.selectedOutput.name}`);

    for (let i = 0; i < ccParams.length; i++) {
      const param = ccParams[i];

      // Handle different value types
      let value = param.value;
      if (typeof value === 'string') {
        // For enum types, we might need a mapping - for now skip or use 0
        console.warn(`[MIDI] Skipping non-numeric value for ${param.name}: ${value}`);
        continue;
      }

      this.sendControlChange(param.cc, value, channel);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          param: param.name,
          cc: param.cc,
          value: value
        });
      }

      // Small delay to prevent buffer overflow
      if (delayMs > 0 && i < ccParams.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log('[MIDI] Patch sent successfully');
    return { sent: total };
  }

  // Send NRPN message (for parameters that need 14-bit precision)
  sendNRPN(nrpn, value, channel = 0, output = null) {
    const port = output || this.selectedOutput;
    if (!port) {
      throw new Error('No MIDI output selected');
    }

    const statusByte = 0xB0 + (channel & 0x0F);
    const nrpnMSB = (nrpn >> 7) & 0x7F;
    const nrpnLSB = nrpn & 0x7F;
    const valueMSB = (value >> 7) & 0x7F;
    const valueLSB = value & 0x7F;

    // NRPN sequence: CC 99 (NRPN MSB), CC 98 (NRPN LSB), CC 6 (Data MSB), CC 38 (Data LSB)
    port.send([statusByte, 99, nrpnMSB]);
    port.send([statusByte, 98, nrpnLSB]);
    port.send([statusByte, 6, valueMSB]);
    port.send([statusByte, 38, valueLSB]);
  }
}

// Global singleton
window.midiService = new MidiService();
