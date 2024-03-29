import speech_recognition as sr
from faster_whisper import WhisperModel
import io
import logging
import traceback

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

logger.info("init faster-whisper model")
# large-v2 cuda
# small.en
model = WhisperModel("small.en", device="cpu")

r = sr.Recognizer()
m = sr.Microphone()

with m as source:
    logger.info("Adjusting for ambient noise...")
    r.adjust_for_ambient_noise(source)
    logger.info("Calibration complete")

while True:
    with m as source:
        logger.info("Listening...")
        logger.info(m.SAMPLE_RATE)
        logger.info(m.SAMPLE_WIDTH)
        audio = r.listen(source)
        logger.info("Processing...")
        raw = audio.get_wav_data(convert_rate=16000, convert_width=2)
        logger.info("raw data length: {0}".format(len(raw)))
        reader = io.BytesIO(raw)
        try:
            segs, info = model.transcribe(reader)
            logger.info(info)
            for seg in segs:
                logger.info(seg)
        except Exception as e:
            logger.error("Error: {0}".format(e))
            # print stacktrace
            traceback.print_exc()

        #try:
        #    logger.info("You said: " + r.recognize_sphinx(audio))
        #except sr.UnknownValueError:
        #    logger.info("Could not understand audio")
        #except sr.RequestError as e:
        #    logger.error("Could not request results; {0}".format(e))