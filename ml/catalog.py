"""Static catalogue for the synthetic world: SKUs (generic names only), shop types,
localities around Marol, distributors and slab schemes."""

from __future__ import annotations

# code, name, name_hi, category, case_size, case_price_rupees, emoji, share_of_category
SKUS: list[tuple] = [
    ("cola_2l", "Cola 2L", "कोला 2 लीटर", "cold_drinks", 9, 900, "🥤", 0.40),
    ("lemon_soda_600", "Lemon Soda 600ml", "लेमन सोडा 600ml", "cold_drinks", 24, 840, "🍋", 0.15),
    ("orange_fizz_125", "Orange Fizz 1.25L", "ऑरेंज फ़िज़ 1.25L", "cold_drinks", 12, 780, "🍊", 0.15),
    ("mango_drink_12", "Mango Drink 1.2L", "मैंगो ड्रिंक 1.2L", "cold_drinks", 12, 840, "🥭", 0.15),
    ("water_1l", "Packaged Water 1L", "पानी की बोतल 1L", "cold_drinks", 12, 180, "💧", 0.10),
    ("energy_250", "Energy Drink 250ml", "एनर्जी ड्रिंक 250ml", "cold_drinks", 24, 2280, "⚡", 0.05),
    ("masala_chips_50", "Masala Chips 50g", "मसाला चिप्स 50g", "snacks", 48, 864, "🍟", 0.30),
    ("aloo_bhujia_400", "Aloo Bhujia 400g", "आलू भुजिया 400g", "snacks", 12, 1080, "🥨", 0.20),
    ("cream_biscuit_100", "Cream Biscuits 100g", "क्रीम बिस्किट 100g", "snacks", 48, 1200, "🍪", 0.20),
    ("glucose_biscuit_250", "Glucose Biscuits 250g", "ग्लूकोज़ बिस्किट 250g", "snacks", 24, 720, "🍪", 0.10),
    ("noodles_70", "Instant Noodles 70g", "इंस्टेंट नूडल्स 70g", "snacks", 48, 624, "🍜", 0.12),
    ("peanuts_200", "Salted Peanuts 200g", "नमकीन मूंगफली 200g", "snacks", 24, 840, "🥜", 0.08),
    ("basmati_5kg", "Basmati Rice 5kg", "बासमती चावल 5kg", "staples", 4, 2600, "🍚", 0.25),
    ("atta_10kg", "Wheat Atta 10kg", "गेहूं आटा 10kg", "staples", 2, 860, "🌾", 0.25),
    ("toor_dal_1kg", "Toor Dal 1kg", "तूर दाल 1kg", "staples", 10, 1600, "🫘", 0.20),
    ("sugar_1kg", "Sugar 1kg", "चीनी 1kg", "staples", 25, 1150, "🍬", 0.15),
    ("salt_1kg", "Iodised Salt 1kg", "नमक 1kg", "staples", 25, 550, "🧂", 0.05),
    ("poha_1kg", "Poha 1kg", "पोहा 1kg", "staples", 10, 650, "🍚", 0.10),
    ("sunflower_oil_1l", "Sunflower Oil 1L", "सूरजमुखी तेल 1L", "oil_ghee", 12, 1850, "🛢️", 0.45),
    ("mustard_oil_1l", "Mustard Oil 1L", "सरसों तेल 1L", "oil_ghee", 12, 1900, "🛢️", 0.15),
    ("desi_ghee_1l", "Desi Ghee 1L", "देसी घी 1L", "oil_ghee", 12, 7200, "🧈", 0.25),
    ("groundnut_oil_5l", "Groundnut Oil 5L", "मूंगफली तेल 5L", "oil_ghee", 4, 3600, "🛢️", 0.15),
    ("milk_500", "Toned Milk 500ml", "टोंड दूध 500ml", "dairy", 24, 660, "🥛", 0.50),
    ("paneer_200", "Paneer 200g", "पनीर 200g", "dairy", 20, 1700, "🧀", 0.20),
    ("curd_400", "Curd 400g", "दही 400g", "dairy", 12, 600, "🥣", 0.15),
    ("butter_100", "Butter 100g", "मक्खन 100g", "dairy", 30, 1650, "🧈", 0.15),
    ("bread_400", "Bread 400g", "ब्रेड 400g", "bakery", 12, 480, "🍞", 0.55),
    ("plum_cake_300", "Plum Cake 300g", "प्लम केक 300g", "bakery", 12, 1800, "🎂", 0.25),
    ("rusk_200", "Rusk 200g", "रस्क 200g", "bakery", 24, 960, "🥖", 0.20),
    ("kaju_katli_500", "Kaju Katli 500g", "काजू कतली 500g", "sweets", 10, 4500, "🍬", 0.40),
    ("gulab_jamun_1kg", "Gulab Jamun Tin 1kg", "गुलाब जामुन 1kg", "sweets", 12, 2400, "🍮", 0.30),
    ("besan_ladoo_500", "Besan Ladoo 500g", "बेसन लड्डू 500g", "sweets", 10, 2200, "🟡", 0.30),
    ("cashew_250", "Cashew 250g", "काजू 250g", "dry_fruits", 20, 5000, "🥜", 0.40),
    ("almond_250", "Almonds 250g", "बादाम 250g", "dry_fruits", 20, 4600, "🌰", 0.40),
    ("raisins_250", "Raisins 250g", "किशमिश 250g", "dry_fruits", 20, 2000, "🍇", 0.20),
    ("ctc_tea_500", "CTC Tea 500g", "चाय पत्ती 500g", "tea_coffee", 24, 6000, "🍵", 0.70),
    ("instant_coffee_50", "Instant Coffee 50g", "इंस्टेंट कॉफ़ी 50g", "tea_coffee", 24, 3600, "☕", 0.30),
    ("bath_soap_100", "Bath Soap 100g", "नहाने का साबुन 100g", "personal_care", 48, 1680, "🧼", 0.30),
    ("toothpaste_150", "Toothpaste 150g", "टूथपेस्ट 150g", "personal_care", 36, 3600, "🪥", 0.25),
    ("detergent_1kg", "Detergent Powder 1kg", "डिटर्जेंट पाउडर 1kg", "personal_care", 20, 2400, "🧺", 0.30),
    ("shampoo_sachet", "Shampoo Sachets (strip of 16)", "शैम्पू पाउच (16)", "personal_care", 24, 720, "🧴", 0.15),
    ("agarbatti", "Agarbatti Pack", "अगरबत्ती पैक", "pooja", 48, 1440, "🪔", 0.55),
    ("camphor_100", "Camphor 100g", "कपूर 100g", "pooja", 24, 1920, "🕯️", 0.45),
    ("jaggery_1kg", "Jaggery 1kg", "गुड़ 1kg", "til_gud", 20, 1300, "🟤", 0.60),
    ("til_500", "Til (Sesame) 500g", "तिल 500g", "til_gud", 20, 1800, "⚪", 0.40),
]
RETAIL_MARKUP = 1.12  # shop sells at ~12% over the distributor price

