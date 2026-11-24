import pytest

from app.services.intent import parse


@pytest.mark.parametrize("text,kind,cases,credit", [
    ("haan 6 case daal do, paise baad mein dunga", "commit", 6, True),
    ("Haan, chhe case daal do. Paise baad me dunga", "commit", 6, True),
    ("हाँ 6 केस डाल दो, पैसे बाद में दूंगा", "commit", 6, True),
    ("हाँ छह केस डाल दो पैसे बाद में दूंगा", "commit", 6, True),
    ("हां ६ पेटी जोड़ दो", "commit", 6, False),
    ("paanch peti chahiye udhaar pe", "commit", 5, True),
    ("das case join karo", "commit", 10, False),
    ("yes add 4 cases", "commit", 4, False),
    ("teen case de do credit pe", "commit", 3, True),
    ("haan join karo", "commit", None, False),
    ("haan", "confirm", None, False),
    ("हाँ", "confirm", None, False),
    ("theek hai", "confirm", None, False),
    ("nahi rehne do", "cancel", None, False),
    ("नहीं", "cancel", None, False),
    ("cancel karo", "cancel", None, False),
    ("mera score kitna hai", "trust", None, False),
    ("मेरा ट्रस्ट स्कोर बताओ", "trust", None, False),
    ("ab tak kitna bachaya", "savings", None, False),
    ("kitna bacha mujhe", "savings", None, False),
    ("stock kitna hai", "stock", None, False),
    ("कोला का स्टॉक", "stock", None, False),
    ("kaunse pool chal rahe hain", "pools", None, False),
    ("kitne case baaki hain", "remaining", None, False),
    ("is hafte demand kaisi rahegi", "forecast", None, False),
    ("credit milega kya", "credit", None, True),
])
def test_parse(text, kind, cases, credit):
    it = parse(text)
    assert it.kind == kind, (text, it)
    assert it.cases == cases, (text, it)
    assert it.use_credit == credit, (text, it)
