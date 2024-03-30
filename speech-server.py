from flask import Flask, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import speech_recognition as sr
from queue import Queue
from threading import Thread, Lock
import logging
import time
import io
from pprint import pp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

class LiveTranscribe:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

        self.logger.info("Loading whisper model")
        self.model = WhisperModel("small.en", device="cpu")
        self.r = sr.Recognizer()
        self.m = sr.Microphone()
        self._transcript = Queue()
        self.audiodata = Queue()
        self.mutex = Lock()
        self._worker_thread = Thread(target=self._worker, daemon=True)

    def _worker(self):
        # worker runs in a separate thread and is responsible
        # for picking audio off the queue and transcribing it
        logger = logging.getLogger(__name__ + ".worker")
        while True:
            audio_time, audio = self.audiodata.get()
            # logger.info("Energy: %s Dynamic Energy: %s", self.r.energy_threshold, self.r.dynamic_energy_adjustment_damping)
            raw = audio.get_wav_data(convert_rate=16000, convert_width=2)
            reader = io.BytesIO(raw)
            segs, info = self.model.transcribe(reader, 
                                               word_timestamps=True,
                                               hallucination_silence_threshold=0.8,
                                               no_speech_threshold=0.4,
                                               log_prob_threshold=-0.8,
                                               )
            duration = info.duration
            wall_time_start = audio_time - duration
            for seg in segs:
                logger.info("segment [no_speech_prob: %s, avg_logprob: %s, temperature: %s, tokens: %s]", seg.no_speech_prob, seg.avg_logprob, seg.temperature, len(seg.tokens))
                logger.info("segment [text: %s]", seg.text)
                for word in seg.words:
                    w = {
                        "wall_start": wall_time_start + word.start,
                        "wall_end": wall_time_start + word.end,
                        "start": word.start,
                        "end": word.end,
                        "word": word.word,
                    }
                    self._transcript.put(w)

    def _callback(self, recognizer, audio):
        now = time.time()
        self.audiodata.put((now, audio))

    def listen(self):
        self.r.dynamic_energy_threshold = False # this doesn't seem to perform well on my system
        self.logger.info("Be quiet! Adjusting for ambient noise...")
        with self.m as source:
            self.r.adjust_for_ambient_noise(source, duration=0.5)
        self.r.energy_threshold = 60 # TODO let the user tune this with a nice little UI

        self.logger.info("Listening...")
        self._worker_thread.start()
        self.r.listen_in_background(self.m, self._callback, phrase_time_limit=10)

    def pop(self):
        with self.mutex:
            t = []
            while not self._transcript.empty():
                t.append(self._transcript.get())
        return t


if __name__ == "__main__":
    lt = LiveTranscribe()

    app = Flask(__name__)
    CORS(app)

    @app.route("/transcript")
    def transcript():
        return jsonify(
            {
                "words": lt.pop(),
                "wall_time_now": time.time(),
            }
        )

    lt.listen()

    app.run(port=5051)