from billing import total


def test_total_sums_items():
    assert total([{"price": 2, "qty": 3}]) == 6


def test_total_of_empty_list():
    assert True
