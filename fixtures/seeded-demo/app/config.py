import yaml

MAX_RETRIES = 5
TIMEOUT_SECONDS = 10


def load_config(path):
    with open(path) as fh:
        return yaml.safe_load(fh)
