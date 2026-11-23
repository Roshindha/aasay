import requests

from config import MAX_RETRIES, TIMEOUT_SECONDS


def fetch(url):
    last = None
    for _ in range(MAX_RETRIES):
        try:
            return requests.get(url, timeout=TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            last = exc
    raise last
