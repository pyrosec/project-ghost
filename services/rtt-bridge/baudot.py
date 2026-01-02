"""
Baudot/TTY Tone Generator

Generates audio tones for TTY/TDD communication using Baudot code.
Standard TTY uses 45.45 baud with 1400Hz (mark) and 1800Hz (space) tones.
"""

import math
import struct
import io
import wave
from typing import List, Optional

# Baudot code tables (ITA2)
# Letters mode (LTRS)
LTRS_TABLE = {
    'A': 0b00011, 'B': 0b11001, 'C': 0b01110, 'D': 0b01001, 'E': 0b00001,
    'F': 0b01101, 'G': 0b11010, 'H': 0b10100, 'I': 0b00110, 'J': 0b01011,
    'K': 0b01111, 'L': 0b10010, 'M': 0b11100, 'N': 0b01100, 'O': 0b11000,
    'P': 0b10110, 'Q': 0b10111, 'R': 0b01010, 'S': 0b00101, 'T': 0b10000,
    'U': 0b00111, 'V': 0b11110, 'W': 0b10011, 'X': 0b11101, 'Y': 0b10101,
    'Z': 0b10001, '\r': 0b01000, '\n': 0b00010, ' ': 0b00100,
}

# Figures mode (FIGS)
FIGS_TABLE = {
    '1': 0b11101, '2': 0b10011, '3': 0b00001, '4': 0b01010, '5': 0b10000,
    '6': 0b10101, '7': 0b00111, '8': 0b00110, '9': 0b11000, '0': 0b10110,
    '-': 0b00011, '?': 0b11001, ':': 0b01110, '$': 0b01001, '!': 0b01101,
    '&': 0b11010, '#': 0b10100, "'": 0b01011, '(': 0b01111, ')': 0b10010,
    '.': 0b11100, ',': 0b01100, ';': 0b11110, '/': 0b10111, '"': 0b10001,
    '\r': 0b01000, '\n': 0b00010, ' ': 0b00100,
}

# Shift codes
LTRS_SHIFT = 0b11111  # Switch to letters mode
FIGS_SHIFT = 0b11011  # Switch to figures mode

# TTY audio parameters
SAMPLE_RATE = 8000  # 8kHz for telephony
BAUD_RATE = 45.45   # Standard TTY baud rate
MARK_FREQ = 1400    # Mark tone frequency (Hz)
SPACE_FREQ = 1800   # Space tone frequency (Hz)
BIT_DURATION = 1.0 / BAUD_RATE  # Duration of each bit in seconds


class BaudotEncoder:
    """Encodes text to Baudot code bits"""

    def __init__(self):
        self.mode = 'LTRS'  # Start in letters mode

    def encode_char(self, char: str) -> Optional[List[int]]:
        """
        Encode a single character to Baudot bits.
        Returns list of 5-bit codes (may include shift codes).
        """
        char = char.upper()
        codes = []

        # Check if character is in current mode's table
        if self.mode == 'LTRS' and char in LTRS_TABLE:
            codes.append(LTRS_TABLE[char])
        elif self.mode == 'FIGS' and char in FIGS_TABLE:
            codes.append(FIGS_TABLE[char])
        elif char in LTRS_TABLE:
            # Need to switch to LTRS mode
            codes.append(LTRS_SHIFT)
            codes.append(LTRS_TABLE[char])
            self.mode = 'LTRS'
        elif char in FIGS_TABLE:
            # Need to switch to FIGS mode
            codes.append(FIGS_SHIFT)
            codes.append(FIGS_TABLE[char])
            self.mode = 'FIGS'
        else:
            # Unknown character, skip
            return None

        return codes

    def encode_text(self, text: str) -> List[int]:
        """Encode a string to list of Baudot codes"""
        self.mode = 'LTRS'
        codes = [LTRS_SHIFT]  # Start with LTRS shift

        for char in text:
            char_codes = self.encode_char(char)
            if char_codes:
                codes.extend(char_codes)

        return codes


