import speech_recognition as sr
from faster_whisper import WhisperModel
import io
import logging
import traceback

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

logger.info("init faster-whisper model")
# small.en 0.5GB
# medium.en 1.5GB
model = WhisperModel("small.en", device="cpu")

r = sr.Recognizer()
m = sr.Microphone()

with m as source:
    logger.info(f"Connected to mic - rate {m.SAMPLE_RATE} width {m.SAMPLE_WIDTH}")
    logger.info("Be quiet! Adjusting for ambient noise...")
    r.adjust_for_ambient_noise(source, duration=2)
    logger.info("Calibration complete")

while True:
    with m as source:
        logger.info("Listening...")
        audio = r.listen(source)

        logger.info("Processing...")
        raw = audio.get_wav_data(convert_rate=16000, convert_width=2)
        reader = io.BytesIO(raw)
        try:
            segs, _ = model.transcribe(reader, word_timestamps=True)
            for seg in segs:
                logger.info(seg)
                logger.info(seg.text)
                for word in seg.words:
                    # log word start to end and the word itself
                    # log the start/end with a consistent format [0.00-0.00]
                    logger.info(f"[{word.start:.2f}-{word.end:.2f}] {word.word}")
        except Exception as e:
            logger.error("Error: {0}".format(e))
            traceback.print_exc()