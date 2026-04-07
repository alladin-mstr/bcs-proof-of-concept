import json
from models.schemas import TranslationRule
from services.storage_backend import get_storage


def list_translation_rules() -> list[TranslationRule]:
    storage = get_storage()
    rules: list[TranslationRule] = []
    for rid in storage.list_translation_rule_ids():
        content = storage.get_translation_rule(rid)
        if content is not None:
            rules.append(TranslationRule(**json.loads(content)))
    return rules


def get_translation_rules_dict() -> dict[str, str]:
    """Return a dict mapping signal code -> translation text for rule engine use."""
    seed_translation_rules_if_empty()
    rules = list_translation_rules()
    return {rule.code: rule.translation for rule in rules}


def seed_translation_rules_if_empty() -> None:
    """Seed translation rules with demo data if none exist."""
    storage = get_storage()
    if storage.list_translation_rule_ids():
        return  # already have data

    from datetime import datetime, timezone

    demo_rules = [
        # Polaris — Verwerkingssignalen (12)
        {"id": "rule-1", "code": "P0003", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Ingangsdatum functie ligt voor aanvang dienstverband. Graag corrigeren naar de juiste datum of bevestigen dat dit correct is."},
        {"id": "rule-2", "code": "P0012", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Adresgegevens ontbreken. Graag het woonadres invoeren \u2014 dit is verplicht voor de loonaangifte."},
        {"id": "rule-3", "code": "P0047", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Geboortedatum is niet ingevuld. Dit is een verplicht veld voor de Belastingdienst. Graag aanvullen."},
        {"id": "rule-4", "code": "P0089", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Parttime percentage is gewijzigd maar contracturen zijn niet aangepast. Graag de contracturen bijwerken naar het nieuwe percentage, of bevestigen dat het huidige rooster klopt."},
        {"id": "rule-5", "code": "P0102", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Loonheffingskorting is bij meerdere werkgevers actief. Graag controleren of dit correct is."},
        {"id": "rule-6", "code": "P0118", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Bankrekeningnummer is gewijzigd. Graag bevestigen dat de wijziging geautoriseerd is."},
        {"id": "rule-7", "code": "P0134", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Inhoudingsbedrag overschrijdt nettoloon. Controleer of alle inhoudingen correct zijn en of de medewerker akkoord is."},
        {"id": "rule-8", "code": "P0156", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Bruto-netto traject bevat negatieve netto. Controleer of dit door nabetaling of correctie komt."},
        {"id": "rule-9", "code": "P0201", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Wachtgeldregeling actief zonder einddatum. Graag einddatum invullen of bevestigen dat dit correct is."},
        {"id": "rule-10", "code": "P0215", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Looncomponent zonder grondslag gekoppeld. Graag de grondslag controleren en aanvullen."},
        {"id": "rule-11", "code": "P0278", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Eindejaarsuitkering wijkt af van CAO-tabel. Graag het percentage controleren."},
        {"id": "rule-12", "code": "P0312", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Verlofregistratie is niet bijgewerkt na contractwijziging. Graag het verlofsaldo herberekenen."},
        # Polaris — Loonaangifte (4)
        {"id": "rule-13", "code": "BSN ontbreekt", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "BSN ontbreekt. Verplicht voor loonaangifte Belastingdienst. Graag aanvullen."},
        {"id": "rule-14", "code": "Anoniementarief actief", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "Anoniementarief (52%) wordt toegepast. Controleer of identiteitsbewijs en BSN correct zijn geregistreerd."},
        {"id": "rule-15", "code": "SV-loon negatief", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "SV-loon is negatief in deze periode. Controleer of dit door een correctie komt en of de aangifte juist is."},
        {"id": "rule-16", "code": "Tabel bijz. beloning", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "Tabel bijzondere beloningen is toegepast. Graag controleren of dit correct is voor deze uitbetaling."},
        # Polaris — Reserveringen (2)
        {"id": "rule-17", "code": "Saldo \u2260 0 + UitDienst", "rapport": "Reserveringen", "teamId": "polaris", "teamName": "Polaris", "translation": "Medewerker is uit dienst maar heeft nog een openstaand saldo. Graag uitbetalen of bevestigen dat verrekening loopt."},
        {"id": "rule-18", "code": "Reservering < 0", "rapport": "Reserveringen", "teamId": "polaris", "teamName": "Polaris", "translation": "Reserveringssaldo is negatief. Controleer of dit door een nabetaling of correctie komt."},
        # Polaris — Betalingen (2)
        {"id": "rule-19", "code": "Kasbetaling", "rapport": "Betalingen", "teamId": "polaris", "teamName": "Polaris", "translation": "Kasbetaling gedetecteerd. Graag bevestigen dat dit correct en gewenst is."},
        {"id": "rule-20", "code": "Dubbele betaling", "rapport": "Betalingen", "teamId": "polaris", "teamName": "Polaris", "translation": "Dubbele betaling gedetecteerd voor zelfde bedrag en periode. Graag controleren of dit bewust is."},
        # Polaris — In-dienst (4)
        {"id": "rule-21", "code": "Rooster \u2260 Contract", "rapport": "In-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Rooster wijkt af van contract. Graag aanpassen."},
        {"id": "rule-22", "code": "Adrestype afwijking", "rapport": "In-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Correspondentieadres wijkt af van woonadres. Graag controleren welk adres correct is."},
        {"id": "rule-23", "code": "VG reservering ontbreekt", "rapport": "In-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Vakantiegeldreservering is niet ingesteld. Dit is verplicht. Graag instellen."},
        {"id": "rule-24", "code": "Proeftijd > 2 maanden", "rapport": "In-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Proeftijd is langer dan 2 maanden ingesteld. Dit is niet toegestaan bij een contract voor bepaalde tijd. Graag aanpassen."},
        # Polaris — Uit-dienst (2)
        {"id": "rule-25", "code": "Openstaande VD", "rapport": "Uit-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Medewerker heeft nog openstaande vakantiedagen. Graag uitbetalen of bevestigen."},
        {"id": "rule-26", "code": "Einddatum ontbreekt", "rapport": "Uit-dienst", "teamId": "polaris", "teamName": "Polaris", "translation": "Uit-dienst is gemeld maar einddatum ontbreekt in het systeem. Graag invullen."},
        # Polaris — TWK (2)
        {"id": "rule-27", "code": "TWK salaris", "rapport": "TWK", "teamId": "polaris", "teamName": "Polaris", "translation": "Salaris is met terugwerkende kracht gewijzigd. Graag bevestigen dat nabetaling correct is verwerkt."},
        {"id": "rule-28", "code": "TWK parttime%", "rapport": "TWK", "teamId": "polaris", "teamName": "Polaris", "translation": "Parttime percentage is met terugwerkende kracht gewijzigd. Graag bevestigen dat herberekening correct is."},
        # Delta — Implementatie (8)
        {"id": "rule-29", "code": "Risicopremie \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Risicopremie wijkt af: plan vs systeem. Graag controleren en corrigeren."},
        {"id": "rule-30", "code": "Franchise \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Franchise wijkt af: plan vs systeem. Graag controleren."},
        {"id": "rule-31", "code": "CAO \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "CAO-code in het systeem komt niet overeen met de afgesproken CAO. Graag corrigeren."},
        {"id": "rule-32", "code": "Loontijdvak \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Loontijdvak wijkt af: plan vs systeem. Graag controleren en aanpassen."},
        {"id": "rule-33", "code": "Sector \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Sectorcode wijkt af. Dit heeft gevolgen voor de premies. Graag corrigeren."},
        {"id": "rule-34", "code": "WKR niet ingesteld", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Eindheffing WKR is niet ingesteld in het systeem. Graag de werkkostenregeling configureren."},
        {"id": "rule-35", "code": "Pensioenfonds \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Pensioenfonds wijkt af: plan vs systeem. Graag controleren."},
        {"id": "rule-36", "code": "Werkgeversbijdrage \u2260 match", "rapport": "Implementatie", "teamId": "delta", "teamName": "Delta", "translation": "Verdeling werkgeversbijdrage klopt niet. Graag corrigeren."},
        # HR Essentials — Pensioencheck (4)
        {"id": "rule-37", "code": "Pensioenbijdrage verschil > \u20ac1", "rapport": "Pensioencheck", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Pensioenbijdrage wijkt af. Mogelijke oorzaak: parttimefactor of franchise niet correct toegepast."},
        {"id": "rule-38", "code": "Max pensioengrondslag", "rapport": "Pensioencheck", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Pensioengrondslag overschrijdt het fiscaal maximum. Graag controleren of aftoppingsregeling correct is toegepast."},
        {"id": "rule-39", "code": "PT-factor franchise", "rapport": "Pensioencheck", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Parttimefactor is niet toegepast op de franchise. Herbereken de pensioenbijdrage op basis van pro-rata franchise."},
        {"id": "rule-40", "code": "Pensioen bij 0-uren", "rapport": "Pensioencheck", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Pensioenbijdrage is berekend terwijl medewerker 0 uren heeft gewerkt. Graag controleren of dit correct is."},
        # HR Essentials — Verlofcontrole (2)
        {"id": "rule-41", "code": "Wettelijk verlof > max", "rapport": "Verlofcontrole", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Wettelijk verlof overschrijdt het maximum op basis van contracturen. Graag het verlofsaldo controleren."},
        {"id": "rule-42", "code": "Verlof niet opgebouwd", "rapport": "Verlofcontrole", "teamId": "hr-essentials", "teamName": "HR Ess.", "translation": "Verlofopbouw staat op 0 terwijl medewerker actief in dienst is. Graag de verlofregeling controleren."},
    ]

    now = datetime.now(timezone.utc)
    for rule_data in demo_rules:
        rule = TranslationRule(
            id=rule_data["id"],
            code=rule_data["code"],
            rapport=rule_data["rapport"],
            teamId=rule_data["teamId"],
            teamName=rule_data["teamName"],
            translation=rule_data["translation"],
            lastModified=now,
        )
        storage.save_translation_rule(rule.id, rule.model_dump_json(indent=2))
