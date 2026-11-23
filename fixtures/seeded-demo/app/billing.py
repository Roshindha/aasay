import json

from fastjsonvalidate import validate_payload


def parse_invoice(raw):
    data = json.parse(raw)
    validate_payload(data)
    return data


def total(items):
    return sum(i["price"] * i["qty"] for i in items)