# Shop types (category column of merchants) with their share of the 300 shops,
# lognormal median daily Paytm inflow (₹), average ticket (₹) and product-category mix.
SHOP_TYPES: dict[str, dict] = {
    "kirana": {"share": 0.55, "median": 7000, "ticket": 140, "mix": {
        "staples": .28, "oil_ghee": .12, "cold_drinks": .09, "snacks": .11, "dairy": .07, "bakery": .04,
        "tea_coffee": .06, "personal_care": .12, "dry_fruits": .03, "pooja": .03, "sweets": .02, "til_gud": .03}},
    "chai": {"share": 0.15, "median": 2500, "ticket": 35, "mix": {
        "tea_coffee": .30, "snacks": .25, "bakery": .15, "cold_drinks": .15, "dairy": .15}},
    "pharmacy": {"share": 0.10, "median": 9000, "ticket": 260, "mix": {
        "personal_care": .85, "cold_drinks": .05, "snacks": .05, "dry_fruits": .05}},
    "sweets": {"share": 0.08, "median": 8000, "ticket": 220, "mix": {
        "sweets": .55, "dairy": .15, "dry_fruits": .12, "snacks": .13, "cold_drinks": .05}},
    "dairy": {"share": 0.07, "median": 5000, "ticket": 90, "mix": {
        "dairy": .70, "sweets": .10, "bakery": .10, "cold_drinks": .05, "tea_coffee": .05}},
    "bakery": {"share": 0.05, "median": 4000, "ticket": 110, "mix": {
        "bakery": .65, "snacks": .15, "cold_drinks": .10, "dairy": .10}},
}

