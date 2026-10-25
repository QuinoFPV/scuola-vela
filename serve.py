#!/usr/bin/env python3
"""Server di prova per provare il simulatore in locale: python3 serve.py [porta]

Il server standard di Python (python3 -m http.server) tiene in coda solo 5 connessioni:
il browser chiede tutti i moduli insieme e alcuni vengono rifiutati. Questo ne accetta molte di piu'.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os.path import abspath, dirname


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = partial(SimpleHTTPRequestHandler, directory=dirname(abspath(__file__)))
print(f"Scuola di Vela: http://localhost:{port}  (Ctrl+C per fermare)")
Server(("127.0.0.1", port), handler).serve_forever()