class TTYToneGenerator:
    """Generates audio tones for TTY transmission"""

    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        baud_rate: float = BAUD_RATE,
        mark_freq: int = MARK_FREQ,
        space_freq: int = SPACE_FREQ
    ):
        self.sample_rate = sample_rate
        self.baud_rate = baud_rate
        self.mark_freq = mark_freq
        self.space_freq = space_freq
        self.bit_duration = 1.0 / baud_rate
        self.samples_per_bit = int(sample_rate * self.bit_duration)
        self.encoder = BaudotEncoder()

    def generate_tone(self, freq: int, duration: float, amplitude: float = 0.8) -> List[int]:
        """Generate a sine wave tone"""
        num_samples = int(self.sample_rate * duration)
        samples = []

        for i in range(num_samples):
            t = i / self.sample_rate
            # Generate sine wave
            value = amplitude * math.sin(2 * math.pi * freq * t)
            # Convert to 16-bit PCM
            sample = int(value * 32767)
            samples.append(sample)

        return samples

    def generate_bit(self, bit: int) -> List[int]:
        """Generate tone for a single bit (0=space, 1=mark)"""
        freq = self.mark_freq if bit == 1 else self.space_freq
        return self.generate_tone(freq, self.bit_duration)

    def generate_baudot_char(self, code: int) -> List[int]:
        """
        Generate audio for a single Baudot character.
        Format: start bit (space) + 5 data bits (LSB first) + stop bit (mark, 1.5 bits)
        """
        samples = []

        # Start bit (space/0)
        samples.extend(self.generate_bit(0))

        # 5 data bits, LSB first
        for i in range(5):
            bit = (code >> i) & 1
            samples.extend(self.generate_bit(bit))

        # Stop bit (mark/1) - 1.5 bit duration
        stop_duration = self.bit_duration * 1.5
        samples.extend(self.generate_tone(self.mark_freq, stop_duration))

        return samples

    def generate_text(self, text: str, lead_in_ms: int = 150) -> List[int]:
        """
        Generate complete TTY audio for text string.
        Includes lead-in carrier tone for synchronization.
        """
        samples = []

        # Lead-in: mark tone for receiver synchronization
        lead_in_duration = lead_in_ms / 1000.0
        samples.extend(self.generate_tone(self.mark_freq, lead_in_duration))

        # Encode text to Baudot
        codes = self.encoder.encode_text(text)

        # Generate audio for each character
        for code in codes:
            samples.extend(self.generate_baudot_char(code))

        # Trail-out: short mark tone
        samples.extend(self.generate_tone(self.mark_freq, 0.05))

        return samples

    def to_wav_bytes(self, samples: List[int]) -> bytes:
        """Convert samples to WAV file bytes"""
        buffer = io.BytesIO()

        with wave.open(buffer, 'wb') as wav:
            wav.setnchannels(1)  # Mono
            wav.setsampwidth(2)  # 16-bit
            wav.setframerate(self.sample_rate)

            # Pack samples as signed 16-bit integers
            for sample in samples:
                wav.writeframes(struct.pack('<h', sample))

        return buffer.getvalue()

    def generate_wav(self, text: str) -> bytes:
        """Generate WAV audio bytes for text"""
        samples = self.generate_text(text)
        return self.to_wav_bytes(samples)

    def save_wav(self, text: str, filename: str) -> None:
        """Save TTY audio to WAV file"""
        wav_bytes = self.generate_wav(text)
        with open(filename, 'wb') as f:
            f.write(wav_bytes)


def generate_tty_audio(text: str) -> bytes:
    """Convenience function to generate TTY audio for text"""
    generator = TTYToneGenerator()
    return generator.generate_wav(text)


# For testing
if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1:
        text = ' '.join(sys.argv[1:])
    else:
        text = "HELLO WORLD"

    print(f"Generating TTY audio for: {text}")
    generator = TTYToneGenerator()
    generator.save_wav(text, '/tmp/tty_test.wav')
    print(f"Saved to /tmp/tty_test.wav")

    # Print some stats
    samples = generator.generate_text(text)
    duration = len(samples) / SAMPLE_RATE
    print(f"Duration: {duration:.2f} seconds")
    print(f"Sample rate: {SAMPLE_RATE} Hz")
    print(f"Baud rate: {BAUD_RATE}")