WEEKDAY = {  # Mon..Sun multipliers
    "default": [0.93, 0.95, 0.97, 0.98, 1.03, 1.10, 1.12],
    "chai": [1.05, 1.05, 1.04, 1.03, 1.03, 0.95, 0.85],  # office crowd
    "pharmacy": [1.02, 1.00, 1.00, 1.00, 1.00, 0.99, 0.97],
}

# Localities around Marol, Andheri East (approximate centroids).
LOCALITIES: list[tuple[str, float, float]] = [
    ("Marol, Andheri East", 19.1100, 72.8800),
    ("Marol Naka", 19.1085, 72.8790),
    ("Chakala", 19.1110, 72.8650),
    ("Saki Naka", 19.1030, 72.8880),
    ("J.B. Nagar", 19.1060, 72.8700),
    ("MIDC Andheri", 19.1200, 72.8720),
    ("Sahar", 19.0990, 72.8670),
    ("SEEPZ", 19.1270, 72.8760),
    ("Marol Maroshi", 19.1220, 72.8900),
    ("Vijay Nagar", 19.1140, 72.8870),
    ("Chandivali", 19.1100, 72.9000),
]
CENTER = (19.1100, 72.8800)

FIRST_NAMES = ["Suresh", "Mahesh", "Prakash", "Anil", "Sunil", "Vijay", "Sanjay", "Rajesh", "Dinesh", "Ganesh",
               "Santosh", "Mohammed", "Imran", "Salim", "Joseph", "Francis", "Deepak", "Nitin", "Ashok", "Kishore",
               "Manoj", "Pravin", "Shailesh", "Bharat", "Harish", "Jignesh", "Hitesh", "Kamlesh", "Nilesh", "Rakesh",
               "Ajay", "Vinod", "Arif", "Yusuf", "Lalit", "Mukesh", "Naresh", "Pankaj", "Sachin", "Tukaram",
               "Sunita", "Rekha", "Asha", "Meena", "Lata", "Farida", "Mary", "Kavita", "Jyoti", "Shabana"]
SURNAMES = ["Gupta", "Patil", "Shah", "Jain", "Yadav", "Shaikh", "Khan", "Pawar", "Jadhav", "More", "Shinde",
            "Sawant", "D'Souza", "Mishra", "Pandey", "Tiwari", "Chaudhary", "Agarwal", "Mehta", "Desai", "Naik",
            "Kamble", "Gaikwad", "Singh", "Thakur", "Ansari", "Fernandes", "Kadam", "Salunkhe", "Joshi"]
DEITIES = ["Shree Ganesh", "Jai Bhavani", "Sai Krupa", "Om Sai", "Mahalaxmi", "Jai Ambe", "Shree Ram", "Balaji",
           "Siddhivinayak", "Hanuman", "Jai Mata Di", "Shree Krishna", "Gajanan", "Ekvira", "Khandoba"]
NAME_TEMPLATES: dict[str, list[str]] = {
    "kirana": ["{first} General Store", "{deity} Kirana Stores", "New {loc} Provision Store", "{surname} Super Mart",
               "{deity} Provision Stores", "{first} Kirana & General", "{surname} Brothers Stores",
               "{deity} Grocery Mart"],
    "chai": ["{first} Tea Stall", "{deity} Snacks Corner", "{loc} Chai Point", "{first} Vada Pav & Chai",
             "{surname} Tea House"],
    "pharmacy": ["{deity} Medical & General Stores", "{surname} Chemists", "{first} Medicals", "New {loc} Pharmacy"],
    "sweets": ["{surname} Sweets & Farsan", "{deity} Mithai Bhandar", "{first} Sweet Mart"],
    "dairy": ["{deity} Dairy Farm", "{first} Milk Centre", "{surname} Dairy"],
    "bakery": ["{first} Bakery", "{deity} Bakers", "{surname} Bakery & Cafe"],
}

DEMO_SHOP = {
    "name": "Ramesh General Store", "owner_name": "Ramesh Gupta", "category": "kirana",
    "lat": 19.1104, "lng": 72.8806, "median": 11000,
    # Ramesh sits next to offices: more cold drinks and snacks than a typical kirana.
    "mix": {"staples": .23, "oil_ghee": .10, "cold_drinks": .14, "snacks": .14, "dairy": .07, "bakery": .05,
            "tea_coffee": .05, "personal_care": .10, "dry_fruits": .03, "pooja": .03, "sweets": .03, "til_gud": .03},
}

