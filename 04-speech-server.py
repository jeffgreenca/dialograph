from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import sys
import time
import speech_recognition as sr
from faster_whisper import WhisperModel
import io
import logging
import traceback
import argparse

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

class LiveTranscribe:
    """LiveTranscribe runs a continuous listening loop
    and transcribes the audio input using the faster-whisper model.

    It provides a pop function that returns the transcript up to the
    point in time when the function is called, and then clears the transcript.
    """

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.logger.info("init faster-whisper model")
        # small.en 0.5GB
        # medium.en 1.5GB
        self.model = WhisperModel("small.en", device="cpu")
        self.r = sr.Recognizer()
        self.m = sr.Microphone()
        with self.m as source:
            self.logger.debug(f"Connected to mic - rate {self.m.SAMPLE_RATE} width {self.m.SAMPLE_WIDTH}")
            self.logger.info("Be quiet! Adjusting for ambient noise...")
            self.r.adjust_for_ambient_noise(source, duration=1)
            self.logger.info("Calibration complete")
        self._transcript = []

    def _make_callback(self):
        def callback(recognizer, audio):
            self.logger = logging.getLogger(__name__)

            callback_timestmap = time.time()

            self.logger.debug("Processing...")
            raw = audio.get_wav_data(convert_rate=16000, convert_width=2)
            reader = io.BytesIO(raw)
            try:
                segs, info = self.model.transcribe(reader, word_timestamps=True)
                duration = info.duration
                wall_time_start = callback_timestmap - duration

                self.logger.debug(info)
                for seg in segs:
                    self.logger.debug(seg)
                    self.logger.debug(seg.text)
                    for word in seg.words:
                        self.logger.debug(f"[{word.start:.2f}-{word.end:.2f}] {word.word}")
                        w = {
                            "wall_start": wall_time_start + word.start,
                            "wall_end": wall_time_start + word.end,
                            "start": word.start,
                            "end": word.end,
                            "word": word.word,
                            "confidence": word.probability,
                        }
                        self._transcript.append(w)
            except Exception as e:
                self.logger.error("Error: {0}".format(e))
                traceback.print_exc()
        return callback

    def listen(self):
        self.logger.info("Start background listening")
        self.r.listen_in_background(self.m, self._make_callback())

    def pop(self):
        # rather unsafe!
        t = self._transcript.copy()
        self._transcript = []
        return t

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()

    lt = LiveTranscribe()

    if args.test:
        lt.listen()
        while True:
            time.sleep(1)
            for x in lt.pop():
                print(x)
            else:
                print(".", end="", flush=True)
    else:
        # set up and run our flask app
        app = Flask(__name__)
        CORS(app)

        @app.route("/transcript", methods=["GET"])
        def transcript():
            return jsonify({
                "words": lt.pop(),
                "wall_time_now": time.time()}
                )

        lt.listen()

        app.run(port=5001)
