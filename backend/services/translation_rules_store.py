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
        {"id": "rule-1", "code": "P0003", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Ingangsdatum functie ligt voor aanvang dienstverband. Graag corrigeren naar de juiste datum of bevestigen dat dit correct is."},
        {"id": "rule-2", "code": "P0012", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Adresgegevens ontbreken. Graag het woonadres invoeren \u2014 dit is verplicht voor de loonaangifte."},
        {"id": "rule-3", "code": "P0047", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Geboortedatum is niet ingevuld. Dit is een verplicht veld voor de Belastingdienst. Graag aanvullen."},
        {"id": "rule-4", "code": "P0089", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Parttime percentage is gewijzigd maar contracturen zijn niet aangepast. Graag de contracturen bijwerken naar het nieuwe percentage, of bevestigen dat het huidige rooster klopt."},
        {"id": "rule-5", "code": "BSN ontbreekt", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "BSN ontbreekt. Verplicht voor loonaangifte Belastingdienst. Graag aanvullen."},
        {"id": "rule-6", "code": "Saldo \u2260 0 + UitDienst", "rapport": "Reserveringen", "teamId": "polaris", "teamName": "Polaris", "translation": "Medewerker is uit dienst maar heeft nog een openstaand saldo. Graag uitbetalen of bevestigen dat verrekening loopt."},
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