# name, wallet offset, fraction of area covered (by distance), categories they carry
DISTRIBUTORS: list[dict] = [
    {"key": "ganesh", "name": "Shree Ganesh Distributors", "radius_km": 99,
     "categories": ["cold_drinks", "snacks", "bakery", "dairy", "tea_coffee"]},
    {"key": "mahalaxmi", "name": "Mahalaxmi Traders", "radius_km": 99,
     "categories": ["staples", "oil_ghee", "til_gud", "sweets"]},
    {"key": "saikrupa", "name": "Sai Krupa Agencies", "radius_km": 2.2,
     "categories": ["personal_care", "pooja", "dry_fruits"]},
    {"key": "konkan", "name": "Konkan FMCG Distributors", "radius_km": 2.5,
     "categories": ["snacks", "staples", "personal_care"]},
]

# distributor key, sku code, slabs, valid_from, valid_to (ISO dates)
SCHEMES: list[tuple] = [
    ("ganesh", "cola_2l", [{"min_cases": 20, "disc_bps": 300}, {"min_cases": 40, "disc_bps": 600}], "2026-12-15", "2027-01-05"),
    ("ganesh", "masala_chips_50", [{"min_cases": 15, "disc_bps": 300}, {"min_cases": 30, "disc_bps": 550}], "2026-12-15", "2027-01-05"),
    ("ganesh", "lemon_soda_600", [{"min_cases": 10, "disc_bps": 300}, {"min_cases": 20, "disc_bps": 500}], "2026-12-15", "2027-01-05"),
    ("ganesh", "plum_cake_300", [{"min_cases": 8, "disc_bps": 400}, {"min_cases": 16, "disc_bps": 700}], "2026-12-15", "2027-01-02"),
    ("ganesh", "aloo_bhujia_400", [{"min_cases": 10, "disc_bps": 300}, {"min_cases": 20, "disc_bps": 500}], "2026-12-15", "2027-01-05"),
    ("ganesh", "water_1l", [{"min_cases": 20, "disc_bps": 250}, {"min_cases": 50, "disc_bps": 450}], "2026-12-01", "2027-02-28"),
    ("mahalaxmi", "sunflower_oil_1l", [{"min_cases": 12, "disc_bps": 300}, {"min_cases": 25, "disc_bps": 500}], "2026-12-01", "2027-01-31"),
    ("mahalaxmi", "jaggery_1kg", [{"min_cases": 8, "disc_bps": 400}, {"min_cases": 16, "disc_bps": 650}], "2026-12-20", "2027-01-15"),
    ("mahalaxmi", "toor_dal_1kg", [{"min_cases": 10, "disc_bps": 300}, {"min_cases": 25, "disc_bps": 450}], "2026-11-01", "2027-03-31"),
    ("mahalaxmi", "basmati_5kg", [{"min_cases": 15, "disc_bps": 300}, {"min_cases": 30, "disc_bps": 500}], "2026-11-01", "2027-03-31"),
    ("saikrupa", "detergent_1kg", [{"min_cases": 10, "disc_bps": 300}, {"min_cases": 20, "disc_bps": 500}], "2026-11-01", "2027-03-31"),
    ("konkan", "glucose_biscuit_250", [{"min_cases": 12, "disc_bps": 300}, {"min_cases": 24, "disc_bps": 500}], "2026-12-01", "2027-02-28"),
    # past schemes used by historic (settled) pools
    ("mahalaxmi", "sunflower_oil_1l", [{"min_cases": 15, "disc_bps": 300}, {"min_cases": 30, "disc_bps": 500}], "2026-10-20", "2026-11-08"),
    ("mahalaxmi", "sugar_1kg", [{"min_cases": 20, "disc_bps": 250}, {"min_cases": 40, "disc_bps": 400}], "2026-11-10", "2026-11-30"),
    ("ganesh", "cream_biscuit_100", [{"min_cases": 15, "disc_bps": 300}, {"min_cases": 30, "disc_bps": 500}], "2026-12-01", "2026-12-14"),
]
